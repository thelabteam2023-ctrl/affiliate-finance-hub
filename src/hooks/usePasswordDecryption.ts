import { useCallback, useRef, useState } from "react";
import { decryptPassword as decryptPasswordValue } from "@/utils/cryptoPassword";

/**
 * Lazy password decryption hook.
 * Passwords show "••••••••" by default. Decryption only happens on explicit user action.
 */
export function usePasswordDecryption() {
  const [cache, setCache] = useState<Record<string, string>>({});
  const pendingRef = useRef<Set<string>>(new Set());

  /** Request decryption for a given key. Returns the decrypted value or "" on failure. */
  const requestDecrypt = useCallback(async (key: string, encrypted: string | null | undefined): Promise<string> => {
    if (!encrypted) return "";

    // Already cached
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      return cache[key] || "";
    }

    // Already in flight — wait for it
    if (pendingRef.current.has(key)) {
      return "••••••••";
    }

    pendingRef.current.add(key);
    try {
      const decrypted = await decryptPasswordValue(encrypted);
      const value = decrypted || "";
      setCache((prev) => ({ ...prev, [key]: value }));
      return value;
    } catch {
      setCache((prev) => ({ ...prev, [key]: "" }));
      return "";
    } finally {
      pendingRef.current.delete(key);
    }
  }, [cache]);

  /** Check if a key has already been decrypted */
  const isDecrypted = useCallback((key: string): boolean => {
    return Object.prototype.hasOwnProperty.call(cache, key);
  }, [cache]);

  /** Get cached value (returns undefined if not yet decrypted) */
  const getCached = useCallback((key: string): string | undefined => {
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      return cache[key] || "";
    }
    return undefined;
  }, [cache]);

  return {
    requestDecrypt,
    isDecrypted,
    getCached,
  };
}
