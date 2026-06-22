## Objetivo

Diagnosticar (sem corrigir ainda) por que pernas Surebet compostas por 2+ casas estão renderizando apenas 1 linha no card, mesmo com o formulário salvando normalmente. Caso teste: Ponte Preta x Grêmio Novorizontino, 22/06, perna do Empate com 2 itens (Vave + outra).

## Fase 0 — Reconhecimento (read-only)

Mapear, sem editar, a topologia real do dado:

1. **Schema (DB)**
   - `apostas_unificada` (aposta pai) → `apostas_pernas` (1 linha por perna lógica) → `apostas_perna_entradas` (1 linha por sub-casa dentro da perna). Confirmar via `information_schema.columns` as FKs `perna_id` e a unicidade/multiplicidade.
   - Verificar se existem registros recentes do jogo Ponte Preta x Grêmio Novorizontino e contar quantas linhas em `apostas_perna_entradas` existem para a perna do Empate.

2. **Gravação**
   - `src/services/aposta/ApostaService.ts` e `src/hooks/useSurebetService.ts`: caminho do "Registrar Operação" do `SurebetCompactForm` / `SurebetModalRoot`. Documentar como `entries[]` do form vira `apostas_perna_entradas`.

3. **Leitura**
   - `src/hooks/useApostasPernas.ts`, `src/hooks/useApostasUnificada.ts`, `src/hooks/useProjetoDashboardData.ts`: identificar a query que alimenta o card (provavelmente um `select` com `apostas_pernas(*, apostas_perna_entradas(*))`). Conferir se o embed está correto e se há `.limit()` / `.single()` indevidos.

4. **Mapeamento**
   - Procurar transformações que convertem `apostas_perna_entradas` em `perna.entries` consumido pelo `SurebetCard` (referências a `entries` no hook/serviço, não apenas no componente).

5. **Renderização**
   - `src/components/projeto-detalhe/SurebetCard.tsx` (linhas 309, 515, 559, 774…): já itera `perna.entries?.map(...)`. Confirmar que o nome do campo bate com o produzido pelo mapeamento.

Saída desta fase: um pequeno mapa textual "form → service → DB → query → mapper → card" com nomes exatos das funções/arquivos e shape esperado.

## Fase 1 — Instrumentação temporária

Adicionar logs marcados `// TEMP-DEBUG perna-composta` (fáceis de remover via `rg`):

- **Gravação** (`ApostaService`/`useSurebetService` no ramo Surebet): logar `payload.pernas` recebido e o resultado de `insert` em `apostas_pernas` + `apostas_perna_entradas` (contagem por perna).
- **Leitura** (hook de fetch do card): logar o objeto bruto retornado pelo Supabase para a aposta-alvo, antes de qualquer transformação. Filtrar por `id` da aposta para não poluir.
- **Mapeamento** (se houver): logar `perna.id`, `entries.length` e ids dos entries de cada perna após o reshape.
- **Render** (`SurebetCard.tsx`, dentro do loop de pernas): logar `perna.id`, `perna.entries?.length`, e cada `entry.id`/`bookmaker`/`stake`.

Nenhuma lógica é alterada nesta fase.

## Fase 2 — Reprodução automatizada

Sem pedir input manual:

1. **Reprodução por API**: usando o mesmo `ApostaService` (não SQL direto), criar via script Node/Playwright uma operação Surebet 3 pernas onde a perna 2 tem 2 entries em casas diferentes — espelhando o caso real (mesma estrutura de mercado 1-X-2, valores plausíveis).
2. Ler de volta pelo mesmo hook que o card usa.
3. Capturar todos os logs da Fase 1 ponta a ponta.
4. **Comparação com dado legado**: rodar a mesma leitura contra a aposta real Ponte Preta x Novorizontino (id já existente em produção/preview) e contra qualquer surebet antiga com perna composta encontrada via `SELECT perna_id, count(*) FROM apostas_perna_entradas GROUP BY perna_id HAVING count(*) > 1`. Isso isola se a regressão é de gravação (só novas) ou de leitura/render (todas).

## Fase 3 — Análise comparativa

Comparar, etapa por etapa, em qual ponto o segundo entry desaparece. Hipóteses prioritárias:

- Query Supabase com embed errado (ex.: `apostas_perna_entradas` faltando, ou aliasado num nome que o mapper não lê).
- Mapper sobrescrevendo `entries` em loop (`obj[key] = e` em vez de `array.push`) ou agrupando por `bookmaker_id` e colapsando duplicatas.
- `.single()`/`.maybeSingle()` no relacionamento, ou RLS escondendo a segunda linha (ex.: política em `apostas_perna_entradas` filtrando por workspace de forma incompleta).
- Migração recente que renomeou coluna/relacionamento sem atualizar a query.
- Cache do React Query servindo shape antigo (`invalidateCanonicalCaches`).

Apoiar cada hipótese com `git log -p` / `git blame` nos arquivos identificados na Fase 0 (queries de `apostas_perna_entradas`, `useApostasPernas`, `SurebetCard.tsx`).

## Fase 4 — Diagnóstico (checkpoint — sem corrigir)

Entregar relatório com:

1. Camada exata onde os entries somem (gravação | leitura | mapper | render).
2. Logs concretos comprovando (números: entries persistidos vs entries retornados vs entries renderizados).
3. Commit/PR suspeito identificado por `git blame`.
4. Proposta de correção e se exige backfill de dados já gravados de forma incorreta.
5. Lista exata dos `// TEMP-DEBUG perna-composta` a remover quando aprovado.

**Aguardar aprovação antes de qualquer alteração de lógica de gravação/leitura.**

## Regras

- Nenhuma escrita em `apostas_pernas`/`apostas_perna_entradas` fora do `ApostaService` real.
- Reprodução 100% automatizada (script + Playwright se necessário).
- Não avançar para correção sem o checkpoint da Fase 4 aprovado.
- Logs temporários todos marcados `// TEMP-DEBUG perna-composta` para remoção via `rg -l`.
