## Objetivo

Aplicar a direção visual selecionada (**Valor hero centralizado** — v2) ao modal Nova Transação, **sem alterar nenhuma regra de negócio, hook, validação, handler de submit ou fluxo dos 4 tipos × 6 sub-fluxos** já implementados nas 5.787 linhas do `CaixaTransacaoDialog.tsx`.

O trabalho é **puramente de camada de apresentação**: substituir componentes de entrada e reorganizar a hierarquia visual, mantendo os mesmos estados, setters, refs, useEffects, queries e RPCs.

## Princípio diretor

> Toda decisão visual nova é um **wrapper** sobre o estado existente. Nenhum `useState`, `useEffect`, `useQuery`, função de validação, fluxo de auto-focus ou handler de submissão é tocado.

## Escopo das mudanças (somente JSX, dentro do `return (...)` a partir da linha 4684)

### 1. Header e tipo de transação
- Título "Nova Transação" + botão fechar (já existem).
- **Substituir** o `<Select>` de `tipoTransacao` por **segmented control de 4 botões** (`APORTE FINANCEIRO | DEPÓSITO | SAQUE | TRANSFERÊNCIA`), ligados ao mesmo setter `setTipoTransacao`. Visual: pill container `bg-muted/30 border border-border rounded-lg p-1`, botão ativo com `bg-card text-foreground shadow-sm`.

### 2. Linha de sub-fluxo + moeda
- Para `APORTE_FINANCEIRO`: manter o toggle `Investidor → Caixa | Caixa → Investidor` (já existe `fluxoAporte`) — apenas redesenhar como **pill control redondo** com seta entre as palavras.
- Para `TRANSFERENCIA`: manter o segmented dos 3 sub-fluxos (já existe) — redesenhar como pill control consistente.
- **Substituir** o `<Select>` de `tipoMoeda` (FIAT/CRYPTO) por **toggle segmentado de 2 botões** no canto direito da mesma linha, ligado ao setter atual.

### 3. Bloco hero do valor
- Reorganizar `Moeda` + `Valor em` numa única zona centralizada:
  - Input de valor com fonte **mono tabular**, `text-5xl`, centralizado, símbolo da moeda à esquerda do número.
  - Label inferior `text-[10px] uppercase tracking-widest text-muted-foreground` com nome completo da moeda selecionada.
- O `<Select>` de moeda específica (USD/BRL/EUR/USDT/BTC...) continua existindo, mas vira um **chip compacto acima do input** (ou abaixo, como sub-label clicável).

### 4. Fluxo da Transação (Origem → Destino)
- Manter exatamente os mesmos componentes que já renderizam Origem/Destino para cada combinação (`InvestidorSelect`, `renderCaixaAccountSelector`, `ParceiroSelect`, `BookmakerSelect`, `WalletCryptoSelect`, `DestinoConfirmadoCard`, etc.).
- Envolvê-los em **dois cards `bg-muted/20 border border-border rounded-xl p-4`** lado a lado, com label `ORIGEM` / `DESTINO` em `text-[10px] uppercase tracking-tight text-muted-foreground`.
- **Seta central animada**: círculo absoluto `w-8 h-8 rounded-full bg-card border border-border` com ícone `ArrowRight text-primary animate-pulse` entre os dois cards.
- Avisos existentes ("Nenhuma conta da empresa na moeda", "Saldo insuficiente", network mismatch) continuam aparecendo dentro do card de destino com o mesmo texto e a mesma lógica condicional — apenas estilizados como `bg-destructive/5 border border-destructive/20 rounded-lg p-3 text-[11px] text-destructive`.

### 5. Detalhes colapsáveis
- Agrupar os atuais campos **Data da Transação**, **Tags (opcional)** e **Descrição (opcional)** dentro de um `<Collapsible>` com trigger "Adicionar detalhes (Data, Tags, Descrição)" fechado por padrão.
- Comportamento idêntico, apenas escondidos atrás de um toggle.

### 6. Footer
- Pill de status à esquerda (`bg-amber-500/10 border border-amber-500/20`) refletindo o estado atual da validação ("Aguardando dados", "Pronto para registrar", etc.) — derivada do mesmo `disabled` que já calculamos.
- Botões Cancelar (ghost) + Registrar Transação (primary) à direita — handlers inalterados.

## O que **NÃO** muda

- Nenhum `useState` / `useEffect` / `useRef` / `useMemo` / `useCallback`.
- Nenhuma query ou mutation Supabase.
- Nenhuma função de validação, conversão cambial, snapshot de cotação, lógica de saldo, auto-focus chain, anti-double-submit.
- Nenhum handler (`handleSubmit`, `handleTipoTransacaoChange`, `handleMoedaChange`, etc.).
- Nenhuma prop, nenhum tipo, nenhuma interface.
- Nenhuma regra dos 4 tipos × 6 sub-fluxos × FIAT/CRYPTO.

## Estratégia de execução (3 patches incrementais)

1. **Patch 1** — Header + segmented de tipo + linha sub-fluxo/moeda como toggles. Smoke test: abrir modal, alternar entre os 4 tipos, alternar FIAT↔CRYPTO, confirmar que cada sub-fluxo renderiza os mesmos campos de antes.
2. **Patch 2** — Hero do valor + cards Origem/Destino + seta central. Smoke test: cada um dos 6 sub-fluxos renderiza os seletores corretos dentro dos novos cards; avisos vermelhos aparecem; toggle APORTE↔LIQUIDAÇÃO inverte as colunas.
3. **Patch 3** — Collapsible de detalhes + footer com pill de status. Smoke test: submit funciona em pelo menos um caso por tipo.

Após cada patch, build TypeScript e visual check no preview.

## Tokens semânticos usados (zero hardcoded)

`bg-background`, `bg-card`, `bg-muted`, `border-border`, `text-foreground`, `text-muted-foreground`, `text-primary`, `bg-primary`, `text-destructive`, `bg-destructive/10`, `border-destructive/20`. Verde do "Aporte" usa `text-primary` / `bg-primary/10` (já é o verde do design system).

## Risco

Médio. O arquivo é gigante (5.787 linhas) e o `return (...)` único contém ramificações condicionais densas por tipo×sub-fluxo. Mitigação: 3 patches pequenos com verificação visual entre eles, em vez de uma reescrita única.

## Critério de aceitação

- Os 6 sub-fluxos seguem registrando transações idênticas às de hoje (mesmos campos no INSERT, mesmos eventos no ledger).
- Visual idêntico ao protótipo v2 selecionado.
- Zero regressão em validações, avisos e bloqueios de submit.
- TypeScript build limpo.
