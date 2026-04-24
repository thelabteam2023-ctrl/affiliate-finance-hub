
# Plano: Separação Conceitual entre Performance, FX e Ajustes

## Diagnóstico do estado atual

Após varrer `FinancialMetricsPopover.tsx` (linhas 100-120, 244-290, 510-615, 761-780) e `LucroProjetadoModal.tsx`, confirmei o problema:

### Como está hoje (Camada 3 — Operacional)

```
Lucro Apostas Puro (juice)        ← performance real
+ Créditos Extras
   ├── Bônus Ganhos               ← performance (estoque promocional)
   ├── Cashback Líquido           ← performance (devolução da casa)
   ├── Giros Grátis               ← performance (promo)
   ├── Ganho de Confirmação       ← FX disfarçado (Δ saque solicitado vs recebido)
   ├── Ajustes de Saldo           ⚠️ MISTURADO: ajuste contábil
   ├── Resultado Cambial (FX)     ⚠️ MISTURADO: efeito macro
   └── Perdas Operacionais        ← evento extraordinário (conta bloqueada)
```

**Resultado**: o KPI de Performance está contaminado por:
- **Variação cambial** (PERDA_CAMBIAL/GANHO_CAMBIAL) — não é operação, é macro
- **Ajustes de Saldo** (AJUSTE_SALDO) — não é operação, é correção contábil
- **Ganho de Confirmação** — é FX disfarçado (mesma natureza)
- **Perdas Operacionais** — é evento extraordinário, não performance recorrente

Isso distorce ROI, eficiência e a leitura de "qualidade da operação" — exatamente o que você apontou.

---

## Proposta: 3 blocos visuais distintos dentro da Camada 3

Em vez de criar uma Camada 4 (que poluiria mais), vou **reorganizar a Camada 3 atual em 3 sub-blocos visuais segregados** com totalizador final:

### Estrutura proposta da Camada 3

```
3. OPERACIONAL — visão completa de resultado
─────────────────────────────────────────────
🟢 PERFORMANCE PURA                    R$ X.XXX
   ├── Lucro de Apostas (juice)        R$ ...
   ├── Bônus Ganhos                    R$ ...
   ├── Cashback Líquido                R$ ...
   └── Giros Grátis                    R$ ...
   → Esta é a performance que você cobra do operador

🟡 EFEITOS FINANCEIROS (não-operacional) ±R$ XXX
   ├── Resultado Cambial (FX)          ±R$ ...
   ├── Ganho/Perda de Confirmação      ±R$ ...
   → Variação de moeda na liquidação. Fora do controle do operador.

🟠 AJUSTES & EXTRAORDINÁRIOS          ±R$ XXX
   ├── Ajustes de Saldo (reconciliação) ±R$ ...
   └── Perdas Operacionais              −R$ ...
   → Correções e incidentes. Não é performance, mas afeta o caixa.

═════════════════════════════════════════════
RESULTADO OPERACIONAL TOTAL            R$ X.XXX
   = Performance + Efeitos FX + Ajustes
   (este é o número que reconcilia com o Patrimônio)
```

### Por que dentro da Camada 3 e não como Camada 4

- Manter as 3 camadas mentais (Realizado / Patrimônio / Operacional) que você já aprovou.
- A reconciliação com Patrimônio (Camada 2) continua coerente — o "Operacional Total" precisa bater com o Patrimônio.
- Visualmente segregado, mas matematicamente unificado.

---

## Decisões já tomadas (consolidando as 3 perguntas da rodada anterior)

### 1. Estratégia de separação
✅ **Performance pura + sub-blocos no operacional** (opção 1) — segregação visual mantendo unidade matemática.

### 2. ROI e Performance
✅ **ROI = só Performance Pura** (opção 1)
- ROI passa a usar apenas: `lucroApostasPuro + bonusGanhos + cashbackLiquido + girosGratis`
- FX e Ajustes saem do denominador/numerador de eficiência
- Razão: ROI mede qualidade da operação, não risco cambial nem correções contábeis

### 3. Conta de Fechamento com Operador
✅ **Adicionar no LucroProjetadoModal** (opção 1) — o modal de reconciliação já existe e é o lugar natural.

---

## Implementação técnica

### Arquivo 1: `src/components/projeto-detalhe/FinancialMetricsPopover.tsx`

