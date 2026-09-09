# Project Memory

## Core
- Saldo de casa nunca fica negativo: trava é o trigger `fn_guard_saldo_bookmaker_nao_negativo` em `financial_events`, não o botão.

## Memories
- [Guard Saldo Não-Negativo](mem://finance/saldo-bookmaker-nao-negativo-guard) — Trigger fail-closed contra débito acima do saldo; merge de auditoria_metadata; janela de duplicidade de saque
- [Aposta Parcial Lifecycle](mem://architecture/aposta-parcial-lifecycle-standard) — Aposta só conclui com 100% das pernas resolvidas; helper único isOperacaoAberta/isOperacaoConcluida
- [Ajuste Cambial Derivado](mem://finance/ajuste-cambial-derivado-standard) — PERDA/GANHO_CAMBIAL são filhos do lançamento pai: herdam competência e projeto, revertem/excluem em cadeia, auditoria em /admin/auditoria-cambial
- [Troca de Casa em Aposta Simples](mem://finance/troca-casa-aposta-simples-reconciliacao) — Trigger reconcilia stake: estorna na casa antiga e debita na nova ao editar aposta pendente
