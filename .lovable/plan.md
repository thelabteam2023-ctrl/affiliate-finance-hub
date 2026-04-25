Plano para corrigir o erro do formulário de Arbitragem e preservar as melhorias recentes

Diagnóstico confirmado
- O erro da imagem vem da trigger de proteção em `apostas_pernas`: ela bloqueia qualquer registro pai `forma_registro = ARBITRAGEM` cuja `estrategia` não seja `SUREBET`.
- O formulário de Arbitragem foi aberto pela aba Bônus (`tab=bonus`) e por isso o estado do formulário ficou com `estrategia = EXTRACAO_BONUS`.
- Ao salvar, o formulário chama `criar_surebet_atomica` com `p_estrategia = EXTRACAO_BONUS`; a função cria o pai como `ARBITRAGEM + EXTRACAO_BONUS`; em seguida, ao inserir as pernas, a trigger bloqueia com: “Arbitragem com pernas deve usar estrategia=SUREBET e motor atômico”.
- Ou seja: as melhorias de roteamento/contexto deixaram o formulário respeitar a aba de origem, mas isso conflitou com a regra atual do banco que exige que toda arbitragem técnica seja `SUREBET`.

Correção proposta

1. Separar “tipo técnico do formulário” de “contexto de origem”
- Para o formulário de Arbitragem, manter sempre `estrategia = SUREBET` no registro salvo, independentemente de ele ter sido aberto dentro de Bônus, Punter, ValueBet, Duplo Green ou Surebet.
- Preservar `contexto_operacional = BONUS` quando o formulário vier da aba Bônus, e `FREEBET` quando vier da aba Freebets.
- Manter a fonte de saldo por perna (`REAL`/`FREEBET`) como a verdade financeira, sem voltar ao modelo antigo.

2. Ajustar UI do cabeçalho do formulário de Arbitragem
- Evitar que o cabeçalho mostre “Extração de Bônus” como estratégia em um formulário de Arbitragem.
- Quando aberto da aba Bônus, o cabeçalho deve indicar o contexto de origem, mas a estratégia técnica do formulário deve permanecer Surebet/Arbitragem.
- Isso elimina a inconsistência visual e evita que o usuário registre uma arbitragem com estratégia incompatível.

3. Corrigir o salvamento no `SurebetModalRoot`
- No `handleSave`, normalizar a estratégia antes da chamada RPC:
  - `p_estrategia: 'SUREBET'` para qualquer `forma_registro = ARBITRAGEM`.
  - `p_contexto_operacional` continua vindo da aba/modal (`NORMAL`, `BONUS`, `FREEBET`).
- Aplicar a mesma regra em rascunhos e duplicações de arbitragem para não reutilizar estratégia inválida.
- Manter os snapshots de cotação de trabalho já implementados (`getEffectiveRate` + `getSnapshotFields`) para todas as pernas.

4. Reforçar a camada de serviço para evitar regressão
- Em `ApostaService.criarAposta`, no caminho `forma_registro = ARBITRAGEM`, enviar `p_estrategia: 'SUREBET'` para a RPC mesmo que algum chamador passe outra estratégia por engano.
- Isso cria uma defesa adicional no frontend/service sem enfraquecer a proteção do banco.

5. Revisar o hook legado de arbitragem
- `useApostasUnificada.criarArbitragem` ainda faz insert direto em `apostas_unificada` e depois em `apostas_pernas`, contrariando o padrão atual do motor atômico.
- Vou atualizar esse hook para delegar a criação para `criar_surebet_atomica` ou remover o caminho inseguro de dual-write direto, preservando os snapshots de cotação de trabalho.
- Isso evita que outros pontos do app recriem o mesmo erro ou contornem o ledger.

6. Auditar os demais formulários de aposta
- Aposta simples: confirmar que continua salvando snapshots de Cotação de Trabalho no pai e nas pernas multi-casa.
- Aposta múltipla: confirmar que usa `getEffectiveRate` e não cotação oficial para snapshots.
- Arbitragem/Surebet: confirmar que usa cotação de trabalho em todas as pernas e que salva via RPC atômica.
- Duplicação: confirmar que não carrega IDs antigos e que abre o formulário correto por `forma_registro`.
- Modal de Vínculos: confirmar que o botão editar abre o formulário correto sem trocar a estratégia técnica de arbitragem.

7. Validação após implementar
- Rodar checagem TypeScript.
- Fazer busca no código por chamadas diretas a inserts de `ARBITRAGEM` em `apostas_unificada`/`apostas_pernas`.
- Validar o caso da imagem: arbitragem aberta da aba Bônus com 3 pernas deve salvar sem erro, como `SUREBET` técnico + `contexto_operacional = BONUS`.

Resultado esperado
- O usuário conseguirá registrar arbitragem novamente sem o erro.
- As melhorias recentes continuarão funcionando: cotação de trabalho, duplicação, edição por vínculos e renderização nas abas.
- O sistema fica coerente com o padrão financeiro definido: arbitragem sempre usa motor atômico e pernas via ledger, sem insert/update direto inseguro.