# Reprojeto da aba Financeiro — Wave 2

Reutiliza padrões já consolidados em **Caixa Operacional**. Substitui o card atual de "Mapa de Patrimônio" e funde "Scan no Período" + "Capital Comprometido" num único card estratégico.

---

## 1. Auditoria das fontes de perda/scan (descoberta importante)

Hoje `ScanPeriodoCard` lê apenas `cash_ledger.tipo_transacao = 'PERDA_OPERACIONAL'`. Após inspecionar o banco, descobri **3 fontes reais** que precisam compor um indicador honesto:

| Fonte | Coluna / Filtro | Natureza |
| --- | --- | --- |
| **A. Perdas operacionais lançadas** | `cash_ledger.tipo_transacao = 'PERDA_OPERACIONAL'` | Evento já materializado no caixa (filtrado por período) |
| **B. Perdas de ocorrências** | `ocorrencias.valor_perda` quando `resultado_financeiro IN ('perda_confirmada','perda_parcial')` e `resolved_at` no período | Perda declarada via fluxo de ocorrências (pode duplicar A se a ocorrência também gerou ledger — checar `perda_registrada_ledger`) |
| **C. Saldo irrecuperável** | `SUM(bookmakers.saldo_irrecuperavel)` | **Estoque atual** de capital travado em casas sem previsão de saque — coluna já existe e nunca foi usada nos KPIs |

**Decisão**:
- **Card "Scan & Capital Comprometido"** vai exibir **A + B (período)** como "Perdas confirmadas no período" e **C (estoque)** como "Saldo irrecuperável" — sem dupla contagem porque B usa `perda_registrada_ledger=false` (ledger já cobre as outras).
- **Capital Comprometido** (já calculado em `useCapitalEmDisputa` via `ocorrencias.valor_risco` em aberto/em_andamento) continua sendo uma quarta linha do mesmo card.

Nenhuma migration nova — todas as colunas já existem.

---

## 2. Componentes a criar / alterar

### A) Substituir `MapaPatrimonioCard` por reaproveitamento do `PosicaoCapital`

- Renderizar o `<PosicaoCapital>` do Caixa Operacional diretamente dentro da aba Financeiro.
- Passar os mesmos inputs já calculados em `useFinanceiroCalculations` (`saldosFiat`, `saldosBookmakers` por moeda, `saldosContasParceiros` por moeda, `saldoWalletsParceiros`, `cotacaoUSD`).
- Passar `capitalEmDisputa={bySegment}` do `useCapitalEmDisputa` para o donut mostrar a faixa em risco — exatamente como no Caixa.
- `MapaPatrimonioCard.tsx` antigo fica deprecated (deixar arquivo, mas remover import).

### B) Novo card unificado `ExposicaoFinanceiraCard`

Arquivo: `src/components/financeiro/ExposicaoFinanceiraCard.tsx`.

Estrutura visual baseada no padrão do `PosicaoCapital` (mesmo header, mesma tipografia, mesmas cores semânticas):

```
┌─────────────────────────────────────────────────────────┐
│  ⚠ Exposição & Perdas                                   │
│  Total comprometido + perdido: R$ X.XXX  (Y% patrimônio)│
├─────────────────────────────────────────────────────────┤
│  EM DISPUTA (aberto / em_andamento)                     │
│  ● Casas de Apostas              R$ —     (—%)          │
│  ● Bancos / Processadores        R$ —     (—%)          │
│  ● Wallets                       R$ —     (—%)          │
│  ● Caixa Operacional             R$ —     (—%)          │
├─────────────────────────────────────────────────────────┤
│  PERDAS CONFIRMADAS NO PERÍODO                          │
│  Total: R$ — (N ocorrências)  |  Y% do lucro op.        │
├─────────────────────────────────────────────────────────┤
│  SALDO IRRECUPERÁVEL (sem previsão de saque)            │
│  R$ — distribuído em N casas                            │
└─────────────────────────────────────────────────────────┘
```

Cada linha é **clicável** e abre uma `Sheet` (drawer lateral à direita — mesmo componente shadcn já usado em outros pontos do Caixa) listando os registros que compõem aquele valor.

#### Drill-down por linha

