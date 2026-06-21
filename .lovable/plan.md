## Objetivo

Reduzir a poluição do rodapé do modal Surebet transformando "Limpar" e "Salvar Rascunho" em botões **icon-only**, com ícones mais elegantes e tooltip explicativo. "Registrar Operação" continua como botão principal com texto (CTA da ação).

## Mudanças

Arquivo: `src/components/surebet/SurebetModalRoot.tsx` (rodapé, linhas ~2570–2634).

### 1. Botão "Limpar" → ícone só
- Troca `Eraser` por **`Brush`** (lucide) — visual mais limpo e moderno que a borracha atual.
- `variant="ghost"`, `size="icon"`, classes: `h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted`.
- Envolto em `<Tooltip>` com label "Limpar formulário".
- Remove o texto "Limpar" e o `mr-1` do ícone.

### 2. Botão "Salvar Rascunho" → ícone só
- Troca `FileText` por **`BookmarkPlus`** (quando novo) e **`BookmarkCheck`** (quando `isAtualizandoRascunho`) — comunica melhor "salvar para depois" do que um documento genérico.
- `variant="ghost"`, `size="icon"`, classes: `h-9 w-9 rounded-full text-blue-500 hover:text-blue-400 hover:bg-blue-500/10` (mantém a identidade azul atual).
- Envolto em `<Tooltip>` com label dinâmico: "Atualizar rascunho" ou "Salvar rascunho".
- Mantém `disabled={saving || !temDadosParciais}`.

### 3. Botão "Registrar Operação" inalterado
- Continua com texto (é a ação principal e o usuário não pediu para mexer).
- Opcional: trocar `Save` por **`CheckCircle2`** para reforçar "confirmar" — só aplico se você quiser.

### 4. Ajustes de import
- Em `lucide-react`: remover `Eraser` e `FileText` (se não usados em outro lugar — `FileText` ainda é usado na linha 2184, mantém); adicionar `Brush`, `BookmarkPlus`, `BookmarkCheck`.

### 5. Tooltip
- Usar `Tooltip`, `TooltipTrigger`, `TooltipContent` de `@/components/ui/tooltip` (já presente no projeto). Se já houver um `TooltipProvider` em volta do modal, só envolvo cada botão; caso contrário, adiciono um `TooltipProvider` local no container dos botões.

## Resultado visual

```text
[ 🖌 ]   [ 🔖 ]   [ 💾 Registrar Operação ]
 ghost    ghost    primary (CTA)
```

Rodapé mais leve, hierarquia clara (ações secundárias discretas, CTA dominante), sem perder descobribilidade graças ao tooltip.

## Fora de escopo

- Não altero lógica de `handleSalvarRascunho`, `resetToNewForm`, validações ou estado.
- Não toco no botão "Simples (N)" da operação parcial nem em "Registrar Operação".
