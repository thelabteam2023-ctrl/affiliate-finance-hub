---
name: phantom-link-baseline-neutralization
description: Vínculos sem uso real são neutralizados retroativamente cancelando o DEPOSITO_VIRTUAL ao desvincular, e revinculação ao mesmo projeto sem uso real (qualquer janela temporal) cancela o SAQUE_VIRTUAL anterior, evitando inflação de KPIs financeiros
type: finance
---

# Neutralização de Vínculo Fantasma (DEPOSITO_VIRTUAL + SAQUE_VIRTUAL)

## Decisão arquitetural (atualizada 2026-04-18)

O sistema implementa **dois mecanismos simétricos** para impedir que ciclos de vínculo/desvínculo sem operação real inflem os KPIs financeiros do projeto. **Toda a neutralização é feita no backend (trigger/RPC)** — o frontend NUNCA aplica matemática defensiva sobre BASELINE/SV.

### 1. Phantom unlink (DV cancelado)
A RPC `desvincular_bookmaker_atomico` **cancela retroativamente o `DEPOSITO_VIRTUAL` baseline** (status='CANCELADO') em vez de criar um `SAQUE_VIRTUAL` simétrico, quando a casa nunca foi utilizada no projeto.

### 2. Revinculação fantasma ao MESMO projeto (SV cancelado + DV não criado) — v2 baseado em uso
O trigger `fn_ensure_deposito_virtual_on_link` detecta re-vinculação ao **mesmo projeto** sem operação real entre o último `SAQUE_VIRTUAL` e o novo link. Nesse caso, **cancela o SV anterior** e **NÃO cria novo DV**, restaurando o ciclo original como se a desvinculação nunca tivesse ocorrido.

**Mudança v2 (2026-04-18)**: a antiga janela de 5 minutos foi removida. Agora o critério é puramente **ausência de uso real**, independente do tempo decorrido. Isso elimina a necessidade de qualquer cálculo de neutralização no frontend — o ledger sempre reflete a verdade contábil.

## Critério canônico de "casa utilizada no projeto"

Qualquer um dos seguintes basta para impedir a neutralização:

1. **Apostas**: existe `apostas_unificada` ou `apostas_pernas` com `bookmaker_id` da casa e `projeto_id` do projeto (criado após o último SV)
2. **Ledger real**: existe `cash_ledger` com `projeto_id_snapshot` do projeto, casa como origem/destino, em tipo `DEPOSITO|SAQUE|CONVERSAO|GANHO_CAMBIAL|PERDA_CAMBIAL|AJUSTE|TRANSFERENCIA`, status `CONFIRMADO|PENDENTE`, criado após o último SV
3. **Bônus**: existe `project_bookmaker_link_bonuses` ativo (status ≠ 'cancelled') — checado no phantom unlink
4. **Freebet**: existe `freebets_recebidas` para casa+projeto — checado no phantom unlink
5. **Ocorrência**: existe `ocorrencias` para casa+projeto — checado no phantom unlink

## Salvaguardas anti-falso-positivo

### Phantom unlink
A neutralização do DV só ocorre quando **TODAS** as condições são satisfeitas:
- DV baseline existe (`tipo_transacao=DEPOSITO_VIRTUAL`, `status=CONFIRMADO`, casa+projeto)
- Casa NÃO foi utilizada (zero evidências)
- `|saldo_virtual_efetivo - DV.valor| < 0.02` → saldo não divergiu por FX/ajuste/depósito intermediário
- NÃO é conta de investidor (`is_investor_account = false`)
- NÃO é conta broker (`is_broker_account = false`)

### Revinculação ao mesmo projeto (trigger v2)
A neutralização do SV anterior só ocorre quando **TODAS** as condições são satisfeitas:
- Existe SV anterior CONFIRMADO da mesma casa
- `v_last_sv_projeto = NEW.projeto_id` (mesmo projeto)
- `|SV.valor - bookmaker.saldo_atual| < 0.02` (saldo não mudou)
- Casa NÃO é broker (`is_broker_account = false`)
- Casa NÃO é de investidor (`investidor_id IS NULL`)
- ZERO uso entre o SV anterior e agora (apostas, pernas, ledger real)

Caso contrário, mantém o comportamento original (cria SV no unlink / cria novo DV no relink como BASELINE).

## Por que não usar mais janela de tempo?

A janela de 5 minutos era arbitrária e gerava falsos negativos: se o usuário desvinculasse e revinculasse 10 minutos depois sem ter operado, o sistema gerava um par fantasma SV+DV que inflava o "Lucro Projetado". O critério de "uso real" é semanticamente correto: se nada aconteceu, contabilmente nada aconteceu.

## Por que excluir broker?
Contas broker (`is_broker_account=true`) têm fluxo de capital próprio do cliente (custódia), não da operação. Neutralizar phantom de broker quebraria a contabilidade de custódia.

## Auditoria

Todos os cancelamentos preservam `auditoria_metadata`:

**Phantom unlink (DV)**:
```json
{
  "cancelled_at": "...",
  "cancelled_reason": "phantom_link_unused",
  "cancelled_by_rpc": "desvincular_bookmaker_atomico",
  "cancelled_user_id": "...",
  "projeto_id": "..."
}
```

**Revinculação ao mesmo projeto (SV) — trigger v2**:
```json
{
  "cancelled_at": "...",
  "cancelled_reason": "ping_pong_neutralized_by_usage",
  "cancelled_by_rpc": "fn_ensure_deposito_virtual_on_link",
  "projeto_id": "...",
  "window_seconds": 87.4,
  "usage_count": 0
}
```

Nada é deletado fisicamente. Views agregadoras de KPI devem filtrar `status IN ('CONFIRMADO','PENDENTE')` para excluir cancelados.

## Logs do trigger

`financial_debug_log` registra `event_type='PINGPONG_SV_CANCELLED'` com `sv_id`, `sv_valor`, `sv_created`, `window_seconds`, `bookmaker_id`, `projeto_id`, `trigger_version='usage_based_v1'`.

## Frontend NÃO neutraliza

Não existe lógica `baselineNeutralizar` em componentes (`FinancialMetricsPopover`, `ProjetoFinancialMetricsCard`, `LucroProjetadoModal`). A fórmula de Lucro Projetado é a canônica:

```
lucroProjetado = saldoCasas + saquesRecebidos + saquesPendentes − depositosEfetivos
```

onde `depositosEfetivos = DEPOSITO real + DEPOSITO_VIRTUAL com origem_tipo='MIGRACAO'`. BASELINE é sempre excluída de depositosEfetivos. Quando a revinculação é fantasma, o trigger garante que nem o SV nem o novo DV BASELINE existem (ambos cancelados/não criados), eliminando a inflação na origem.

## Cenários cobertos

| Cenário | Resultado |
|---|---|
| Vincula → desvincula sem uso | DV cancelado |
| Vincula → usa → desvincula → re-vincula → usa | Tudo preservado (cada ciclo é real) |
| Vincula → usa → desvincula → re-vincula sem operar (mesmo projeto, qualquer tempo) | SV cancelado, novo DV não criado |
| Vincula → desvincula → re-vincula em projeto DIFERENTE | SV preservado + DV criado como MIGRACAO |
| Casa investidor/broker em qualquer cenário | Nunca neutraliza |
