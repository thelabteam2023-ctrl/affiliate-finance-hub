---
name: Edição Cadastral de Aposta
description: Campos sem efeito financeiro de apostas (data, evento, mercado, observações) só podem ser gravados via atualizarApostaCadastral; nunca em UPDATE com colunas financeiras nem com erro silencioso
type: feature
---

Toda gravação de campos cadastrais de aposta (`data_aposta`, `evento`, `esporte`, `mercado`, `selecao`, `observacoes`, `estrategia`, `contexto_operacional`, `fonte_entrada`) usa `atualizarApostaCadastral` (`src/services/aposta/atualizarApostaCadastral.ts`).

Regras:
- Nunca incluir `stake*`, `fonte_saldo`, `usar_freebet`, `odd*`, `status`, `resultado`, `bookmaker_id` no mesmo UPDATE cadastral — essas colunas disparam `tg_sync_aposta_simples_resultado_financeiro` e reemitem eventos no ledger.
- Erro no UPDATE cadastral é PROIBIDO ser engolido (`console.warn`): deve lançar e virar toast; caso contrário o usuário vê "salvo" e a alteração se perde.
- Edição puramente cadastral de aposta LIQUIDADA não pede confirmação de reliquidação (não há reversão de ledger).
- Comparação de "mudança financeira" usa limiares numéricos (0,01 stake / 0,00001 odd), nunca `!==` cru.
