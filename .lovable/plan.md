Entendi a gravidade. A análise já encontrou uma causa raiz objetiva no caso que você acabou de reproduzir com “+1 entrada”: a correção anterior não resolveu porque ela tentava detectar uma duplicidade que ainda não existia no momento em que o trigger rodava.

## Diagnóstico confirmado

Na aposta mais recente do projeto `PROJETO 00`, criada às 06:12 (`d810ca80...`), cada perna gerou duas stakes no ledger:

```text
HUGEWIN
-100  via trigger: stake_perna_<perna_id>
-100  via RPC:     stake_<aposta_id>_idx1_<perna_id>
Excesso: -100 USD

TALISMANIA
-100  via trigger
-100  via RPC
Excesso: -100 USD

7GAMES
-491,58 BRL via trigger
-491,58 BRL via RPC
Excesso: -491,58 BRL
```

Ou seja: o saldo fica errado imediatamente na criação da surebet, antes mesmo da liquidação.

A falha estrutural é esta:

```text
criar_surebet_atomica
  1. insere apostas_unificada pai
  2. insere apostas_pernas
       -> trigger tr_perna_auto_stake_ledger roda aqui e debita stake
  3. insere financial_events STAKE pela própria RPC
       -> segundo débito
```

A tentativa anterior de corrigir `fn_perna_auto_stake_ledger` checando se já existia stake com o `perna_id` não funciona nesse fluxo, porque quando o trigger roda, a stake da RPC ainda não foi inserida.

Também encontrei um segundo problema grave no ledger: `liquidar_perna_surebet_v1` pode criar múltiplos `REVERSAL` para o mesmo payout, porque não bloqueia `reversed_event_id` repetido. A auditoria mostra eventos de payout com 10, 8, 6 reversões duplicadas. Isso explica por que, após resolver/reliquidar/excluir, o saldo pode aumentar ou diminuir de forma incoerente.

## Objetivo da correção

Transformar o ledger em fonte única e auditável:

```text
financial_events = única fonte de movimento financeiro
bookmakers.saldo_atual / saldo_freebet = materialização do ledger
apostas_unificada.pl_consolidado = fonte única de P&L consolidado
KPIs/gráficos/cards = consumidores da fonte canônica, sem recálculo divergente
```

## Plano de implementação

### 1. Blindar a criação de Surebet contra stake duplicada

Vou alterar o fluxo de banco, não o frontend:

- Em `criar_surebet_atomica`, ativar um contexto transacional antes de inserir pernas:
  - `app.skip_perna_auto_stake = on`
- Em `fn_perna_auto_stake_ledger`, retornar sem criar evento quando esse contexto estiver ativo.
- Manter a RPC `criar_surebet_atomica` como responsável única por gerar os eventos `STAKE` da surebet.

Resultado: novas surebets não terão mais o par duplicado `stake_perna_*` + `stake_<aposta>_idx*`.

### 2. Tornar `liquidar_perna_surebet_v1` idempotente de verdade

Vou corrigir a re-liquidação por perna para não gerar estornos repetidos:

- Antes de criar um `REVERSAL`, verificar se já existe reversão para aquele `reversed_event_id`.
- Usar chave estável para reversão por evento original, em vez de chave baseada em timestamp.
- Manter a lógica por entrada (`apostas_perna_entradas`) para multi-entry e multimoeda.

Resultado: clicar/rodar liquidação várias vezes não contamina saldo com reversões duplicadas.

### 3. Criar uma auditoria canônica do ledger

Vou criar uma função/view de auditoria que responda, por bookmaker e por aposta:

- saldo materializado atual;
- soma real do ledger por `tipo_uso` (`NORMAL` e `FREEBET`);
- diferença entre materializado e ledger;
- stakes esperadas por perna/entrada;
- stakes duplicadas;
- payouts duplicados;
- reversões duplicadas;
- eventos órfãos ou sem `aposta_id` quando deveriam ter vínculo;
- inconsistências de moeda entre evento, entrada e bookmaker.