| Linha clicada | Conteúdo do drawer |
| --- | --- |
| Em disputa — Bookmakers | Lista de `ocorrencias` em aberto com `bookmaker_id` set: título, casa, titular (via `parceiros`), valor_risco, data_ocorrencia, status, sub_motivo, link "ver ocorrência" |
| Em disputa — Bancos | `ocorrencias` em aberto com `conta_bancaria_id` setada cujo `parceiro_id` é de parceiro: nome da conta, titular, banco, valor_risco, data, sub_motivo |
| Em disputa — Wallets | `ocorrencias` em aberto com `wallet_id`: exchange/coin, valor_risco, data |
| Em disputa — Caixa Op. | `ocorrencias` em aberto com `conta_bancaria_id` cuja `parceiro_id` é nulo |
| Perdas no período | Linha por linha: tipo (ledger PERDA_OPERACIONAL ou ocorrência perda_confirmada), origem (bookmaker/conta/wallet) com titular, valor, data, observação |
| Saldo irrecuperável | Linha por casa: bookmaker, projeto, titular do parceiro, valor irrecuperável, link para o card da casa |

Reaproveita `getOrigemInfo` (já implementada em `Caixa.tsx`) para mostrar **instituição · titular** em cada linha — mesmo padrão da revisão anterior do Histórico.

### C) Atualizar `useFinanceiroCalculations`

Adicionar campos consolidados:

```ts
// dentro de movimentacao
totalPerdasOperacionaisPeriodo  // A (já existe como totalScanPeriodo)
totalPerdasOcorrenciasPeriodo   // B — novo, lê ocorrências resolvidas no período
totalSaldoIrrecuperavel          // C — soma de bookmakers.saldo_irrecuperavel (estoque)
countPerdasPeriodo               // A.count + B.count
```

E renomear o agregado exposto para `totalPerdasConfirmadasPeriodo = A + B` (com guarda contra duplicação via `perda_registrada_ledger`).

### D) Hook novo: `useExposicaoDetalhada`

`src/hooks/useExposicaoDetalhada.ts`. Retorna, sob demanda (ao abrir o drawer), a lista detalhada de cada segmento — joins com `parceiros`, `contas_bancarias`, `bookmakers`, `wallets_crypto`. Mantém workspace isolation.

### E) Página `src/pages/Financeiro.tsx`

- Faixa 1 (header KPIs) — **manter** como está hoje.
- Faixa 2:
  - Esquerda (2/3): `<PosicaoCapital>` reutilizado.
  - Direita (1/3): `<ExposicaoFinanceiraCard>` novo.
- Faixa 3: `<ComposicaoCustosCard>` em largura cheia.
- Faixa 4 (mini-KPIs) — manter.
- Remover `ScanPeriodoCard` e `CapitalComprometidoCard` (substituídos pelo card unificado).

---

## 3. Padrões de interação (uniformizar com Caixa)

- **Popover** rápido: hover em ícones de info — usar `<HoverCard>`/`<Popover>` shadcn (já presente).
- **Drawer**: detalhamentos de lista — `<Sheet>` lateral direita (mesma usada em `SaldosParceirosSheet.tsx`).
- **Modal**: análise profunda multi-aba — `<Dialog>` (usado em `CurrencyBreakdownModal.tsx`).
- Linhas clicáveis usam `cursor-pointer` + hover `bg-[var(--bg-hover)]` (mesma classe do `BreakdownRow` do `PosicaoCapital`).

---

## 4. Riscos & verificações

- **Dupla contagem A vs B**: filtrar B com `perda_registrada_ledger = false` para nunca somar duas vezes a mesma ocorrência.
- **Saldo irrecuperável é estoque, não fluxo**: não somar a A+B no "Total perdido no período" — exibir em bloco próprio com label "Estoque travado".
- **Performance**: o drawer só busca dados quando aberto (`useQuery` com `enabled: open`).
- **i18n / moeda**: usar `convertUnified` para tudo em BRL — mesma engine do Caixa, garantindo paridade absoluta.

---

## 5. Ordem de implementação

1. Estender `useFinanceiroCalculations` com as 3 fontes de perda (A/B/C).
2. Criar `useExposicaoDetalhada` para drill-downs.
3. Criar `ExposicaoFinanceiraCard` com as 4 seções + linhas clicáveis abrindo Sheet.
4. Refatorar `Financeiro.tsx` para usar `<PosicaoCapital>` direto e o novo card.
5. Remover `ScanPeriodoCard`, `CapitalComprometidoCard` e o import do `MapaPatrimonioCard` da página.
6. Verificar no preview: paridade dos números com Caixa, drill-downs abrindo dados corretos.

Nenhuma migration. Nenhuma alteração de lógica financeira existente — apenas leitura adicional de colunas já preenchidas.
