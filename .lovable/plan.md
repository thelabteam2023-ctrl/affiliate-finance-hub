
# Plano: Explorador de Dados como Catálogo de Jogos

## Objetivo

Transformar o Explorador em uma **base de catálogo confiável de partidas** (não de odds) para todos os esportes já suportados (futebol, basquete, futebol americano, beisebol, tênis, hóquei). Fonte primária: **TheSportsDB** (gratuito, com logos). O Odds API deixa de alimentar este explorador, mas permanece disponível para outras áreas do sistema que precisem de odds.

## Princípios de engenharia

1. **Uma única fonte de verdade por linha** — sem duplicatas. Cada partida tem uma chave canônica determinística.
2. **Idempotência** — qualquer sync pode rodar N vezes sem criar duplicata nem perder dados.
3. **Enriquecimento sem perda** — logos e metadados podem vir de fontes secundárias e atualizam só os campos vazios/desatualizados.
4. **Separação clara entre raw e curado** — payload bruto persistido para auditoria; tabela normalizada para consumo da UI.
5. **Sync automatizado** — cron diário em vez de depender de clique manual.
6. **Observabilidade** — métricas por execução (eventos por esporte, novos vs atualizados, erros).

---

## 1. Modelo de dados

### 1.1 Nova tabela `sports_events` (catálogo curado)

Substitui o uso de `daily_events` para este explorador (mantemos `daily_events` intocada para o restante do sistema).

Campos principais:
- `id` (uuid, PK)
- `canonical_key` (text, UNIQUE) — `${sport}|${YYYYMMDDHHMM}|${normHome}_${normAway}`
- `sport` — soccer | basketball | tennis | baseball | americanfootball | icehockey
- `home_team`, `away_team` (display)
- `home_team_normalized`, `away_team_normalized` (para dedup)
- `home_team_logo`, `away_team_logo`
- `league_id`, `league_name`, `league_logo`
- `country`, `continent` (com "Internacional" para Mundial/Champions/Libertadores/Euro)
- `competition_type` (league | cup | continental)
- `commence_time` (UTC), `event_date_brt` (date)
- `status` (scheduled | live | finished | postponed | cancelled)
- `home_score`, `away_score` (nullable)
- `venue`, `city`
- `primary_source` (thesportsdb)
- `sources` (jsonb) — { thesportsdb: { event_id, league_id, updated_at }, odds_api: {...} }
- `first_seen_at`, `last_synced_at`

Índices: `canonical_key UNIQUE`, `(sport, event_date_brt)`, `(league_id)`, `(status)`.

### 1.2 Normalização de nomes (chave de dedup)

Função SQL `normalize_team(text)`:
- lowercase, remove acentos, remove "FC/CF/SC/Club/Football", remove espaços/pontuação.
- Ex: `"Real Madrid CF"` → `realmadrid`; `"São Paulo FC"` → `saopaulo`.

Aliases manuais via `team_name_aliases` (já existe) para casos que a normalização não resolve (ex.: `"Man United"` ↔ `"Manchester United"`).

### 1.3 Tabelas auxiliares (já existentes, mantidas/expandidas)

- `team_logos` — cache de badges. Source preferido: TheSportsDB.
- `league_logos` — idem para ligas.
- `sofascore_events_raw` → **renomear** para `sports_events_raw`. Continua guardando payload bruto por execução para auditoria/replay.
- `sofascore_sync_runs` → **renomear** para `sports_sync_runs`.
- `sofascore_seeds` → **descontinuar** (TheSportsDB não usa seeds; pode ser dropada ou marcada como deprecated).

---

## 2. Pipeline de sincronização

### 2.1 Edge function `thesportsdb-sync` (já existe, expandir)

Fluxo por execução:
1. Calcular janela de datas (default: hoje, amanhã, depois de amanhã — 3 dias rolling no fuso BRT).
2. Para cada (esporte × data), chamar `/eventsday.php?d=YYYY-MM-DD&s=<Sport>`.
3. Inserir payload bruto em `sports_events_raw`.
4. Normalizar cada evento e calcular `canonical_key`.
5. **UPSERT** em `sports_events` com `onConflict: canonical_key`:
   - Sempre atualiza: `status`, `home_score`, `away_score`, `commence_time`, `last_synced_at`.
   - Atualiza só se vazio: `home_team_logo`, `away_team_logo`, `league_logo` (não sobrescreve logo manual).
   - Faz merge no campo `sources` (preserva referências de outras APIs).
