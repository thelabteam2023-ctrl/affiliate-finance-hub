---
name: lay-liability-as-ledger-debit-standard
description: Perna LAY debita liability (stake×(odd−1)) no ledger; perna BACK debita stake. fn_sync_stake_event_v1 e criar_surebet_atomica/v3 já aplicam. fn_recalc_pai_surebet calcula LAY GREEN como stake×(1−comissao).
type: finance
---

# Padrão: Liability como débito de Ledger em pernas LAY

## Regra
- **BACK**: ledger debita `-stake` (sem mudança).
- **LAY**: ledger debita `-stake × (odd − 1)` (liability/responsabilidade).
- **GREEN LAY**: payout = `stake × (1 − comissao)` (ganho líquido) + `VOID_REFUND` da liability.
- **RED LAY**: nenhum evento de payout (liability já consumida na criação).
- **VOID LAY**: refund = liability inteira.

## Onde está aplicado
- `fn_sync_stake_event_v1` (caminho `criar_surebet_atomica_v3` e `editar_surebet_completa_v3`): lê `apostas_perna_entradas.tipo` e debita liability quando LAY.
- `criar_surebet_atomica` (legado): ramo `CASE WHEN tipo='lay' THEN stake*(odd-1) ELSE stake END`.
- `liquidar_perna_surebet_v1`: trata GREEN/MEIO_GREEN/MEIO_RED/RED/VOID separadamente para LAY com comissão.
- `fn_recalc_pai_surebet`: P&L do pai usa `liability` como risco (stake_total) e `stake×(1−comissao)` como ganho do GREEN.

## Frontend
- `PernaInput.tipo` ('back'|'lay') e `PernaInput.comissao` (decimal, ex: 0.028) precisam ser enviados no payload.
- `SurebetModalRoot` já propaga; `useSurebetService.SurebetPerna` também passou a propagar.

## Política anti-retrofix
Apostas LAY anteriores à correção NÃO são reprocessadas. Só novos lançamentos seguem a regra.