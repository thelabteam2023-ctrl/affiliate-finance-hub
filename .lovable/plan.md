# Plano P0 — Apostas de Arbitragem/Surebet omitidas das telas

## Status — diagnóstico executado

- Causa raiz confirmada: a aba de Operações/Surebet usava `estrategia = SUREBET` como critério de leitura, mas operações válidas criadas pelo formulário de Arbitragem são identificadas tecnicamente por `forma_registro = ARBITRAGEM` e podem ter estratégia analítica diferente (`EXTRACAO_BONUS`, `DUPLO_GREEN`, `PUNTER`, etc.).
- Evidência banco-lado: existem 766 operações `ARBITRAGEM` não canceladas; 753 delas têm `estrategia <> SUREBET` e eram omitidas pelo filtro antigo em telas especializadas.
- Evidência de integridade: amostras recentes omitidas possuem pai em `apostas_unificada`, pernas em `apostas_pernas` e entradas em `apostas_perna_entradas`; portanto o problema principal identificado é de leitura/filtro/exibição, não de perda dos dados históricos.
- Correção aplicada: Operações/Surebet agora carrega por `forma_registro = ARBITRAGEM`; o badge de abertas também conta por forma de registro; “Todas as Apostas” mantém arbitragens visíveis quando o usuário filtra por Surebet; filtros de casa/parceiro consideram pernas e entries.
- Teste isolado criado: fixtures em Vitest reproduzem histórico/abertas com `ARBITRAGEM + EXTRACAO_BONUS` sem tocar nos dados reais.

## Objetivo

Investigar, instrumentar e corrigir qualquer falha que faça apostas criadas pelo formulário de Arbitragem/Surebet deixarem de aparecer em:

- Operações;
- Todas as Apostas;
- Aba Surebet/Arbitragem;
- Abas derivadas por estratégia/contexto;
- KPIs, exposição por casa/parceiro e históricos que dependem das mesmas leituras.

A investigação não deve assumir se a falha está no frontend, banco, RPC, sincronização ou filtro. O fluxo inteiro será auditado de ponta a ponta.

## Hipóteses iniciais a validar

1. A aposta é criada no banco, mas alguma tela filtra indevidamente.
2. A operação pai é criada em `apostas_unificada`, mas pernas não são criadas ou não são lidas.
3. As pernas são criadas em `apostas_pernas`, mas entradas 1:N em `apostas_perna_entradas` não são carregadas em todos os consumidores.
4. O formulário de Arbitragem passou a salvar com combinação inesperada de `forma_registro`, `estrategia`, `contexto_operacional`, `status`, `resultado` ou `cancelled_at`.
5. Alterações recentes de Lay/Back/BR/CK ou agrupamento de pernas mudaram o payload, a RPC ou os mappers.
6. A aposta aparece no banco, mas não volta após popup/janela por falha de sincronização/cache.
7. A aposta chega ao frontend, mas é descartada em transformação, agrupamento, deduplicação, filtro de período ou filtro por estratégia.
8. A operação aparece em uma aba e não em outra por divergência entre queries.

## Escopo protegido

Durante a investigação/correção:

- Não fazer correções retroativas em massa nos dados.
- Não alterar saldos diretamente.
- Não atualizar `saldo_atual` ou `saldo_freebet` diretamente.
- Não recalcular P&L client-side para Surebet.
- Não substituir RPCs financeiras sem diagnóstico confirmado.
- Não remover filtros de workspace/projeto.
- Não criar painel visual de logs agora.

## Fluxo que será auditado

```text
Formulário Arbitragem/Surebet
  ↓
Payload frontend
  ↓
Serviço/hook de criação
  ↓
RPC criar_surebet_atomica / criar_aposta_atomica
  ↓
apostas_unificada
  ↓
apostas_pernas
  ↓
apostas_perna_entradas
  ↓
Queries de leitura por tela
  ↓
Transformações/mappers/groupers
  ↓
React Query / cache / cross-window sync
  ↓
Renderização: Operações / Todas as Apostas / Surebet / demais abas
```

## Fase 1 — Mapa técnico completo do fluxo atual

### 1.1 Criação pelo formulário

Auditar os pontos que disparam criação de Arbitragem/Surebet:

- Janela standalone de Surebet;
- Modal/formulário de Surebet;
- Hooks `useApostasUnificada`, `useSurebetService` e serviços centralizados;
- Serviço `ApostaService`;
- Chamadas RPC envolvidas.

Validar:

