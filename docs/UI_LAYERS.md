# Arquitetura de Camadas da Interface (z-index)

## Escala canônica

Definida em `src/lib/z-layers.ts` e exposta como classes Tailwind (`z-floating`, `z-overlay`, ...).

| Camada     | Valor | Uso |
| ---------- | ----- | --- |
| `base`     | 0     | conteúdo normal |
| `sticky`   | 20    | cabeçalhos de tabela, barras fixas internas |
| `floating` | 30    | FABs globais (Chat, Anotações) |
| `header`   | 40    | topbar da aplicação |
| `overlay`  | 50    | Dialog, Sheet, Drawer, AlertDialog |
| `popper`   | 60    | Select, Popover, Tooltip, DropdownMenu |
| `toast`    | 70    | notificações |

## Contratos obrigatórios

1. **FAB nunca acima de overlay.** Botões flutuantes usam `z-floating` (30) e são
   removidos automaticamente da tela enquanto existir qualquer overlay modal aberto
   (hook `useOverlayPresence`). Isso impede que cubram ações críticas como
   "Enviar", "Salvar" ou "Confirmar".
2. **Proibido `z-[9999]` e afins.** Qualquer nova camada deve ser adicionada à escala.
3. **Ações críticas no fluxo, não sobrepostas.** Botões de envio/confirmação devem
   ficar em uma linha de ação própria, com rótulo textual — evitar
   `absolute bottom-x right-x` sobre inputs.
4. **Áreas seguras.** Containers de scroll de página que convivem com os FABs devem
   usar `.safe-bottom-right` / `.safe-bottom` (definidos em `src/index.css`) para
   reservar o gabarito de 88px do canto inferior direito.

## Como validar

Teste de fumaça em `tests/ui/floating-safe-area.spec.md` (roteiro manual/Playwright):
abrir a ocorrência na Central de Operações, digitar uma atualização e enviar em
1280x800, 1366x768 @125% e 390x844.