## Objetivo

Corrigir o bug de **double-counting** no card "Resultado de Caixa" da aba Extrato, que está somando os Extras (bônus, cashback, ajustes) duas vezes — uma vez via `saldoCasasTotal` (já refletido pelos triggers do ledger) e outra vez via `ajustesTotal`.

## Diagnóstico (já confirmado na auditoria anterior)

**Fórmula atual (errada)** em `ExtratoProjetoTab.tsx`:
```
resultadoCaixa = saquesTotal + saldoCasasTotal + ajustesTotal − depositosTotal
```

**Por quê está errada**: quando um `BONUS_CREDITADO` ou `CASHBACK` é lançado, o trigger do ledger já atualiza o `saldo_atual` da bookmaker. Logo, esses valores **já estão dentro de `saldoCasasTotal`**. Ao somar `ajustesTotal` separadamente, contamos duas vezes.

**Exemplo do print do usuário**:
- Depósitos: $898,67 / Saques: $0 / Saldo Casas: ~$1.198,67 / Extras (bônus): $300
- Atual (errado): 0 + 1.198,67 + 300 − 898,67 = **$600** ❌
- Correto: 0 + 1.198,67 − 898,67 = **$300** ✅ (bate com Patrimônio Líquido da Visão Geral)

## Mudanças

### 1. `src/components/projeto-detalhe/ExtratoProjetoTab.tsx`

**a) Corrigir fórmula** (remover `ajustesTotal` da soma):
```ts
const resultadoCaixa = saquesTotal + saldoCasasTotal − depositosTotal;
```

**b) Renomear card** "Resultado de Caixa" → **"Lucro se sacar tudo"** (alinhado com a nomenclatura do `FinancialMetricsPopover`).

**c) Atualizar tooltip do `KpiInfoButton` do card renomeado**:
- Nova fórmula
- Explicar que bônus/cashback/ajustes já estão refletidos no Saldo Casas via triggers
- Manter aviso sobre divergência cambial vs Saldo Operável (mark-to-market vs snapshot)

**d) Card "Extras"** permanece, mas com tooltip atualizado:
> *"Soma informativa dos lançamentos extras (bônus, cashback, ajustes) no período. **Estes valores já estão refletidos no Saldo Casas** via triggers do ledger e NÃO são somados novamente no Lucro se sacar tudo."*

### 2. `mem://finance/extrato-kpi-dual-view-standard.md`

Atualizar a tabela e adicionar seção "Anti-double-counting":
- Corrigir fórmula do "Resultado de Caixa" → "Lucro se sacar tudo"
- Documentar que Extras é **informativo apenas**, não entra no cálculo
- Justificar: triggers do ledger já refletem extras no `saldo_atual`

### 3. `mem://finance/extrato-projeto-canonical-kpi-standard.md`

Atualizar seção "Resultado de Caixa" com:
- Nova fórmula sem `ajustesTotal`
- Renomeação do card
- Nota explicativa sobre por que não somar extras

## Validação esperada após o fix

Com os números do print do usuário:
- **Lucro se sacar tudo (Extrato)** ≈ **Patrimônio Líquido (Popover)** ≈ **Lucro Operacional (Visão Geral)** ± variação cambial

A divergência residual entre Extrato e Visão Geral será apenas **variação cambial** (snapshot vs live), o que é o comportamento intencional documentado em `extrato-kpi-dual-view-standard`.

## Arquivos afetados

- `src/components/projeto-detalhe/ExtratoProjetoTab.tsx` (fórmula + label + tooltip)
- `.lovable/memory/finance/extrato-kpi-dual-view-standard.md` (atualização)
- `.lovable/memory/finance/extrato-projeto-canonical-kpi-standard.md` (atualização)

## Não-objetivos

- Não alterar lógica de `saldoCasasTotal` (continua live mark-to-market)
- Não alterar conversão dos Extras (continua snapshot via `convertToConsolidation`)
- Não tocar em RPCs ou triggers do banco (anti-retrofix)
