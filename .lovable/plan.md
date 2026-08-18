# Auditoria Financeira - Caso Bora Progame

## 1. Causa Raiz e Reprodução Matemática

**Dados do Projeto:**
- Moeda de Consolidação: **USD**
- Cotação de Trabalho: **5.2231** (BRL/USD) - *Embora o projeto use USD como base, a cotação de trabalho existe no registro.*

**Transações Identificadas:**
1. **DEPOSITO (ID: 34a53e66...):**
   - Moeda Original: **EUR**
   - Valor (Nominal): **€200.2762...**
   - Valor Confirmado (Realizado): **€199.00**
   - Valor USD Referência (Snapshot): **$232.00**
   - Cotação Destino USD (EUR/USD Snapshot): **1.1584**
   - *Cálculo:* €200.28 * 1.1584 ≈ $232.00.

2. **PERDA_CAMBIAL (ID: 8eacd3f3...):**
   - Moeda Original: **EUR**
   - Valor: **€1.2762...**
   - Descrição: "Perda cambial em conciliação: 200.28 nominal → 199.00 confirmado"

### Investigação dos KPIs

#### Pergunta 1: Como o sistema calculou os €200,28?
O sistema usou a cotação **Snapshot EUR/USD de 1.1584** capturada no momento do depósito.
$232.00 / 1.1584 = €200.276... (arredondado para €200.28 na UI).
Esta cotação veio do `cotacao_destino_usd` no `cash_ledger` no momento do lançamento.

#### Pergunta 2: Como o sistema registrou os €199?
O valor de €199 foi registrado como `valor_confirmado` na transação de depósito original e reflete o `saldo_atual` da bookmaker SPORTMARKET.

#### Pergunta 3: Por que o KPI de prejuízo mostra -€1,49 (≈ -$1.72)?
O KPI de "Extras" (Ajustes) em `ExtratoProjetoTab.tsx` soma todos os eventos do tipo `PERDA_CAMBIAL`, `GANHO_CAMBIAL`, `AJUSTE`, etc.
- **Evento 1:** Depósito de €200.28 (não entra em ajustes).
- **Evento 2:** Perda Cambial de €1.28.
- *Inconsistência Identificada:* O usuário relata **-€1.49**. 
  Ao observar o `ExtratoProjetoTab.tsx` (linhas 606-627), os ajustes são calculados usando `resolveConsolidado(e, valorBase, moeda)`.
  Para a `PERDA_CAMBIAL`, `valor_usd_referencia` está **NULO**.
  O fallback é `convertToConsolidation(1.27, 'EUR')`.
  `convertToConsolidation` em `useProjetoCurrency` (projeto USD) faz: `valor * (rates.EUR / rates.USD)`.
  Se a cotação PTAX live de EUR/USD no momento do render for diferente de 1.1584, o valor flutua.
  Se PTAX EUR/USD ≈ 1.17, então €1.28 * 1.17 ≈ **$1.49**.
  **Erro:** O KPI de ajustes está usando cotação LIVE/TRABALHO, enquanto o depósito usou SNAPSHOT. Isso gera o "drift" de $0.21 ($1.49 vs $1.28).

#### Pergunta 4: Por que o KPI "Se sacar tudo" mostra €0,41 (≈ $0.41)?
Fórmula em `ExtratoProjetoTab.tsx` (linha 701):
`resultadoCaixa = saquesTotal + saldoCasasTotal - depositosTotal`
- `saquesTotal` = $0
- `depositosTotal` = **$232.00** (Vem do snapshot `valor_usd_referencia` do depósito).
- `saldoCasasTotal` = $199.00 (EUR) convertido via cotação LIVE/TRABALHO.
  Se PTAX EUR/USD ≈ 1.1679: €199 * 1.1679 ≈ **$232.41**.
- `resultadoCaixa` = 0 + $232.41 - $232.00 = **$0.41**.
  **Erro:** O Saldo das Casas está sendo valorizado a mercado (Mark-to-Market), enquanto o Depósito está congelado no snapshot. Como o EUR valorizou frente ao USD desde o depósito (1.1584 -> 1.1679), o sistema acha que você tem um "lucro" de $0.41, ignorando que você perdeu €1.28 no recebimento.

---

## 2. Proposta de Nova Arquitetura Financeira (V15)

Para resolver o conflito entre **Snapshot (Passado)** e **Liquidação (Presente)**, implementaremos a distinção explícita proposta:

### A. Fluxo de Realização (SSOT)
1. **Valor de Referência (Expected):** O valor que o sistema previu no envio ($232.00).
2. **Valor Realizado (Actual):** O valor que efetivamente entrou na bookmaker (€199.00).
3. **Variação na Origem (Realized Gap):** A diferença entre o esperado e o realizado no momento do aporte (-€1.28). Esta diferença deve ser **CONGELADA** e não flutuar mais.

### B. Mapeamento de KPIs
| KPI Antigo | Novo KPI Sugerido | Lógica de Cálculo |
| :--- | :--- | :--- |
| **Depósitos** | **Capital Aportado** | Soma dos Snapshots USD de depósitos efetivos. |
| **Extras** | **Resultado Cambial/Taxas** | Soma das variações realizadas (Snapshots) + variações de liquidação. |
| **Se sacar tudo** | **Patrimônio Líquido** | (Saldo Atual * Cotação Live) + Saques Confirmados - Capital Aportado. |

### C. Mudanças Técnicas
1. **Lançamento de Conciliação:** O trigger/serviço que gera `PERDA_CAMBIAL` deve gravar obrigatoriamente o `valor_usd_referencia` (Snapshot) usando a mesma cotação do depósito original, para neutralizar o drift.
2. **FinancialMetricsService:** Criar separação entre `lucroOperacional` (apostas) e `lucroFinanceiro` (FX/Taxas).
3. **ExtratoProjetoTab:** Ajustar o cálculo de `resultadoCaixa` para que o Saldo das Casas use a cotação de snapshot para o "Lucro Realizado" e cotação live apenas para "Lucro se sacar tudo hoje".

## 3. Plano de Implementação

### Passo 1: Correção dos Snapshots Órfãos (Backfill)
Identificar transações de `PERDA_CAMBIAL`/`GANHO_CAMBIAL` sem snapshot e preencher com base na cotação da transação pai (Depósito/Saque).

### Passo 2: Ajuste no Cálculo do Extrato
Modificar `ExtratoProjetoTab.tsx` para:
- Garantir que ajustes cambiais usem snapshot.
- Criar o KPI de "Resultado Cambial Realizado".

### Passo 3: Evolução da Interface
Atualizar os cards de KPI para refletir a nova nomenclatura e fornecer o detalhamento (popover) reconciliável centavo a centavo.

---

*Aprovação Necessária: Deseja que eu prossiga com a aplicação desta lógica de Snapshot nas perdas cambiais e a separação dos KPIs no Extrato?*
