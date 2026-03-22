# Memory: features/ocr/asian-handicap-detection-v1
Updated: 2026-03-22

O parser de mercados OCR agora prioriza a detecção de Handicap Asiático ANTES de Total de Gols. Regras implementadas:

1. **Split line detection**: Linhas divididas como "0.0,-0.5" são reconhecidas e normalizadas para a média (-0.25)
2. **Team + numbers pattern**: "Modbury Jets 0.0,-0.5" é detectado como handicap do time, não total
3. **Negative numbers**: Números negativos associados a times NUNCA são classificados como total de gols
4. **Explicit terms guard**: Só classifica como Total se houver termos explícitos (Over/Under/Gols/Goals)
5. **Priority order**: 1X2 → Handicap explícito → Split handicap → Handicap combinado → Total → outros

Tabela de normalização: (val1 + val2) / 2 — ex: 0.0,-0.5 → -0.25; +0.5,+1.0 → +0.75

Arquivos: `marketOcrParser.ts` (parser), `parse-betting-slip/index.ts` (prompt da IA)
