/**
 * Escala canônica de camadas (z-index) do sistema.
 *
 * Regra de ouro: NENHUM elemento flutuante (FAB) pode ficar acima de um overlay
 * modal. Botões de confirmação/envio vivem dentro de overlays e precisam sempre
 * receber o clique do usuário.
 *
 * Ordem: base < sticky < floating < header < overlay < popper < toast
 */
export const Z_LAYERS = {
  base: 0,
  sticky: 20,
  /** FABs globais (Chat, Anotações) — sempre abaixo de overlays */
  floating: 30,
  header: 40,
  /** Sheet, Dialog, Drawer, AlertDialog (Radix) */
  overlay: 50,
  /** Select, Popover, Tooltip, DropdownMenu (poppers do Radix) */
  popper: 60,
  toast: 70,
} as const;

export type ZLayer = keyof typeof Z_LAYERS;

/** Gabarito ocupado pelos FABs no canto inferior direito (px). */
export const FLOATING_SAFE_AREA = {
  bottom: 88,
  right: 88,
} as const;