# Plano: Odds API como fonte complementar do catálogo

## Objetivo

Cobrir os jogos que o TheSportsDB gratuito não devolve (Brasileirão Série A/B, Copa do Brasil, La Liga 2, etc.) usando o **Odds API como segunda fonte** que alimenta a MESMA tabela `sports_events`, com deduplicação pela `canonical_key` já existente. TheSportsDB continua como primário (badges/logos); Odds API entra para garantir cobertura de jogos.

## Estratégia de merge

Cada fonte enriquece a outra:
- **TheSportsDB primário:** quando ambos têm o jogo, fica o registro do TheSportsDB e Odds API só faz merge no campo `sources` jsonb (rastreabilidade).
- **Odds API único:** quando só Odds API tem (caso da Série B), insere normalmente. `primary_source='odds_api'`. Logos virão do cache local (`team_logos`/`league_logos`) ou ficam vazias até o `fill-missing-logos` tentar buscar pelo nome.
- **Dedup:** mesma `buildCanonicalKey(sport, commenceUtc, home, away)` com `normTeam()` ordenado. Isto garante que `"Coritiba x Botafogo SP"` chegue pelas duas APIs e vire um único registro.

## Mudanças

### 1. Edge function `odds-api-catalog-sync` (nova)

Caminho: `supabase/functions/odds-api-catalog-sync/index.ts`. Usa `ODDS_API_KEY` (secret existente).

Fluxo:
1. Lista esportes ativos do Odds API (`/v4/sports?all=false`).
2. Para cada esporte mapeado (soccer_brazil_campeonato, soccer_brazil_serie_b, soccer_efl_champ, americanfootball_nfl, basketball_nba, etc.), busca `/v4/sports/{key}/events` (endpoint sem custo de odds — só catálogo).
3. Normaliza para o mesmo formato `NormalizedEvent`:
   - `canonical_key` calculada igual ao TheSportsDB
   - `sport` mapeado pra interno (soccer / basketball / ...)
   - `league_name` ← título do esporte (ex.: "Brazil Série B")
   - `country` / `continent` inferidos pelo prefixo da chave Odds API
   - `competition_type` por regex (mesma `inferCompetitionType`)
   - `home_team_logo`/`away_team_logo`/`league_logo` ← buscados no cache local `team_logos`/`league_logos`; se não tiver, ficam null
4. UPSERT em `sports_events` com a mesma lógica de merge do `thesportsdb-sync`:
   - Se `canonical_key` já existe (vinda do TheSportsDB), só atualiza `last_synced_at` e faz merge no `sources.odds_api`. Não sobrescreve logos.
   - Se não existe, insere com `primary_source='odds_api'`.
5. Registra run em `sports_sync_runs` com `params.source = 'odds_api'`.

### 2. Refatoração mínima

Extrair as funções compartilhadas (`normTeam`, `buildCanonicalKey`, `inferCompetitionType`, `COUNTRY_TO_CONTINENT`, mapa de status) para `supabase/functions/_shared/catalogNormalize.ts` para garantir que as duas funções produzam exatamente a mesma `canonical_key`.

### 3. Cron

Agendar `odds-api-catalog-sync` também 3× ao dia, defasado 5min do TheSportsDB (06:05, 14:05, 22:05 BRT). Assim o TheSportsDB chega primeiro e o Odds API só preenche o que falta.

### 4. UI no Explorador (`src/pages/ApiExplorer.tsx`)

- Botão **"Atualizar catálogo (Odds API)"** ao lado do botão atual.
- KPI "Cobertura por fonte" mostrando: X jogos só TheSportsDB / Y só Odds API / Z em ambas.
- Filtro opcional por `primary_source`.

### 5. Logos faltantes

`fill-missing-logos` continua igual. Como ele já busca em `team_logos` por nome normalizado e cai para `searchteams.php` do TheSportsDB, vai cobrir naturalmente logos de times brasileiros que o TheSportsDB conhece (mesmo sem ter o jogo na agenda).

## Detalhes técnicos

```text
TheSportsDB sync ─┐
                  ├─► canonical_key ─► UPSERT em sports_events
Odds API sync ────┘                     (merge sources, preserva logos)
```

Esportes Odds API a priorizar no MVP:
- soccer_brazil_campeonato, soccer_brazil_serie_b
- soccer_argentina_primera_division
- soccer_spain_la_liga, soccer_spain_segunda_division
- soccer_efl_champ (Championship inglesa)
- soccer_uefa_champs_league
- americanfootball_nfl, basketball_nba, baseball_mlb, icehockey_nhl
- Lista controlada via constante no edge function; fácil expandir.

Endpoint usado: `GET /v4/sports/{sport_key}/events?apiKey=...` — esse endpoint **não consome quota** (só `odds` consome), então o custo de uso é zero.

## Fora de escopo

- Continuar coletando odds.
- Mexer em `daily_events` ou em fluxos de aposta.
- Buscar logos novas a partir do Odds API (ele não fornece).

## Entregáveis

1. `supabase/functions/_shared/catalogNormalize.ts` — utilitários compartilhados.
2. `supabase/functions/odds-api-catalog-sync/index.ts` — nova edge function.
3. Cron 3× ao dia para a nova função.
4. Botão + KPI de fonte no `ApiExplorer.tsx`.

Confirma que sigo?
