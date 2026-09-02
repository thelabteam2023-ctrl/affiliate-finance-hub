---
name: Partner Import Bookmaker Idempotency
description: Importação de parceiros deduplica casas por identidade canônica (catálogo|nome + instância + moeda) com trava única parcial em bookmakers.portability_ext_id
type: feature
---

Regra: para um parceiro dentro de um workspace, a mesma casa só pode existir uma vez via importação.

- Chave canônica (`src/lib/partnerPortability/bookmakerIdentity.ts`):
  `catalogoId do destino (fallback nome canônico) | instance_identifier normalizado | moeda já normalizada`.
- Nunca usar `bookmakers.id` nem `parceiro_id` de origem como chave entre workspaces.
- `applyImport.ts` deduplica contra o destino E dentro do próprio arquivo; casa existente é apenas reportada (`bookmakersExisting`), nunca atualizada — sem tocar saldo, projeto, investidor ou histórico.
- Banco: coluna `bookmakers.portability_ext_id` + índice único parcial `(workspace_id, parceiro_id, portability_ext_id) WHERE portability_ext_id IS NOT NULL`. Insert com erro 23505 é tratado como "já existia" (corrida entre importações).
- Índice é parcial de propósito: o modelo multi-instância manual (várias contas da mesma casa, `instance_identifier` nulo repetido) continua válido.
- Preview do `ImportarParceiroDialog` mostra por casa "já existe, não será duplicada" / "nova, será criada".
