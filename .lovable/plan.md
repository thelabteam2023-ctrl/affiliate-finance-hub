# Plano: Gráfico Mensal Lucro vs Custo + Relatório

## 1. O que o gráfico deve mostrar (recomendação)

**Tipo:** Composed Chart (Recharts) — barras + linhas combinadas, mês a mês (últimos 12 meses por padrão, ajustável).

**Séries (eixo Y esquerdo — R$):**
- **Barras empilhadas de custo** (stack "custos"): CAC, Comissões, Bônus, Infraestrutura, RH, Operadores — mesmas 5+1 famílias da Composição de Custos, mantendo a paridade de escopo já decidida.
- **Barra agrupada (lado a lado das barras de custo):** **Fluxo Líquido** (Saques − Depósitos do mês) — verde.
- **Linha 1:** **Resultado Líquido** (Fluxo Líquido − Custo Total) — destaque (cor primária, grossa, com dots).
- **Linha 2 (tracejada):** **Lucro Operacional** (teórico das apostas) — referência secundária.

**Eixo Y direito (%):**
- **Linha:** **Margem Operacional** (Resultado Líquido ÷ (Fluxo Líquido + Custo) × 100) — usa `calcMargemOperacional` existente.

**Interatividade:**
- Tooltip rico mostrando todas as séries do mês + delta vs mês anterior.
- Legenda clicável (toggle de séries).
- Brush no rodapé para zoom temporal quando >6 meses.
- Toggle de período: 6m / 12m / 24m / "Tudo".
- Animação de entrada (framer-motion no card; Recharts `isAnimationActive`).

## 2. UI

**Local:** aba "Despesas/Financeiro" (mesma que hoje mostra Composição de Custos e Resumo Admin), no topo, dois botões:
- `[Gerar Gráfico]` (Sparkline icon) — abre Dialog/Sheet fullscreen com o gráfico.
- `[Salvar Relatório]` (Download icon) — dropdown: **PDF** ou **Excel (.xlsx)**.

Dialog do gráfico:
- Header: título + seletor de período + botão exportar.
- Gráfico principal (Composed).
- Abaixo: tabela compacta mês a mês com totais (Fluxo Líquido, Custos por família, Resultado Líquido, Margem %).
- Cards de resumo no topo: Média mensal de Resultado Líquido, Melhor mês, Pior mês, Margem média.

## 3. Dados — agregação mensal

Novo hook `useFinanceiroMensal(meses: number)` em `src/hooks/useFinanceiroMensal.ts`:
- Reusa as mesmas fontes do `useFinanceiroCalculations` (despesas, despesasAdmin, pagamentosOperador, cash_ledger para Fluxo Líquido / Lucro Real).
- Agrupa por mês (`format(data, "yyyy-MM")`) respeitando timezone São Paulo.
- Para cada mês retorna:
  ```
  { mes, cac, comissoes, bonus, infra, rh, operadores, custoTotal,
    fluxoLiquido, lucroOperacional, resultadoLiquido, margemOperacional }
  ```
- Filtra por `workspace_id` (memória de isolamento já vigente).
- Respeita as 5 famílias já canonizadas (sem mudar escopo).

## 4. Relatório (Salvar)

**PDF** (`jspdf` + `jspdf-autotable` — já no projeto se possível, senão `bun add`):
- Capa: workspace, período, geração em.
- Resumo executivo (cards convertidos em tabela).
- Tabela mês a mês.
- Imagem do gráfico (capturada via `html-to-image` do node do Recharts).
- Rodapé com paginação.

**XLSX** (usa skill xlsx — openpyxl não roda no browser; faremos com **`xlsx` / SheetJS** no client):
- Aba 1 "Resumo Mensal": colunas mês, fluxo, custos (6), custo total, resultado líquido, margem.
- Aba 2 "Composição Custos": detalhe por família por mês.
- Formatação BRL e %; totais por coluna; linha de média.

Nome do arquivo: `relatorio-financeiro-{workspace}-{yyyyMM}-{yyyyMM}.{pdf|xlsx}`.

## 5. Arquivos a criar/alterar

Criar:
- `src/hooks/useFinanceiroMensal.ts` — agregação mensal.
- `src/components/financeiro/GraficoMensalDialog.tsx` — Dialog com Composed Chart + tabela.
- `src/components/financeiro/RelatorioMensalActions.tsx` — botões "Gerar Gráfico" e "Salvar Relatório" (dropdown PDF/XLSX).
- `src/lib/financeiro/exportRelatorioPDF.ts`
- `src/lib/financeiro/exportRelatorioXLSX.ts`

Alterar:
- Página/aba financeira (onde vive Composição de Custos) — montar `<RelatorioMensalActions />` no header.

Dependências (se faltarem): `jspdf`, `jspdf-autotable`, `xlsx`, `html-to-image`.

## 6. Validação

- Soma dos custos mensais do gráfico = Composição de Custos quando filtro = mês cheio.
- Fluxo Líquido mensal = Lucro Real do mesmo período no Indicadores Financeiros.
- Margem Operacional = `calcMargemOperacional` (sem reimplementar).
- Exportações PDF/XLSX abrem sem erro e batem com a tela.

## 7. Fora do escopo

- Nenhuma mudança em RPCs/migrations.
- Não altera escopo de Composição vs Admin (mantido).
- Não muda KPIs existentes.

---

Posso prosseguir com a implementação? Se sim, qual formato prioritário de relatório — **PDF**, **XLSX**, ou ambos já no primeiro release?