- Qual função é realmente chamada em criação normal;
- Qual função é chamada em edição;
- Qual função é chamada em duplicação;
- Se a origem “Todas as Apostas” usa o mesmo pipeline da aba Surebet;
- Se há caminhos legados ainda ativos.

### 1.2 Payload enviado

Adicionar verificação interna do payload antes da persistência para confirmar:

- `projeto_id` correto;
- `workspace_id` correto;
- `forma_registro = ARBITRAGEM` para operação de arbitragem;
- `estrategia = SUREBET` quando aplicável;
- quantidade de pernas >= 2;
- cada perna com `bookmaker_id`, `stake`, `odd`, `moeda`, `selecao`, `ordem`;
- campos Lay/Back preservados (`tipo`, `comissao`, liability quando existir);
- campos de BR/CK não removendo dados essenciais;
- campos de snapshot cambial presentes quando moeda diferente da consolidação;
- entries múltiplas preservadas quando uma perna possui mais de uma casa.

### 1.3 Persistência

Verificar em banco, para cada aposta criada:

- existe linha em `apostas_unificada`;
- `cancelled_at IS NULL`;
- `projeto_id` e `workspace_id` corretos;
- `forma_registro`, `estrategia`, `status`, `resultado` coerentes;
- existe número esperado de linhas em `apostas_pernas`;
- existe número esperado de linhas em `apostas_perna_entradas`;
- `apostas_pernas.aposta_id` aponta para o pai correto;
- entradas adicionais não foram perdidas;
- bookmakers das entradas pertencem ao mesmo projeto/workspace;
- stake agregada no pai bate com a soma canônica das pernas/entradas;
- odds e tipos Lay/Back não foram normalizados incorretamente.

### 1.4 Leitura pelas telas

Auditar as queries de:

- Todas as Apostas;
- Aba Surebet/Arbitragem;
- Central/Operações;
- Abas de bônus/freebet/duplo green/valuebet/punter quando consumirem operações semelhantes;
- KPIs e exposição por casa/parceiro.

Validar se cada query:

- filtra por `workspace_id` ou por projeto dentro do workspace correto;
- usa `.eq("projeto_id", projetoId)` quando aplicável;
- não exclui `ARBITRAGEM` por acidente;
- não depende apenas de `forma_registro = SIMPLES`;
- não depende apenas de `estrategia = SUREBET` quando o dado salvo pode divergir;
- não ignora pendentes fora do período operacional;
- traz `apostas_pernas`;
- traz `apostas_perna_entradas` quando a tela precisa exibir/expor todas as casas;
- carrega bookmakers/parceiros das sub-entries, não apenas da perna principal.

## Fase 2 — Observabilidade interna não visual

Implementar uma camada leve de probes internos, sem painel visual, para gerar evidência automática durante o fluxo.

### 2.1 Criar utilitário de auditoria do ciclo de vida

Criar um helper interno, por exemplo:

```text
src/utils/surebetLifecycleProbe.ts
```

Responsabilidades:

- registrar checkpoints em memória (`window.__SUREBET_LIFECYCLE__`) apenas em runtime;
- opcionalmente persistir anomalias em `debug_logs` usando o logger existente, em modo best-effort;
- nunca bloquear salvamento por falha de log;
- nunca expor dados sensíveis;
- consolidar evidências por `aposta_id` ou `correlation_id`.

### 2.2 Checkpoints automáticos

Adicionar checkpoints nos seguintes pontos:

1. `FORM_PAYLOAD_READY`
   - Quantidade de pernas;
   - Quantidade de entries;
   - IDs de bookmakers;
   - forma/estratégia/contexto/status.

2. `RPC_CREATE_SENT`
   - Nome da RPC chamada;
   - shape do payload;
   - contagem de pernas/entries;
   - presença de Lay/Back/BR/CK.

3. `RPC_CREATE_RETURNED`
   - sucesso/falha;
   - `aposta_id` retornado;
   - mensagem de erro se existir.

4. `DB_PARENT_VISIBLE`
   - pai existe em `apostas_unificada`;
   - campos críticos batem.

5. `DB_PERNAS_VISIBLE`
   - quantidade real em `apostas_pernas`;
   - soma de stake;
   - seleções/ordens.

6. `DB_ENTRIES_VISIBLE`
   - quantidade real em `apostas_perna_entradas`;
   - entries por perna;
   - bookmaker/parceiro por entry.

7. `READ_QUERY_RETURNED`
   - tela/aba consumidora;
   - se a aposta veio ou não na query bruta.

