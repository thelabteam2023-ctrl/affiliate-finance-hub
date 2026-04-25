Diagnóstico do erro ao revincular a Alawin

Identifiquei que o erro acontece no fluxo da aba Central de Operações > Bookmakers > Disponíveis, ao tentar vincular novamente uma casa que acabou de ser desvinculada.

Causa provável

O vínculo em si é feito com um UPDATE direto em `bookmakers.projeto_id`. Esse UPDATE dispara triggers no banco que já fazem automaticamente:

- criação/neutralização do `DEPOSITO_VIRTUAL` quando necessário;
- criação/fechamento do histórico em `projeto_bookmaker_historico`;
- adoção de freebets órfãs.

Porém, o frontend ainda tenta inserir manualmente um novo registro em `projeto_bookmaker_historico` logo depois do UPDATE. Isso pode gerar conflito/inconsistência porque o trigger já criou ou manipulou esse histórico. O erro mostrado no toast é genérico, então a operação pode estar falhando depois do UPDATE, deixando o usuário com sensação de que o vínculo falhou mesmo quando parte do processo já aconteceu.

Também encontrei outro ponto sensível no trigger de desvinculação: a RPC `desvincular_bookmaker_atomico` referencia `project_bookmaker_link_bonuses` usando `projeto_id`, mas a tabela usa `project_id`. Esse erro está escondido por um bloco `EXCEPTION`, então não necessariamente quebra tudo, mas pode causar detecção incorreta de uso da casa ao decidir se um vínculo foi fantasma ou real.

Plano de correção

1. Tornar o fluxo de vínculo canônico no frontend
   - Em `ContasDisponiveisModule.tsx`, remover a inserção manual em `projeto_bookmaker_historico` no vínculo individual.
   - No vínculo em massa, remover também a inserção manual em `projeto_bookmaker_historico`.
   - Manter o banco como fonte única para criar/fechar histórico via trigger `fn_ensure_historico_on_projeto_change`.

2. Melhorar o feedback de erro
   - Trocar o toast genérico `Erro ao vincular bookmaker ao projeto` por uma mensagem com `err.message` quando existir.
   - Adicionar log estruturado com bookmaker, projeto e etapa onde falhou.
   - Assim, se houver outro bloqueio real no banco, ele ficará claro na interface/console.

3. Reforçar segurança contra cliques duplos
   - O botão já respeita `vincularLoading`, mas vou adicionar early-return se já estiver vinculando.
   - No vínculo em massa, manter o processamento sequencial, mas com resultado claro de quais casas falharam.

4. Corrigir a inconsistência na RPC de desvinculação
   - Criar migração para ajustar `desvincular_bookmaker_atomico`, trocando a referência incorreta `projeto_id` por `project_id` em `project_bookmaker_link_bonuses`.
   - Seguir o padrão do projeto: `DROP FUNCTION IF EXISTS` antes de recriar a RPC para evitar ambiguidade de assinatura.
   - Não alterar saldos diretamente e não fazer retrofix em ledger.

5. Verificação após aplicar
   - Conferir o estado atual da Alawin: ela está sem `projeto_id`, saldo MX$ 1.453,50, com SAQUE_VIRTUAL confirmado e DEPOSITO_VIRTUAL anterior cancelado.
   - Após a correção, o fluxo esperado ao revincular no mesmo projeto é:

```text
bookmakers.projeto_id = PROJETO 00
  -> trigger neutraliza ping-pong se aplicável ou calcula novo baseline
  -> trigger cria histórico ativo se não existir
  -> frontend apenas atualiza cache e mostra sucesso
```

Resultado esperado

- Revincular uma casa recém-desvinculada não deve mais falhar por duplicidade/inconsistência de histórico.
- O fluxo fica mais leve e menos redundante.
- O histórico volta a ter uma única fonte de verdade: os triggers do banco.
- Se houver erro real de regra financeira, a mensagem aparecerá de forma diagnóstica em vez de toast genérico.