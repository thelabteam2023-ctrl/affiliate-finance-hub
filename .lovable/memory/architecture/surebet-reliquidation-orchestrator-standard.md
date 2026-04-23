---
name: surebet-reliquidation-orchestrator-standard
description: Re-liquidação de surebet usa orquestrador por perna via liquidar_perna_surebet_v1; UPDATE direto em apostas_unificada arbitragem é bloqueado por trigger
type: feature
---
Re-liquidação de surebet (forma_registro=ARBITRAGEM) NUNCA usa UPDATE raw no pai. ApostaService.reliquidarAposta orquestra por perna chamando liquidarPernaSurebet (RPC liquidar_perna_surebet_v1) em paralelo (Promise.all). Mapeamento de resultado global: RED→todas RED, VOID→todas VOID, GREEN→BLOQUEADO (ambíguo). Para GREEN em surebet usar Quick Resolve por cenário (single_win/double_green) no SurebetRowActionsMenu.

Defesa em profundidade no banco: trigger tg_apostas_unificada_arbitragem_guard bloqueia UPDATE direto de resultado/lucro_prejuizo/status=LIQUIDADA em registros ARBITRAGEM, exceto quando vier de RPC autorizada (que seta GUC app.surebet_recalc_context='on' via SET LOCAL). RPCs autorizadas: liquidar_perna_surebet_v1, reverter_liquidacao_v4, liquidar_aposta_v4, reliquidar_aposta_v6, editar_perna_surebet_atomica, deletar_perna_surebet_v1, deletar_aposta_v4, criar_surebet_atomica, criar_aposta_atomica_v3, fn_recalc_pai_surebet.

liquidarSurebetSimples está @deprecated — não usar em novos chamadores.
