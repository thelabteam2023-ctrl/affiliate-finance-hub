# Plano: Lucro Realizado como Métrica Principal da Visão Financeira

## 1. Contexto e Decisão Conceitual

Hoje a plataforma exibe **Lucro Operacional** (resultado teórico: apostas liquidadas + cashback + giros + bônus − perdas + ajustes + cambial + promocionais) como KPI de destaque em diversas telas. Esse número inclui valores que ainda estão **presos em saldo de casa**, **pendentes de saque**, **em trânsito** ou **bloqueados** — ou seja, não representam dinheiro efetivamente recuperado para o caixa.

O **Lucro Realizado** já existe e segue a fórmula canônica documentada em `mem://finance/lucro-real-payment-standard`:

```
LUCRO_REALIZADO = (Saques + Saques Virtuais) − (Depósitos + Depósitos Virtuais)
```

Ele responde à pergunta correta para o gestor: **"quanto dinheiro de fato voltou para a operação?"**.

**Decisão proposta:** promover **Lucro Realizado a métrica primária** na visão financeira (cards, kanban, dashboards, header), mantendo Lucro Operacional como **métrica secundária / de apoio operacional** (eficiência teórica da operação, ainda útil para comparar casas e estratégias).

Não vamos **remover** Lucro Operacional — ele continua sendo a referência da camada de Performance (Apostas, Bônus, Ciclos). A mudança é de **hierarquia visual e narrativa**.

---

## 2. Princípios da Mudança

1. **Não alterar fórmulas existentes.** Lucro Realizado e Lucro Operacional continuam calculados pelas mesmas fontes canônicas atuais (`fetchProjetosLucroCanonico` para Realizado, `fetchProjetosLucroOperacionalKpi` para Operacional).
2. **Hierarquia visual clara:** Realizado = número grande/colorido principal; Operacional = subtexto/popover/badge.
3. **Lucro Potencial** (saldo nas casas + saques pendentes − depósitos) ganha destaque como ponte entre os dois: "o que ainda pode virar Realizado".
4. **Configuração por projeto** (`projetos.metrica_lucro_ciclo`) continua respeitada nos ciclos. Default global do header passa a ser **Realizado**.
5. **Nenhuma migration de dados**, nenhuma mudança em RPC. Trabalho 100% de frontend/UX.

---

## 3. Telas Afetadas e Mudanças

### 3.1 Header do Projeto — `FinancialSummaryCompact.tsx`
**Hoje:** já mostra Lucro Realizado como número grande (correto). Mantém.
**Ação:** adicionar tooltip/legenda explicando "Dinheiro efetivamente retornado ao caixa" e mostrar Lucro Operacional como linha secundária menor abaixo do ROI.

### 3.2 Card Kanban de Projetos — `GestaoProjetos.tsx`
**Hoje:** card mostra Lucro Operacional canônico como destaque.
**Mudança:**
- **Número principal:** Lucro Realizado (`fetchProjetosLucroCanonico.lucroRealizado`, já disponível).
- **Linha secundária:** "Operacional: R$ X" em cinza/menor.
- **Badge "Potencial":** mostra `lucroPotencial` se ≠ realizado, sinalizando capital ainda preso.

### 3.3 Dashboard Financeiro (`Financeiro.tsx` / `ProjetoFinancialMetricsCard.tsx`)
**Hoje:** Lucro Operacional e Realizado coexistem em cards separados.
**Mudança:**
- Reordenar: card **Lucro Realizado** vira o primeiro/maior.
- Card **Lucro Potencial** segundo.
- Card **Lucro Operacional** terceiro, com label "Resultado teórico da operação".
- Texto de ajuda em cada card explicando o que representa.

### 3.4 Workspace / Visão Consolidada — `useWorkspaceLucroOperacional.ts`
**Hoje:** hook agrega Lucro Operacional do workspace.
**Mudança:** criar `useWorkspaceLucroRealizado` análogo, agregando `lucroRealizado` de `fetchProjetosLucroCanonico` por projeto. Componentes do dashboard de workspace passam a consumir ambos, exibindo Realizado em destaque.

