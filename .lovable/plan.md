# Auditoria forense do saque MYR → USDC

## Objetivo
Explicar, com evidências e sem qualquer gravação, por que as duas tentativas de sacar 2.000 MYR da 12BET para aproximadamente 488,83 USDC chegaram a um estado rejeitado pelo `cash_ledger`.

## Evidências já confirmadas
- A regra atual do banco é `chk_snapshot_1_para_1_nao_stable`: uma moeda diferente de USD/USDT/USDC não pode ter simultaneamente `valor_usd_referencia = valor` e `cotacao_origem_usd = 1`.
- O formulário grava diretamente em `cash_ledger`; não há RPC ou Edge Function nessa chamada.
- No código atual, o saque cripto redefine o registro canônico para `moeda = MYR`, `valor = 2000`, `moeda_destino = USDC` e `valor_destino ≈ 488,83`.
- O código atual também pretende calcular `valor_usd_referencia ≈ 488,83` e `cotacao_origem_usd ≈ 0,244`, combinação que não viola a constraint. Portanto, a origem exata da divergência ainda precisa ser comprovada no caminho executado, sem atribuí-la novamente apenas à classificação da moeda.
- Há saques históricos MYR → USDT válidos, inclusive um confirmado, demonstrando que o modelo suporta essa conversão quando o snapshot está coerente.
- Nenhuma tentativa MYR recente aparece persistida no `cash_ledger`, compatível com aborto atômico antes da criação do lançamento; isso ainda será confrontado com eventos e auditorias relacionados.

## Plano de investigação somente leitura

1. **Reconstruir as duas tentativas**
   - Correlacionar horário, usuário, workspace, 12BET, wallet de destino e registros de erro disponíveis.
   - Consultar logs do navegador, PostgREST, banco e tabelas de diagnóstico.
   - Separar claramente fatos encontrados de dados que não foram registrados pelos logs.

2. **Reconstituir o payload efetivo**
   - Rastrear formulário → estado → cálculo cambial → objeto final → chamada `.insert()`.
   - Reproduzir os cálculos como funções puras/`SELECT`, sem inserir dados.
   - Registrar cada campo relevante: moeda/valor canônicos, origem, destino, quantidade de USDC, taxas e referência USD.
   - Verificar caminhos alternativos, dados pendentes, confirmação de taxa e diferenças entre preview e versão publicada.

3. **Auditar a ordem real dos triggers**
   - Inventariar todos os triggers `BEFORE`/`AFTER` de `cash_ledger` e `financial_events`, incluindo ordem alfabética de execução.
   - Inspecionar as definições atuais das funções que normalizam snapshots, criam eventos, travam saldo e tratam pendências.
   - Determinar se algum trigger reescreve `moeda`, `valor`, `valor_usd_referencia` ou `cotacao_origem_usd` antes da validação.

4. **Reconstruir o registro rejeitado sem gravar**
   - Aplicar, em consultas puras, as mesmas transformações do frontend e dos triggers.
   - Produzir a comparação obrigatória: registro original → payload final → tuple após cada trigger → expressão da constraint.
   - Identificar exatamente `constraint → coluna → valor → regra violada`.

5. **Comparar com casos válidos**
   - Comparar o caso MYR → USDC com saques MYR → USDT e USD → USDC já persistidos.
   - Fazer diff de moedas, valores, taxas, status, carteira, origem/destino, snapshots e eventos derivados.
   - Verificar se o problema depende de MYR, USDC, wallet específica, cotação ausente, versão publicada ou ordem de triggers.

6. **Verificar atomicidade e impacto histórico**
   - Procurar, somente por leitura, `financial_events` órfãos, lançamentos sem mirror, mirrors divergentes, locks ou alteração de saldo associados às tentativas.
   - Classificar o incidente entre aborto integral, persistência parcial ou divergência persistida.
   - Não corrigir nenhum achado nesta fase.

7. **Mapear todas as moedas em risco**
   - Simular BRL, USD, EUR, GBP, MYR, MXN, ARS, COP e criptoativos suportados.
   - Criar matriz por moeda com taxa disponível, payload calculado, compatibilidade com a constraint e risco.
   - Tratar moedas desconhecidas e cotações zero/ausentes como casos fail-closed.

8. **Auditar a regressão recente**
   - Comparar as alterações recentes de classificação, cálculo e trava com a versão efetivamente publicada.
   - Só atribuir causalidade a uma alteração quando o diff explicar os valores exatos rejeitados.

## Entrega antes de qualquer correção
- Linha do tempo das duas tentativas e lacunas de observabilidade.
- Causa raiz comprovada ou, se os logs não retiveram o payload, conclusão explícita sobre o limite da prova.
- Definição exata da constraint, função responsável e primeiro estágio onde o dado diverge.
- Comparativo MYR → USDC versus operações válidas.
- Matriz de moedas afetadas e auditoria de integridade histórica.
- Proposta de correção separada, riscos, rollback e testes — sem implementá-la até nova aprovação.

## Garantias
- Nenhum `INSERT`, `UPDATE` ou `DELETE` em dados financeiros.
- Nenhuma nova tentativa real de saque.
- Nenhuma alteração em constraints, migrations, saldos, ledger ou histórico.
- Somente consultas, leitura de código/logs e simulações sem persistência.
