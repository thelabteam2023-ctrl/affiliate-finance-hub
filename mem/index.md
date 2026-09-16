# Project Memory

## Core
- Saldo de casa nunca fica negativo: trava é o trigger `fn_guard_saldo_bookmaker_nao_negativo` em `financial_events`, não o botão.

## Memories
- [Guard Saldo Não-Negativo](mem://finance/saldo-bookmaker-nao-negativo-guard) — Trigger fail-closed contra débito acima do saldo; merge de auditoria_metadata; janela de duplicidade de saque
- [Aposta Parcial Lifecycle](mem://architecture/aposta-parcial-lifecycle-standard) — Aposta só conclui com 100% das pernas resolvidas; helper único isOperacaoAberta/isOperacaoConcluida
- [Ajuste Cambial Derivado](mem://finance/ajuste-cambial-derivado-standard) — PERDA/GANHO_CAMBIAL são filhos do lançamento pai: herdam competência e projeto, revertem/excluem em cadeia, auditoria em /admin/auditoria-cambial
- [Troca de Casa em Aposta Simples](mem://finance/troca-casa-aposta-simples-reconciliacao) — Trigger reconcilia stake: estorna na casa antiga e debita na nova ao editar aposta pendente
- [Leitura de Print na Arbitragem](mem://features/apostas/leitura-print-surebet-semantica) — Mercado canônico por sinônimos, posição da seleção 1X2 sem chute e separação entre início do evento e horário do registro
- [Reconciliação do Lucro Realizado](mem://finance/reconciliacao-lucro-realizado-standard) — Proibida conversão BRL→USD→BRL na apresentação; Lucro Realizado decomposto em operacional + cambial (realizado/não realizado) + diferenças de recebimento
- [Lucro Realizado fonte única](mem://finance/lucro-realizado-fonte-unica-cotacao-trabalho) — Card e Extrato usam Cotação de Trabalho; oficial só para agregação; cambialConversao explica resíduo multimoeda
- [Surebet Edit Identity & Multi-Entradas](mem://architecture/surebet-edit-identity-and-entries) — Edição de surebet preserva ids reais de perna/entrada e fonte de saldo; ids da UI podem ser sintéticos
