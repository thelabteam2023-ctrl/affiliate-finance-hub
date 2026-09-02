# Status do parceiro e filtro "Em andamento"

## O que foi verificado (fatos, não suposições)

Consultas ao banco e leitura do código:

- A Ariane Aparecida existe em **dois workspaces com o mesmo CPF** (434.284.848-19):
  - LABBET: `status = inativo` (alterado em 01/08/2026)
  - LABBET CONSULTORIA: `status = ativo` (última alteração em 10/04/2026)
- O campo que determina ativo/inativo é `parceiros.status` (texto: `ativo` / `inativo`). Não existe nenhum trigger no banco que reescreva esse campo (os triggers da tabela são apenas `updated_at`, proteção do caixa operacional e cascata para bookmakers).
- A listagem vem de `useParceirosData` (query `["parceiros-data", workspaceId]`), que busca todos os parceiros do workspace e **não filtra status no banco**.
- O filtro "Em andamento" é 100% no frontend, em `ParceiroListaSidebar.tsx`: compara `p.status === "ativo"`.
- Cache: `staleTime` de 5 minutos, `gcTime` de 30 minutos, `refetchOnWindowFocus: false` no cliente global. Não há persistência em disco.
- A lista só é atualizada quando o diálogo de edição fecha com `saved: true` (`refetchParceiros`). Nenhuma outra origem de mudança (outra aba, outra janela, outro usuário) atualiza a lista.

## Diagnóstico

Com o workspace confirmado como **LABBET**, onde o banco já registra `inativo`, a persistência está correta — o problema está no lado do cliente. O código do filtro em si está correto, então a causa é **dado desatualizado em memória**, não lógica de comparação. Os dois vetores possíveis, ambos reais na arquitetura atual:

1. **Sem invalidação reativa**: a query `parceiros-data` só é refeita ao fechar o diálogo de edição na mesma janela. Uma aba/janela aberta em paralelo (o sistema abre janelas separadas em vários fluxos) continua exibindo o status antigo indefinidamente enquanto a query permanecer montada.
2. **Refetch condicionado**: se o salvamento não devolver `saved: true` por qualquer caminho de fechamento (fechar pelo X, ESC ou clicando fora após salvar), nenhum refetch acontece e a lista fica com o valor antigo até um F5.

Isto é diagnóstico com evidência de código; a reprodução exata na sessão do usuário não pôde ser observada. Por isso o primeiro passo do trabalho é instrumentar e confirmar, e só então aplicar o restante.

Observação adicional (não é bug, apenas registro): como o mesmo CPF existe em dois workspaces com status diferentes, inativar no LABBET não afeta o LABBET CONSULTORIA — cada workspace tem seu próprio cadastro.

## O que será feito

### 1. Confirmar o vetor real
Registrar, em modo diagnóstico temporário, o `status` que a query devolve e o `updated_at` da linha, comparando com o banco. Isso identifica se a lista está com dado antigo em memória ou se algo mais está em jogo, antes de qualquer mudança de comportamento.

### 2. Tornar a listagem reativa ao status (correção principal)
- Invalidar a query `["parceiros-data", workspaceId]` no próprio salvamento do parceiro (e não só no fechamento do diálogo), de forma que o refetch aconteça mesmo quando o diálogo é fechado por caminhos alternativos.
- Assinar mudanças da tabela `parceiros` do workspace ativo via Realtime, no mesmo padrão já usado pela sincronização financeira global, para que alterações feitas em outra aba, outra janela ou por outro usuário atualizem a lista sem F5.
- Ajustar a query da listagem para revalidar ao montar a tela (`refetchOnMount: "always"`), garantindo consistência com o banco a cada entrada na tela.

### 3. Endurecer a comparação do filtro (defensivo, sem mudar a regra)
Normalizar o valor de status na comparação (`trim` + minúsculas) para que variações de gravação nunca façam um parceiro inativo escapar do filtro. A regra funcional permanece a acordada: **só `parceiros.status` manda** — parceria/contrato encerrado não influencia o filtro.

### 4. Teste automatizado da regra
Extrair a filtragem da sidebar para uma função pura e cobrir com testes: ativo aparece em "Em andamento"; inativo não aparece; "Inativos" mostra só inativos; "Todos" mostra ambos; status com espaço/maiúscula é tratado corretamente.

## Validação

- Caso 1: parceiro ativo em "Em andamento" → aparece.
- Caso 2: parceiro inativo em "Em andamento" → não aparece.
- Caso 3: ativo → inativo → salvar → some da lista sem F5.
- Caso 4: inativo → ativo → salvar → aparece na lista sem F5.
- Caso 5: F5 → resultado idêntico ao banco.
- Caso 6: filtros "Inativos" e "Todos os status" seguem com o comportamento atual.

Os casos 1, 2 e 6 são cobertos por teste automatizado; 3, 4 e 5 são verificados na tela após a implementação.

## Risco de regressão

Baixo e contido. As mudanças ficam restritas a: hook de listagem de parceiros, filtro da sidebar e invalidação após salvar o parceiro. Não há alteração em importação/exportação, financeiro, bookmakers, saldos, ledger, apostas, RLS, histórico ou na semântica do campo `status`. O único efeito colateral esperado é um refetch adicional da lista de parceiros ao entrar na tela e quando o status muda.
