# Internal Server Error ao acessar Projetos — diagnóstico e próximos passos

## O que já foi verificado agora (com evidência)

Todos os testes abaixo foram executados nesta investigação, contra o app publicado (`stake-sync-erp.lovable.app`) e contra o backend:

| Teste | Resultado |
| --- | --- |
| `GET /projetos` no app publicado | 200, HTML correto (2113 bytes) |
| `GET /`, `/parceiros`, `/caixa`, `/projeto/:id` | 200 |
| Variações de URL: `/projetos/`, `/Projetos`, `/projetos?tab=todos`, `/projetos#x` | 200 |
| Bundle principal (`index-Dn-LX0TK.js`), CSS e `~flock.js` | 200 |
| Varredura dos **212 chunks** carregados sob demanda, incluindo `GestaoProjetos-*.js` e `ProjetoDetalhe-*.js` | 212/212 retornaram 200 |
| RPC `get_saldo_operavel_por_projeto` (usada no load de Projetos) | 200 em ~0,05s |
| RPC `get_projeto_dashboard_data` em 2 projetos reais | 200 em ~0,2s |
| Funções duplicadas/ambíguas no PostgREST | nenhuma (assinatura única) |
| Logs de build | limpos ("build OK") |
| Logs de runtime/console/rede do preview | ausentes (nada foi capturado da sessão) |

Conclusão parcial honesta: **a causa ainda não está determinada.** Com os dados disponíveis não é possível afirmar que o erro está no código de Projetos — a rota, os assets e as consultas de banco estão saudáveis neste momento. A string "Internal Server Error" **não existe em nenhum lugar do código da aplicação**, o que confirma que essa tela branca é gerada pela camada de hospedagem/CDN, não pelo React. Faltam duas evidências que só existem no navegador do usuário logado: a resposta HTTP real que o navegador recebeu e qual requisição a produziu.

## Hipóteses ainda abertas (em ordem de probabilidade)

1. **Cabeçalho de requisição grande demais** — sessão com muitos cookies (`sb-*-auth-token` grande + cookies acumulados) faz a borda/CDN responder 5xx antes de chegar ao app. Explica: só no publicado, tela branca, independente da rota React, e por que a navegação anônima funciona.
2. **Deploy servido de um nó com cache inconsistente** — um chunk específico falhou naquele momento e já se regularizou (todos os 212 respondem 200 agora).
3. **Falha real na cadeia de dados de Projetos** — menos provável, porque produziria a tela de erro *dentro* do sistema (o `GlobalErrorBoundary` já cobre isso), e não uma página branca do navegador.

## Plano — Etapa 1: capturar a evidência que falta (sem alterar código)

Precisamos de uma captura do erro no ambiente onde ele acontece. O que será pedido/feito:

1. Reproduzir em Gestão de Parceiros → Projetos no app publicado com o DevTools aberto (aba Network, "Preserve log" ligado) e registrar: a URL que aparece na barra de endereço, a linha em vermelho com status 5xx, e a aba Response dessa linha.
2. Testar imediatamente depois, na mesma máquina, em uma janela anônima com login novo — isso separa a hipótese 1 (cookies) das demais: se em anônima funcionar, a causa é o estado da sessão/cookies do navegador.
3. Testar acesso direto por URL (`.../projetos`) sem passar por Parceiros, para saber se o gatilho é a navegação ou a rota.

## Plano — Etapa 2: correção conforme o que a evidência mostrar

- **Se for cabeçalho/cookie (hipótese 1):** reduzir o que é persistido no armazenamento de sessão e limpar cookies órfãos de autenticação no boot do app, de modo que a requisição volte a caber no limite da borda. Correção no código de inicialização de autenticação, sem tocar em lógica financeira.
- **Se for cache/CDN (hipótese 2):** republicar o app para gerar hashes novos de assets e confirmar com nova varredura dos chunks; nenhum código muda.
- **Se for a cadeia de dados (hipótese 3):** com o endpoint e o payload exatos em mãos, corrigir a consulta/RPC responsável e cobrir com verificação direta no banco antes e depois.

## Etapa 3: instrumentação permanente (recomendada em qualquer cenário)

Para não voltarmos a ficar sem evidência quando isso reaparecer:

- Registrar no console, de forma estruturada, toda resposta de erro do backend (endpoint, status, corpo) num interceptador único do cliente, para que os logs de runtime do preview passem a capturar essas falhas automaticamente.
- Exibir mensagem de erro objetiva na tela de Projetos quando a carga de dados falhar, em vez de estado silencioso.

## Observação de escopo

Nenhuma alteração em saldos, ledger, KPIs ou migrações de banco faz parte deste trabalho.
