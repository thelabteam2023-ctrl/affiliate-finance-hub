Plano de refatoração para corrigir o cenário da aba Surebet

Objetivo

Fazer com que o botão/formulário de "Aposta Simples" usado dentro da aba Surebet tenha exatamente o mesmo comportamento da aposta simples criada em Punter/Valuebet: registro simples, liquidação simples, card simples e cálculo por casa/perna quando houver múltiplas casas.

Diagnóstico confirmado

1. O registro recém-criado pela aba Surebet ainda nasceu assim:

```text
forma_registro = SIMPLES
estrategia = SUREBET
bookmaker_id = null
stake = 200
pernas_count = 0
```

Isso é um estado híbrido incorreto: parece aposta simples, mas é rotulada como Surebet e aparece em Operações da aba Surebet. Como não tem pernas, o card mostra informação incompleta e pode usar handlers/visual de surebet.

2. As simulações anteriores que funcionaram bem nasceram corretamente como:

```text
forma_registro = SIMPLES
estrategia = PUNTER
com ou sem apostas_pernas para multi-casa
```

3. O problema não é apenas visual. Existem pelo menos três pontos que precisam ser alinhados:
- abertura do formulário ainda pode passar `estrategia=SUREBET` por algum caminho antigo;
- a aba Surebet busca tudo com `estrategia = SUREBET`, então captura apostas simples que não deveriam estar ali como surebet real;
- o card de Operações força badge/estratégia `SUREBET` mesmo quando renderiza `ApostaCard` para uma aposta simples.

O que será alterado

1. Corrigir a origem do formulário
- Garantir que qualquer abertura de "Aposta Simples" pela aba Surebet envie `estrategia=PUNTER`, não `SUREBET`.
- Corrigir também o caminho via `ApostaPopupContainer`, que ainda usa `getEstrategiaFromTab(activeTab)` para simples/múltipla e pode reintroduzir `SUREBET`.
- A regra final será:

```text
Aposta Simples = forma_registro SIMPLES + estratégia escolhida no formulário, default PUNTER
Surebet real = forma_registro ARBITRAGEM + estratégia SUREBET + pernas de arbitragem
```

2. Separar a listagem da aba Surebet
- Ajustar a query da aba Surebet para tratar como "Surebet real" apenas operações de arbitragem:

```text
estrategia = SUREBET
forma_registro = ARBITRAGEM
```

- Aposta simples criada enquanto o usuário está na aba Surebet não deve ser convertida em surebet nem ganhar badge `SUREBET` por causa da aba.
- Se for necessário manter visibilidade operacional na aba Surebet, ela deve aparecer como `SIMPLES/PUNTER`, usando o mesmo card da aposta simples, nunca como arbitragem.

3. Corrigir o card em Operações
- Remover o `estrategia="SUREBET"` hardcoded quando a operação é simples.
- O `ApostaCard` deve receber `operacao.estrategia` real, por exemplo `PUNTER`, `VALUEBET`, etc.
- Para multi-casa simples, o card deve exibir as casas/pernas como entradas replicadas, não como cenário de arbitragem.
- Evitar que `bookmaker_id = null` sem pernas gere card vazio/incompleto.

4. Corrigir multi-casa simples como comportamento canônico
- Quando o usuário adiciona "casa a mais" no formulário simples, o sistema deve persistir as entradas como multi-entry de aposta simples.
- Cada casa deve ter stake, odd, moeda e resultado próprios em `apostas_pernas`.
- O pai deve ser apenas agregador da operação, sem virar surebet.

5. Conferir liquidação e resultados parciais
- Validar que GREEN, RED, VOID, MEIO_GREEN e MEIO_RED usam a mesma liquidação canônica para apostas simples em todas as abas.
- Para multi-casa, a liquidação rápida deve atualizar as pernas e o pai com os valores esperados:

```text
GREEN      lucro = stake * (odd - 1), retorno = stake * odd
MEIO_GREEN lucro = stake * (odd - 1) / 2, retorno = stake + lucro
VOID       lucro = 0, retorno = stake
MEIO_RED   lucro = -stake / 2, retorno = stake / 2
RED        lucro = -stake, retorno = 0
```

- Em multi-moeda, cada perna calcula na moeda nativa e o pai consolida com Cotação de Trabalho/snapshot, sem misturar símbolo de uma moeda com valor de outra.

6. Backend/defesa contra estados híbridos
- Adicionar ou ajustar uma proteção de domínio para impedir novos registros inconsistentes:

```text
estrategia = SUREBET + forma_registro = SIMPLES
```

- Em vez de permitir esse híbrido, o serviço deve normalizar para `PUNTER` quando for aposta simples, ou bloquear com erro claro se a intenção era surebet real.
- Não vou fazer correção em massa retroativa nos dados financeiros. Se existir algum registro de teste/híbrido, apenas indicarei qual está inconsistente para correção pontual aprovada depois.

7. Validação
- Rodar checagens TypeScript/testes disponíveis.
- Fazer uma simulação local/read-only dos cenários esperados e comparar com as fórmulas:
  - 1 bookmaker;
  - 2+ bookmakers mesma moeda;
  - 2+ bookmakers moedas diferentes;
  - resultados GREEN, MEIO_GREEN, VOID, MEIO_RED, RED.

Arquivos prováveis

- `src/components/popups/ApostaPopupContainer.tsx`
- `src/components/projeto-detalhe/GlobalActionsBar.tsx`
- `src/pages/ApostaWindowPage.tsx`
- `src/components/projeto-detalhe/ApostaDialog.tsx`
- `src/components/projeto-detalhe/ProjetoSurebetTab.tsx`
- `src/components/projeto-detalhe/ApostaCard.tsx`
- `src/services/aposta/ApostaService.ts`
- possivelmente uma migration pequena de validação/normalização de domínio, se necessário

Resultado esperado

Depois da refatoração:

```text
Abrir "Nova Aposta > Aposta Simples" na aba Surebet
= mesmo formulário e mesmo comportamento da aba Punter
= registro SIMPLES/PUNTER por padrão
= adicionar casas a mais cria multi-entry simples
= cards e liquidação mostram os valores corretos por casa
= Surebet real continua existindo apenas pelo formulário/motor de Surebet
```

