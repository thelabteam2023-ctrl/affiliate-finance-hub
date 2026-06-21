## Diagnóstico

Hoje, a janela do formulário de Surebet abre com **largura fixa de 1200px**, definida em `src/lib/windowHelper.ts` na constante `SUREBET_WINDOW_FEATURES`. **Não existe nenhum breakpoint responsivo** que alterne o formulário entre "layout horizontal" e "layout vertical" — o layout é sempre o mesmo. O que muda com a largura é apenas se o conteúdo cabe sem aparecer scroll horizontal ou ficar visualmente apertado.

### Largura mínima real do conteúdo

Somando as larguras fixas declaradas hoje:

**Tabela de pernas (`SurebetExecutionTable.tsx`):**
```text
Perna      32px
Casa      120px (min-w)
Odd        68px
Stake      90px
🎯         24px
Lucro      80px
ROI        56px
Ações      40px
+ paddings  ~96px (px-1.5 por célula × 8)
---------------------
total      ~606px
```

**Header (`BetFormHeaderV2.tsx`, linha 2 — `grid-cols-12`):**
- Esporte (3) | Evento (3) | Mercado (3) | Data (3) — fixo, sem breakpoint
- Para os 4 campos ficarem usáveis (Select + texto), precisa de ~**720–760px** de largura interna útil

**Padding da janela + scrollbar:**
- `p-3 md:p-4` lateral = ~32px
- Scrollbar do navegador = ~16px
- Bordas do popup nativo = ~16px
- Total de "cromo" ≈ **64px**

### Conclusão

| Largura | O que acontece |
|---|---|
| **1200px (atual)** | Folga grande, sobra ~400px |
| **~960–1000px** | Confortável; header e tabela cabem com folga moderada |
| **~820px** | Limite seguro — tabela ainda cabe, header começa a ficar apertado |
| **<800px** | Header (Esporte/Evento/Mercado/Data) fica visualmente apertado; tabela com 4+ pernas pode precisar de scroll horizontal mínimo (já existe `overflow-x-auto`) |
| **<640px** | Quebra visual real do header e estética da tabela |

## Plano de mudança

### 1. Reduzir a largura padrão da janela Surebet
- Arquivo: `src/lib/windowHelper.ts`
- Alterar `SUREBET_WINDOW_FEATURES` de `width=1200` para `width=1000` (recomendado) ou `width=960` (mais compacto).
- A altura continua dinâmica via `calcSurebetWindowHeight(numPernas)` — sem mudança.

### 2. Garantir largura mínima de segurança
- No container raiz da `SurebetModalRoot` (linha 2287, `<div className="relative w-full flex flex-col overflow-hidden">`), opcionalmente adicionar `min-w-[820px]` para que mesmo se o usuário redimensionar manualmente a janela do navegador abaixo disso, o conteúdo não se deforme — o `overflow-x-auto` da tabela já protege o resto.

### 3. Validar visualmente
- Abrir o formulário Surebet com 2, 3 e 4+ pernas após a mudança, conferindo:
  - Header (Esporte/Evento/Mercado/Data) sem truncar labels;
  - Tabela de pernas sem scroll horizontal em 2 e 3 pernas;
  - Footer com totais (Lucro / Stake / ROI) sem quebra estranha.

## Recomendação

Ir direto para **1000px**. É o melhor equilíbrio: ~17% mais compacto que hoje, ainda confortável para 4+ pernas e mantém o header legível. Se quiser ser mais agressivo, **960px** também é seguro; abaixo disso só vale se decidirmos repensar o header.

## Pergunta antes de implementar

Qual largura deseja adotar?
- **1000px** (recomendado — compacto e confortável)
- **960px** (mais compacto, ainda seguro)
- Outro valor (informe)
