
# Enxugar formulário de Arbitragem (Surebet)

Três mudanças focadas em reduzir poluição visual, sem tocar em motor de cálculo, ledger ou RPCs.

---

## 1. Explorador → ícone 📅 dentro do campo Evento

**Hoje:** botão "Explorador" no header, ao lado de "Estratégia".
**Depois:** ícone de calendário discreto encostado à direita do input "Evento". Clica → abre o mesmo Popover atual.

**Arquivos:**
- `src/components/apostas/BetFormHeaderV2.tsx`
  - Adicionar prop opcional `eventoAdornment?: React.ReactNode` (renderiza absolutamente posicionado dentro do wrapper do input Evento, com `pr-8` no input).
  - Remover/limpar a prop `headerAction` da área do header (ou deixar opcional, mas não usar mais).
- `src/components/surebet/SurebetModalRoot.tsx`
  - Substituir `headerAction={<ExploradorEventoPicker .../>}` por `eventoAdornment={<ExploradorEventoPicker .../>}`.
- `src/components/surebet/ExploradorEventoPicker.tsx`
  - Aceitar prop `variant?: "button" | "icon"` (default `button`).
  - No `variant="icon"`: trigger vira `<Button variant="ghost" size="icon" className="h-6 w-6">` com `<CalendarDays className="h-3.5 w-3.5"/>` e tooltip "Importar jogo do Explorador".

---

## 2. Toggles "Mostrar comissões" e "Arredondar" → menu ⚙

**Hoje:** dois toggles sempre visíveis no rodapé da tabela (`SurebetTableFooter`).
**Depois:** ícone de engrenagem no canto direito do footer abre um Popover compacto com os mesmos controles.

**Arquivos:**
- `src/components/surebet/SurebetTableFooter.tsx`
  - Remover o bloco de toggles inline (linhas ~110-145).
  - Substituir por `<Popover>` com trigger `<Button variant="ghost" size="icon"><Settings2 className="h-4 w-4"/></Button>`.
  - `PopoverContent` (w-64, align="end") contém:
    - Switch "Mostrar comissões" + label.
    - Switch "Arredondar" + input numérico (mantém lógica atual `arredondarValor`).
  - Manter exatamente as mesmas props e handlers (zero mudança de comportamento; só reposiciona UI).

---

## 3. "Cancelar" → "Limpar"

**Hoje:** botão "Cancelar" fecha a janela.
**Depois:** botão "Limpar" reseta todos os campos do formulário sem fechar a janela. (Em modo edição, o botão é ocultado — não faz sentido limpar uma operação existente.)

**Arquivos:**
- `src/components/surebet/SurebetModalRoot.tsx` (linhas ~2572-2575)
  - Trocar texto "Cancelar" → "Limpar".
  - Ícone `<Eraser className="h-4 w-4 mr-1" />`.
  - `onClick`: chamar um novo `handleLimparFormulario()` que reseta os state setters principais do form (esporte→"Futebol", evento→"", mercado→"", estrategia→null, modelo→"1-2", odds→estado inicial de 2 pernas vazias, observacoes→"", contexto_operacional→null, dataAposta→agora). Toast "Formulário limpo".
  - Esconder se `isEditing` (já que limpar destruiria a edição em andamento por engano).
  - Manter fechamento da janela apenas pelo X do header (já existe) e pelo onSuccess.

**Não mexer:**
- AlertDialog interno (linha 2565) mantém "Cancelar" — é o cancelar do dialog de confirmação de exclusão, comportamento padrão shadcn.

---

## Validação
- `tsc` limpo.
- Abrir form de Arbitragem: header sem botão Explorador; campo Evento mostra 📅 à direita; clicar abre o picker; importar jogo preenche Esporte/Evento/Data.
- Footer: toggles sumiram; engrenagem abre popover; alternar Mostrar comissões e Arredondar funcionam igual.
- Botão "Limpar" reseta tudo sem fechar; em edição, botão não aparece.

## Fora do escopo
- Outras sugestões anteriores (badges RASCUNHO/COMPLETO, labels-as-placeholder, fundir colunas 🎯/D, KPIs do rodapé). Ficam para próxima rodada se você aprovar.