**A) Novos campos calculados em `metrics`** (no `useMemo` linhas 510-615):
```typescript
// PERFORMANCE PURA (ROI usa só isto)
const performancePura = lucroApostasPuro + bonusGanhos + cashbackLiquido + girosGratis;

// EFEITOS FINANCEIROS (FX)
const efeitosFinanceiros = (ganhoFx - perdaFx) + ganhoConfirmacao;

// AJUSTES & EXTRAORDINÁRIOS
const ajustesExtraordinarios = ajustes - perdaOp;

// TOTAL OPERACIONAL (substitui o atual extrasPositivos para reconciliação)
const resultadoOperacionalTotal = performancePura + efeitosFinanceiros + ajustesExtraordinarios;
```

**B) Refatorar `LucroOperacionalCollapsible`** (linhas 304-339):
- Renomear seção principal para "Operacional · Resultado Completo"
- Criar 3 sub-componentes colapsáveis: `PerformancePuraSection`, `EfeitosFinanceirosSection`, `AjustesSection`
- Cada um com cor de borda própria (emerald/amber/orange) e ícone (TrendingUp/ArrowRightLeft/AlertCircle)
- Totalizador "Resultado Operacional Total" no rodapé

**C) Atualizar tooltip da Camada 3** (linha 773-775):
> "Performance Pura mostra a qualidade da operação. Efeitos Financeiros (FX) e Ajustes são apresentados separados — eles afetam o caixa mas não medem performance."

**D) Remover `ExtrasCollapsible` redundante** (linhas 244-290) — sua função vai ser absorvida pelos novos sub-blocos. Os mesmos drill-downs continuam disponíveis.

### Arquivo 2: `src/components/projeto-detalhe/LucroProjetadoModal.tsx`

Adicionar **novo bloco "Conta de Fechamento com Operador"** após a Ponte de Reconciliação:

```
─── CONTA DE FECHAMENTO ───
✅ Lucro do Operador (performance pura)    R$ X.XXX
   Apostas + Bônus + Cashback + Giros
   → Esta é a parcela atribuída ao trabalho do operador

ℹ️ Efeitos Não-Operacionais (informativo)  ±R$ XXX
   ├── Variação Cambial                     ±R$ ...
   ├── Ajustes de Saldo                     ±R$ ...
   └── Perdas Operacionais                  −R$ ...
   → Esta parcela NÃO compõe a remuneração do operador

═════════════════════════════════════════
TOTAL DO PROJETO                           R$ X.XXX
```

**Props novos** no `LucroProjetadoModal`:
- `performancePura: number`
- `efeitosFinanceiros: number`
- `ajustesExtraordinarios: number`

### Arquivo 3 (memória): criar `mem://finance/operational-performance-segregation-standard`

Documentar a regra:
- Performance Pura = juice + bônus + cashback + giros (denominador de ROI)
- Efeitos Financeiros = FX + ganho de confirmação (informativo, fora de ROI)
- Ajustes & Extraordinários = AJUSTE_SALDO + PERDA_OPERACIONAL (fora de ROI)
- Resultado Operacional Total = soma dos 3 (reconcilia com Patrimônio)

### Arquivo 4 (memória): atualizar `mem://index.md`
Adicionar uma linha no Core:
> ROI usa apenas Performance Pura. FX e Ajustes ficam segregados visualmente, fora do denominador.

---

## Impactos colaterais a verificar

1. **`useKpiBreakdowns.ts`** — usado pelo `LucroProjetadoModal` para o breakdown de "Lucro Operacional". Verificar se já segrega ou se replica o problema. Se replicar, não mexer agora — apenas o popover é o escopo desta iteração (consistente com sua diretriz "refatorar o popover atual").

2. **ROI em outros lugares** — esta refatoração toca apenas o popover de Indicadores Financeiros do header. ROI exibido em outros componentes (PerformancePorCasaCard, badges de estratégia, etc.) **não é alterado** nesta iteração — eles usam fontes RPC canônicas. Se quiser propagar a regra, fica para iteração futura.

3. **Cores e ícones** — vou usar:
   - Performance: emerald + `TrendingUp`
   - Efeitos FX: amber + `ArrowRightLeft`
   - Ajustes: orange + `AlertCircle`

---

## Pergunta única antes de implementar

Você confirma que esta iteração foca **apenas o popover + modal** (não propaga ROI segregado para PerformancePorCasaCard, cards de estratégia, etc.)? Ou prefere que eu já mapeie e proponha a 2ª fase de propagação no mesmo plano?

Aguardando aprovação para implementar.
