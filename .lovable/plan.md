# Auditoria: Natureza dos Ajustes de Saldo e Propagação Financeira

## 1. Fluxo técnico real do "Contas Ativas → Ajustar Saldo"

`Contas Ativas` e `Vínculos → Ajustar Saldo` são **o mesmo componente** (`AjusteSaldoDialog.tsx`, montado em `ProjetoVinculosTab.tsx`). Não existem dois mecanismos — existe um só, exposto em dois pontos da UI.

```
AjusteSaldoDialog (delta = saldoReal - saldoSistema)
   ↓ registrarAjusteViaLedger()  [src/lib/ledgerService.ts]
cash_ledger  tipo_transacao='AJUSTE_SALDO'
             ajuste_direcao = ENTRADA | SAIDA
             ajuste_motivo  = texto livre digitado pelo operador
             ajuste_natureza = 'RECONCILIACAO_OPERACIONAL' (default por trigger)
             projeto_id_snapshot = projeto atual
   ↓ trigger fn_cash_ledger_generate_financial_events (bloco "AJUSTES E FX")
financial_events  tipo_evento='AJUSTE', tipo_uso='NORMAL', origem='AJUSTE_SALDO'
   ↓ trigger tr_financial_event_sync
bookmakers.saldo_atual  (recalculado por SUM)
```

Verificado em dados reais: os 3 ajustes mais recentes (incl. o PROMO_LIMIT de $169,39) têm `financial_events_generated = true` e um `financial_events` correspondente com sinal correto (+3,37 / -2,26 / -169,39). **Ajuste positivo e negativo são perfeitamente simétricos** — a direção vem de `ajuste_direcao` no trigger.

## 2. Matriz de comportamento atual (comprovada em código + dados)

| Mecanismo | tipo_transacao | Altera saldo | Entra no Lucro (KPI card) | Entra no gráfico Evolução do Lucro | Extrato |
|---|---|---|---|---|---|
| Perda promocional (Bônus → finalizar com limite) | AJUSTE_SALDO + `ajuste_motivo=PROMO_LIMIT` | Sim | Sim (bucket `bonus`) | **Sim** | Sim |
| Bônus → cancelamento | AJUSTE_SALDO + `BONUS_CANCELAMENTO` | Sim | Sim (bucket `bonus`) | **Sim** | Sim |
| Contas Ativas → Ajustar Saldo | AJUSTE_SALDO (motivo livre) | Sim | Sim (bucket `ajuste_saldo`) | **NÃO** | Sim |
| Vínculos → Ajustar Saldo | idem (mesmo componente) | Sim | Sim | **NÃO** | Sim |
| Ajuste Manual (Caixa) | AJUSTE_MANUAL | Sim | **NÃO** (nenhuma RPC de lucro lê esse tipo) | Não | Sim (Caixa) |
| Reconciliação de ledger | AJUSTE_RECONCILIACAO (290 linhas) | Sim | **NÃO** | Não | Sim |
| Conciliação de vínculo | `bookmaker_balance_audit` (origem=CONCILIACAO_VINCULO) | Sim | Sim (bucket `conciliacao`) | **NÃO** | Parcial |
| FX (GANHO/PERDA_CAMBIAL) | ledger + financial_events | Sim | Não (por design) | Não | Sim (Indicadores Financeiros) |
| Perda operacional / Scan | PERDA_OPERACIONAL + `projeto_perdas` | Sim | Sim | **Sim** | Sim |

## 3. Resposta direta às perguntas

**Contas Ativas → Ajustar Saldo +€100:** aumenta o saldo da casa, grava no ledger, gera financial_event `AJUSTE`, **aumenta o Lucro Operacional do KPI**, aparece no Extrato, mas **não aparece no gráfico de Evolução do Lucro**. Com -€100 o comportamento é exatamente o inverso (mesmo caminho, sinal trocado). Isso é confirmado por código, não pela interface.

**Por que o gráfico ignora:** `get_projeto_lucro_operacional_daily` (fonte única do gráfico, via `useCanonicalCalendarDaily`) só une seis CTEs: apostas, cashback, giros, bônus, `perdas_cancel_daily` (filtrada em `ajuste_motivo IN ('BONUS_CANCELAMENTO','PROMO_LIMIT')`) e perdas operacionais. **Não existe CTE de AJUSTE_SALDO genérico, nem de conciliação, nem de promocional/freebet.** Já o KPI (`calcularLucroCanonicoFromRpc`) soma o bucket `ajuste_saldo`. Logo o card "Lucro" e o gráfico divergem hoje pelo valor dos ajustes.

## 4. Inconsistências encontradas

