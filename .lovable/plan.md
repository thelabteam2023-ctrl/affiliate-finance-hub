# Plano: Sync de catálogo estável + Estados "ao vivo / encerrado" baseados no tempo real do jogo

## Diagnóstico

### 1. "Sync falhou: Failed to send a request to the Edge Function"

Esse erro vem do cliente Supabase quando a Edge Function não responde a tempo (timeout do fetch ou cold-start lento) ou cai por exceder o limite de execução. Olhando o `odds-api-catalog-sync` atual:

- Faz `fetch` paralelo de **47 sport_keys** contra a Odds API em uma única request.
- Depois roda um loop **sequencial** de `UPDATE` por linha (`for (const u of toUpdate) { supabase.update(...) }`) — N requests serializadas ao Postgres.
- Em horários ruins (muitos eventos / latência da Odds API) a função fica perto do limite de 60s do edge runtime; o `supabase.functions.invoke` no front aborta com a mensagem genérica que você viu.

Histórico recente confirma: a maioria das runs duraram ~1s, mas houve uma run com erro 403 da Odds API e outras com 6+ s — perto do limite quando a Odds API está lenta. Não é problema de CORS nem código quebrado; é fragilidade do desenho síncrono.

### 2. Quando os resultados são atualizados hoje?

Há **dois** cron jobs (configurados via `pg_cron`):

| Job | Horário (UTC) | Em Brasília (UTC-3) |
|---|---|---|
| `thesportsdb-sync-3x-daily` | 01:00, 09:00, 17:00 | 22:00, 06:00, 14:00 |
| `odds-api-catalog-sync-3x-daily` | 01:05, 09:05, 17:05 | 22:05, 06:05, 14:05 |

Ou seja, o catálogo (com `result_home`/`result_away`) só é refrescado **3× por dia**. Resultados quase nunca chegam minutos depois do fim do jogo — é normal demorar várias horas.

### 3. Por que aparece "Encerrado" assim que a partida começa?

No `ApiExplorer.tsx` (linha 1014) o badge "Encerrado" é puramente derivado de tempo:

```ts
const isPast = startsAt.getTime() < Date.now();
```

Ou seja, basta `commence_time < agora` para virar "Encerrado". Não existe estado intermediário "ao vivo / em andamento". É só rótulo de UI; o campo `status` no banco continua `scheduled` até o sync 3×/dia preencher.

---

## O que eu vou fazer

### Parte A — Estabilizar o "Atualizar catálogo"

**A1. Resposta imediata + processamento em background**
- `odds-api-catalog-sync` passa a:
  1. Criar a run em `sports_sync_runs` com `status='running'` e devolver **202 + `run_id`** imediatamente.
  2. Continuar o trabalho dentro de `EdgeRuntime.waitUntil(...)` (padrão Supabase para tarefas que ultrapassam o tempo de resposta).
- O front deixa de depender do retorno da função: após disparar, faz polling em `sports_sync_runs` (5–10 s) e mostra "Sincronizando... (run #abc)" → quando `status` vira `success`/`error`, toast com o resumo.

**A2. Reduzir tempo do trabalho em si**
- Substituir o loop sequencial `for (const u of toUpdate) supabase.update(...)` por **upsert em lote** (`supabase.from('sports_events').upsert(rows, { onConflict: 'canonical_key' })` em chunks de 500). Reduz N requests para `ceil(N/500)`.
- Limitar paralelismo dos fetches à Odds API a **8 concorrentes** (em vez de 47) com uma pool simples — evita o 403 "challenge" intermitente e diminui pressão de memória.
- Timeout individual por fetch (`AbortController`, 12 s); erros parciais entram em `fetch_errors` sem derrubar tudo.

**A3. Retentativa amigável no front**
- Se mesmo assim o invoke falhar, o handler atual mostra um botão "Tentar novamente" no toast em vez de só erro.

### Parte B — Estado "Ao Vivo" / "Em Andamento" no UI

Sem custo extra de API: derivado de tempo + duração esperada por esporte.

**B1. Tabela de duração estimada por esporte** (constante no front, sem mudança de schema)

| Esporte | Duração base + janela de buffer |
|---|---|
| Futebol | 115 min (90 + 15 intervalo + 10 acréscimos) |
| Basquete | 130 min |
| Tênis | 180 min |
| Vôlei | 120 min |
| MLB / Baseball | 200 min |
| NFL / Football | 210 min |
| Hockey | 160 min |
| Default | 150 min |

**B2. Helper `computeMatchPhase(ev, now)`** em `src/utils/matchPhase.ts`:

