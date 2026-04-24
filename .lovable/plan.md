# Plano — Reorganização dos Indicadores Financeiros (3 perspectivas)

## 🎯 Objetivo
O popover atual mostra **Resultado Realizado**, **Patrimônio Líquido** e **Resultado Operacional Total** com peso visual parecido — confundindo o usuário sobre **qual número é o "lucro real"**. Esta reforma é **puramente visual + de copy**: zero mudança em cálculos, zero migração, zero risco financeiro.

## 🧭 Princípio condutor
Cada KPI responde a uma **pergunta diferente**. Vamos rotular cada bloco com a pergunta que ele responde:

| Camada | Pergunta | Campo existente |
|---|---|---|
| 💰 **Patrimônio** | *"Quanto eu teria de lucro se sacasse tudo hoje?"* | `metrics.lucroFinanceiro` |
| 🏦 **Caixa** | *"Quanto já voltou pro meu bolso?"* | `metrics.lucroRealizado` |
| 📊 **Operação** | *"Quanto a operação produziu (perf + FX + extraord)?"* | `metrics.resultadoOperacionalTotal` |

---

## 📦 Fase 1 — Card-resumo "Lucro se sacar tudo hoje"

**Local**: topo do popover (acima do bloco atual de patrimônio), `FinancialMetricsPopover.tsx` ~linha 970.

**Componente novo**: card com gradiente sutil (emerald se positivo, rose se negativo), maior e mais proeminente:
- Label primário: **"💰 Lucro se sacar tudo hoje"**
- Valor: `formatCurrency(metrics.lucroFinanceiro)` (já existe, é `patrimônio − depósitos`)
- Sublinha em texto pequeno: *"Saldo nas casas + saques recebidos − depósitos confirmados"*
- Tooltip do `?` ao lado: *"Esta é a resposta principal. Se você sacasse todo o saldo das casas hoje e fechasse a operação, este é o lucro/prejuízo que ficaria no seu bolso."*

**Sem novo cálculo** — apenas reusa `metrics.lucroFinanceiro` que já é renderizado mais abaixo.

---

## 🪜 Fase 2 — Reordenação e renomeação das 3 camadas

### Ordem nova (top→bottom)
1. **Card-resumo** (Fase 1)
2. **🏦 Lucro em Caixa** (renomeado de "Resultado Realizado")
   - Subtítulo: *"Dinheiro que já voltou pra conta"*
   - Mantém barra de "Faltam X para recuperar" (já existe)
   - Tooltip: *"Saques confirmados − depósitos confirmados. Só conta dinheiro que efetivamente voltou ao seu banco."*
3. **📊 Performance da Operação** (renomeado de "Resultado Operacional Total")
   - Subtítulo: *"Performance + FX + extraordinários"*
   - Mantém os 3 sub-blocos (Performance Pura / Efeitos Financeiros / Extraordinários) inalterados
   - Tooltip: *"Mede o que a operação produziu de valor. Em equilíbrio, deve convergir com o Lucro se sacar tudo hoje."*

### Renomeações de copy (zero refactor de campo)
| Texto atual | Texto novo |
|---|---|
| "Resultado Realizado" | "Lucro em Caixa" |
| "Patrimônio Líquido" | "Lucro se sacar tudo hoje" (no card-resumo) |
| "Resultado Operacional Total" | "Performance da Operação" |
| "Ajustes & Extraordinários" (já renomeado na fase anterior) | "Extraordinários" (mantém) |

---

## 🎚️ Fase 3 — Badge de paridade Patrimônio ↔ Operação

Ao lado do valor de **"Performance da Operação"**, adicionar badge:
- **🟢 Convergente** se `|lucroFinanceiro − resultadoOperacionalTotal| < 0.01`
- **🟡 Divergência: $X.XX** se acima do threshold

Tooltip do badge: *"Em uma operação saudável, a Performance da Operação deve bater com o Lucro se sacar tudo hoje. Divergência indica saldos ainda não realizados, FX pendente ou ajustes recém-classificados."*

Sem novo cálculo — diff já está disponível em memória do componente.

---

## 📈 Fase 4 — Barra de progresso de recuperação

No bloco **"Lucro em Caixa"**, substituir o texto solto *"Faltam $X para recuperar"* por:
- `<Progress value={recovered/depositos*100} />` do shadcn (`@/components/ui/progress`)
- Label: *"Recuperação de capital: $X / $Y"* (X = soma de saques confirmados, Y = soma de depósitos)
- Cor da barra: amber se < 100%, emerald se ≥ 100%

Quando ≥ 100% (saques superam depósitos), trocar copy para: *"✓ Capital recuperado · Excedente: $Z"*.

---

## 🧠 Fase 5 — Header educacional do popover

No topo do popover (acima do card-resumo), uma linha-guia compacta:
> 💡 *3 perspectivas de lucro: o que voltou pro caixa · o que voltaria se sacasse tudo · o que a operação produziu.*

Hover no ícone 💡 expande tooltip explicando quando olhar cada um (resumo do que está nesta resposta).

---

## 📚 Fase 6 — Memória

**`mem://finance/indicadores-financeiros-3-camadas-standard.md`** (novo):
- Define as 3 camadas como padrão de comunicação financeira ao usuário.
- Mapeia cada campo (`lucroRealizado`, `lucroFinanceiro`, `resultadoOperacionalTotal`) à pergunta que responde.
- Documenta o badge de paridade como verificação saudável.
- Regra: **não inventar nova camada** — qualquer novo KPI financeiro deve se enquadrar em uma das 3 categorias ou justificar a criação de uma 4ª.

**`mem://index.md`**: nova entrada Core curta:
> *Indicadores Financeiros = 3 camadas: Caixa (lucroRealizado) · Patrimônio (lucroFinanceiro = "se sacar tudo hoje") · Operação (resultadoOperacionalTotal). Card-resumo destaca Patrimônio como resposta principal.*

---

## 🛡️ Garantias

| Risco | Mitigação |
|---|---|
| Quebra de cálculo | **Zero alteração** em fórmulas — só reusa campos do `metrics` existente |
| Confusão durante transição | Tooltips explícitos em cada KPI explicam o renome |
| Divergência permanente Patrimônio ↔ Operação | Badge amarelo expõe o problema visualmente em vez de esconder |
| Componente Progress ausente | Já existe em `src/components/ui/progress.tsx` |

---

## 📁 Arquivos tocados

1. `src/components/projeto-detalhe/FinancialMetricsPopover.tsx` (UI: card-resumo, reordenação, renomeações, badge paridade, barra progress)
2. `.lovable/memory/finance/indicadores-financeiros-3-camadas-standard.md` (novo)
3. `.lovable/memory/index.md` (nova entrada Core)

---

**Aprovando este plano**, executo em sequência: header educacional → card-resumo de Patrimônio → reordenação + renomeação das camadas → badge de paridade → barra de progresso → memórias.