1. **Divergência KPI × gráfico** (acima). Não é intencional: é lacuna de cobertura da RPC diária.
2. **Dupla contagem em `src/services/fetchProjetoExtras.ts`**: `fetchAjustesSaldo` pega *todos* os AJUSTE_SALDO, incluindo PROMO_LIMIT/BONUS_CANCELAMENTO, que já vêm por `fetchPerdasCancelamentoBonuses`. O mesmo evento de -169,39 é contado duas vezes (-338,78) em quem consome esse serviço. `useKpiBreakdowns` já corrigiu isso com `if/else`, o serviço não.
3. **RPC `get_projetos_lucro_operacional` está duplicada** (assinaturas 3-arg e 4-arg → risco de ambiguidade PostgREST). Na versão 4-arg efetivamente chamada, o bucket `ajustes` filtra `ajuste_direcao IN ('CREDITO','DEBITO')`, valores que **não existem** no banco (só ENTRADA/SAIDA) → o bucket é **sempre zero**: essa RPC ignora silenciosamente todos os ajustes de saldo. Mesmo defeito no bucket `promocionais` (`tipo_transacao='EVENTO_PROMOCIONAL'`, inexistente).
4. **Ausência de semântica econômica**: `ajuste_natureza` existe (RECONCILIACAO_OPERACIONAL / EFEITO_FINANCEIRO / EXTRAORDINARIO) mas **nenhum agregador a lê**. Todo ajuste é tratado como resultado, inclusive correções puramente patrimoniais.
5. **AJUSTE_MANUAL e AJUSTE_RECONCILIACAO movem saldo mas ficam fora de qualquer lucro** — divergência estrutural entre patrimônio e resultado.

## 5. Classificação econômica recomendada

Cada evento que altera saldo deve declarar duas dimensões independentes:

```
Evento → afeta_saldo (sempre true aqui)
       → afeta_resultado ?  (derivado de ajuste_natureza)
```

| ajuste_natureza | Afeta saldo | Afeta Lucro Operacional | Gráfico | Bucket |
|---|---|---|---|---|
| `RECONCILIACAO_OPERACIONAL` (default) | Sim | Sim | Sim | Ajustes de Saldo |
| `EFEITO_FINANCEIRO` | Sim | Não (vai para Indicadores Financeiros/FX) | Não | FX |
| `EXTRAORDINARIO` | Sim | Não (linha separada de Extraordinários) | Não | Extraordinário |

Ajuste puramente patrimonial (ex.: "sistema mostra 500, casa tem 510") **não é lucro novo** — mas hoje o default o trata como resultado. A distinção deve ser feita na origem, no diálogo, não por heurística no agregador.

## 6. Proposta de correção (a executar após aprovação)

**A. Um único contrato de classificação**
- `AjusteSaldoDialog` passa a exigir a natureza do ajuste (3 opções, com `RECONCILIACAO_OPERACIONAL` pré-selecionada e explicação curta de cada uma), gravando em `cash_ledger.ajuste_natureza`.
- `PROMO_LIMIT`/`BONUS_CANCELAMENTO` continuam gravados como `RECONCILIACAO_OPERACIONAL` (são perdas econômicas reais).

**B. Fonte única para gráfico e KPI**
- Adicionar em `get_projeto_lucro_operacional_daily` as CTEs faltantes: `ajustes_daily` (AJUSTE_SALDO **excluindo** `ajuste_motivo IN ('BONUS_CANCELAMENTO','PROMO_LIMIT')` e restrito a `ajuste_natureza='RECONCILIACAO_OPERACIONAL'`), `conciliacao_daily` e `promocional_daily`, para que a soma dos pontos do gráfico seja idêntica ao KPI canônico.

**C. Eliminar dupla contagem**
- Em `fetchProjetoExtras.fetchAjustesSaldo`, excluir os motivos de bônus (espelhar o `if/else` de `useKpiBreakdowns`).

**D. Higienizar a RPC de lucro por projeto**
- `DROP` da assinatura 3-arg redundante; na 4-arg, corrigir `ajuste_direcao` para ENTRADA/SAIDA, remover o bucket morto `EVENTO_PROMOCIONAL` e excluir motivos de bônus do bucket `ajustes` (evitando reintroduzir dupla contagem com `cancelamento_bonus`).

**E. Sem retrofix de dados**
- Nenhum UPDATE em massa no ledger. Os registros históricos permanecem `RECONCILIACAO_OPERACIONAL`; a reclassificação continua manual via `AjusteNaturezaBadge` no Extrato.

## 7. Plano de testes

1. Ajuste +100 e -100 numa casa de teste: conferir `cash_ledger`, `financial_events` (sinal), `bookmakers.saldo_atual`, KPI Lucro, gráfico e Extrato — os deltas devem bater em todos.
2. Conferir que a soma dos pontos do gráfico == badge de Lucro == card de Lucro, com e sem filtro de período.
3. Reproduzir o caso PROMO_LIMIT de $169,39 e confirmar impacto **único** (-169,39, não -338,78) em todos os consumidores.
4. Ajuste marcado como `EFEITO_FINANCEIRO`: saldo muda, Lucro Operacional **não** muda, aparece em Indicadores Financeiros.
5. Reversão/estorno de um ajuste: conferir simetria total (saldo, KPI, gráfico).
6. Regressão: perdas operacionais, conciliação de vínculo e FX permanecem com o comportamento atual.
