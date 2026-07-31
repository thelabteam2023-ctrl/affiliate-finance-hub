import { useEffect, useState } from "react";

const OVERLAY_SELECTOR = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

let listeners = new Set<(open: boolean) => void>();
let observer: MutationObserver | null = null;
let currentValue = false;

function compute() {
  const next = !!document.querySelector(OVERLAY_SELECTOR);
  if (next === currentValue) return;
  currentValue = next;
  listeners.forEach((l) => l(next));
}

function ensureObserver() {
  if (observer || typeof document === "undefined") return;
  observer = new MutationObserver(() => compute());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-state", "role"],
  });
  compute();
}

/**
 * Detecta globalmente se existe algum overlay modal (Dialog/Sheet/Drawer do Radix)
 * aberto no documento. Usado para suprimir os botões flutuantes globais e evitar
 * que eles cubram ações críticas (enviar, salvar, confirmar) dentro de modais.
 */
export function useOverlayPresence(): boolean {
  const [hasOpenOverlay, setHasOpenOverlay] = useState(() => {
    if (typeof document === "undefined") return false;
    return !!document.querySelector(OVERLAY_SELECTOR);
  });

  useEffect(() => {
    ensureObserver();
    const listener = (open: boolean) => setHasOpenOverlay(open);
    listeners.add(listener);
    // sync imediato (outro consumidor pode já ter montado o observer)
    setHasOpenOverlay(!!document.querySelector(OVERLAY_SELECTOR));

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && observer) {
        observer.disconnect();
        observer = null;
      }
    };
  }, []);

  return hasOpenOverlay;
}