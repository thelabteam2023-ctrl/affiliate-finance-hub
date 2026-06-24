# Plano: Atualização automática de saldos em Transferência Caixa Operacional → Parceiro

## Causa raiz identificada

O fluxo de gravação da transferência já funciona no backend (trigger `tr_cash_ledger_update_bookmaker_balance_v2` e views `v_saldo_parceiro_contas` / `v_saldo_parceiro_wallets` são atualizadas em tempo real). O problema está **100% no front-end**, na camada de invalidação de cache:

`src/hooks/useInvalidateCaixaData.ts` declara as constantes:

```
saldosFiat: "caixa-saldos-fiat"
saldosCrypto: "caixa-saldos-crypto"
saldosBookmakers: "caixa-saldos-bookmakers"
saldoContasParceiros: "caixa-saldos-contas-parceiros"
saldoWalletsParceiros: "caixa-saldos-wallets-parceiros"
```

Mas **nenhum hook consumidor usa esses queryKeys**. Os hooks reais que renderizam saldos do Caixa e dos Parceiros usam outras chaves:

| Hook | queryKey real | Telas afetadas |
|---|---|---|
| `useFinanceiroData` | `["financeiro-data", workspaceId]` | Financeiro, Caixa Operacional, saldos por moeda |
| `useParceirosData` | `["parceiros-data", workspaceId]` | Gestão de Parceiros, saldo do Lolisa |
| `useExposicaoFinanceira` | `["exposicao-financeira", workspaceId, ...]` | KPIs financeiros |

Como o `invalidateCaixa()` chamado em `CaixaTransacaoDialog.tsx` (linhas 3098 e 3219) invalida apenas chaves órfãs, o React Query nunca refaz o fetch dos saldos de parceiro. Resultado: o usuário precisa dar F5 para ver o débito no Caixa e o crédito no Lolisa.

## Correção (escopo mínimo)

### 1. `src/hooks/useInvalidateCaixaData.ts`
Adicionar invalidação das chaves reais ao bloco de `saldosFiat`, `saldosCrypto`, `saldoContasParceiros` e `saldoWalletsParceiros`:

- `["financeiro-data"]` (cobre fiat, crypto e contas/wallets de parceiros do módulo Caixa)
- `["parceiros-data"]` (cobre saldo agregado do parceiro destino — Lolisa)
- `["exposicao-financeira"]` (KPIs financeiros que dependem de saldos)

Manter as chaves antigas como alias para não quebrar nada.

### 2. Verificação rápida nos outros pontos de gravação
Auditar se `ConciliacaoSaldos.tsx`, `ReverterMovimentacaoDialog.tsx` e `ContasEmpresaSection.tsx` também chamam `invalidateCaixa()` após mutar. Onde faltar, adicionar.

### 3. Rotina automatizada de validação (anti-regressão)
Criar `src/hooks/__tests__/useInvalidateCaixaData.test.ts` (Vitest) com três asserts:

1. Após `invalidateCaixa({ only: ["saldoContasParceiros"] })`, o queryClient marca `["financeiro-data"]` e `["parceiros-data"]` como stale.
2. Sem `only`, todas as chaves abaixo entram em invalidação:
   `financeiro-data`, `parceiros-data`, `exposicao-financeira`, `bookmaker-saldos`, `central-operacoes-data`, `caixa-transacoes`.
3. Smoke test garantindo que toda string declarada em `CAIXA_QUERY_KEYS` corresponde a um queryKey realmente usado em `src/hooks/**` (varre o repo com `import.meta.glob` ou `fs.readdirSync`). Esse teste **falha** se alguém declarar uma chave fantasma de novo — exatamente o defeito que originou o bug.

## Detalhes técnicos (para devs)

```text
Trigger DB          OK  → atualiza v_saldo_parceiro_*
Insert cash_ledger  OK  → CaixaTransacaoDialog
invalidateCaixa()   BUG → invalida queryKeys que ninguém escuta
useFinanceiroData   ←  consome ["financeiro-data"]  (não invalidado)
useParceirosData    ←  consome ["parceiros-data"]   (não invalidado)
```

Sem alteração de dados em produção. Nenhuma migração SQL. Apenas três arquivos tocados: o hook de invalidação, o teste novo e (se necessário) os diálogos auxiliares.

## Entregáveis

1. Patch em `useInvalidateCaixaData.ts` adicionando `financeiro-data`, `parceiros-data` e `exposicao-financeira` aos grupos `saldosFiat`, `saldosCrypto`, `saldoContasParceiros`, `saldoWalletsParceiros`.
2. Teste Vitest `useInvalidateCaixaData.test.ts` com os três asserts acima.
3. (Opcional) Atualizar memory `architecture/cache-invalidation-consistency-standard` reforçando a regra: **toda chave declarada em hook de invalidação deve ter consumidor real — proibido queryKey fantasma**.