```ts
type Phase = 'scheduled' | 'live' | 'finished';
// 1. Se ev.status já diz finished/FT/encerrado → finished
// 2. Se now < commence_time → scheduled
// 3. Se commence_time ≤ now ≤ commence_time + duracao(esporte) → live
// 4. Caso contrário → finished (mesmo sem confirmação do sync)
```

Também devolve `minutesIn` para mostrar "ao vivo · 37'" no badge de futebol.

**B3. Substituir o `isPast` por `computeMatchPhase` em:**
- `src/pages/ApiExplorer.tsx` (Explorador) — badge passa a ter três estados: cinza "Agendado", vermelho pulsante "Ao Vivo · 37'", âmbar "Encerrado".
- `src/components/surebet/ExploradorEventoPicker.tsx` — o toggle "Mostrar encerrados" passa a esconder/mostrar apenas `phase === 'finished'`; jogos `live` ficam sempre visíveis.

**B4. Cores e acessibilidade**
- Live: `bg-red-500/15 text-red-500 border-red-500/40` + ponto pulsante (`animate-pulse`).
- Finished: mantém âmbar atual.
- Scheduled: sem badge (como hoje).

### Parte C — Trazer resultados reais de forma econômica

A Odds API cobra créditos para `/scores` mas tem janela barata (`daysFrom=1`, 1 crédito por chamada por esporte). TheSportsDB devolve resultados grátis com algumas horas de defasagem.

**C1. Novo cron `match-results-poller` (cron a cada 30 min entre 13h e 06h BRT)**
- Edge function `match-results-poller`:
  - Busca em `sports_events` / `daily_events` jogos onde `phase` esperada = `live` ou `finished` **e** `result_home is null` (limite ~200 por execução).
  - Agrupa por `sport_key`. Para cada `sport_key` chama `/v4/sports/{key}/scores?daysFrom=1&apiKey=...` (1 crédito por sport, mesmo que cubra 50 jogos → muito barato).
  - Faz match por `canonical_key`, atualiza `result_home`, `result_away`, `status='finished'`.
  - Insere row em `sports_sync_runs` para auditoria/custo (`cost_usd` = nº de calls × custo por crédito).
- Padrão "trabalho em background" também aqui: responde 202 imediatamente e processa via `EdgeRuntime.waitUntil`.

**C2. Mecanismo de "early stop" para economizar créditos**
- A função só consulta um `sport_key` se houver pelo menos 1 jogo do dia anterior ou de hoje sem resultado registrado. Sport sem pendência = 0 créditos.

**C3. Fallback grátis: TheSportsDB**
- O job já existente `thesportsdb-sync-3x-daily` cobre quase tudo grátis. Mantemos ele e só usamos Odds API `/scores` quando o TheSportsDB ainda não trouxe resultado depois de 4h do fim estimado.

**C4. Botão manual "Atualizar resultados"**
- Em `ApiExplorer.tsx`, ao lado de "Atualizar catálogo", adiciono botão "Atualizar resultados" que invoca `match-results-poller` com o mesmo padrão de polling de run.

### Parte D — QA

- Disparar "Atualizar catálogo": toast mostra "Sincronizando...", troca para resumo final em ≤30s, sem erro de timeout.
- Em jogos em curso: badge muda automaticamente para "Ao Vivo" durante a janela esperada.
- Rodar manualmente `match-results-poller` em jogo encerrado sem score: confere que `result_home/away` ficam preenchidos.

---

## Detalhes técnicos

**Arquivos a alterar / criar**
- `supabase/functions/odds-api-catalog-sync/index.ts` — resposta 202, `EdgeRuntime.waitUntil`, upsert em lote, pool de concorrência, AbortController por fetch.
- `supabase/functions/match-results-poller/index.ts` (novo) — polling de `/scores` por sport_key com early-stop.
- `src/pages/ApiExplorer.tsx` — usa `computeMatchPhase`, mostra estados Ao Vivo/Encerrado/Agendado, polling do run, botão "Atualizar resultados".
- `src/components/surebet/ExploradorEventoPicker.tsx` — toggle "Mostrar encerrados" passa a usar `phase`.
- `src/utils/matchPhase.ts` (novo) — helper único reutilizado.
- Cron `match-results-poller-30min` via `supabase--insert` (não migration, contém apikey).

**Sem mudanças**
- Não mexo no schema do banco (estado é derivado client-side; `status='finished'` do banco continua sendo gravado pelos syncs).
- Não toco em odds, surebet, ou cálculo financeiro.
- O sync de campeonatos (badges) já entregue na rodada anterior segue intacto.

Confirma para eu implementar?
