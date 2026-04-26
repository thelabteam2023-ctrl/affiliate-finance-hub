Plano para corrigir o erro ao editar estratégia em entradas de arbitragem

Diagnóstico
- O erro da imagem não é mais o bloqueio antigo de “estratégia precisa ser SUREBET”. Esse ponto foi relaxado.
- O erro atual vem da trigger de proteção do pai `apostas_unificada`: ela bloqueia UPDATE direto de campos de liquidação em apostas `forma_registro = ARBITRAGEM` (`resultado`, `lucro_prejuizo`, `status = LIQUIDADA`) quando a atualização não passa pelo motor autorizado.
- O formulário de edição `SurebetModalRoot` chama a RPC `editar_surebet_completa_v1` e envia também `p_lucro_prejuizo`, `p_roi_real`, `p_status` e `p_resultado`. Mesmo quando o usuário só quer trocar a estratégia, essa RPC faz UPDATE nesses campos no pai. Como a função `editar_surebet_completa_v1` ainda não seta o contexto autorizado `app.surebet_recalc_context`, a trigger entende isso como UPDATE manual de liquidação e bloqueia.
- Há ainda fluxos legados (`SurebetDialog`, `useApostasUnificada.atualizarArbitragem`) com update direto/delete+insert de pernas que podem recriar inconsistências. O formulário usado na imagem parece ser o novo `SurebetModalRoot`, mas a auditoria deve fechar esses caminhos também.

Correção proposta

1. Ajustar a RPC `editar_surebet_completa_v1` no banco
- Criar uma migração substituindo a função com `DROP FUNCTION IF EXISTS` antes do `CREATE OR REPLACE`, seguindo a regra do projeto para evitar ambiguidade de assinatura.
- No início da função, setar `PERFORM set_config('app.surebet_recalc_context', 'on', true);` para que edições atômicas autorizadas possam atualizar os campos derivados do pai quando necessário.
- Melhorar a função para atualizar campos de liquidação do pai apenas quando os parâmetros realmente forem enviados e representarem mudança necessária, evitando alterações desnecessárias em `resultado/lucro/status` durante uma simples troca de estratégia.
- Preservar a edição atômica de pernas via `editar_perna_surebet_atomica` e criação/deleção de pernas via RPCs já existentes.

2. Ajustar o frontend para não recalcular liquidação ao editar apenas metadados
- Em `SurebetModalRoot`, diferenciar dois tipos de edição:
  - edição estrutural/financeira: pernas, stake, odd, bookmaker, resultados;
  - edição de metadados: estratégia, contexto, evento, esporte, mercado, data.
- Para troca simples de estratégia/contexto, enviar para a RPC apenas os campos necessários e manter `p_lucro_prejuizo`, `p_roi_real`, `p_status` e `p_resultado` como `null/undefined` quando não houver alteração real de resultado.
- Manter estratégia editável em “Todas Apostas” e travada apenas nas abas com estratégia fixa (Bônus, Duplo Green, Surebet, ValueBet, Punter, etc.), conforme a regra que você descreveu.

3. Blindar a edição de registros salvos com estratégia antiga/errada
- Garantir que um registro `ARBITRAGEM` possa ter `estrategia = EXTRACAO_BONUS`, `DUPLO_GREEN`, `VALUEBET`, `PUNTER` etc. quando editado a partir de “Todas Apostas”.
- Preservar `forma_registro = ARBITRAGEM` como tipo técnico do formulário e `estrategia` como classificação operacional editável.
- Preservar `contexto_operacional` separado da estratégia.

4. Remover/neutralizar caminhos legados inseguros
- Atualizar `useApostasUnificada.atualizarArbitragem` para não fazer `update` direto em `apostas_unificada` + delete/insert em `apostas_pernas`; deve delegar para `editar_surebet_completa_v1` ou ficar restrito a um caminho seguro sem impacto financeiro.
- Revisar `SurebetDialog`/`SurebetDialogTable`: se ainda forem usados em alguma aba, impedir que façam UPDATE direto de arbitragem liquidada ou sincronização manual de pernas fora das RPCs.
- Manter `liquidarSurebetSimples` apenas como deprecated e garantir que nenhum chamador novo dependa dele.

5. Validação
- Rodar TypeScript.
- Rodar a suíte Vitest existente.
- Auditar por busca no código chamadas diretas a `.update()` em `apostas_unificada` para `ARBITRAGEM`, especialmente atualizações de `resultado`, `lucro_prejuizo` ou `status`.
- Testar o caso da imagem: editar a entrada “WEST HAM X EVERTON”, trocar estratégia de Surebet para Extração de Bônus e salvar sem acionar bloqueio.
- Testar também:
  - criação de arbitragem normal;
  - edição só de estratégia em Todas Apostas;
  - edição em aba com estratégia fixa continua travada;
  - edição de odds/stakes/pernas continua passando pela RPC atômica;
  - liquidação/reliquidação continua via `liquidar_perna_surebet_v1`.

Resultado esperado
- Você conseguirá corrigir apostas antigas lançadas com estratégia errada diretamente pelo modo edição.
- A proteção financeira continua ativa contra updates manuais de liquidação.
- A flexibilidade de estratégia em “Todas Apostas” passa a funcionar sem quebrar o motor de surebet/arbitragem.
- As abas com estratégia fixa continuam se comportando como antes.