6. Atualizar `team_logos` e `league_logos` (já feito hoje — manter).
7. Detectar e classificar competição como `continental` quando regex bater (FIFA World Cup, Champions, Libertadores, Euro etc.) → `continent='Internacional'`, `country=null`.
8. Registrar métricas em `sports_sync_runs`.

### 2.2 Cron diário (pg_cron + pg_net)

Agendar `thesportsdb-sync` para rodar **3× ao dia** (06:00, 14:00, 22:00 BRT) automaticamente, mantendo o catálogo fresco sem ação humana. Mantém botão manual no UI para forçar refresh.

### 2.3 Backfill histórico (opcional)

Endpoint extra `?dates=["2026-06-15", ..., "2026-06-22"]` para preencher últimos N dias ao primeiro deploy.

---

## 3. UI do Explorador

### 3.1 Substituir fonte de leitura

`ApiExplorer.tsx` passa a ler de `sports_events` (em vez de `daily_events`). Mesmos filtros (continente, país, tipo, esporte, intervalo de datas, busca) continuam funcionando.

### 3.2 Remover/ocultar elementos de odds

- Tirar botões e contadores ligados ao sync do Odds API deste explorador (não excluir a função em si — outros módulos do sistema podem usar).
- Renomear seção para **"Catálogo de Partidas"** com descrição clara.

### 3.3 Indicadores de qualidade

Cards no topo:
- Total de partidas no catálogo
- Partidas com logos completos / sem logos
- Última sincronização (timestamp + status)
- Cobertura por esporte (mini-barras)

### 3.4 Ação "Recarregar logos faltantes"

Botão que dispara função específica para reprocessar partidas com `home_team_logo IS NULL OR away_team_logo IS NULL`, tentando: (a) `team_logos` cache, (b) busca por alias, (c) chamada extra ao TheSportsDB `/searchteams.php`.

---

## 4. Limpeza e migração

### 4.1 Migração inicial

1. Criar `sports_events`, função `normalize_team`, índices.
2. Migrar `daily_events WHERE source='thesportsdb'` → `sports_events` (computando `canonical_key`).
3. Renomear `sofascore_*` → `sports_*`.
4. Manter `daily_events` intocada (continua servindo outros módulos com Odds API).

### 4.2 Plano de descontinuação suave

- Marcar (não excluir) a infra Sofascore/Apify como deprecated nos comentários SQL.
- Após 30 dias rodando estável, dropar `sofascore_seeds` e revogar Apify.

---

## 5. Testes e validação

- Rodar sync e verificar que `New Zealand × Egypt` aparece **uma única vez** com `canonical_key` estável.
- Forçar segunda execução: contar antes/depois deve ser igual (idempotência).
- Validar continent='Internacional' para Copa do Mundo, Champions, Libertadores.
- Validar que `team_logos` traz badge para >80% dos times retornados.

---

## 6. O que NÃO está no escopo

- Mexer no fluxo de odds usado por outras telas (apostas, calculadora, etc.).
- Excluir `daily_events` ou registros do Odds API.
- Trazer dados ao vivo (placar minuto-a-minuto). Status é atualizado a cada sync, não em tempo real.

---

## 7. Entregáveis em ordem

1. **Migration** — tabela `sports_events`, função `normalize_team`, índices, renomeação `sofascore_* → sports_*`.
2. **Edge function** — `thesportsdb-sync` adaptada para `sports_events` com `canonical_key` e merge de `sources`.
3. **Backfill** — migrar registros existentes de `daily_events (source=thesportsdb)` para `sports_events`.
4. **Cron** — `pg_cron` agendando 3× ao dia.
5. **UI** — `ApiExplorer.tsx` lendo de `sports_events`, removendo botões de Odds API, adicionando indicadores de qualidade e botão de re-logos.
6. **Função "fill-missing-logos"** — endpoint específico para enriquecer logos faltantes.

Tempo estimado: ~3 iterações.

---

Confirma que sigo por esse caminho? Se sim, começo pela **migration (passo 1)**.
