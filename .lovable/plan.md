# Plano: Dedup de jogos + Filtro por Campeonato (badges) no formulário de Arbitragem

## Contexto / Diagnóstico

Investiguei os dois pontos levantados:

### 1. Duplicação de jogos (ex.: New Zealand x Egypt em 21 e 22 de junho)

Consultando `daily_events` o mesmo fixture aparece duas vezes:

| commence_time (UTC) | event_date | league_name | id |
|---|---|---|---|
| 2026-06-22 01:00 | **2026-06-21** | FIFA World Cup | d040… |
| 2026-06-22 01:00 | **2026-06-22** | Copa do Mundo | ebdf… |

Duas causas combinadas:

1. **`event_date` calculado em fuso diferente entre syncs.** 01:00 UTC = 22:00 (21/06) no horário de Brasília. Um sync grava `event_date` em UTC (22/06), outro em horário local (21/06). Resultado: mesmo jogo aparece em dois dias.
2. **Falta de dedup entre fontes / nomes de liga.** A mesma partida vem de duas ligas com nomes diferentes ("FIFA World Cup" vs "Copa do Mundo") e ambas são gravadas porque a chave de unicidade considera o nome da liga.

### 2. Filtro atual do popover (`ExploradorEventoPicker`)

Hoje o popover tem: data + busca + painel "Filtros" avançados (esporte/país/liga em checkboxes) + chips de filtros ativos + toggles "Apenas Futebol" / "Mostrar encerrados". Você quer manter os avançados, mas trocar a forma de filtrar por campeonato para **badges horizontais clicáveis** com o nome de cada liga do dia.

---

## O que vou fazer

### Parte A — Corrigir duplicação de jogos

**A1. Normalizar `event_date` para o fuso do app (America/Sao_Paulo) em todas as origens de escrita**
- Edge functions afetadas: `odds-api-catalog-sync`, `api-monitor`, `fill-missing-logos`, qualquer função que faça `INSERT/UPSERT` em `daily_events`.
- Padronizar: `event_date = (commence_time AT TIME ZONE 'America/Sao_Paulo')::date`. Assim 01:00 UTC sempre cai em 21/06 (local), nunca duplicado.
- Mesma regra aplicada em `sports_events` se ela alimenta o explorador.

**A2. Unificar nomes de liga (alias)**
- Criar tabela `league_aliases (raw_name text PK, canonical_name text, sport text)` com GRANTs e RLS leitura pública/serviço.
- Seed inicial: `FIFA World Cup → Copa do Mundo`, e os principais casos que aparecerem nos dados.
- Sync passa a gravar `league_name = canonical_name` quando houver alias; mantém `league_name_raw` para auditoria.

**A3. Chave de dedup determinística**
- Adicionar coluna `fixture_key text` em `daily_events` calculada como
  `lower(sport) || '|' || date_trunc('minute', commence_time) || '|' || lower(home_team) || '|' || lower(away_team)`
  (independente de liga/data local).
- `UNIQUE INDEX` em `fixture_key`. Upsert por essa chave.
- Migração one-shot que: (a) recalcula `event_date` em America/Sao_Paulo, (b) aplica aliases, (c) consolida linhas duplicadas mantendo a com logos mais completas, (d) cria o índice único.

**A4. Defesa client-side (rede de segurança)**
- Em `useDailyEventsByDate`, dedupar por `fixture_key` (ou pelo trio sport+commence_time+times) antes de retornar, garantindo que mesmo se vier duplicado da API o UI mostra uma linha.

### Parte B — Filtro por campeonatos como badges

Redesenho do `ExploradorEventoPicker`:

```text
┌────────────────────────────────────────────────────┐
│ [22 de jun ▾]  [🔎 buscar…]            [Filtros▾] │
├────────────────────────────────────────────────────┤
│ Campeonatos:                                       │
│ [ Todos (7) ] [⚽ Copa do Mundo (3)]               │
│ [ Série B (2)] [ Irish Premier (1)] [ MLB (1) ]    │
├────────────────────────────────────────────────────┤
│ 7 jogos      ◐ Apenas Futebol  ◐ Mostrar encerr.   │
├────────────────────────────────────────────────────┤
│  …lista de jogos…                                  │
└────────────────────────────────────────────────────┘
```

**B1. Componente novo `LeagueBadgeRow`**
- Recebe `events: DailyEvent[]` (já passados pelos filtros rápidos) e `selected: string[]`.
- Renderiza um badge "Todos" + um badge por liga do dia com contagem entre parênteses, ícone do esporte e logo da liga quando disponível (`league_logo`).
- Multi-seleção (click alterna; "Todos" limpa).
- Scroll horizontal com `overflow-x-auto` (sem quebrar layout do popover).
- Estado selecionado destacado (variant `default`), não-selecionado `outline`, hover sutil.

**B2. Integração com o estado existente**
- Reaproveitar `ExploradorFilterState.leagues` (já existe) — os badges são apenas uma UI nova para o mesmo array.
- Sincronizar nos dois sentidos: clique no badge atualiza `filters.leagues`; alterar via painel "Filtros" reflete nos badges.
- Manter o painel "Filtros" avançado (esporte/país/liga em checkboxes) para uso quando a lista de ligas for grande.
- Manter chips de filtros ativos e os toggles "Apenas Futebol" / "Mostrar encerrados".

**B3. Comportamento "Todos"**
- Quando nenhuma liga estiver selecionada, exibe "Todos" como ativo e mostra tudo.
- Clicar em qualquer badge entra em modo seleção; "Todos" zera a seleção.

**B4. Acessibilidade e responsividade**
- `role="tablist"` no container, `aria-pressed` nos badges.
- Largura do popover passa de 460px → 520px para acomodar a faixa; permanece dentro do limite de viewport em mobile (com scroll horizontal).

### Parte C — QA

- Reabrir o popover em 21/06 e 22/06: o jogo NZ x Egypt aparece apenas em 21/06 (data local).
- Sync manual da Odds API: confirmar que reupsert não recria duplicata.
- Selecionar badge "Copa do Mundo": lista mostra só os 3 jogos.
- Combinar badge + busca + toggle "Apenas Futebol": resultados consistentes.

---

## Detalhes técnicos

**Arquivos a editar**
- `src/components/surebet/ExploradorEventoPicker.tsx` — integra `LeagueBadgeRow`, amplia largura.
- `src/components/surebet/LeagueBadgeRow.tsx` (novo).
- `src/components/surebet/utils/exploradorFilters.ts` — sem mudança de shape; eventual helper `toggleLeague`.
- `src/hooks/useDailyEventsByDate.ts` — dedup defensivo client-side, seleciona `fixture_key`.
- `supabase/functions/odds-api-catalog-sync/index.ts`, `api-monitor/index.ts`, `fill-missing-logos/index.ts` — normalizar `event_date` para `America/Sao_Paulo` e aplicar alias de liga ao gravar.

**Migrações Supabase**
1. `league_aliases` (tabela + RLS + GRANTs + seed).
2. `daily_events`: adicionar `fixture_key`, recalcular dados existentes, criar `UNIQUE INDEX`, recalcular `event_date` em fuso local, aplicar aliases, consolidar duplicatas.
3. Mesmo ajuste em `sports_events` se aplicável.

**Não vou mexer**
- Lógica de logos (resolvida na rodada anterior).
- Mapeamento de mercados, odds, ou qualquer engine de surebet.
- Form de Arbitragem fora do popover.

Confirma este plano para eu implementar?
