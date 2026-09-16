# Auditoria do Financeiro: origem exata dos R$ 11.151 e correção estrutural

## Diagnóstico (já confirmado nos dados, sem alterar nada)

O workspace **DANIEL LABBET** tem **um único projeto**, LIVE DANIEL (consolidação BRL, cotação de trabalho 5,12). Logo o Lucro Operacional Teórico do Financeiro é, por construção, o lucro operacional desse projeto. Não há duplicidade de join, nem projeto extra, nem período errado (o valor é o mesmo em setembro/2026 e acumulado porque toda a operação ocorreu em setembro).

Decomposição exata devolvida pela função do banco `get_projetos_lucro_operacional`:

```text
Apostas liquidadas BRL ......... -5.809,10
Cashback BRL ................... +  481,00
Apostas liquidadas USD 331,725 → +1.698,43  (x 5,12)
Apostas liquidadas MYR -35     → -   44,43  (x 1,2695)
Bônus creditados (snapshot)    → +15.827,61  <-- AQUI ESTÁ O ERRO
Cancelamento de bônus USD -195,70 → -1.002,00
-----------------------------------------------
Total .......................... +11.151,51
```

### Causa raiz

Cada bônus grava `valor_consolidado_snapshot` **já na moeda de consolidação do projeto** (é o que o formulário de bônus salva, e é assim que todas as telas do projeto leem: somam o snapshot direto, sem converter).

A função do banco usada pelo Financeiro rotula esse mesmo campo como se fosse dólar (chave interna `__SNAPSHOT_USD__`) e **multiplica de novo pela cotação**. Os 8 bônus somam R$ 3.091,33 em snapshot; a função transforma isso em R$ 15.827,61.

```text
Bônus corretos .... R$  3.091,33
Bônus inflados .... R$ 15.827,61
Excesso ........... R$ 12.736,28
```

Lucro Operacional Teórico correto do LIVE DANIEL: **−R$ 1.584,77** (e não +R$ 11.151,51). A função é a única no banco com esse defeito; nenhuma tela de projeto é afetada — por isso o projeto e o Financeiro divergem.

Consequência em cadeia: na **Composição do Patrimônio Atual**, "Resultado operacional realizado" usa esse mesmo número inflado, e "Variação cambial não realizada" é calculada como resíduo (plug) — ou seja, os −R$ 6.300,07 absorvem artificialmente parte do erro. Corrigindo a origem, os dois se ajustam sozinhos.

### Dois problemas secundários encontrados (mesmo caminho, não são a causa aqui)

1. O Financeiro soma o lucro de cada projeto **na moeda do próprio projeto**, sem converter para a moeda do workspace. Com um projeto BRL não aparece; com um projeto em dólar somaria dólar com real.
2. A lista de projetos do Financeiro não filtra workspace nem status — depende só das permissões e inclui projetos arquivados/encerrados.

## O que será feito

1. **Corrigir a função de lucro operacional no banco**: tratar o snapshot de bônus como valor já consolidado na moeda do projeto (sem reconversão), mantendo o fallback por moeda original quando não há snapshot. Nenhum dado histórico, evento financeiro ou saldo é tocado — só a leitura/agregação.
2. **Consolidar por moeda no Financeiro**: converter o lucro de cada projeto para a moeda do workspace antes de somar, e restringir explicitamente a projetos do workspace atual (com decisão explícita sobre arquivados — proposta: incluir, pois o resultado histórico existiu).
3. **Redesenhar o modal "Fluxo Líquido × Lucro Operacional Teórico"** para ser auditável: valor e período de cada lado, composição do lucro operacional por componente (apostas, cashback, giros, bônus, perdas, ajustes) e por projeto, composição do fluxo líquido (depósitos x saques), e a diferença explicada como "resultado ainda represado em saldos", com a fonte de cada número.
4. **Documentar as definições** (Fluxo Líquido, Resultado Operacional Teórico, Realizado, Lucro Realizado, Lucro se sacar tudo, Patrimônio, Variação Cambial Não Realizada) na memória do projeto, uma definição e uma fonte por conceito.
5. **Testes de regressão** com LIVE DANIEL como caso âncora: bônus em BRL, USD e MYR com snapshot; bônus sem snapshot; projeto em dólar; projeto sem operações; projeto com prejuízo; vários vínculos na mesma casa (garantindo que não multiplica); período com e sem filtro. Critério: Financeiro == soma dos projetos, componente por componente.

## Detalhes técnicos

- Migração corrigindo `public.get_projetos_lucro_operacional(uuid[],text,text,jsonb)`: substituir a chave `__SNAPSHOT_USD__` por um bucket `__CONSOLIDADO__` (taxa 1 sobre a moeda de consolidação do projeto) no bloco `bonus`; manter o `CASE` por moeda apenas para registros sem `valor_consolidado_snapshot`, convertendo direto para a moeda de consolidação. `DROP FUNCTION` antes de recriar, conforme padrão anti-ambiguidade do PostgREST.
- Verificar no mesmo passo o bucket `cancelamento_bonus` (hoje em USD nativo) para confirmar que não sofre o mesmo desvio.
- `src/hooks/useWorkspaceLucroOperacional.ts`: filtro por `workspace_id`, leitura de `moeda_consolidacao` por projeto e conversão para a moeda do workspace antes da soma; expor breakdown por projeto e por componente para o modal.
- `src/components/financeiro/FluxoLiquidoDetalheDialog.tsx`: nova composição detalhada; `src/pages/Financeiro.tsx` passa o breakdown.
- `src/components/financeiro/PosicaoCapitalCard.tsx`: sem mudança de fórmula; apenas rótulo/tooltip deixando claro que a variação cambial não realizada é resíduo de marcação a mercado.
- Nada de `financial_events`, `cash_ledger` ou `saldo_atual`. Sem migração de dados.
- Validação: `npx tsgo --noEmit -p tsconfig.app.json`, vitest dos novos testes e conferência do LIVE DANIEL na tela.
