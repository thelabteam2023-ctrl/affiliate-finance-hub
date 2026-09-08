# Saque duplicado de US$ 559 na Happy Slots — diagnóstico e correção

## 1. O que as evidências mostram

Casa HAPPY SLOTS (projeto do Márcio, workspace LABBET), moeda USD.

Linha do tempo real (horários UTC de 08/09):

```text
00:22:47  Ocorrência KYC resolvida — "sem impacto", valor recuperado 559
00:23:29  Saque #1 registrado — US$ 559, recebido 546,78 USDC, data 07/09  (Luiz Felipe)
00:23:45  Lançamento financeiro do saque #1  → saldo 559 → 0
00:23:58  Saque #2 registrado — US$ 559, recebido 0,219679 ETH, data 27/08 (Márcio)
00:24:25  Lançamento financeiro do saque #2  → saldo 0 → -559
```

Saldo atual da casa: **-559,00 USD**.

Duas conclusões apoiadas em dados:

- A hipótese de "ocorrência resolvida recompôs saldo" está **descartada**. A resolução
  não gerou nenhum lançamento financeiro. Os 559 já existiam desde 07/07 (payout de
  freebet). A casa tinha exatamente 559 e foi sacada duas vezes.
- Não houve reversão, nem retroatividade, nem erro de conversão. Houve simplesmente
  **ausência de trava**: os dois saques foram aceitos com 29 segundos de diferença.

## 2. Causa raiz

Três falhas somadas, todas confirmadas no código/banco:

**(a) Não existe validação de saldo no servidor.**
`process_financial_event` recebe o parâmetro `p_allow_negative` mas **nunca o usa** —
insere o evento sem comparar com o saldo. O gatilho `fn_financial_events_sync_balance`
também ignora `allow_negative` e simplesmente soma o delta. Ou seja: qualquer saque
maior que o saldo passa, e o saldo fica negativo.

**(b) A trava do formulário é apenas visual e usa dados em cache.**
`checkSaldoInsuficiente` em `CaixaTransacaoDialog.tsx` compara o valor com a lista de
casas já carregada na tela. Dois operadores em telas abertas ao mesmo tempo enxergam
os mesmos 559 disponíveis — foi exatamente o que aconteceu.

**(c) A detecção de duplicidade não pega esse caso e é apagada na confirmação.**
`fn_detect_duplicate_withdrawal` só compara saques com `data_transacao` dentro de 48h —
aqui as datas eram 27/08 e 07/09, fora da janela. Além disso ela nunca bloqueia, só
anota. E `ConfirmarSaqueDialog` grava `auditoria_metadata: { ignore_duplicate: true }`
**sobrescrevendo o objeto inteiro**, apagando qualquer marca de duplicidade anterior.

## 3. Correção proposta

### Etapa 1 — Trava de saldo no banco (obrigatória, fail-closed)
Criar `fn_guard_saldo_bookmaker_nao_negativo`, gatilho `BEFORE INSERT/UPDATE` em
`financial_events`, que:
- calcula o saldo resultante (real ou freebet, conforme `tipo_uso`) com `FOR UPDATE`
  na linha da casa — isso serializa dois saques concorrentes;
- se o resultado ficar abaixo de zero (tolerância 0,01) e `allow_negative` for falso,
  lança `SALDO_INSUFICIENTE: <CASA> — disponível X, solicitado Y <moeda>`;
- ignora eventos `event_scope = 'VIRTUAL'` e reversões/estornos.

Corrigir também `process_financial_event` para respeitar `p_allow_negative` antes de
inserir, com a mesma mensagem.

### Etapa 2 — Duplicidade que realmente bloqueia
- Ampliar a janela de comparação: usar `created_at` (registro) além de `data_transacao`,
  com janela de 7 dias sobre a data de competência **ou** 24h sobre a data de registro.
- Passar de "anota" para "exige confirmação explícita": marcar o saque como
  `duplicidade_detectada` e exigir que o usuário confirme no diálogo, com o motivo
  gravado em auditoria.
- Parar de sobrescrever `auditoria_metadata` no `ConfirmarSaqueDialog`: usar merge
  (`{...saque.auditoria_metadata, ignore_duplicate: true}`), preservando o histórico.

### Etapa 3 — Frontend consistente com o servidor
- Antes de gravar o saque, reconsultar o saldo da casa direto do banco (não do cache)
  e revalidar.
- Tratar a exceção `SALDO_INSUFICIENTE` vinda do banco com mensagem clara no diálogo,
  em vez de erro genérico.

### Etapa 4 — Regularização do caso Happy Slots
Sem apagar histórico e sem correção em massa. Confirmar com você **qual dos dois
saques é o verdadeiro** e então:
- cancelar o saque indevido com rastro de auditoria (mesmo procedimento usado no caso
  BORA JOGAR), estornando o lançamento financeiro correspondente;
- saldo volta de -559 para 0,00.

### Etapa 5 — Varredura
Listar todas as casas com saldo negativo hoje e apresentar o relatório, sem alterar
nada — cada caso será tratado individualmente por você.

## 4. Riscos de regressão

- A trava nova pode barrar fluxos legítimos que hoje dependem de saldo negativo
  (ajustes, perdas em trânsito, estornos). Por isso o gatilho respeita `allow_negative`
  e ignora eventos virtuais/reversões, e a Etapa 5 mapeia o passivo existente antes.
- A duplicidade com confirmação explícita adiciona um passo ao operador em casos de
  saques legítimos de mesmo valor.

## 5. Testes

1. Casa com 559 → saque de 559 passa; segundo saque de 559 é recusado com mensagem.
2. Dois operadores simultâneos na mesma casa: só um passa (teste de concorrência).
3. Saque com data retroativa não reabre saldo já consumido.
4. Estorno/ajuste com `allow_negative` continua funcionando.
5. Saque cripto com diferença de recebimento continua conciliando normalmente.
6. Confirmação de saque preserva os metadados de auditoria anteriores.
