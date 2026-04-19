

## Contexto

Você quer criar **grupos de casas (bookmakers)** para aplicar **regras de governança** sobre como usuários (perfis) podem se relacionar com elas em campanhas de planejamento. Exemplos:
- "Máximo 5 casas do Grupo X por perfil"
- "Casa do Grupo Y não pode se repetir no mesmo perfil"
- "Casas do Grupo Z exigem IP único"

**Boa notícia**: já existe infraestrutura de grupos (`bookmaker_grupos` + `bookmaker_grupo_membros` em `useBookmakerGrupos.ts` e `BookmakerGruposDialog.tsx`). Vamos **reaproveitar** essa base e **estender** com um motor de regras.

## Arquitetura proposta

### 1. Reaproveitar grupos existentes
Os grupos já agregam `bookmaker_catalogo` (template global) — perfeito porque uma regra como "máx 5 casas do grupo Tier 1" se refere à **identidade da casa** (catálogo), não à instância operacional (`bookmakers`).

### 2. Nova tabela: `bookmaker_grupo_regras`
Cada grupo pode ter N regras tipadas. Schema:
```
- id, workspace_id, grupo_id
- tipo_regra: ENUM (LIMITE_MAX_POR_PERFIL, UNICA_POR_PERFIL,
                    IP_UNICO_OBRIGATORIO, CARTEIRA_UNICA, COOLDOWN_DIAS, ...)
- valor_numerico (opcional, ex: 5 para limite)
- ativa (bool)
- mensagem_violacao (texto custom opcional)
- escopo: ENUM (PERFIL, IP, CARTEIRA, WORKSPACE) — onde a regra é avaliada
```

### 3. Motor de validação (client-side primeiro)
Hook `useGrupoRegrasValidator` que recebe contexto (perfil_id + casa pretendida + data) e retorna `{ ok, violations[] }`. Avaliado:
- **No `CampanhaDialog`** ao selecionar casa/perfil → bloqueia salvar com toast explicando a violação
- **No drag-and-drop do `PlanejamentoCalendario`** → impede mover se gerar violação
- **Visualmente** no calendário: badge ⚠️ no card quando houver violação detectada

### 4. UI de gerenciamento
Estender o `BookmakerGruposDialog` existente com uma **3ª coluna/aba "Regras"** quando um grupo está selecionado:
- Lista de regras ativas do grupo
- Botão "+ Adicionar regra" → form com seletor de tipo + valor + escopo
- Cada regra com toggle ativa/inativa + delete

### 5. Tipos de regra no MVP (4 mais úteis)
| Tipo | Descrição | Valor | Escopo padrão |
|---|---|---|---|
| `LIMITE_MAX_POR_PERFIL` | Perfil pode ter no máximo N casas deste grupo | número (ex: 5) | PERFIL |
| `UNICA_POR_PERFIL` | Casa do grupo não pode se repetir no perfil | — | PERFIL |
| `IP_UNICO_OBRIGATORIO` | Casas do grupo exigem IPs distintos por perfil | — | IP |
| `COOLDOWN_DIAS` | Após usar uma casa, aguardar N dias para outra do grupo | número | PERFIL |

### 6. Ordem de implementação
1. **Migração SQL** — tabela `bookmaker_grupo_regras` + RLS por workspace + enum `tipo_regra_grupo`
2. **Hook** `useBookmakerGrupoRegras` (CRUD)
3. **UI no `BookmakerGruposDialog`** — painel de regras do grupo selecionado
4. **Hook** `useGrupoRegrasValidator` — avalia contexto contra todas as regras ativas dos grupos das casas envolvidas
5. **Integrar no `CampanhaDialog`** — validação ao salvar
6. **Integrar no `PlanejamentoCalendario`** — validação no drag-and-drop + badge visual

## Dicas adicionais

- **Severidade**: adicione campo `severidade: 'BLOQUEIO' | 'AVISO'` para que algumas regras sejam apenas alertas, não bloqueios duros
- **Auditoria**: log opcional `bookmaker_grupo_regra_violacoes` para rastrear tentativas (útil para relatórios)
- **Cache**: regras mudam pouco → `staleTime: 5min` no React Query
- **Server-side enforcement futuro**: se quiser blindagem total, replicar validação em trigger Postgres no `INSERT` de campanhas — mas client-side é suficiente para MVP

## Arquivos previstos

- `supabase/migrations/...` (nova tabela + enum + RLS)
- `src/hooks/useBookmakerGrupoRegras.ts` (novo)
- `src/hooks/useGrupoRegrasValidator.ts` (novo)
- `src/components/bookmakers/BookmakerGrupoRegrasPanel.tsx` (novo)
- `src/components/bookmakers/BookmakerGruposDialog.tsx` (estender)
- `src/components/planejamento/CampanhaDialog.tsx` (integrar validação)
- `src/components/planejamento/PlanejamentoCalendario.tsx` (integrar drag validation + badge)

