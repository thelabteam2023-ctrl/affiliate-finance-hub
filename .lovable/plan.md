
# Plano — Sofascore como fonte interna do Explorador de Dados

## Diagnóstico atual (confirmado no banco)

- Página: `src/pages/ApiExplorer.tsx` ("Explorador de Dados Esportivos v2"). Ela já **lê apenas da nossa tabela** `public.daily_events` — não bate na API durante a navegação. O princípio "API → tabela nossa → UI" já está correto na leitura.
- Ingestor atual: edge function `supabase/functions/api-monitor` usando **The Odds API + API-Sports** (não o Sofascore/Apify novo). Lista hard-coded de ~15 ligas.
- Estado da tabela `daily_events` (499 linhas no total):
  - Hoje (22/06/2026): apenas **4 soccer + 9 baseball**. Zero tênis, basquete, hóquei, F. Americano.
  - Distribuição histórica: soccer 229, americanfootball 139, tennis 74 (só 25–27/05), baseball 51, basketball 4, icehockey 2.
- Causa raiz do "nada carrega": o ingestor antigo só popula as ligas que ele conhece, com janela curta, e não cobre os esportes da tela. Não é bug de filtro — é **gap de ingestão**.

## Objetivo

1. Trazer eventos do **Sofascore (actor `azzouzana/sofascore-scraper-pro` no Apify)** para uma tabela nossa (staging), com escopo amplo (futebol + tênis + basquete + NFL + MLB + NHL).
2. Materializar em `daily_events` (já consumida pelo Explorador) via UPSERT idempotente, sem quebrar nada que hoje lê dela.
3. Manter os filtros (Esporte/País/Liga) lendo da nossa tabela, com cobertura real de todos os esportes.
4. Controle de custo: cap por chamada, sem polling automático nesta fase.

## Arquitetura proposta

```text
Apify (Sofascore actor)
        │  run sync (com maxItems)
        ▼
edge fn  sofascore-sync   ── chama Apify, normaliza, faz UPSERT
        │
        ├─► public.sofascore_events_raw    (staging cru, auditável)
        └─► public.daily_events            (consumida pelo Explorador)
                       │
                       ▼
              ApiExplorer.tsx (já existente)
              ExploradorEventoPicker (formulário Surebet)
```

Nada na UI consulta a API externa. A UI só lê das tabelas locais.

## Etapas

### 1. Tabelas (migration)
- Nova `public.sofascore_events_raw`: payload bruto (jsonb) + `source_run_id`, `actor_id`, `fetched_at`, `sport`, `unique_tournament_id`, `event_id`. Serve como auditoria e fonte de reprocessamento sem refazer chamadas pagas.
- Nova `public.sofascore_sync_runs`: id, status, cost_usd, items_fetched, started_at, finished_at, params (jsonb), error. Visível no header do Explorador.
- Em `public.daily_events`: adicionar colunas opcionais `source` ('odds_api' | 'api_sports' | 'sofascore') e `external_ids jsonb` (para guardar `uniqueTournament.id`, `event.id`, etc.). Sem mexer no shape lido hoje.
- GRANTs e RLS: leitura para `authenticated`, escrita só `service_role` (ingestor roda no edge function).
- Índices: `(sport, event_date)`, `(unique_tournament_id)`, `(source, fetched_at desc)`.

### 2. Edge function `sofascore-sync`
- Input: `{ sports: string[], days: number (1..3), maxItems: number (cap, default 200) }`.
- Lê secret `APIFY_TOKEN` (a ser cadastrado).
- Monta `startUrls` a partir de uma tabela de seeds por esporte (próximo item).
- Chama o actor com `maxItems` sempre presente; aborta e reporta se acumulado da run estimado > USD 0.50.
- Salva payload em `sofascore_events_raw`, normaliza para `daily_events` com UPSERT por `(source, external_ids->>'event_id')`.
- Resposta: `{ run_id, items, cost_estimate_usd, by_sport: {...} }`.

### 3. Seeds de cobertura (tabela `sofascore_seeds`)
- Linhas configuráveis: `sport`, `label`, `start_url`, `enabled`. Bootstrap inicial:
  - Futebol: agenda global de hoje/amanhã + top ligas (BR, EPL, LaLiga, Serie A, Bundesliga, Ligue 1, Champions, Libertadores).
  - Tênis: ATP, WTA, Challenger, ITF (agenda do dia).
  - Basquete: NBA + EuroLeague.
  - NFL, MLB, NHL (quando em temporada).
- Permite ligar/desligar cada seed sem deploy.

### 4. Normalização Sofascore → `daily_events`
Mapeamento determinístico:
- `sport` ← mapa do actor (football→soccer, american-football→americanfootball, etc).
- `event_date` ← `startTimestamp` → data em America/Sao_Paulo.
- `commence_time` ← `startTimestamp` (UTC).
- `home_team`, `away_team`, `home_team_logo`, `away_team_logo`.
- `league_name` ← `uniqueTournament.name`.
- `league_key` ← `sofascore_<uniqueTournament.id>`.
- `league_logo`, `league_flag`.
- `country` ← `category.name` (com normalização que já existe em `exploradorFilters.ts`).
- `continent` ← derivado por mapa país→continente (utilitário pequeno).
- `competition_type` ← heurística por nome ('cup'|'continental'|'league').
- `status` ← mapa Sofascore → {scheduled, live, finished}.
- `external_ids` ← `{ sofascore_event_id, unique_tournament_id, category_id }`.
- `source = 'sofascore'`.

### 5. UI no Explorador (mínima, opcional nesta fase)
- Botão **"Sincronizar Jogos (Sofascore)"** ao lado do botão atual, chamando `sofascore-sync` com `{ sports: [...selecionados], days: 2, maxItems: 200 }`.
- Card de "Última sincronização Sofascore" com `cost_usd`, `items`, `by_sport` da última run.
- Filtros laterais continuam como estão — passam a ter dados de todos os esportes porque a tabela estará populada.
- Nada de chamada direta à Apify a partir do browser (sempre via edge function).

### 6. Segurança e custo
- `APIFY_TOKEN` cadastrado via Lovable Cloud (nunca exposto ao client). Vou solicitar o secret antes da implementação.
- Toda chamada do actor passa `maxItems`. Hard cap por run: 500 itens.
- Hard cap acumulado por dia (controle simples em `sofascore_sync_runs`): USD 1,00. Acima disso, função retorna erro.
- Sem cron automático nesta fase — disparo manual pelo botão. Cron entra em fase seguinte, depois de validarmos custo real.

### 7. Validação
- Após primeira sync manual: conferir `SELECT sport, count(*) FROM daily_events WHERE source='sofascore' AND event_date=CURRENT_DATE GROUP BY 1`.
- Conferir UI: Explorador deve mostrar partidas em basquete/tênis/etc. no dia.
- Conferir filtros Esporte/País/Liga com contagens facetadas refletindo a nova base.

## Fora de escopo (próximas fases)

- Liquidação automática de apostas via Sofascore (placares).
- Cron horário/diário.
- Backfill histórico amplo.
- Substituir The Odds API / API-Sports (por ora, convivem; `source` permite comparar).

## O que preciso do seu lado antes de codar

- Confirmar o nome do secret a cadastrar: sugiro `APIFY_TOKEN`.
- Confirmar os esportes do bootstrap (sugestão: soccer, basketball, tennis, baseball, americanfootball, icehockey).
- Confirmar o cap diário de USD 1,00 da fase de validação.
