
# Grupos de Bookmakers Clones — Plano Consolidado

## Decisões confirmadas

- **Governança:** grupos são **globais**, criados e mantidos apenas por **admin**. Leitura para todos os usuários autenticados.
- **Cardinalidade:** cada bookmaker pertence a **no máximo 1 provedor** (constraint `UNIQUE` no `bookmaker_catalogo_id`).
- **Isolamento de casas restritas:** o próprio catálogo já respeita a visibilidade via `bookmaker_workspace_access` (GLOBAL_RESTRICTED). O front vai renderizar apenas as casas que a RLS de `bookmakers_catalogo` liberar para o workspace atual — casas restritas simplesmente **desaparecem** do pool e dos grupos para quem não tem acesso, mesmo estando classificadas globalmente.

## Nome da aba — propostas

Descartando "Provedores de Odds" (técnico demais). Opções melhores:

1. **"Famílias de Casas"** — intuitivo, sugere parentesco.
2. **"Casas Irmãs"** — direto, expressa clone/mesma origem.
3. **"Origem de Odds"** — enfatiza o que compartilham.
4. **"Rede de Provedores"** — mais corporativo.

**Sugestão:** **"Famílias de Casas"** (label) com subtítulo *"Casas que compartilham o mesmo provedor de odds"*. Confirma antes de eu aplicar.

## Modelagem de dados

```sql
-- Famílias (globais, admin-only para escrita)
create table public.bookmaker_familias (
  id uuid pk default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  cor text default '#6366f1',
  bookmaker_referencia_id uuid references bookmakers_catalogo(id),
  created_at, updated_at, created_by uuid
);

-- Membros (1 casa = 1 família, garantido por UNIQUE)
create table public.bookmaker_familia_membros (
  id uuid pk default gen_random_uuid(),
  familia_id uuid not null references bookmaker_familias on delete cascade,
  bookmaker_catalogo_id uuid not null references bookmakers_catalogo on delete cascade unique,
  is_referencia boolean default false,
  created_at, created_by
);
```

**GRANTs + RLS:**
- `GRANT SELECT ... TO authenticated` em ambas.
- `GRANT ALL ... TO service_role`.
- Policies:
    - `SELECT` livre para `authenticated` (dado global de mercado).
    - `INSERT/UPDATE/DELETE` apenas se `has_role(auth.uid(),'admin')`.
- Trigger para garantir que só exista **uma** `is_referencia = true` por família.

## Isolamento de casas restritas — como o front garante

O pool e as famílias renderizam via **JOIN com `bookmakers_catalogo`** (que já tem RLS ativa e considera `bookmaker_workspace_access`). Como a política de leitura do catálogo filtra por workspace, qualquer casa restrita não autorizada:

- não aparece no pool,
- não aparece dentro da família (fica "invisível" na lista, mesmo que o vínculo exista no banco).

O admin, ao editar em workspace-admin, enxerga tudo. Assim não vazamos nome/logo de casa restrita para workspaces sem acesso. Nenhum código de UI adicional é necessário — a fonte de verdade continua sendo o RLS do catálogo.

## UI — Layout "Famílias + Pool"

Mantido do plano anterior. Duas regiões, com dnd-kit:

```text
┌────────────────────────────────────────────────────────────┐
│ [🔍 Buscar]        [+ Nova família]      [Filtro ▾]        │
├───────────────────────────┬────────────────────────────────┤
│ FAMÍLIAS (esquerda)       │ POOL — casas sem família (dir) │
│ ▾ 🟣 Kambi (12)           │ ┌────┐ ┌────┐ ┌────┐ ┌────┐    │
│   ★ Unibet (referência)   │ │Bet9│ │Pina│ │... │ │... │    │
│   · LeoVegas              │ └────┘ └────┘ └────┘ └────┘    │
│   · 32Red                 │  87 casas sem família          │
│ ▸ 🟢 SBTech (8)           │                                │
│ ▸ 🔵 BetConstruct (5)     │                                │
└───────────────────────────┴────────────────────────────────┘
```

Interações:
- DnD do pool → família, e entre famílias (move o vínculo — UNIQUE garante 1:1).
- Seleção múltipla (Shift/Ctrl+click) → "Adicionar N casas à família…".
- Menu ⋯ no card dentro da família: "Definir como referência", "Remover da família".
- Referência sempre no topo com ⭐, borda destacada e nome em negrito.
- Famílias colapsáveis; virtualização no pool acima de 200 casas.
- Cor da família como faixa lateral fina no card.
- Empty state por família.
- **Badge de admin-only:** usuários sem `admin` veem a tela em modo **leitura** (sem DnD, sem botões de edição) — útil para consultar sem risco de mexer.

## Localização

Nova aba no módulo **Bookmakers**, ao lado de "Catálogo" e "Grupos Operacionais".

## Escopo desta entrega

1. Migração das duas tabelas + trigger de referência única + policies + grants.
2. Hook `useBookmakerFamilias` (list + CRUD, invalida cache).
3. Rota/aba "Famílias de Casas" no módulo Bookmakers.
4. Componentes: `FamiliaColumn`, `CasaCard`, `PoolCasas`, `NovaFamiliaDialog`.
5. DnD com dnd-kit + seleção múltipla.
6. Marcar referência.
7. Busca no pool + filtros básicos (todas / sem família).
8. Modo leitura para não-admins.

## Fora de escopo (fases futuras)

- Recomendação inteligente ("outras casas da mesma família") na criação de arbitragem/surebet.
- Deduplicação automática de odds clones no mesmo evento.
- Marcação em relatórios.

## Perguntas antes de codar

1. Confirma o nome **"Famílias de Casas"**? Prefere outro da lista?
2. Ok criar a aba dentro do módulo Bookmakers existente (rota nova tipo `/bookmakers/familias`)?
