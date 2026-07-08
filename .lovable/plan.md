# Causa raiz identificada

O Explorador dentro do formulário de Nova Aposta (componente `ExploradorEventoPicker`) usa o hook `useDailyEventsByDate`, que consulta a tabela `public.daily_events`.

- `daily_events` está **estagnada** desde 2026-11-28 (nenhum registro para 08/07/2026 e para praticamente nenhuma data recente).
- A página `/admin/api-explorer` — a versão "isolada" do Explorador — consulta outra tabela: `public.sports_events`, que **tem dados atuais** (25 eventos em 08/07/2026, 40 em 07/07, etc.).
- Portanto o Explorador em si funciona; o picker está lendo de uma tabela legada que deixou de ser alimentada. Isso explica exatamente o print anexado ("0 jogos · Nenhum jogo de Futebol em 08/07/2026").

Não há erro de rede, permissão ou RLS — a query retorna 0 linhas legitimamente porque a fonte de dados foi trocada e o hook não acompanhou.

# Correção

Alterar `src/hooks/useDailyEventsByDate.ts` para consumir `sports_events` (mesma fonte que o Explorador oficial), mantendo a assinatura pública do hook para não impactar `ExploradorEventoPicker`.

Mudanças pontuais no hook:

1. Trocar `.from("daily_events")` por `.from("sports_events")`.
2. Como `sports_events` não tem coluna `event_date`, filtrar por range de `commence_time`:
   - `gte(commence_time, <YYYY-MM-DD>T00:00:00)`
   - `lt(commence_time, <YYYY-MM-DD+1>T00:00:00)`
   - (usar dia local, igual ao `ApiExplorer.tsx`).
3. Mapear campos para o shape `DailyEvent` já esperado:
   - `id` ← `canonical_key` (ou `id` da linha)
   - `sport`, `league_name`, `league_logo`, `home_team`, `away_team`, `home_team_logo`, `away_team_logo`, `commence_time`, `country` → mesmos nomes já existem em `sports_events`
   - `status` ← derivado (ex.: `home_score/away_score` presentes ⇒ `"finished"`, senão `null`) — mantém `computeMatchPhase` funcionando
   - `fixture_key` ← `canonical_key` para preservar a deduplicação já implementada
4. Manter a deduplicação existente no client (sem alterações).
5. Nenhuma mudança de UI, sem novos componentes, sem migração de banco.

# Fora de escopo

- Não vamos migrar/backfillar `daily_events` (tabela legada, sem dono claro).
- Não vamos remover `daily_events` neste passo (evita quebrar qualquer consumidor residual).
- Nenhuma mudança em RLS, edge functions ou no `ApiExplorer.tsx`.

# Verificação

Após o patch:
1. Abrir Nova Aposta → botão Explorador na data 08/07/2026 → esperar lista com ~25 jogos de Futebol.
2. Selecionar um jogo e confirmar que o form preenche evento/mercado/hora como antes (o callback `onSelect(DailyEvent)` recebe os mesmos campos).
3. Trocar data para 07/07 e 09/07 e conferir contagens compatíveis com o Explorador oficial.
