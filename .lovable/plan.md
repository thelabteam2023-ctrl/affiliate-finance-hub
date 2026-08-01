## Diagnóstico (confirmado)

- O histórico do Caixa (`src/pages/Caixa.tsx`) busca `cash_ledger` com `select("*")` e **sem** filtro de reversão — `reversed_at` chega ao componente.
- Em `src/components/caixa/HistoricoMovimentacoes.tsx` (bloco `metricas`, linhas ~533-640) a soma ignora apenas `status` em `RECUSADO / CANCELADO / ESTORNADO`. **Não** há teste de `reversed_at`.
- Consulta ao banco: existem **19 linhas revertidas** (`reversed_at IS NOT NULL`), das quais **18 ainda estão com status `CONFIRMADO`** — ou seja, entram integralmente nos totais fiat/cripto.
- Existem também **19 linhas-espelho** de estorno (`AJUSTE_RECONCILIACAO` com descrição `ESTORNO:%`). `AJUSTE_RECONCILIACAO` está em `CASH_REAL_TYPES`, então o espelho também aparece e soma em módulo (`Math.abs`) — dobrando a distorção: a operação original conta uma vez e o estorno conta de novo.
- Já existe helper canônico para isso: `src/lib/ledger/effective.ts` (`applyEffectiveFilter`, `classifyLedgerRow`), usado em vários hooks (`usePosicaoCapital`, `useFinanceiroData`, `useExposicaoFinanceira`, etc.), mas **não** no caminho do Caixa Operacional.

## Correção proposta

### 1. Somatórias do Histórico (núcleo do problema)
Em `HistoricoMovimentacoes.tsx`, no `useMemo` de `metricas`:
- Pular a linha quando `t.reversed_at` estiver preenchido (original anulado).
- Pular também a linha-espelho de estorno, usando `classifyLedgerRow` de `@/lib/ledger/effective` — só agrega quando o resultado for `ORIGINAL_EFETIVO`.
- Isso vale para fiat (`fiatTotal/Confirmado/Pendente`), cripto (`qtdTotal/usdTotal/...`) e para o contador `count`.

A **lista** do histórico continua inalterada: a linha revertida segue visível com o badge "Revertida em …" (linhas ~1096 e ~1277) e o espelho de estorno também continua listado. Só a agregação muda.

### 2. Transparência no cabeçalho
No bloco de resumo, exibir uma nota discreta quando houver linhas excluídas do cálculo no recorte atual: `"N operação(ões) revertida(s) não incluída(s) nos totais"`, com tooltip explicando que os valores refletem o líquido efetivo. Sem novos controles nem toggles.

### 3. Auditoria dos demais consumidores
Varrer os pontos que agregam `cash_ledger` **sem** filtro de reversão e aplicar `applyEffectiveFilter` (ou o teste equivalente em memória) apenas onde o consumo é **agregação/indicador**, nunca em telas de auditoria/edição:

Alvos de agregação a corrigir:
- `src/components/caixa/RelatorioROI.tsx`
- `src/hooks/useFinanceiroMensal.ts`
- `src/hooks/useResumoOperacional.ts`
- `src/hooks/useWorkspaceLucroRealizado.ts`
- `src/hooks/useProjetoPerformance.ts`
- `src/hooks/useProjectBonusAnalytics.ts`
- `src/hooks/useParceiroFinanceiroCache.ts` / `useParceiroTabsCache.ts`
- `src/components/caixa/HistoricoInvestidor.tsx` (totais; lista permanece)
- `src/components/caixa/ConciliacaoSaldos.tsx` (validar caso a caso — saldo de conciliação pode já derivar de trigger)

Explicitamente **não** alterar: `useReverterMovimentacao`, diálogos de edição/confirmação (`ConfirmarSaqueDialog`, `EditarTagsDialog`, `EditarDataTransacaoDialog`, `EditarSaqueConfirmadoDialog`), `useInvalidateCaixaData`, `usePreCommitValidation` — esses precisam enxergar a linha original.

Cada arquivo será verificado antes da edição; se a leitura mostrar que já é filtrado indiretamente (via RPC canônica), fica registrado e não é tocado.

### 4. Regra de memória
Registrar em memória de projeto a regra: *"Toda agregação sobre `cash_ledger` desconsidera `reversed_at IS NOT NULL` e espelhos `ESTORNO:`; listas de auditoria continuam exibindo ambos."*

## Observações técnicas

- Nenhuma migração de banco é necessária — os dados já estão corretos (`reversed_at` preenchido pela RPC `reverter_movimentacao_caixa`); o defeito é puramente de leitura/agregação.
- Nenhuma alteração em saldos: saldos continuam vindo de triggers/eventos, não da soma do histórico.
- Validação: comparar, num recorte com reversão conhecida, o total antes/depois — a diferença deve ser exatamente (valor original + valor do espelho).
