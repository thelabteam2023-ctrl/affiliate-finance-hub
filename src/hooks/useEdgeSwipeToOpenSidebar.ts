import { useEffect } from "react";

/**
 * Detecta swipe a partir da borda esquerda da tela em dispositivos touch
 * e dispara `onOpen` (tipicamente abre a sidebar mobile).
 *
 * Regras:
 * - Touch deve começar nos primeiros 20px da borda esquerda
 * - Movimento horizontal mínimo de 50px
 * - Movimento predominantemente horizontal (|dx| > |dy| * 1.5)
 * - Ignora se houver modal/sheet aberto (deixa o gesto nativo)
 */
export function useEdgeSwipeToOpenSidebar(
  enabled: boolean,
  onOpen: () => void,
) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const EDGE_PX = 20;
    const THRESHOLD_PX = 50;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const hasOpenOverlay = () =>
      !!document.querySelector(
        '[role="dialog"][data-state="open"],[data-radix-popper-content-wrapper]'
      );

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX > EDGE_PX) return;
      if (hasOpenOverlay()) return;
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dx > THRESHOLD_PX && dx > dy * 1.5) {
        tracking = false;
        onOpen();
      } else if (dy > 30 && dy > Math.abs(dx)) {
        // gesto vertical (scroll) — abortar
        tracking = false;
      }
    };

    const onTouchEnd = () => {
      tracking = false;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, onOpen]);
}