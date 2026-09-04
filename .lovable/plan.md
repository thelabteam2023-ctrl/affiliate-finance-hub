# Auditoria: entrada com saldo real inexistente no formulário de Arbitragem

## Diagnóstico (confirmado em código e no banco)

A brecha é real e tem duas causas somadas.

### Causa 1 — o "saldo real" usado na validação inclui a freebet

A função do banco `get_bookmaker_saldos` devolve:

```text
saldo_disponivel = saldo_real - saldo_em_aposta
saldo_operavel   = saldo_disponivel + saldo_freebet   <-- soma a freebet
```

Todas as travas do formulário de arbitragem comparam uma entrada de **saldo real** contra `saldo_operavel`:

- `SurebetModalRoot.tsx`, validação por perna (`calcularSaldoDisponivel`): `saldoBase = isFB ? saldo_freebet : saldo_operavel`
- `SurebetModalRoot.tsx`, validação agregada (`balanceValidation`): `saldoReal = bookmaker.saldo_operavel`
- `src/utils/surebetBalanceValidation.ts` (mesma lógica duplicada, usada pela tabela de surebets)

Com GASTON RED (verificado no banco: `saldo_atual = 0,00`, `saldo_freebet = 100`), o "saldo real" enxergado pela validação é 100. Por isso uma entrada REAL de US$ 100 passou. Todos os cenários da tabela enviada que envolvem "real 0 + freebet X" falham pelo mesmo motivo.

### Causa 2 — o backend não valida saldo nenhum nesse fluxo

A arbitragem grava por `criar_surebet_atomica_v3` (e edita por `editar_surebet_completa_v3`). A definição atual de `criar_surebet_atomica_v3` **não contém nenhuma verificação de saldo** — apenas insere pernas/entradas e emite os eventos. Não há uso de `validate_and_reserve_stakes` nesse caminho. Ou seja: qualquer chamada direta à RPC, edição, reimportação ou concorrência entre duas abas persiste a operação sem trava.

Consequência: hoje a regra existe só como bloqueio de botão, exatamente o que o pedido diz não bastar.

### Lacunas adicionais mapeadas

- Lógica de validação **duplicada** em três lugares (modal, util puro, validador de card) — corrigir um não corrige os outros.
- `saldo_disponivel` já desconta apostas pendentes, mas em multi-instância a checagem por casa não considera reservas (`bookmaker_stake_reservations`) de outra sessão: duas abas podem validar contra o mesmo saldo.
- Freebet não valida "freebet disponível" por unidade (estoque), apenas o total `saldo_freebet`.
- Moeda: a comparação é feita sempre na moeda da casa; não há conversão indevida detectada, mas também não há guarda explícita para stake em moeda diferente da casa.

## Plano de correção

### Fase 1 — Trava de backend (essencial, é o critério de sucesso do pedido)

Criar uma função de verificação única no banco, `fn_validar_saldo_pernas_surebet(pernas jsonb)`, que:

1. Agrega, por bookmaker, o total exigido de **saldo real** (BACK = stake; LAY = liability) e o total de **freebet**.
2. Compara separadamente: real contra `saldo_real - saldo_em_aposta` (sem freebet) e freebet contra `saldo_freebet`.
3. Bloqueia com `RAISE EXCEPTION` nomeando casa, recurso, disponível e solicitado.
4. Lê os saldos com `FOR UPDATE` na linha da casa, para que duas gravações simultâneas não usem o mesmo saldo.

Chamar essa função no início de `criar_surebet_atomica_v3` e de `editar_surebet_completa_v3` (na edição, creditando de volta o que a operação original já consumia, para não bloquear ajustes neutros).

### Fase 2 — Corrigir a base de comparação no frontend

- Deixar de usar `saldo_operavel` para entradas REAIS. Usar `saldo_disponivel` (real menos apostas pendentes) para REAL e `saldo_freebet` para FREEBET.
- Unificar: `SurebetModalRoot` passa a consumir `src/utils/surebetBalanceValidation.ts` em vez da cópia interna, eliminando a duplicação.
- Manter o comportamento fail-closed já existente (casa desconhecida = bloqueio) e o crédito virtual em modo edição.
- Mensagem de erro passa a distinguir o recurso: "Saldo real insuficiente" × "Freebet insuficiente", mostrando os dois saldos.

### Fase 3 — Cobertura dos demais fluxos de gravação

Aplicar a mesma verificação de backend nos caminhos que também persistem entradas: criação simples (`criar_aposta_atomica_v2` — hoje valida contra `saldo_atual` sem separar freebet), edição de aposta, troca de casa, troca de tipo de saldo e alteração de valor.

### Fase 4 — Testes

Cobrir em `supabase/tests/triggers/` e nos testes de unidade toda a tabela enviada:

```text
real 0  + fb 100 -> entrada real 100  = bloquear
real 0  + fb 100 -> entrada real 1    = bloquear
real 50 + fb 100 -> entrada real 51   = bloquear
real 50 + fb 100 -> entrada real 50   = permitir
real 50 + fb 100 -> entrada fb 100    = permitir
real 50 + fb 100 -> entrada fb 101    = bloquear
real 0  + fb 0   -> entrada real 1    = bloquear
real 100+ fb 0   -> entrada real 100  = permitir
real 100+ fb 0   -> entrada fb 1      = bloquear
```

Mais: LAY (liability > saldo), múltiplas pernas na mesma casa, sub-entradas, edição que aumenta stake, edição que só muda dados cadastrais, e duas gravações concorrentes.

## Riscos de regressão

- Trocar `saldo_operavel` por `saldo_disponivel` deixa a validação **mais restritiva**: operações que hoje passam encostando na freebet passarão a ser bloqueadas. É o comportamento desejado, mas pode surpreender no dia a dia — a mensagem de erro precisa explicar claramente.
- A exceção no backend passa a interromper gravações que antes eram aceitas; o formulário precisa exibir a mensagem da RPC sem quebrar o fluxo.
- Nada de correção em massa de dados históricos: apostas já registradas com saldo insuficiente não serão alteradas. Se quiser, listo essas ocorrências em um relatório separado.

## Fora de escopo

Motor de liquidação, recálculo de P&L e retrofit de operações antigas.
