---
name: Projeto 00 Reset Total — Exceção Simulação
description: Em 2026-04-24 foi autorizado hard delete cirúrgico do Projeto 00 (LABBET ONE id 80d16390-22a0-4995-843a-3b076d33d8fe) apagando apostas, bônus, freebets, cashback, giros e TODO o cash_ledger/financial_events do projeto e das 5 casas, zerando saldo_freebet e desvinculando (projeto_id=NULL). saldo_atual REAL preservado e Caixa Operacional intocado. Operação justificada como simulação de QA pelo usuário; NÃO cria precedente — produção continua sob anti-retrofix (incidente-0904) e safe-balance-reset-policy
type: constraint
---

## Escopo da exceção

- Projeto: PROJETO 00 / LABBET ONE (`80d16390-22a0-4995-843a-3b076d33d8fe`)
- Casas afetadas: ALAWIN, AMUNRA, MY EMPIRE, TALISMANIA, THUNDERPICK

## O que foi apagado (DELETE direto, ignorando triggers via `session_replication_role = replica`)

- `apostas_unificada` + `apostas_pernas` do projeto
- `project_bookmaker_link_bonuses` do projeto
- `cashback_manual`, `giros_gratis`, `giros_gratis_disponiveis` (casas)
- `freebets_recebidas` (projeto + casas)
- `financial_events` das 5 casas (incluindo FREEBET)
- `cash_ledger` com `projeto_id_snapshot = projeto` + qualquer evento envolvendo as 5 casas
- `bookmaker_stake_reservations`, `bookmaker_balance_audit` das casas

## O que foi alterado por UPDATE (sem trigger)

- `bookmakers.saldo_freebet = 0`, `saldo_bonus = 0`, `projeto_id = NULL` para as 5 casas
- `bookmakers.saldo_atual` REAL **preservado** (capital depositado mantido)

## O que NÃO foi tocado

- Caixa Operacional: contas bancárias, aportes para contas bancárias, eventos do ledger sem vínculo às 5 casas e sem `projeto_id_snapshot = projeto`
- Cadastro das bookmakers (nome, credenciais, catálogo)

## Por que NÃO é precedente

Esta operação **viola** as seguintes políticas, autorizadas explicitamente pelo usuário SOMENTE para este caso de simulação/QA:
- `governance/incidente-contaminacao-financeira-0904` (proibição de DELETE em ledger)
- `architecture/balance-sync-trigger-exclusive-standard` (proibição de UPDATE direto em saldo_freebet/saldo_bonus)
- `finance/safe-balance-reset-policy` (correções devem usar AJUSTE_SALDO via ledger)

Para qualquer outro projeto/operação em produção, USE os fluxos canônicos: `useResetOperacional` (RPC `reset_projeto_operacional_seguro`) + `DesvinculacaoEmMassaDialog` que geram estornos auditáveis no ledger.