8. `MAPPER_OUTPUT`
   - se a aposta sobreviveu à transformação;
   - quantidade de pernas renderizáveis;
   - quantidade de entries renderizáveis.

9. `FILTER_OUTPUT`
   - se a aposta foi removida por filtro;
   - qual filtro removeu: período, status, estratégia, contexto, bookmaker, parceiro, busca textual, subaba abertas/histórico.

10. `RENDER_READY`
   - card/lista recebeu a aposta;
   - dados mínimos presentes para exibição.

### 2.3 Probes específicos para inconsistência

Adicionar funções internas como:

```text
probeSurebetCreated(apostaId)
probeSurebetReadByTab(apostaId, tabName, rawRows, mappedRows, filteredRows)
probeSurebetLegIntegrity(apostaId, expectedPayload, dbRows)
probeSurebetVisibility(apostaId, source, reason)
```

Essas funções devem responder automaticamente:

- A aposta foi criada?
- Foi salva corretamente?
- Foi vinculada à operação correta?
- Está presente no banco?
- Está sendo retornada pela query?
- Está sendo filtrada indevidamente?
- Chegou ao frontend?
- Foi descartada por mapper/grouping?
- Foi ocultada por regra de negócio?

### 2.4 Reaproveitar observabilidade existente

Integrar sem duplicar:

- `debugLogger` para persistência best-effort em `debug_logs`;
- `integrityProbe` para divergência entre abas;
- `surebetObservability` para snapshots de cálculo;
- `rpcInterceptor` em ambiente dev para rastrear chamadas RPC.

## Fase 3 — Auditoria profunda de persistência

### 3.1 Verificar schema real

Consultar schema real de:

- `apostas_unificada`;
- `apostas_pernas`;
- `apostas_perna_entradas`;
- `bookmakers`;
- tabelas de vínculo workspace/projeto se forem usadas nos filtros.

Validar colunas adicionadas por mudanças recentes:

- `tipo`;
- `comissao`;
- campos Lay;
- campos Back;
- campos BR/CK;
- campos de snapshot cambial;
- campos de stake real/freebet;
- campos de consolidação.

### 3.2 Verificar políticas e grants

Checar se RLS e permissões permitem leitura/inserção correta para usuário autenticado:

- INSERT/SELECT em `apostas_unificada`;
- INSERT/SELECT em `apostas_pernas`;
- INSERT/SELECT em `apostas_perna_entradas`;
- SELECT em `bookmakers` e `parceiros` usados para labels.

Importante: se uma tabela auxiliar não tiver SELECT para o papel correto, a aposta pode existir mas chegar incompleta ao frontend.

### 3.3 Verificar RPCs

Auditar definição e assinatura das RPCs envolvidas:

- `criar_surebet_atomica`;
- `criar_aposta_atomica`, se algum caminho ainda usar;
- RPCs de edição de surebet;
- RPCs de liquidação/reliquidação se impactarem status/histórico;
- RPCs de leitura agregada usadas pela Central de Operações.

Validar:

- se recebem entries múltiplas;
- se inserem entries múltiplas;
- se retornam `aposta_id` sempre;
- se falham silenciosamente em campos novos;
- se fazem `DROP FUNCTION IF EXISTS` em migrações futuras para evitar ambiguidade PostgREST.

## Fase 4 — Auditoria de leitura por tela

### 4.1 Todas as Apostas

Auditar a tela que unifica:

- simples;
- múltiplas;
- surebets/arbitragens.

Pontos críticos:

- query de simples usa `forma_registro = SIMPLES`;
- query de surebet usa `forma_registro = ARBITRAGEM`;
- pendentes fora do período são reintroduzidas;
- cards são unificados depois;
- filtros locais podem remover por estratégia/contexto/status.

Adicionar probe para comparar:

```text
DB parent count vs query raw count vs mapped count vs filtered count vs rendered count
```

### 4.2 Aba Surebet/Arbitragem

Auditar query que usa `estrategia = SUREBET`.

Risco específico:

- se uma arbitragem for salva como `forma_registro = ARBITRAGEM`, mas `estrategia` vier nula/diferente, pode aparecer em Todas as Apostas e sumir da aba Surebet;
- se uma operação for salva como `estrategia = SUREBET`, mas `forma_registro` vier diferente, pode ocorrer o inverso.

Correção potencial, se confirmado:

- leitura robusta para considerar o contrato canônico;
- normalizar criação para sempre salvar `forma_registro = ARBITRAGEM` + `estrategia = SUREBET`;
- adicionar probe para detectar divergência entre esses campos.