A auditoria será construída com `NUMERIC`, sem casts para inteiro.

### 4. Corrigir a view de auditoria antiga que hoje é enganosa

A view `v_bookmaker_saldo_audit` atual calcula `STAKE` com sinal invertido em alguns cenários e compara contra o saldo de forma inconsistente. Vou substituí-la/ajustá-la para usar a mesma lógica do trigger de saldo:

```text
saldo esperado NORMAL  = SUM(financial_events.valor WHERE tipo_uso = NORMAL AND event_scope = REAL)
saldo esperado FREEBET = SUM(financial_events.valor WHERE tipo_uso = FREEBET AND event_scope = REAL)
```

Isso evita diagnósticos falsos enquanto auditamos o ledger.

### 5. Reconciliar dados contaminados sem apagar histórico financeiro

Como existe regra do projeto contra correção retroativa agressiva e contra atualização direta de saldo, a correção dos dados deve ser feita com eventos de compensação/auditoria, não com UPDATE direto em `saldo_atual`.

Vou aplicar correção em duas camadas:

1. Eventos duplicados criados pelo trigger `stake_perna_*` para surebets que também têm a stake canônica `stake_<aposta>_idx*`:
   - criar evento compensatório `REVERSAL`/`AJUSTE_SALDO` vinculado ao evento duplicado;
   - não deletar o histórico.

2. Reversões duplicadas para o mesmo payout:
   - manter uma reversão canônica;
   - criar eventos compensatórios para neutralizar as reversões extras.

Depois disso, rodar sincronização materializada por bookmaker a partir do ledger canônico.

### 6. Ajustar a sincronização de saldo para ser determinística

Vou revisar `sync_bookmaker_balance_from_ledger` e o trigger `fn_financial_events_sync_balance` para garantir:

- `saldo_atual` segue somente eventos `tipo_uso = NORMAL` e `event_scope = REAL`;
- `saldo_freebet` segue somente eventos `tipo_uso = FREEBET` e `event_scope = REAL`;
- nenhum fluxo faz `UPDATE` direto em saldo fora desse mecanismo;
- correções manuais usam eventos financeiros auditáveis.

### 7. Validar o cenário do usuário ponta a ponta

Após aplicar as correções, vou validar no banco:

- criar/identificar surebet nova com 3 pernas e +1 entrada;
- confirmar que cada perna tem exatamente uma stake real no ledger;
- liquidar uma perna como GREEN;
- voltar a perna para PENDENTE;
- liquidar novamente;
- conferir que não há reversão duplicada;
- conferir saldo por casa antes/depois:
  - stake pendente reduz saldo;
  - payout aumenta saldo da casa vencedora;
  - reversão volta exatamente ao estado anterior;
  - nenhuma casa perde saldo duas vezes.

### 8. Ajustar caches/consumidores se necessário

Se os dados do banco estiverem corretos mas a tela ainda mostrar saldo antigo, vou invalidar os caches canônicos relacionados a:

- saldos de bookmakers;
- dashboard do projeto;
- apostas/surebet;
- KPIs financeiros.

Mas a prioridade é corrigir o ledger primeiro; cache é camada secundária.

## Arquivos/funções que serão alterados

Principalmente migração de banco:

- `criar_surebet_atomica`
- `fn_perna_auto_stake_ledger`
- `liquidar_perna_surebet_v1`
- `sync_bookmaker_balance_from_ledger`, se necessário
- views/funções de auditoria do ledger

Possíveis ajustes de frontend somente se a auditoria mostrar algum caminho ainda criando apostas/pernas direto sem passar pelas RPCs canônicas.

## Resultado esperado

Depois da correção:

- uma entrada nova não reduz saldo duas vezes;
- resolver perna não gera estorno duplicado;
- saldo das casas passa a ser reconstruível pelo ledger;
- o patrimônio deixa de oscilar de forma incoerente;
- teremos uma auditoria objetiva para detectar qualquer nova contaminação antes que ela vire discrepância visual.