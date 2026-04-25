Plano para ajustar o formulário de Aposta Simples com múltiplas entradas:

1. Formulário: remover a coluna/campo “Linha” das entradas adicionais
- No modo “Bookmaker” da Aposta Simples, quando o usuário clicar em “+ Entrada”, as novas entradas não terão mais um campo separado de Linha.
- A Linha continuará sendo definida apenas uma vez, na entrada principal.
- Todas as entradas adicionais usarão automaticamente a mesma Linha/seleção da entrada principal.
- O cabeçalho/tabela será reajustado para ficar mais limpo: Bookmaker, Odd, Stake, Retorno e ação de remover.

2. Persistência correta nas pernas
- Ao salvar/criar uma aposta simples multi-entry, cada registro em `apostas_pernas` receberá a mesma `selecao` da entrada principal.
- `selecao_livre` das entradas adicionais deixará de ser preenchido individualmente; será `null` ou herdará visualmente a seleção principal, evitando divergência entre casas.
- Ao editar/duplicar apostas antigas que tenham `selecao_livre` diferente nas subentradas, a tela passará a tratá-las como uma única linha compartilhada pela aposta.

3. Card de operações
- No `SurebetCard`, usado para renderizar aposta simples multi-entry, as subentradas deixarão de exibir uma linha individual entre parênteses.
- O card mostrará a Linha/Mercado uma única vez no agrupamento da perna, e as casas dentro do agrupamento mostrarão apenas bookmaker, odd, stake, moeda/freebet e resultado quando aplicável.
- Isso mantém o comportamento correto: várias casas compondo a mesma perna, com o mesmo mercado e a mesma linha.

4. Validação visual e regressão
- Conferir que apostas simples single-entry continuam iguais.
- Conferir que surebets/múltiplas reais continuam exibindo pernas distintas normalmente.
- Conferir que liquidação rápida e resultado global de multi-entry simples continuam funcionando, pois a alteração é de modelagem visual/persistência da seleção, não de cálculo financeiro.

Arquivos previstos:
- `src/components/projeto-detalhe/ApostaDialog.tsx`
- `src/components/projeto-detalhe/SurebetCard.tsx`
- Possível ajuste auxiliar em `src/utils/groupPernasBySelecao.ts`, se necessário para garantir agrupamento consistente por linha principal.