import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value`. The returned reference only updates
 * after `delayMs` has passed without further changes — useful for keeping
 * heavy `useMemo`/`useEffect` work off the input event loop.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}