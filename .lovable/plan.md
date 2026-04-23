

## Diagnóstico Final

A re-liquidação de Surebets falha silenciosamente porque `reliquidarAposta()` desvia para `liquidarSurebetSimples()`, que faz `UPDATE` direto em `apostas_unificada` (status, resultado, lucro_prejuizo) **sem tocar nas pernas e sem gerar eventos no ledger**.

Consequências:
- As `apostas_pernas` continuam com `resultado=NULL` → o trigger `fn_recalc_pai_surebet` recalcula o pai e pode sobrescrever ou divergir do valor "manual".
- Nenhum `PAYOUT`/`VOID_REFUND` é criado → saldo do bookmaker não muda.
- Nenhum `REVERSAL` da liquidação anterior → double-counting silencioso quando há re-liquidação.
- A UI parece "não atualizar" porque a verdade (pernas) permanece intacta e o trigger volta a recalcular o pai.

A arquitetura correta de Surebet (já documentada em `architecture/surebet-engine-and-liquidation-standard`) diz: **a verdade da surebet vive nas pernas**. Toda liquidação deve passar por `liquidar_perna_surebet_v1`, e o pai é recalculado automaticamente por `fn_recalc_pai_surebet`.

## Solução Proposta

Substituir o caminho `liquidarSurebetSimples` por um **orquestrador por perna** — sem criar nova RPC, reutilizando a infra atômica que já existe (`liquidar_perna_surebet_v1`). Isso elimina o desvio "raw update" e alinha 100% com o padrão Surebet.

### Mudanças

**1. `src/services/aposta/ApostaService.ts` — `reliquidarAposta()` (caso `isArbitragem`)**

Substituir a chamada `liquidarSurebetSimples()` por um orquestrador:

```text
SE forma_registro = ARBITRAGEM:
  1. Buscar todas as pernas (apostas_pernas) ordenadas por `ordem`
  2. Mapear novoResultado global → resultado por perna:
       GREEN  → primeira perna GREEN, demais RED   (ou política a confirmar — ver pergunta)
       VOID   → todas as pernas VOID
       RED    → todas as pernas RED
  3. Para cada perna, chamar `liquidarPernaSurebet({ pernaId, resultado })`
     em paralelo (Promise.all, skipRefresh:true)
  4. Recalcular pai é automático via fn_recalc_pai_surebet
  5. Um único invalidateCanonicalCaches no final
```

**2. Depreciar `liquidarSurebetSimples()`**

Manter exportado por compatibilidade, mas marcar `@deprecated` e logar warning. Nenhum chamador novo deve usar.

**3. `SurebetRowActionsMenu` — opção "Liquidar Pai" (liquidação simples global)**

Avaliar se faz sentido manter "Liquidar (resultado simples)" em surebets quando existe o submenu Quick Resolve por cenário. Proposta: **remover** essa opção do menu de surebet, deixando apenas o Quick Resolve (que já passa por `liquidar_perna_surebet_v1`). Isso elimina o caminho ambíguo.

**4. Validação no banco (defesa em profundidade)**

Trigger `BEFORE UPDATE ON apostas_unificada` que bloqueia mudança direta de `resultado`/`lucro_prejuizo` em registros com `forma_registro='ARBITRAGEM'` quando feita fora do contexto da RPC `fn_recalc_pai_surebet`. Implementação: a função `fn_recalc_pai_surebet` seta uma `SET LOCAL` flag de sessão que o trigger consulta. Se a flag não está setada e é arbitragem, RAISE EXCEPTION. Garante que nenhum UPDATE raw passe.

**5. Testes de cenário (sem tocar dados reais)**

Replicar via `read_query` os 3 cenários:
- Surebet nunca liquidada → quick resolve
- Surebet liquidada uma vez → re-liquidação pelo mesmo cenário (idempotência)
- Surebet liquidada → re-liquidação por cenário diferente (REVERSAL + novo PAYOUT)

Validar que o saldo do bookmaker fecha em todos os casos via `financial_events`.

## Arquivos afetados

- `src/services/aposta/ApostaService.ts` — refator de `reliquidarAposta` no ramo arbitragem
- `src/components/apostas/SurebetRowActionsMenu.tsx` — remover ação "Liquidar Pai"
- Migration nova — trigger guard contra UPDATE raw em arbitragem
- Sem mudança em `liquidarPernaSurebet` (já é a fonte canônica)

## Pergunta de regra de negócio

Para o caminho legado "Liquidar Pai com GREEN/RED/VOID global" em surebets, qual é o mapeamento esperado para as pernas?

- **GREEN global**: qual perna ganha? A primeira? A de maior odd? Não temos como saber sem heurística — esse é exatamente o motivo pelo qual o Quick Resolve por cenário existe.

Sugestão: **bloquear** essa ação em surebets (forçar uso do Quick Resolve), ao invés de inferir.

## Riscos e mitigação

- **Regressão em fluxos legados**: se algum lugar antigo chama `liquidarSurebetSimples` direto (ex.: import de planilha), continuará funcionando mas com warning. Auditar via `code--search_files` antes de remover.
- **Pernas com freebet**: o orquestrador delega 100% para `liquidar_perna_surebet_v1`, que já trata `tipo_uso=FREEBET` e direção do payout (`freebet-snr-payout-direction-standard`).
- **Multimoeda**: `fn_recalc_pai_surebet` já consolida via `cotacao_snapshot`. Sem mudança aqui.
- **Cache UI**: usar o padrão `surebet-quick-resolve-batch-refresh` (Promise.all + skipRefresh + único invalidate).