### 4.3 Operações / Central de Operações

Auditar RPC/fonte consolidada da Central de Operações.

Pontos críticos:

- a Central usa RPC consolidada;
- se a RPC não inclui apostas/surebets ou depende de status/alertas, a expectativa de “Operações” precisa ser validada contra o conceito exato da tela;
- verificar se a função filtra por papel, workspace ou domínio operacional;
- verificar se `ARBITRAGEM` foi excluída da agregação.

### 4.4 Exposição por casa/parceiro

Auditar consumidores que calculam exposição:

- por `apostas_pernas`;
- por `apostas_perna_entradas`;
- por `bookmaker_id` no pai.

Risco específico:

- uma perna com múltiplas casas pode aparecer no card, mas exposição por parceiro continuar subestimada se a tela só usar `apostas_pernas.bookmaker_id`.

## Fase 5 — Auditoria de transformações e filtros

### 5.1 Mappers de pernas

Padronizar todas as leituras de pernas com o mesmo helper compartilhado.

Contrato esperado:

- `apostas_pernas` é fonte da perna;
- `apostas_perna_entradas` é fonte das entradas 1:N;
- campo denormalizado da perna não substitui entries;
- se entries estiver vazio, usar fallback legado apenas para exibição single-entry;
- se entries existir, usar entries para stake/odd/bookmaker/parceiro da sublinha.

### 5.2 Agrupamento por seleção

Auditar `groupPernasBySelecao`.

Validar:

- se agrupar duas entradas na mesma seleção mantém entries;
- se não soma stake incorretamente em moeda mista;
- se não descarta entradas com mesmo `selecao`;
- se preserva `tipo = lay/back`;
- se preserva `resultado` individual.

### 5.3 Filtros locais

Instrumentar filtros para indicar motivo de exclusão:

- período;
- subaba abertas/histórico;
- status/resultado;
- estratégia;
- contexto;
- bookmaker;
- parceiro;
- texto de busca;
- filtros suspeitos/anomalias.

## Fase 6 — Investigação de regressões recentes

### 6.1 Lay/Back

Validar se alterações de Lay/Back:

- mudaram o campo `tipo`;
- passaram a exigir `comissao`;
- alteraram cálculo de exposure;
- quebraram mapper que assumia tudo como BACK;
- causaram divergência entre perna e entry;
- impactaram liquidação rápida.

### 6.2 BR/CK

Validar se mudanças BR/CK:

- adicionaram campos obrigatórios não presentes em algum payload;
- alteraram normalização de mercado/modelo;
- afetaram filtros de estratégia ou origem;
- geraram apostas com campos nulos que depois são filtradas.

### 6.3 Novos agrupamentos de pernas

Validar se refatorações de agrupamento:

- passaram a deduplicar por seleção e perder entries;
- usam chave errada (`selecao`, `ordem`, `bookmaker_id`, `perna_id`);
- tratam uma perna multi-entry como uma única casa;
- somam stake na moeda errada;
- impactam “Todas as Apostas” e “Surebet” de forma diferente.

### 6.4 Sincronização/cache

Validar se após salvar:

- popup dispara `SUREBET_SAVED`;
- `BroadcastChannel` recebe;
- `postMessage` recebe;
- `localStorage` fallback recebe;
- `focus/visibilitychange` dispara refetch;
- React Query invalida as keys certas;
- abas com estado local chamam o refetch correto.

## Fase 7 — Correções possíveis conforme diagnóstico

As correções só devem ser aplicadas após o probe apontar o ponto de falha.

### Cenário A — Falha na criação

Se a aposta não é criada:

- corrigir payload do formulário;
- corrigir validação pré-RPC;
- corrigir chamada RPC;
- tornar erro explícito no retorno;
- adicionar teste de criação.

### Cenário B — Pai criado sem pernas

Se `apostas_unificada` existe, mas `apostas_pernas` não:

- corrigir RPC de criação;
- garantir transação atômica;
- falhar a criação inteira se pernas não forem persistidas;
- adicionar invariante: ARBITRAGEM exige 2+ pernas.

### Cenário C — Pernas criadas sem entries

Se `apostas_pernas` existe, mas `apostas_perna_entradas` não:

- corrigir RPC/mapper para persistir entries;
- garantir fallback apenas para legado;
- adicionar teste multi-entry.

### Cenário D — Banco correto, query errada

Se banco está correto, mas tela não retorna:

- corrigir query da tela;
- incluir `apostas_pernas` e `apostas_perna_entradas`;
- ampliar condição canônica sem abrir dados indevidos;
- manter filtro por projeto/workspace.

