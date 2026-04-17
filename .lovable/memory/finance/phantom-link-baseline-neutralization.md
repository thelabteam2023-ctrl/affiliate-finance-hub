---
name: phantom-link-baseline-neutralization
description: Vínculos sem uso real são neutralizados retroativamente cancelando o DEPOSITO_VIRTUAL ao desvincular, e ping-pong (re-vínculo <5min sem uso) cancela também o SAQUE_VIRTUAL anterior, evitando inflação de KPIs financeiros
type: finance
---

# Neutralização de Vínculo Fantasma (DEPOSITO_VIRTUAL + SAQUE_VIRTUAL)

## Decisão arquitetural (2026-04-17)

O sistema implementa **dois mecanismos simétricos** para impedir que ciclos de vínculo/desvínculo sem operação real inflem os KPIs financeiros do projeto (Total Depositado, Total Sacado, Capital Investido, Capital Médio, ROI).

### 1. Phantom unlink (DV cancelado)
A RPC `desvincular_bookmaker_atomico` **cancela retroativamente o `DEPOSITO_VIRTUAL` baseline** (status='CANCELADO') em vez de criar um `SAQUE_VIRTUAL` simétrico, quando a casa nunca foi utilizada no projeto.

### 2. Ping-pong (SV cancelado + DV não criado)
O trigger `fn_ensure_deposito_virtual_on_link` detecta re-vinculação **dentro de 5 minutos** após o último `SAQUE_VIRTUAL`, na mesma casa+projeto, sem operação entre os eventos. Nesse caso, **cancela o SV anterior** e **NÃO cria novo DV**, restaurando o ciclo original como se a desvinculação nunca tivesse ocorrido.

## Critério canônico de "casa utilizada no projeto"

Qualquer um dos seguintes basta para impedir a neutralização:

1. **Apostas**: existe `apostas_unificada` ou `apostas_pernas` com `bookmaker_id` da casa e `projeto_id` do projeto
2. **Ledger real**: existe `cash_ledger` com `projeto_id_snapshot` do projeto, casa como origem/destino, em tipo `DEPOSITO|SAQUE|CONVERSAO|GANHO_CAMBIAL|PERDA_CAMBIAL|AJUSTE|TRANSFERENCIA`, status `CONFIRMADO|PENDENTE`, criado **após** o `created_at` do DV baseline (ou após o último SV, no ping-pong)
3. **Bônus**: existe `project_bookmaker_link_bonuses` ativo (status ≠ 'cancelled')
4. **Freebet**: existe `freebets_recebidas` para casa+projeto
5. **Ocorrência**: existe `ocorrencias` para casa+projeto

## Salvaguardas anti-falso-positivo

### Phantom unlink
A neutralização do DV só ocorre quando **TODAS** as condições são satisfeitas:
- DV baseline existe (`tipo_transacao=DEPOSITO_VIRTUAL`, `status=CONFIRMADO`, casa+projeto)
- Casa NÃO foi utilizada (zero evidências)
- `|saldo_virtual_efetivo - DV.valor| < 0.02` → saldo não divergiu por FX/ajuste/depósito intermediário
- NÃO é conta de investidor (`is_investor_account = false`)
- NÃO é conta broker (`is_broker_account = false`)

### Ping-pong (re-link)
A neutralização do SV anterior só ocorre quando **TODAS** as condições são satisfeitas:
- Último SV foi há **menos de 5 minutos**
- Mesmo `projeto_id` (re-vínculo ao mesmo projeto)
- `|SV.valor - bookmaker.saldo_atual| < 0.02` (saldo não mudou)
- Casa NÃO é broker (`is_broker_account = false`)
- Casa NÃO é de investidor (`investidor_id IS NULL`)
- ZERO uso entre o SV anterior e agora (apostas, pernas, ledger real)

Caso contrário, mantém o comportamento original (cria SV no unlink / cria novo DV no relink).

## Por que 5 minutos?
Janela curta o suficiente para cobrir clique errado / arrependimento imediato, mas não invade decisões operacionais legítimas (ex.: usuário move casa entre projetos durante o dia para reorganizar). Janelas mais longas (24h) corriam risco de neutralizar reorganizações intencionais.

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

**Ping-pong (SV)**:
```json
{
  "cancelled_at": "...",
  "cancelled_reason": "ping_pong_neutralized",
  "cancelled_by_rpc": "fn_ensure_deposito_virtual_on_link",
  "projeto_id": "...",
  "window_seconds": 87.4
}
```

Nada é deletado fisicamente. Views agregadoras de KPI devem filtrar `status IN ('CONFIRMADO','PENDENTE')` para excluir cancelados.

## Resposta da RPC `desvincular_bookmaker_atomico`

Retorna `phantom_link_neutralized: true|false`, `is_broker_account` e `usage_evidence` com a contagem de cada critério.

## Logs do trigger (ping-pong)

`financial_debug_log` registra `event_type='PINGPONG_SV_CANCELLED'` com `sv_id`, `sv_valor`, `sv_created`, `window_seconds`.

## Cenários cobertos

| Cenário | Resultado |
|---|---|
| Vincula → desvincula sem uso | DV cancelado |
| Vincula → usa → desvincula → re-vincula → usa | Tudo preservado (cada ciclo é real) |
| Vincula → usa → desvincula → re-vincula sem operar (>5min) | SV e novo DV preservados (pode ser reorganização) |
| Vincula → desvincula → re-vincula em <5min sem uso | SV anterior cancelado, novo DV não criado (ping-pong) |
| Casa investidor/broker em qualquer cenário | Nunca neutraliza |
