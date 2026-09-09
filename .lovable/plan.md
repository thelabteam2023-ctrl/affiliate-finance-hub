# Editar aposta liquidada: botão Salvar não faz nada

## O que está acontecendo

Quando a aposta já está liquidada (Green/Red/etc.) e o formulário de aposta simples é aberto na **janela separada** (a tela do print, `preview--stake-sync-erp.lovable.app/janela/aposta/...`), clicar em **Salvar** não produz efeito nenhum: nada é gravado, nenhum erro aparece, nenhuma mensagem de sucesso.

## Causa raiz (confirmada no código)

Ao salvar uma aposta já liquidada, o formulário pede uma confirmação ("Aposta já liquidada — reverter e salvar") e fica **esperando** a resposta do usuário antes de continuar.

Essa janelinha de confirmação só existe na versão do formulário que abre como modal dentro da página. Na versão de janela separada (usada pelos botões que abrem a aposta em janela própria, tanto na aba Bônus quanto em Todas as Apostas) ela **não é montada na tela**. Resultado: a espera nunca termina, a gravação nunca começa e o formulário fica em silêncio.

Isso explica por que a falha atinge qualquer campo (resultado, casa, odd, stake, data, mercado, evento) sempre que a aposta está liquidada — e por que apostas ainda pendentes salvam normalmente.

Detalhe técnico: `ApostaDialog.tsx` tem um retorno antecipado para o modo `embedded` (linha ~3503) que renderiza apenas o diálogo de exclusão. O `AlertDialog` de confirmação de liquidada (linha ~5147) e a promessa de `requestLiquidadaConfirm()` (linha ~456) só existem no caminho de modal, então em janela a promessa fica pendente para sempre.

## Correção

1. Passar a montar o diálogo de confirmação de "aposta já liquidada" também no modo janela, com o mesmo texto e os mesmos botões (Cancelar / Reverter e salvar).
2. Blindar o fluxo contra novo silêncio: se por qualquer motivo a confirmação não puder ser exibida, o salvamento não pode ficar preso — ou segue com aviso explícito, ou falha com mensagem visível.
3. Garantir que "Cancelar" na confirmação libere o botão Salvar (sem travar em carregando).

Nenhuma regra financeira muda: a reversão + reemissão continua sendo feita pelas rotinas do banco já existentes (`atualizar_aposta_liquidada_atomica_v2`, `reliquidar_aposta_v6`, `reverter_liquidacao_v4`) e as travas de saldo negativo continuam valendo.

## Verificação (obrigatória antes de dar como resolvido)

Com uma aposta simples de teste, em janela separada e também no modal, e nas duas abas (Bônus e Todas as Apostas):

- Green → Red e Red → Green: confirmar que o resultado muda, o lucro/prejuízo muda de sinal e o saldo da casa acompanha.
- Troca de casa em aposta liquidada: valor sai da casa nova e volta para a antiga, sem duplicar lançamento.
- Alteração de odd e de stake em aposta liquidada: retorno e lucro recalculados.
- Alteração só cadastral (data, evento, mercado, seleção, observação): salva sem pedir confirmação e sem gerar lançamento novo.
- Vários campos alterados de uma vez.
- Liquidada → Pendente e depois voltar a liquidar.
- Cancelar na confirmação: nada é gravado e o formulário volta a responder.
- Após cada caso: conferir no banco os lançamentos da aposta (sem duplicidade, soma bate com o saldo da casa) e checar que a lista e os indicadores atualizam sem F5.

Fecha com um teste automatizado de regressão para o caminho "editar liquidada em janela" e conferência do build.
