## O que é a aba "Histórico Mensal" hoje

Componente: `src/components/financeiro/FinanceiroHistoricoTab.tsx` — tabela de 12 meses retroativos com 7 colunas. Dados vêm de `historicoMensal` em `useFinanceiroCalculations.ts` (linhas 413-453).

| Coluna | Fórmula atual | Fonte |
|---|---|---|
| Lucro Apostas | Σ `lucro_prejuizo` por mês | `apostas_unificada` |
| Custos | Σ `movimentacoes_indicacao.valor` + Σ `pagamentos_operador.valor` | sem RH |
| Despesas | Σ `despesas_administrativas.valor` | inclui RH |
| Participações | Σ `participacoes_pagas.valor_participacao` | — |
| Lucro Líq. | LucroApostas − Custos − Despesas − Participações | — |
| Patrimônio | Σ acumulada do "Lucro Líq." | — |

## Problemas e redundâncias detectados

### 1. Redundância grave com a "Análise Temporal"
A Análise Temporal (novo gráfico) já mostra **CAC, Comissões, Bônus, Infra, Operadores, Fluxo Líquido, Resultado Líquido e Margem** mês a mês — com janela dinâmica, baseline e gráfico interativo. O Histórico Mensal mostra basicamente os mesmos custos agregados em "Custos + Despesas + Participações", **sem o detalhamento**. É uma versão obsoleta e mais pobre da mesma informação.

### 2. "Lucro Apostas" é métrica teórica, não Lucro Real
Soma `lucro_prejuizo` por `data_aposta` (lucro operacional teórico). Conflita semanticamente com o KPI principal "Fluxo Líquido / Lucro Real" que padronizamos (memória `lucro-realizado-metrica-primaria-standard`). O usuário vê dois "lucros" diferentes na mesma tela sem entender o motivo.

### 3. "Patrimônio" é fictício e enganoso
É apenas a soma acumulada do "Lucro Líq." teórico — **não é o patrimônio real** do workspace (que é a Posição de Capital, R$ 35M no seu print). Em projetos novos, pode aparecer negativo enquanto o patrimônio real é altamente positivo. Esse número não tem uso financeiro defensável.

### 4. Sem consolidação multi-moeda (mesmo bug que corrigimos)
`apostas_unificada.lucro_prejuizo`, `cash_ledger.valor` etc. estão em moedas distintas (USD, BRL, EUR…) e a tabela soma como se tudo fosse BRL. Reproduz exatamente o bug do KPI Fluxo Líquido que acabamos de corrigir.

### 5. Split "Custos" vs "Despesas" inconsistente
RH cai em "Despesas" (vem de `despesas_administrativas` grupo RH), mas pagamentos de operador caem em "Custos". Pela memória `useFinanceiroCalculations` o padrão é juntar **RH + pagamentos_operador** em "Operadores". A tabela quebra esse padrão.

### 6. Janela fixa 12m mostra meses zerados
Mesmo problema da Análise Temporal antiga, já resolvido lá com baseline dinâmico — aqui continua exibindo zeros em meses sem dado.

### 7. Sem filtro de status
Despesas administrativas PENDENTES entram nos números? `useFinanceiroData` carrega `despesasAdmin` (CONFIRMADO) e `despesasAdminPendentes` separados; o histórico só usa um deles. Mas vale auditar.

## Proposta — duas opções

### Opção A (recomendada) — Remover a aba
A Análise Temporal já cumpre o papel com mais detalhe, multi-moeda correto, baseline dinâmico, gráfico, tooltip rico e exportação PDF/XLSX. A aba Histórico Mensal vira ruído.

**Ações:**
- Remover a tab "Histórico Mensal" do TabsList em `src/pages/Financeiro.tsx`.
- Remover `FinanceiroHistoricoTab.tsx`, o `historicoMensal` em `useFinanceiroCalculations.ts` e dependências exclusivas.
- Adicionar a coluna **Participações** na Análise Temporal (única informação que ela ainda não exibia), com tooltip explicando que é distribuição paga a investidores.
- Manter "Patrimônio acumulado" fora — ele já é representado corretamente pela "Posição de Capital" no KPI Rail.

### Opção B — Refatorar a aba para "Histórico Realizado"
Manter a tab mas reescrever para alinhar ao padrão atual:

| Nova coluna | Nova fórmula |
|---|---|
| Fluxo Líquido | Mesma do KPI/Análise Temporal (SAQUE+SAQUE_VIRTUAL − DEPOSITO+DEPOSITO_VIRTUAL[MIGRACAO]), via PTAX |
| CAC | Σ PAGTO_PARCEIRO + PAGTO_FORNECEDOR |
| Comissões+Bônus | Σ COMISSAO_INDICADOR + BONUS_INDICADOR |
| Infra | despesas_administrativas (grupo ≠ RH) |
| Operadores (RH+ops) | despesas_administrativas (RH) + pagamentos_operador |
| Participações | participacoes_pagas |
| Resultado Líquido | Fluxo Líquido − (CAC+Comissões+Bônus+Infra+Operadores+Participações) |

**Remover** "Patrimônio acumulado" e "Lucro Apostas teórico". Aplicar a mesma conversão multi-moeda (`convertToBRL` com cotações oficiais). Reaproveitar o `useFinanceiroMensal` existente — adicionar campo `participacoes` lá e reusar o array. Janela dinâmica + baseline já vêm de graça.

A Opção B introduz redundância de UI (mesma info em tabela e gráfico) mas mantém quem prefere "ver em tabela densa".

## Recomendação

**Opção A**. A Análise Temporal já é a versão evoluída e correta dessa visão; manter a aba antiga só perpetua confusão (dois "lucros" diferentes, patrimônio fictício, soma multi-moeda errada). A única informação exclusiva (Participações) cabe como nova série/coluna na Análise Temporal.

Qual aplicar — **A** (remover + adicionar Participações na Análise Temporal) ou **B** (refatorar a aba)?
