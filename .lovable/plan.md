
# Carrossel no slot da "Posição de Capital" (Financeiro)

## Objetivo

Voltar o slot atual ao gráfico clean da **Posição de Capital** (donut + lista de saldos, como na imagem) e permitir alternar, **no mesmo espaço**, para o novo painel **Capital Próprio** (Aportes vs Liquidações + composição do patrimônio) que acabei de criar.

A navegação acontece dentro do próprio card, por:
- **Setas laterais** (◀ ▶) discretas.
- **Dots** indicando a página atual (2 dots).
- **Swipe** com o dedo / arrasto do mouse (gesto horizontal).
- **Atalho de teclado**: setas ← →, quando o card está em foco.

A transição é uma animação de "passar página" (slide horizontal), suave.

## O que muda

### UI
- O `PosicaoCapitalCard` (novo) **deixa de aparecer fora** do slot.
- O slot que hoje renderiza só `<PosicaoCapital />` passa a renderizar um carrossel com 2 slides:
  1. **Slide 1 — Posição de Capital** (componente atual, inalterado — visual clean original).
  2. **Slide 2 — Capital Próprio** (novo card, com Aportes/Liquidações/Composição).
- Header do carrossel: título do slide ativo à esquerda, controles à direita (setas + dots).
- Mesma altura entre slides para o card não "pular" ao trocar (altura mínima fixa).

### Comportamento
- Estado inicial: Slide 1 (Posição de Capital — como era antes).
- Persistência: a página ativa é salva em `localStorage` por workspace, então quem prefere ver Capital Próprio mantém ao recarregar.
- Loop: setas avançam/retornam ciclicamente entre os 2 slides.
- Acessibilidade: `role="region"` + `aria-roledescription="carousel"`, setas com `aria-label`, dots como botões.

## Como construir

### Novo componente
`src/components/financeiro/PosicaoCapitalCarousel.tsx`
- Wrapper genérico que recebe `slides: { id, title, content }[]`.
- Usa **embla-carousel-react** (já presente via shadcn `@/components/ui/carousel`), que dá swipe/drag nativo, transição suave, teclado e API para botões/dots.
- Renderiza:
  - Header com título do slide ativo + setas + dots.
  - Viewport com slides em `flex` e `overflow-hidden`.
  - Slide ativo controla a altura (sem layout shift entre páginas).

### Integração em `Financeiro.tsx`
- Remover o bloco que renderiza `<PosicaoCapitalCard ... />` acima do grid (ele deixa de existir como card solto).
- No grid, substituir:
  ```tsx
  <PosicaoCapital ... />
  ```
  por:
  ```tsx
  <PosicaoCapitalCarousel
    slides={[
      { id: "patrimonio", title: "Posição de Capital", content: <PosicaoCapital ... /> },
      { id: "capital",    title: "Capital Próprio",    content: <PosicaoCapitalCard ... /> },
    ]}
    storageKey={`fin:posicao-capital:${workspaceId}`}
  />
  ```
- Mantém todas as props que já são calculadas (saldos, freebet, aportes, etc.) — nenhuma lógica de dados muda.

### Estilo
- Setas: ícones `ChevronLeft`/`ChevronRight` (lucide), botões `ghost size-icon`, opacidade baixa em repouso, plena em hover, sem mudar a borda do card.
- Dots: 2 bolinhas pequenas (`h-1.5 w-1.5`), a ativa em `bg-primary`, inativa em `bg-muted-foreground/30`.
- Transição: `transform: translateX` controlado pelo embla, ~250ms ease.
- Cursor `grab` / `grabbing` no viewport.

### Estados de borda
- Loading dos dados do slide 2 (`posicaoCapital.loading`) é tratado dentro do próprio `PosicaoCapitalCard` (já tem skeleton). O carrossel não precisa saber.
- Em telas pequenas (mobile), setas continuam visíveis mas o swipe é a forma natural.

## Fora do escopo
- Não criar um terceiro slide.
- Não alterar dados/cálculos de nenhum dos dois componentes.
- Não mexer em outras áreas do Financeiro.

## Validação
1. Abrir `/financeiro` → slot mostra o donut **Posição de Capital** (estado limpo, como na imagem).
2. Clicar na seta direita / arrastar para a esquerda / pressionar `→` → desliza para **Capital Próprio**.
3. Recarregar a página → volta ao slide que estava antes.
4. Conferir que altura do card não "pula" entre slides.
5. Conferir em mobile que swipe funciona e setas continuam visíveis e clicáveis.
