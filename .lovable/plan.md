

## Auditoria: MULTIBET / Juliana Costa de Oliveira / Projeto SUREBET LIVE

### Linha do tempo real do ledger (3 eventos, todos CONFIRMADOS)

| Data | Evento | Valor | Scope | Efeito em `saldo_atual` |
|---|---|---|---|---|
| 06/04 14:53:35 | `DEPOSITO` (real, manual) | +R$ 3.000,00 | REAL | +3.000 → saldo = **3.000** |
| 06/04 14:53:41 | `DEPOSITO_VIRTUAL` (Baseline automático ao vincular) | +R$ 3.000,00 | VIRTUAL | 0 (correto: virtual não impacta) |
| 12/04 17:36:15 | `AJUSTE_RECONCILIACAO` (SAIDA) | −R$ 3.000,00 | REAL | −3.000 → saldo = **0,00** |

### Diagnóstico — o que realmente aconteceu

1. **O depósito de R$ 3.000 existe e foi processado** (evento `369071ed…`, scope REAL). Não houve perda de dado.
2. **6 segundos depois**, o gatilho `fn_ensure_deposito_virtual_on_link` criou o **baseline virtual** de R$ 3.000 (correto, padrão arquitetural — não afeta saldo).
3. **No dia 12/04**, alguém abriu o **diálogo de Ajuste de Saldo / Reconciliação** (`AjusteSaldoDialog` → `registrarAjusteViaLedger`) e informou que o **saldo real na casa era R$ 3.000**, enquanto **o sistema mostrava R$ 6.000**.
   - O sistema então gravou um `AJUSTE_RECONCILIACAO` de SAIDA de R$ 3.000.
   - Texto registrado: *“Saldo sistema: 6000.00 → Saldo real: 3000.00 | Diferença: -3000.00”*.
   - Motivo digitado: apenas *“ajuste”*.

### Causa raiz da inconsistência

O usuário que fez a reconciliação **leu o saldo errado na tela**. O sistema mostrava R$ 6.000 porque **estava somando o DEPOSITO real (R$ 3.000) + o DEPOSITO_VIRTUAL baseline (R$ 3.000)** em algum ponto da UI no momento da reconciliação — clássico sintoma do incidente `0904` (contaminação real x virtual). Resultado: o operador “ajustou para baixo” um saldo que na verdade já estava correto, **drenando os R$ 3.000 reais legítimos**.

Conforme as policies `virtual-contamination-remediation-policy` e `safe-balance-reset-policy`, **a remediação é feita exclusivamente via novo lançamento de ajuste no ledger**. Proibido editar/deletar o evento original.

### Plano de correção

**Etapa 1 — Remediação imediata do saldo (1 lançamento no ledger, com sua aprovação)**

Criar uma migration que insere **um único** `AJUSTE_RECONCILIACAO` de **ENTRADA de R$ 3.000** no bookmaker `29e3ff3c…`:

- `tipo_transacao = 'AJUSTE_RECONCILIACAO'`
- `ajuste_direcao = 'ENTRADA'`
- `destino_bookmaker_id = 29e3ff3c-a2d3-4547-a02f-7f3179812956`
- `valor = 3000.00`, `moeda = BRL`
- `status = 'CONFIRMADO'`, `transit_status = 'CONFIRMED'`
- `projeto_id_snapshot = adccc507…` (SUREBET LIVE)
- `descricao`: *“Estorno de reconciliação indevida 49c47685… — depósito real de 06/04 nunca foi gasto, ajuste anterior decorreu de leitura de saldo contaminado (real+virtual baseline)”*
- `referencia_transacao_id = 49c47685-34f4-42b0-a7a8-88a139af2f29` (link com o ajuste original para rastreabilidade)

O trigger `tr_cash_ledger_generate_financial_events` materializa o `financial_events` e re-credita os R$ 3.000 em `bookmakers.saldo_atual`. Saldo final esperado: **R$ 3.000,00**.

**Etapa 2 — Investigação preventiva (read-only, sem alteração de dados)**

Identificar **onde na UI** o saldo apareceu como R$ 6.000 no dia 12/04 (provavelmente em algum card/listagem de bookmaker que ainda soma scope VIRTUAL no display de “saldo total”). Auditar:
- `useBookmakerSaldos` / `get_bookmaker_saldos` RPC
- Qualquer view que materialize saldo somando `event_scope` REAL + VIRTUAL sem segregação
- Card que o operador viu antes de abrir o `AjusteSaldoDialog`

Se a contaminação visual ainda existir, **abriremos um plano separado** para corrigir a fonte (sem migration retroativa de dados, conforme política anti-retrofix).

**Etapa 3 — Validação pós-correção**

```sql
-- Esperado: saldo_atual = 3000.00
SELECT saldo_atual FROM bookmakers WHERE id = '29e3ff3c-a2d3-4547-a02f-7f3179812956';

-- Esperado: soma de financial_events REAL = 3000.00
SELECT SUM(valor) FROM financial_events
WHERE bookmaker_id = '29e3ff3c-a2d3-4547-a02f-7f3179812956' AND event_scope = 'REAL';
```

### Detalhes técnicos

- **Sem hard-delete, sem UPDATE direto em `saldo_atual`** (respeita `balance-sync-trigger-exclusive-standard` e `safe-balance-reset-policy`).
- **Sem retrofix em massa** — apenas 1 lançamento cirúrgico para 1 bookmaker (respeita `governance/incidente-contaminacao-financeira-0904`).
- O evento original (`49c47685…`) permanece intacto no histórico, com `referencia_transacao_id` apontando para ele a partir do estorno → trilha de auditoria completa preservada.
- O Histórico de Movimentações passará a mostrar os 4 eventos: depósito original, baseline virtual, ajuste indevido e estorno do ajuste — com explicação clara em `descricao`.

