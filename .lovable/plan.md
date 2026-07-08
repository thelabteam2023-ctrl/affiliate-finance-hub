
## Diagnóstico

Fizemos consultas nas duas APIs que hoje alimentam `sports_events` (a tabela que o Explorador de Dados lê):

**1. Odds API (fonte primária/curada em `supabase/functions/odds-api-catalog-sync/index.ts`)**
Nosso `SPORT_KEY_MAP` cobre só os torneios "principais":
- `soccer_uefa_champs_league` → UEFA Champions League
- `soccer_uefa_europa_league` → UEFA Europa League
- `soccer_uefa_europa_conference_league` → UEFA Conference League

Consultando o catálogo oficial (https://the-odds-api.com/sports-odds-data/sports-apis.html) descobrimos:

| Torneio | Existe sport_key na Odds API? |
|---|---|
| UEFA Champions League **Qualification** | **Sim** — `soccer_uefa_champs_league_qualification` |
| UEFA Europa League **Qualification** | **Não** (não há key) |
| UEFA Conference League **Qualification** | **Não** (não há key) |

Ou seja: a Odds API só publica a Qualificação da Champions. As qualificatórias de Europa/Conference **não existem como produto** na Odds API.

**2. TheSportsDB (fonte secundária em `supabase/functions/thesportsdb-sync/index.ts`)**
O sync usa `/eventsday.php?d=DATA&s=Soccer`. Testamos em 5 datas (08–15/07/26). Resultado: o endpoint gratuito retorna apenas **3 jogos de futebol por dia no mundo inteiro** (nenhum jogo europeu). O catálogo `all_leagues.php` também não expõe as ligas de qualificação — só existem `4480 UEFA Champions League`, `5071 UEFA Conference League` e `4524 UEFA Cup` (sem separar as fases eliminatórias).

Confirmação em `sports_events`: nenhum jogo com `league_name ilike '%uefa%'` ou `'%qualif%'` foi persistido nos últimos dias.

## Conclusão

- Podemos **ganhar imediatamente** a UEFA Champions League Qualification agregando o sport_key que a Odds API já expõe.
- Podemos **melhorar parcialmente** garantindo que a fase de qualificação da Champions apareça como categoria própria no explorador (evita cair em "UEFA Champions League" e confundir com fase de grupos).
- **NÃO conseguimos** hoje trazer Europa League Qualifying e Conference League Qualifying pelas APIs conectadas. Para isso é preciso uma terceira fonte (opções listadas no fim).

## Escopo desta entrega

### 1. Adicionar UCL Qualifying ao catálogo Odds API
Arquivo: `supabase/functions/odds-api-catalog-sync/index.ts`
- Acrescentar no `SPORT_KEY_MAP`:
  - `soccer_uefa_champs_league_qualification: { internal: "soccer", country: null, league_name: "UEFA Champions League — Qualification" }`
- Bônus (mesma família, mesmo custo zero de quota — endpoint `/events`):
  - `soccer_uefa_euro_qualification` → `"UEFA Euro Qualification"`
  - `soccer_uefa_nations_league` → `"UEFA Nations League"`

`inferCompetitionType` em `_shared/catalogNormalize.ts` já casa com `/champions/` e `/qualif/` (a regex atual pega Champions; vamos incluir `qualif` explicitamente na branch `continental` para as três ficarem classificadas como internacionais).

### 2. Disparar o sync retroativo
Uma execução manual da edge `odds-api-catalog-sync` (via botão do `/admin/api-explorer` ou `curl`) faz o upsert idempotente em `sports_events`. Nenhuma migração é necessária — a tabela já aceita esses league_names via `canonical_key`.

### 3. Reportar transparência ao usuário
No `/admin/api-explorer`, adicionar uma linha na aba **Diagnóstico** informando quais ligas UEFA estão cobertas por fonte, para que o operador saiba que Europa/Conference Qualifying **não estão cobertas** hoje.

## Fora do escopo (precisa decisão)

Para cobrir **Europa League Qualifying** e **Conference League Qualifying** é preciso plugar uma fonte adicional. Opções em ordem de custo/benefício:

| Fonte | Cobertura | Custo | Esforço |
|---|---|---|---|
| **API-Football (RapidAPI)** | Cobre todas as fases de todas as competições UEFA por `league.id` + `season` | Free tier: 100 req/dia; pago a partir de US$19/mês | Novo connector + novo edge function (~1 dia) |
| **TheSportsDB Patreon key** | Desbloqueia `/eventsround.php` e `/eventsseason.php` sem cap de 3/dia | US$5/mês | Trocar `TSD_KEY="3"` por env `THESPORTSDB_KEY` e adicionar sync por league_id (4480, 5071 + Europa) |
| **Firecrawl scraping de FlashScore/Sofascore** | Cobre 100% | Já temos conector Firecrawl; custa créditos | Novo edge function de scraping — frágil a mudanças de HTML |

Recomendação: **TheSportsDB Patreon** (US$5/mês) é o melhor custo/benefício — reutiliza o sync existente e resolve as três qualificatórias de uma vez. Aguardo confirmação antes de implementar.

## Arquivos que serão alterados (etapa 1–3)

```text
supabase/functions/odds-api-catalog-sync/index.ts   ← 3 entradas novas em SPORT_KEY_MAP
supabase/functions/_shared/catalogNormalize.ts      ← regex "qualif" em inferCompetitionType
src/components/api-explorer/…DiagnosticoTab.tsx     ← linha "Cobertura UEFA por fase"
```

Sem migração de banco. Sem alteração de RLS. Sem impacto em custo da Odds API (endpoint `/events` é gratuito no plano atual).
