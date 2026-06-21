## Problema

No formulário de Arbitragem, ao abrir o popover **Explorador** (ícone de calendário ao lado do campo Evento), são listados todos os jogos do dia, misturando esportes (futebol, beisebol, tênis, etc.), mesmo quando o usuário já selecionou um esporte específico (ex.: Futebol) no campo "Esporte" do formulário.

O esporte selecionado no formulário hoje **não é repassado** para o `ExploradorEventoPicker`, e o hook `useDailyEventsByDate` busca tudo da tabela `daily_events` sem filtro de `sport`.

## Objetivo

Quando o usuário tiver um esporte selecionado no formulário, o Explorador deve listar **apenas jogos daquele esporte** por padrão, com a opção de o usuário desmarcar/alargar o filtro caso queira ver todos.

## Mudanças

### 1. `src/components/surebet/ExploradorEventoPicker.tsx`
- Adicionar prop opcional `esporte?: string` (label do form, ex.: `"Futebol"`, `"Basquete"`).
- Adicionar estado local `filterBySport` (default `true` quando `esporte` válido e ≠ `"Outro"`).
- Adicionar um toggle compacto no header do popover: **"Apenas {esporte}"** (visível só quando `esporte` está definido e ≠ `"Outro"`).
- No `useMemo` de `filtered`, quando `filterBySport && esporte`, manter somente eventos cujo `normalizeEsporte(ev.sport) === esporte`.
- Reutilizar `normalizeEsporte` já exportado de `src/components/surebet/utils/mapDailyEventToFormFields.ts` (exportar a função se ainda não estiver exposta — já está).
- Mensagem de "nenhum jogo" deve refletir o filtro: "Nenhum jogo de {esporte} encontrado em {data}. Desative o filtro para ver todos."

### 2. `src/components/surebet/SurebetModalRoot.tsx` (linha ~2324)
- Passar `esporte={esporte}` para `<ExploradorEventoPicker ... />`.
- Nenhuma outra alteração — o restante do fluxo (`onSelect` → `mapDailyEventToFormFields`) continua igual.

### 3. (Opcional, performance) `src/hooks/useDailyEventsByDate.ts`
- Por ora, **manter a busca completa por data** e filtrar no client. Motivos:
  - Volume diário é baixo (centenas de linhas).
  - O usuário pode desligar o filtro sem refazer query.
  - Evita complicar a queryKey/cache.
- Se mais tarde virar gargalo, dá para aceitar um `sport?: string[]` e filtrar no servidor.

## Detalhes técnicos

- `normalizeEsporte` já mapeia `soccer→Futebol`, `basketball→Basquete`, `baseball→Baseball`, `tennis→Tênis`, `americanfootball→Futebol Americano`, etc. — sport values atuais no banco confirmam compatibilidade (`soccer`, `americanfootball`, `tennis`, `baseball`, `basketball`, `icehockey`).
- O toggle não deve aparecer quando o form está com `esporte = "Outro"` ou vazio (não há filtro útil).
- O contador de jogos no header já é dinâmico (`filtered.length`), portanto reflete o filtro automaticamente.
- Nenhuma mudança em backend, schema, RLS ou tipos.

## Fora de escopo

- Mudanças visuais maiores no popover.
- Filtros por liga/país.
- Busca server-side por esporte.
