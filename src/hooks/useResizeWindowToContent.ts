import { useEffect, useRef } from 'react';

/**
 * Hook that auto-resizes the browser window to fit its content height.
 * Used in standalone popup windows (Aposta, Surebet) to eliminate dead space.
 * 
 * @param deps - Dependencies that trigger a re-measure (e.g., formKey, loading state)
 */
export function useResizeWindowToContent(deps: any[] = []) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const resize = () => {
      if (!ref.current) return;
      
      const contentHeight = ref.current.scrollHeight;
      // Account for browser chrome (title bar, etc.)
      const chromeHeight = window.outerHeight - window.innerHeight;
      const targetHeight = contentHeight + chromeHeight + 2; // +2 for rounding
      
      // Only shrink or grow to fit, don't exceed screen
      const maxHeight = window.screen.availHeight - 40;
      const finalHeight = Math.min(targetHeight, maxHeight);
      
      if (Math.abs(window.outerHeight - finalHeight) > 10) {
        window.resizeTo(window.outerWidth, finalHeight);
      }
    };

    // Wait for content to render fully
    const timer = setTimeout(resize, 150);
    // Also try after a longer delay for async-rendered content
    const timer2 = setTimeout(resize, 500);

    return () => {
      clearTimeout(timer);
      clearTimeout(timer2);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
