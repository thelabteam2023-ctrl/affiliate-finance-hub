# Correção: "saldo insuficiente" ao editar aposta em aberto (múltiplas entradas)

## O que está acontecendo

Ao salvar a edição de uma arbitragem já lançada e ainda em aberto, o sistema recusa a alteração com
"SALDO_INSUFICIENTE: 1XBET — saldo real disponível: 500,00, necessário: 1.000,00", mesmo quando a aposta
apenas está sendo ajustada (a casa já está com aquele valor comprometido pela própria aposta).

## O que a investigação já mostrou (verificado no código e no banco)

1. **A tela de edição não envia a identidade das pernas.** Em `SurebetDialog.tsx` (linhas ~2229-2239) o
   pacote enviado para `editar_surebet_completa_v1` contém casa, odd, stake, seleção e moeda — **mas não o
   `id` da perna**. Sem `id`, a rotina de edição trata cada perna como perna nova: apaga todas as pernas
   existentes e recria tudo do zero, gerando novos débitos de stake em vez de ajustar os existentes.
2. **A mesma chamada força `fonte_saldo: 'REAL'`**, então uma perna que usava freebet vira consumo de saldo real
   ao ser salva.
3. **Sub-entradas são sobrescritas.** A rotina `editar_perna_surebet_atomica` atualiza *todas* as entradas da
   perna com o stake cheio da perna. Numa perna com duas entradas de 500, ambas passam a valer 1.000 —
   dobrando a exposição da perna e gerando a falta de saldo relatada.
4. **A trava de saldo negativo (`fn_guard_saldo_bookmaker_nao_negativo`) não reconhece o contexto de edição.**
   Diferente da trava das entradas, ela não tem exceção para a reemissão orquestrada de eventos; qualquer
   ordem em que o débito novo chegue antes da devolução do antigo vira erro de saldo.
5. Ao recriar as pernas, se todas forem apagadas antes, a aposta chega a ser marcada como CANCELADA no meio
   do processo.

Regra financeira correta (já usada no resto do LABBET): a edição deve validar o **efeito líquido** da
alteração (novo comprometimento − comprometimento atual da mesma aposta/perna), nunca tratar a aposta que
está sendo editada como um consumo novo e independente.

## Plano de correção

### Etapa 1 — Reproduzir em ambiente controlado (antes de qualquer correção)
Script SQL de teste com rollback (sem tocar em dados reais) cobrindo os cenários pedidos: uma entrada por
perna; duas entradas na mesma perna; sub-entrada na segunda perna; múltiplas entradas nas duas pernas;
excluir sub-entrada; reduzir stake; aumentar stake; adicionar sub-entrada. Objetivo: confirmar em qual passo
o saldo é consumido duas vezes e se o problema depende ou não das sub-entradas.

### Etapa 2 — Preservar a identidade da aposta na edição
- Enviar o `id` de cada perna (e das entradas, quando existirem) no salvamento da edição.
- Enviar a origem real do saldo (real/freebet) de cada perna, em vez do valor fixo.
- Resultado: editar deixa de apagar e recriar; passa a ajustar a perna existente.

### Etapa 3 — Tornar a edição consciente de múltiplas entradas
- A rotina de edição de perna passa a tratar entradas individualmente: alterar, excluir e incluir entrada
  ajustando apenas a diferença financeira de cada uma.
- Fim da sobrescrita de todas as entradas com o stake cheio da perna.
- Divisão real/freebet respeitada por entrada, sem recalcular por proporção.

### Etapa 4 — Validação de saldo por efeito líquido
- A verificação passa a considerar o valor já comprometido pela própria aposta/perna que está sendo editada.
- Mensagens distintas para "saldo real insuficiente" e "freebet insuficiente", com casa, disponível e
  necessário.
- A trava de saldo negativo continua fail-closed, mas passa a reconhecer o contexto de edição orquestrada,
  avaliando o efeito líquido da operação em vez de cada lançamento isolado.

### Etapa 5 — Ordem e atomicidade
Garantir a sequência: estado atual → devolver logicamente o comprometimento da aposta → aplicar a nova
configuração → validar → persistir, tudo na mesma transação, sem estado intermediário de aposta cancelada.

### Etapa 6 — Testes de regressão e verificação
- Testes SQL rollback-only para os cenários A–H, incluindo freebet e multimoeda.
- Verificação de que o saldo da casa após uma edição neutra (salvar sem mudar nada) permanece idêntico.
- Teste de tela no fluxo de edição, mais checagem de tipos/compilação.

## Detalhes técnicos

- Frontend: `src/components/projeto-detalhe/SurebetDialog.tsx` (montagem de `pernasParaRPC`) e a tabela de
  edição `SurebetDialogTable.tsx` (propagação de `id` de perna/entrada e `fonte_saldo`).
- Banco: `editar_surebet_completa_v1`, `editar_perna_surebet_atomica`, `deletar_perna_surebet_v1`,
  `fn_guard_saldo_bookmaker_nao_negativo`, `fn_guard_saldo_entrada_surebet`.
- Testes: novo arquivo em `supabase/tests/triggers/` no mesmo padrão dos testes 08 e 09.

## Fora do escopo

- Nenhuma correção em massa ou retroativa de lançamentos históricos: nada de `financial_events`,
  `cash_ledger` ou `saldo_atual` existentes será alterado.
- A aposta do Everton já excluída não será recriada; serve apenas como caso de referência.
