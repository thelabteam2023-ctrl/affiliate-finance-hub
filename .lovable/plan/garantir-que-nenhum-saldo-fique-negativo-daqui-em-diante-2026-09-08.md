# Garantir que nenhum saldo fique negativo daqui em diante

## Situação hoje (verificada no banco)

A trava criada na investigação do saque duplicado **está ativa**: o gatilho
`trg_guard_saldo_bookmaker_nao_negativo` roda em toda entrada e alteração de evento
financeiro, trava a casa durante o cálculo (evitando dois saques simultâneos) e recusa
qualquer débito que deixe o saldo real ou o de freebet abaixo de zero.

Mas ela protege **um caminho só**: o dos eventos financeiros. Existem outras rotinas no
banco que mexem no saldo da casa diretamente, sem passar por lá. Verifiquei uma a uma:

- Com verificação própria de saldo: débito com trava, débito múltiplo, débito em cascata
  (waterfall) e criação de aposta.
- **Sem nenhuma verificação**: ajuste de saldo com auditoria, processamento de bônus em
  aposta e a rotina antiga de atualização de saldo.

E a tabela de casas em si não tem nenhuma trava final. Ou seja: hoje a garantia é boa,
mas não é completa.

## O que proponho

Uma trava final na própria tabela das casas — a última porta antes do saldo ser gravado.
Qualquer rotina, atual ou futura, que tente deixar uma casa negativa é recusada, com
mensagem clara dizendo qual casa, se é saldo real ou freebet, quanto há e quanto foi pedido.

Regras da trava:

1. Se a casa está positiva e a operação a jogaria para negativo → recusa.
2. Se a casa **já está negativa** (os 255 casos antigos) → não bloqueia melhorias nem
   correções; só recusa deixá-la ainda mais negativa.
3. Continuam liberados os caminhos legítimos que precisam operar no vermelho: estornos,
   reversões e ajustes explícitos de auditoria.
4. Tolerância de 1 centavo, para não travar por arredondamento.

Além disso:

- Acrescento a verificação de saldo nas três rotinas que hoje não têm nenhuma, para que o
  erro apareça cedo, com mensagem boa, em vez de estourar só na trava final.
- Um painel simples de acompanhamento em Admin: quantas casas estão negativas, quanto
  somam e desde quando — para você ver na hora se algum caso novo aparecer.
- Um teste de regressão que tenta deixar uma casa negativa por cada caminho e confirma
  que todos recusam.

## O que não vou fazer

Não encosto nas 255 casas já negativas. Elas ficam como estão, para a revisão caso a caso
que você pediu.

## Detalhes técnicos

- Nova função `fn_guard_bookmaker_saldo_nao_negativo()` + gatilho `BEFORE UPDATE OF
  saldo_atual, saldo_freebet ON public.bookmakers`, `FOR EACH ROW`.
  - Ignora quando `NEW.saldo >= OLD.saldo` (crédito ou correção para cima).
  - Ignora quando `OLD.saldo < 0 AND NEW.saldo >= OLD.saldo`.
  - Escape hatch por flag de sessão `SET LOCAL app.allow_negative_balance = 'on'`,
    setada dentro de `process_financial_event` quando `allow_negative` é verdadeiro,
    e nas rotinas de estorno/reversão/reconciliação
    (`reconciliar_saldo_bookmaker`, `sync_bookmaker_balance_from_ledger`,
    `recalcular_saldos_projeto`, `recalcular_saldos_workspace`,
    `reprocessar_ledger_workspace`, `reset_projeto_operacional_seguro`,
    `desvincular_bookmaker_atomico`).
  - Exceção padronizada `SALDO_INSUFICIENTE: ...` para reaproveitar o tratamento de erro
    que o front já tem.
- Verificação prévia em `update_bookmaker_balance_with_audit`, `processar_bonus_aposta` e
  `atualizar_saldo_bookmaker_v5`, retornando o mesmo código de erro.
- View `v_bookmakers_saldo_negativo` (nome, moeda, saldo real, freebet, projeto, parceiro,
  workspace, data da última alteração) consumida por um card em
  `src/pages/AuditoriaCambial.tsx` ou página irmã em `/admin/saldos-negativos`.
- Testes em `src/lib/__tests__/` cobrindo: débito acima do saldo real, débito de freebet
  acima do estoque, saque concorrente na mesma casa, estorno em casa negativa (deve
  passar), ajuste explícito de auditoria (deve passar), crédito em casa negativa (deve
  passar).
