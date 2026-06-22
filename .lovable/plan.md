
# Plano de Investigação — Actor `azzouzana/sofascore-scraper-pro`

Objetivo: produzir um relatório técnico factual sobre o que esse actor entrega para tênis, sem escrever código de produção e gastando o mínimo possível de itens (pay-per-result).

## 0. Pré-requisitos e guardrails

- Token: ler exclusivamente de `APIFY_API_TOKEN` já configurado nos secrets do projeto. Validar com `fetch_secrets`. Se ausente, parar e pedir ao usuário para adicionar via `add_secret` (sem expor valor).
- Nunca logar, ecoar ou incluir o token em arquivos, outputs, prints ou no relatório final. Em qualquer `curl`, usar `-H "Authorization: Bearer $APIFY_API_TOKEN"` direto no shell, sem interpolar em strings que serão exibidas.
- Tudo roda em script local descartável (`/tmp/apify-investigacao.ts` via bun). Nada é commitado no projeto.
- Hard cap de custo: máximo ~40 itens consumidos no total da investigação (3 runs × ~10–15 itens). Antes de cada chamada, confirmar `maxItems`/`maxResults`/`maxRequestsPerCrawl` no menor valor que o schema permitir.
- Modo síncrono (`run-sync-get-dataset-items`) para cada chamada, para inspecionar resultado imediatamente sem deixar runs órfãos.

## 1. Descobrir schema e contrato do actor

Chamadas read-only à Apify API (custo zero — não disparam runs):

1. `GET /v2/acts/azzouzana~sofascore-scraper-pro` — metadados gerais, pricing model, default run options.
2. `GET /v2/acts/azzouzana~sofascore-scraper-pro/builds/default` — extrair:
   - `data.actorDefinition.input` (inputSchema completo: campos, tipos, enums, defaults, required).
   - `data.actorDefinition.storages.dataset` (schema de saída, se declarado).
   - `data.actorDefinition.readme` (texto integral).
3. Salvar respostas cruas em `/tmp/apify-schema.json` e `/tmp/apify-readme.md` para citação literal no relatório.

Critérios a marcar já nesta etapa:
- Existe enum de `sport` com valor `tennis`?
- Existe campo `tour` / `category` / `tier` / `circuit` / `level` no input?
- O actor aceita URLs do Sofascore como entrada (modo "startUrls")?
- Pricing por item (USD/1000 results) e limite default.

## 2. Três runs de teste mínimos

Ordem deliberada: do mais barato/específico ao mais amplo. Parar cedo se uma run já responder todas as perguntas.

| # | Objetivo | Entrada provável (ajustar ao schema real) | Cap |
|---|---|---|---|
| A | Torneio ATP Grand Slam conhecido | `startUrls`: URL Sofascore de Wimbledon ATP (temporada atual) | `maxItems: 10` |
| B | Torneio WTA Grand Slam conhecido | `startUrls`: URL Sofascore de US Open WTA | `maxItems: 10` |
| C | Tênis genérico sem filtro | `sport: "tennis"` (ou modo de listagem do dia) | `maxItems: 15` |

Endpoint: `POST /v2/acts/azzouzana~sofascore-scraper-pro/run-sync-get-dataset-items?token=...&timeout=120`. Salvar cada response em `/tmp/apify-run-{A,B,C}.json`.

Se o schema do passo 1 já expuser `tour`/`category` como enum (`ATP`/`WTA`/`ITF`/`Challenger`), reduzir run C para 5 itens — não precisa de amostra grande.

## 3. Perguntas a responder com evidência do JSON real

Para cada uma, citar o caminho do campo (`a.b.c`) e exemplo de valor:

1. Campo explícito de tour/categoria (`category` / `tournament.category` / `uniqueTournament.category` etc.) com valores `ATP`/`WTA`? Ou implícito no nome?
2. Campo que distingue Grand Slam (`tier`, `tournament_type`, `level`, `groundType`)?
3. ID estável de torneio (provável `uniqueTournament.id` do Sofascore) utilizável como whitelist?
4. Run C inclui ITF / Challenger / juniores misturados? Listar o que apareceu.
5. Algum input nativo filtra por tour/circuito (mesmo não documentado no README, visível no enum do inputSchema)?
6. Logos/imagens de jogador e de torneio presentes em tênis (`homeTeam.logo`, `tournament.image`, `uniqueTournament.logo`)? Ou só em outros esportes?

## 4. Entregável (markdown único)

Estrutura fixa do relatório `/mnt/documents/sofascore-actor-investigacao.md`:

1. Resumo executivo (5 linhas: serve ou não para cobrir ATP+WTA+Grand Slams, principal risco).
2. Trecho relevante do `inputSchema` (campos e enums envolvidos em tênis/tour/sport).
3. 1 item de output real de tênis, JSON completo, anonimizado se houver nomes de usuários.
4. Respostas objetivas às 6 perguntas, cada uma com caminho de campo + exemplo.
5. Tabela de torneios ATP/WTA/Grand Slam observados: `nome | tour | tier | uniqueTournament.id`.
6. Custo total: itens consumidos por run × pricing pay-per-result do actor = USD estimado.
7. Recomendação técnica curta: viável / viável com filtro client-side / inviável — e por quê.

## 5. Restrições e não-fazer

- Não criar edge function, não adicionar dependência ao projeto, não alterar `monitored_leagues` nem nenhum arquivo de `src/`.
- Não rodar o actor em modo async sem `maxItems`. Nunca chamar `/run` sem cap.
- Não publicar o relatório no preview; entregar apenas como arquivo em `/mnt/documents/`.
- Se qualquer run retornar > cap esperado ou custo projetado > ~USD 0,50, abortar e reportar antes de continuar.

## Detalhes técnicos

- Stack do script: `bun` standalone em `/tmp`, `fetch` nativo, sem libs.
- Apify base URL: `https://api.apify.com/v2`.
- Pricing real do actor é lido do passo 1 (`pricingInfos[]` no metadata do act), não chutado.
- Para descobrir URLs Sofascore atuais de Wimbledon/US Open sem gastar item do actor, usar `websearch--web_search` (gratuito) antes das runs A/B.
- Caminhos esperados (a confirmar contra JSON real, não assumir):
  - `tournament.uniqueTournament.id` — ID estável de torneio Sofascore.
  - `tournament.uniqueTournament.category.name` — costuma ser `ATP`/`WTA`/`ITF` no Sofascore público.
  - `tournament.uniqueTournament.tier` ou `groundType` — diferencia Grand Slam.
