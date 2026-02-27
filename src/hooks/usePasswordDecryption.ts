import { useCallback, useRef, useState } from "react";
import { decryptPassword as decryptPasswordValue } from "@/utils/cryptoPassword";

/**
 * Cacheia a descriptografia por id lógico para evitar mostrar ciphertext na UI
 * quando houver falha temporária de rede/back-end.
 */
export function usePasswordDecryption() {
  const [cache, setCache] = useState<Record<string, string>>({});
  const pendingRef = useRef<Set<string>>(new Set());

  const ensureDecrypted = useCallback(async (key: string, encrypted: string | null | undefined) => {
    if (!encrypted) {
      setCache((prev) => (Object.prototype.hasOwnProperty.call(prev, key) ? prev : { ...prev, [key]: "" }));
      return;
    }

    if (Object.prototype.hasOwnProperty.call(cache, key) || pendingRef.current.has(key)) {
      return;
    }

    pendingRef.current.add(key);
    try {
      const decrypted = await decryptPasswordValue(encrypted);
      setCache((prev) => ({ ...prev, [key]: decrypted || "" }));
    } catch {
      setCache((prev) => ({ ...prev, [key]: "" }));
    } finally {
      pendingRef.current.delete(key);
    }
  }, [cache]);

  const getDecryptedPassword = useCallback((key: string, encrypted: string | null | undefined): string => {
    if (!encrypted) return "";

    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      return cache[key] || "";
    }

    void ensureDecrypted(key, encrypted);
    return "••••••••";
  }, [cache, ensureDecrypted]);

  return {
    getDecryptedPassword,
  };
}