### Cenário E — Query retorna, mapper descarta

Se raw query contém a aposta, mas mapper remove:

- corrigir transformação;
- preservar entries;
- remover deduplicação indevida;
- adicionar probe `MAPPER_DROPPED_OPERATION`.

### Cenário F — Mapper mantém, filtro oculta

Se mapper mantém, mas filtro remove:

- corrigir filtro específico;
- registrar motivo de exclusão;
- garantir pendentes sempre visíveis mesmo fora do período quando essa for a regra da tela.

### Cenário G — Render recebe, card não exibe

Se render recebe, mas UI oculta:

- corrigir props do card;
- garantir `SurebetCard` renderize pernas e entries;
- garantir labels corretas por bookmaker/parceiro;
- garantir estado vazio não sobrescreva lista.

### Cenário H — Sincronização/cache

Se só aparece após refresh manual:

- corrigir invalidação de query;
- corrigir listener cross-window;
- adicionar fallback pós-save para refetch por `aposta_id`;
- garantir keys de cache consistentes.

## Fase 8 — Testes e validação

### 8.1 Testes automatizados

Adicionar ou ampliar testes para:

1. criação de Arbitragem com 3 pernas simples;
2. criação de Arbitragem com uma perna contendo 2 entries;
3. operação com Lay + Back;
4. operação multimoeda;
5. operação pendente fora do período atual;
6. leitura por Todas as Apostas;
7. leitura por aba Surebet;
8. preservação de entries após grouping;
9. filtros não removendo arbitragem válida;
10. sincronização pós-save.

### 8.2 Teste SQL de integridade

Adicionar teste SQL/rotina de verificação para confirmar:

```text
ARBITRAGEM válida:
- 1 pai em apostas_unificada
- 2+ pernas em apostas_pernas
- entries >= pernas ou conforme modelo esperado
- soma de stake consistente
- nenhum bookmaker_id nulo em entry válida
- workspace/projeto consistentes
```

### 8.3 Validação manual orientada por evidências

Para uma operação nova criada no formulário:

1. salvar Arbitragem;
2. capturar `aposta_id` retornado;
3. confirmar checkpoints internos;
4. confirmar banco;
5. confirmar retorno em Todas as Apostas;
6. confirmar retorno em Surebet;
7. confirmar retorno em Operações/Central quando aplicável;
8. confirmar exposição por casa/parceiro;
9. confirmar reload da página sem perda;
10. confirmar reabertura do modal preservando pernas/entries.

## Fase 9 — Relatório final esperado

Ao final da investigação, entregar relatório com:

- ponto exato da falha;
- causa raiz;
- commit/alteração provável que introduziu a regressão, se identificável;
- telas impactadas;
- dados impactados;
- correção aplicada;
- evidências antes/depois;
- checklist de validação;
- testes adicionados;
- regra de prevenção salva em memória do projeto, se for um padrão permanente.

## Critérios de aceite

A correção só será considerada concluída quando:

- uma Arbitragem criada pelo formulário aparece em Todas as Apostas;
- aparece na aba Surebet/Arbitragem;
- aparece nas visões operacionais aplicáveis;
- todas as pernas aparecem;
- todas as entries dentro da mesma perna aparecem;
- bookmaker e parceiro de cada entry estão corretos;
- stake total não muda indevidamente;
- exposição por casa/parceiro considera entries;
- pendentes não somem por filtro de período;
- reload completo mantém a operação visível;
- probes não reportam `CREATED_BUT_NOT_READ`, `READ_BUT_FILTERED`, `MAPPER_DROPPED_OPERATION` ou divergência entre abas;
- testes automatizados cobrem o caso regressivo.

## Ordem de execução proposta

1. Instrumentar probes internos de ciclo de vida.
2. Criar operação de teste controlada via formulário.
3. Coletar evidências do fluxo completo.
4. Identificar primeiro ponto onde a aposta desaparece.
5. Corrigir apenas esse ponto.
6. Rodar validação da mesma operação.
7. Repetir para Todas as Apostas, Surebet e Operações.
8. Cobrir regressões Lay/Back/BR/CK/multi-entry.
9. Adicionar testes permanentes.
10. Documentar regra final para evitar recorrência.

## Prioridade

P0 / Crítica.

Enquanto a causa não estiver comprovada, tratar como risco de omissão operacional de apostas válidas e risco direto à confiabilidade de exposição, stake, lucro/prejuízo e histórico.