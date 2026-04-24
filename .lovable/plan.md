
## Objetivo

Eliminar a redundância visual do `FinancialMetricsPopover.tsx` (mesmas informações repetidas em até 3 seções) aplicando **progressive disclosure**: o usuário vê a leitura essencial imediatamente e expande detalhes apenas quando precisa auditar.

## Decisões aprovadas

- **Layout**: 2 cards sempre visíveis no topo + accordions colapsados abaixo
- **Cards de topo**: Sempre separados (didático), mesmo quando convergem
- **Lucro em Caixa**: Mantém no popover, mas dentro de accordion fechado por padrão

---

## Layout final (top → bottom)

### 1. Header educacional (compacto)
- Reduzir o tooltip atual (que explica 4 perspectivas) a uma linha curta + ícone 💡 com tooltip
- Remover textos longos da área visível

### 2. Cards de topo (sempre visíveis, lado-a-lado)

**Grid `grid-cols-2 gap-3`** com 2 cards primários:

#### Card A — `💰 Lucro se sacar tudo hoje` (Patrimônio)
- Mantém o design atual (gradiente emerald/red, ícone `PiggyBank`)
- Valor: `metrics.lucroFinanceiro`
- Subtítulo: "Patrimônio se liquidar tudo agora"

#### Card B — `🎯 Lucro Real Ajustado` (Operacional reconciliado)
- Mantém o design atual (gradiente sky/red, ícone `Target`)
- Valor: `metrics.resultadoOperacionalTotal`
- 3 chips inline (Performance · FX · Ajustes) — mantidos
- Badge de paridade (CheckCircle2 verde / Δ âmbar) — mantido

### 3. Accordions colapsados (`defaultOpen={false}`)

Usar `Accordion type="multiple"` de `@/components/ui/accordion` para permitir expandir múltiplos simultaneamente.

#### Accordion 1 — `🏦 Lucro em Caixa`
- **Trigger**: Label + valor preview à direita (ex: `R$ -899,50`)
- **Content**: Conteúdo atual da seção "Lucro em Caixa" (Saques – Depósitos + Extras)

#### Accordion 2 — `📐 Composição do Patrimônio`
- **Trigger**: Label + valor preview = `lucroFinanceiro`
- **Content**: Detalhamento atual (Saldos + Valores em Trânsito + Bônus + ... = Patrimônio)
- Esta seção responde "como cheguei no número do Card A"

#### Accordion 3 — `📊 Detalhe da Performance`
- **Trigger**: Label + valor preview = `performancePura`
- **Content**: 
  - `LucroOperacionalCollapsible` (decomposição apostas/bônus/cashback/etc)
  - `SegregatedExtrasBlock` (créditos, FX, extraordinários expansíveis)
  - Status de Recuperação de Capital (movido para o final deste accordion)

---

## Mudanças concretas no código

### `src/components/projeto-detalhe/FinancialMetricsPopover.tsx`

1. **Importar Accordion**:
   ```tsx
   import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
   ```

2. **Reestruturar JSX principal** (linha ~899 em diante):
   - Manter o header educacional (mais enxuto)
   - Manter os 2 cards de topo dentro de `<div className="grid grid-cols-2 gap-3">`
   - Substituir as 3 seções soltas (`Lucro em Caixa`, `Composição do Patrimônio`, `Performance da Operação`) por `<Accordion type="multiple">` contendo 3 `<AccordionItem>`
   - Cada `AccordionTrigger` mostra: ícone + label à esquerda, valor formatado à direita (estilo "preview")
   - Cada `AccordionContent` recebe o conteúdo correspondente que já existe no componente

3. **Remover duplicação**: 
   - O bloco `MetricRow label="= Lucro se sacar tudo hoje"` dentro de "Composição do Patrimônio" pode ser mantido (é o totalizador da fórmula), mas com tooltip atualizado para evitar redundância narrativa
   - O badge "Em uma operação saudável, a Performance da Operação deve bater com o Lucro se sacar tudo" da seção Performance pode ser removido (essa convergência já é mostrada no Card B via badge de paridade)

4. **Status de Recuperação de Capital**: mover para dentro do Accordion 3 (Performance), no final, ou para um quarto accordion opcional `🎯 Recuperação de Capital` se ficar pesado dentro de Performance.

### `mem://finance/lucro-real-ajustado-quarta-camada.md`

Atualizar a seção **"Layout obrigatório do popover"** para refletir o novo padrão:

```
1. Header educacional compacto (1 linha + tooltip)
2. Grid 2 colunas:
   - Card A: 💰 Lucro se sacar tudo hoje (Patrimônio)
   - Card B: 🎯 Lucro Real Ajustado (com chips e badge de paridade)
3. Accordions colapsados (defaultOpen=false):
   - 🏦 Lucro em Caixa
   - 📐 Composição do Patrimônio
   - 📊 Detalhe da Performance (inclui Status de Recuperação)
```

Adicionar regra:
> **Proibido** abrir accordions por padrão. O popover deve caber em uma leitura curta sem rolagem, com os 2 cards principais como entrada e os accordions como caminho de auditoria.

---

## Resultado esperado

- **Antes**: 5+ seções verticais, mesmas informações em 3 lugares, popover com rolagem longa
- **Depois**: 2 cards de leitura imediata + 3 trilhas de auditoria sob demanda
- **Benefícios**: 
  - Leitura rápida do "estou ganhando?" em <2 segundos
  - Detalhes preservados para auditoria
  - Eliminação da sensação de redundância
  - Mantém didática (Card A vs Card B sempre visíveis)

## Riscos / mitigações

- **Risco**: Usuário acostumado pode estranhar accordions fechados → mitigado pelos previews de valor no trigger (vê o número sem expandir)
- **Risco**: Parity badge no Card B pode ficar redundante com o totalizador da Composição → manter ambos pois respondem a perguntas distintas (badge = "está convergindo?", totalizador = "qual a fórmula?")

