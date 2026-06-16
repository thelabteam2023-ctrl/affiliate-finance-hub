# Refatorar Composição de Custos: Popover → Colapsável Inline

## Objetivo
Replicar exatamente o padrão da **Posição de Capital** (`src/components/caixa/PosicaoCapital.tsx`) na **Composição de Custos** (`src/components/financeiro/ComposicaoCustosCard.tsx`). Hoje, ao clicar na seta lateral (▸) de uma categoria como "Operadores", abre um **Popover lateral flutuante**. Queremos substituir por um **painel colapsável inline** que se expande abaixo da linha clicada, mostrando a composição (ex.: lista de operadores).

## Comportamento alvo (igual ao PosicaoCapital)
- A linha inteira da categoria fica clicável (não só a seta).
- Clicar alterna `expandedSegment`: abre uma única categoria por vez (clicar de novo fecha).
- A seta `ChevronRight` gira 90° quando expandida (`rotate-90`).
- O painel expandido aparece logo abaixo da linha, com:
  - Borda lateral colorida (`borderLeft: 2px solid <color>`).
  - Header com label "Composição de {categoria}".
  - Lista de itens (nome + valor + % do segmento + barra de progresso).
  - Linha "Total" no rodapé.
- Donut e linha sincronizam estado de hover/active (já existe `activeSegment` — manter).

## Mudanças no arquivo `src/components/financeiro/ComposicaoCustosCard.tsx`

### 1. State novo
Adicionar `const [expandedSegment, setExpandedSegment] = useState<string | null>(null);` ao lado do `activeSegment`.

### 2. Handler
```ts
const handleToggle = (name: string) => {
  setExpandedSegment(prev => prev === name ? null : name);
};
```

### 3. Remover imports não usados
- Remover `Popover, PopoverContent, PopoverTrigger` de `@/components/ui/popover`.
- Manter `ChevronRight` (será reusado com rotação).

### 4. Refatorar a linha de categoria (`sortedCategorias.map(...)`)
- Envolver o `<div>` atual num wrapper `<div className="flex flex-col">` para acomodar o painel inline embaixo.
- Adicionar `onClick={() => temDetalhes && handleToggle(cat.name)}` no div da linha (e `cursor-pointer` quando `temDetalhes`).
- A seta `ChevronRight` agora apenas indica estado: aplicar `cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")`.
- Remover totalmente o bloco `<Popover>...</Popover>`.

### 5. Painel inline (após a linha)
Renderizar quando `isExpanded && temDetalhes`:
```tsx
{isExpanded && (
  <div
    style={{
      animation: 'expand-down 0.2s ease-out forwards',
      background: 'rgba(22, 27, 39, 0.4)',
      borderLeft: `2px solid ${color}`,
    }}
    className="mt-1 mb-2 mx-[10px] rounded-r-lg overflow-hidden"
  >
    <div className="p-3 border-l border-white/5 bg-white/[0.02]">
      <div className="flex items-center justify-between mb-3 px-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Composição de {cat.name}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {detalhes.items.length} {detalhes.items.length === 1 ? "item" : "itens"}
        </span>
      </div>

      <div className="space-y-0.5 max-h-[260px] overflow-y-auto">
        {detalhes.items.map((item, idx) => (
          <DetalheItem
            key={idx}
            nome={item.nome}
            valor={item.valor}
            total={detalhes.total}
            formatCurrency={formatCurrency}
            color={detalhes.color}
            hasCrypto={item.hasCrypto}
            valorUSD={item.valorUSD}
          />
        ))}
      </div>

      <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between px-2">
        <span className="text-[11px] font-medium text-[var(--text-faint)]">Total</span>
        <span className="text-[12px] font-semibold text-[var(--text-primary)] tabular-nums">
          {formatCurrency(detalhes.total)}
        </span>
      </div>
    </div>
  </div>
)}
```
- Reusa o `DetalheItem` que já existe no arquivo (sem duplicar lógica).
- Mantém os agrupamentos preservados em `getDetalhesForCategoria` (Operadores tradicionais + RH ficam juntos, ordenados por valor — comportamento já existente).

### 6. Animação `expand-down`
Verificar se o keyframe `expand-down` já está definido globalmente (é usado em PosicaoCapital). Se não houver, ele já funciona porque está no CSS global; nenhuma ação extra necessária. Caso esteja faltando no projeto, o painel ainda aparece (sem animação), mas o keyframe está presente porque PosicaoCapital o usa em produção.

## Não muda
- `CustoSustentacaoCard.tsx`: o usuário se refere ao card **Composição de Custos** (screenshot mostra "Composição de Custos" com Operadores, Infraestrutura), não ao Custo de Sustentação. Esse arquivo fica intocado.
- Lógica de cálculo (`getDetalhesForCategoria`, `hasDetalhes`) permanece igual.
- Donut SVG, comparativo "Período Atual / Anterior", agrupamentos e cores: sem mudanças.
- `Financeiro.tsx`: sem mudanças (props do card permanecem).

## Validação
- Build TS limpo.
- Visualmente: clicar na linha "Operadores" expande inline (não abre Popover lateral). Seta rotaciona. Clicar novamente fecha. Apenas uma categoria expandida por vez.
- Donut + linha continuam sincronizados em hover.
