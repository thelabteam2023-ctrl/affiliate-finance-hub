---
name: bet-reopening-financial-control-standard
description: Reabertura de apostas liquidadas para edição estrutural via REVERSAL atômico no ledger, sem janela de tempo, com bloqueios financeiros (saque posterior, saldo insuficiente). Fase 1 cobre surebets simples sem freebet/bônus.
type: architecture
---

# Padrão de Reabertura de Apostas Liquidadas (Fase 1)

A edição de apostas já resolvidas é tratada como **reabertura implícita** dentro do botão "Editar" existente — nunca como botão separado. O usuário clica Editar; se a aposta está liquidada, o sistema mostra modal de confirmação com preview financeiro, executa REVERSAL atômico no ledger e só então abre o editor padrão.

## Princípios

- **Sem janela de tempo**: o controle é por integridade financeira, não por tempo.
- **Bloqueios obrigatórios**:
  - Saque posterior à liquidação no bookmaker
  - Saldo atual insuficiente para reverter o payout
  - Bookmaker em estado crítico (ENCERRADA/BLOQUEADA/AGUARDANDO_SAQUE)
- **In-place**: mesmo `id` da aposta, status volta para PENDENTE. Histórico preservado em `audit_logs.before_data`/`after_data`.
- **Stakes permanecem reservadas**: apenas PAYOUTs são revertidos via `REVERSAL` no `financial_events`. Capital continua comprometido.

## Componentes

- **RPC `validar_reabertura_surebet(p_aposta_id)`**: read-only. Retorna `{ elegible, blockers[], preview: { pernas[], total_a_reverter } }`.
- **RPC `reabrir_surebet_atomica(p_aposta_id)`**: transacional. LOCK FOR UPDATE → REVERSAL idempotente (`reopen_{aposta_id}_perna_{perna_id}_n{epoch}`) → limpa pernas → status PENDENTE → audit_logs.
- **Service**: `src/services/aposta/reabertura/ReaberturaService.ts` (`validarReaberturaSurebet`, `reabrirSurebet`).
- **UI**: `ConfirmReaberturaDialog` (mostra preview) + `useReabrirSurebetGuard` (envolve `onEdit` do `SurebetCard`).

## Escopo Fase 1

✅ Surebet/Arbitragem (1–3 pernas), sem freebet, sem bônus, sem multi-entry por perna.
❌ Bloqueios automáticos para `usar_freebet=true`, `bonus_id IS NOT NULL`, ou pernas com `stake_freebet > 0` / `fonte_saldo='FREEBET'`.

## Integração

O guard `useReabrirSurebetGuard` é instanciado **uma vez por aba** (ProjetoApostasTab, ProjetoSurebetTab, ProjetoPunterTab, ProjetoValueBetTab) e o `ReaberturaDialog` é renderizado no nível raiz do componente. Cada `<SurebetCard onEdit={wrapOnEdit(originalOnEdit, surebetData)} />` decide automaticamente:
- Status PENDENTE → executa `originalOnEdit` direto
- Status liquidado → abre `ConfirmReaberturaDialog`; após sucesso, invalida queries e executa `originalOnEdit`

## Próximas fases

- **Fase 2**: incluir multi-entry por perna e apostas simples completas
- **Fase 3**: incluir freebets, bônus e dependências financeiras complexas