### 3.5 Popover de Indicadores — `FinancialMetricsPopover.tsx`
**Mudança:** reorganizar seções na ordem:
1. **Lucro Realizado** (destaque)
2. **Lucro Potencial** (capital ainda preso)
3. **Patrimônio Total**
4. **Lucro Operacional** (com rótulo "teórico")
5. **ROI Realizado** e **ROI Operacional** lado a lado.

### 3.6 Ciclos — sem mudança de fórmula
Mantém `projetos.metrica_lucro_ciclo` (operacional|realizado). Adiciona apenas legenda visual no card de ciclo indicando qual métrica está ativa, e botão rápido para alternar a visualização (sem trocar config).

---

## 4. UX / Comunicação

- **Glossário inline** (tooltip/info ícone) em todos os pontos onde os termos aparecem:
  - *Lucro Realizado:* "Dinheiro que efetivamente retornou ao caixa (Saques − Depósitos)."
  - *Lucro Potencial:* "Quanto vira lucro se todo o saldo nas casas fosse sacado hoje."
  - *Lucro Operacional:* "Resultado teórico da operação (apostas + cashback + bônus − perdas). Inclui valores ainda presos em casa."
- **Banner único** no primeiro acesso após deploy explicando a mudança de hierarquia.
- **Cores semânticas mantidas** (emerald/red). Sem hardcode.

---

## 5. Detalhes Técnicos

**Arquivos editados (frontend apenas):**
- `src/components/projeto-detalhe/FinancialSummaryCompact.tsx` — adicionar linha secundária Operacional + tooltip.
- `src/pages/GestaoProjetos.tsx` — trocar número principal do card kanban para `lucro_realizado` (já vem em `fetchProjetosLucroCanonico`); operacional vira subtexto.
- `src/components/projeto-detalhe/ProjetoFinancialMetricsCard.tsx` — reordenar cards.
- `src/components/projeto-detalhe/FinancialMetricsPopover.tsx` — reordenar seções.
- `src/hooks/useWorkspaceLucroOperacional.ts` — manter; criar irmão `src/hooks/useWorkspaceLucroRealizado.ts` agregando via `fetchProjetosLucroCanonico`.
- `src/pages/Financeiro.tsx` (e cards de workspace) — consumir hook novo, reordenar exibição.
- Pequenos componentes de glossário/tooltip reutilizáveis em `src/components/ui/`.

**Não tocar:**
- RPCs (`get_projetos_lucro_operacional`, `get_projeto_dashboard_data`, `get_projeto_apostas_resumo`).
- Tabela `projetos` / campo `metrica_lucro_ciclo`.
- `fetchProjetosLucroCanonico` e `fetchProjetosLucroOperacionalKpi` (já são as fontes únicas).
- Camada de Performance (Apostas/Bônus/Ciclos) — continua usando Operacional como definido.

**Memórias a atualizar após implementação:**
- Criar `mem://finance/lucro-realizado-metrica-primaria-standard` definindo Realizado como métrica de destaque na Visão Financeira e Operacional como apoio.
- Atualizar `mem://index.md` Core: "Visão Financeira destaca Lucro Realizado; Operacional é métrica secundária/teórica."

---

## 6. Critérios de Aceite

1. Card kanban de projeto mostra Lucro Realizado como número principal; Operacional aparece menor abaixo.
2. Header do projeto e popover financeiro têm Realizado em primeiro lugar, com tooltip explicativo.
3. Dashboard Financeiro reordenado: Realizado → Potencial → Operacional.
4. Workspace consolidado expõe ambos, com Realizado em destaque.
5. Nenhuma fórmula muda; valores absolutos atuais permanecem idênticos (apenas hierarquia visual e rótulos mudam).
6. Tooltips/glossário presentes em todos os pontos onde os termos aparecem.
7. Ciclos continuam respeitando `metrica_lucro_ciclo`.

---

## 7. Fora de Escopo

- Mudanças em fórmula, RPC ou schema.
- Remoção do Lucro Operacional.
- Reescrever cálculos de Performance (Apostas/Bônus).
- Auditoria das IC-1..IC-7 levantadas anteriormente (item separado, já documentado).
