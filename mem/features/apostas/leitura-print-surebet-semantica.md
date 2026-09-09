---
name: leitura-print-surebet-semantica
description: Regras semânticas de leitura de prints na arbitragem (mercado canônico, posição da seleção, horários separados)
type: feature
---

# Leitura de prints na arbitragem — camada semântica

## Módulos
- `src/lib/ocr/marketSynonyms.ts` — `normalizeMarketKey()` mapeia sinônimos (Match Result, Resultado da Partida, 1X2, FT Result...) para chaves canônicas. Dupla Chance, Placar Exato e mercados de período NUNCA viram Match Result de tempo integral.
- `src/lib/ocr/teamNameMatch.ts` — `resolveSelectionPosition()` decide HOME/DRAW/AWAY com normalização de acentos, tokens e Levenshtein (`TEAM_MATCH_THRESHOLD = 0.7`), preservando categorias (feminino, sub-20, reservas). Retorna null quando não há evidência — proibido chutar.
- `src/lib/ocr/eventTimeResolution.ts` — separa `eventStartsAt`, `betPlacedAt` e `settledAt` por rótulo, com hierarquia de confiança e sinalização de ambiguidade.

## Regras
1. A inferência 1X2 preenche apenas as **seleções complementares** nas pernas **vazias**, nunca por índice fixo, nunca repetindo a seleção lida.
2. `detectMarketFamily` consulta primeiro o mapa da UI, depois a camada de sinônimos; `CORRECT_SCORE` e `DOUBLE_CHANCE` não geram inferência automática.
3. A inferência usa sempre os dados normalizados do print corrente e o mercado do próprio print (`sharedContextRef` evita estado desatualizado).
4. O formulário de arbitragem preenche a data com o **início do evento** (`sharedContext.dataEvento`), nunca com o horário de registro da aposta, e só quando o usuário ainda não editou a data (`dataEditadaManualRef`).
5. `parse-betting-slip` retorna `eventStartsAt` / `betPlacedAt` / `settledAt` com `label` literal; `dataHora` é mantido por compatibilidade. Nunca inventar horário: ausente = null/none.
6. Horário ambíguo gera aviso pedindo confirmação; nada é salvo silenciosamente.
