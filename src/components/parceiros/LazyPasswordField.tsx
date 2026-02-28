import { useState, useCallback } from "react";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface LazyPasswordFieldProps {
  /** Unique cache key for this password */
  cacheKey: string;
  /** The encrypted password value from the database */
  encrypted: string | null | undefined;
  /** Whether the field is masked by a parent toggle (e.g. showSensitiveData) */
  parentMasked?: boolean;
  /** Hook methods from usePasswordDecryption */
  requestDecrypt: (key: string, encrypted: string | null | undefined) => Promise<string>;
  isDecrypted: (key: string) => boolean;
  getCached: (key: string) => string | undefined;
  /** Optional: custom copy handler */
  onCopy?: (text: string) => void;
}

export function LazyPasswordField({
  cacheKey,
  encrypted,
  parentMasked = false,
  requestDecrypt,
  isDecrypted,
  getCached,
  onCopy,
}: LazyPasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState(false);
  const { toast } = useToast();

  const handleReveal = useCallback(async () => {
    if (!encrypted) return;
    if (isDecrypted(cacheKey)) {
      setVisible((v) => !v);
      return;
    }
    setLoading(true);
    try {
      await requestDecrypt(cacheKey, encrypted);
      setVisible(true);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, encrypted, isDecrypted, requestDecrypt]);

  const handleCopy = useCallback(async () => {
    if (!encrypted) return;
    let pwd = getCached(cacheKey);
    if (pwd === undefined) {
      setLoading(true);
      try {
        pwd = await requestDecrypt(cacheKey, encrypted);
      } finally {
        setLoading(false);
      }
    }
    if (!pwd) return;
    if (onCopy) {
      onCopy(pwd);
    } else {
      try {
        await navigator.clipboard.writeText(pwd);
        setCopiedField(true);
        toast({ title: "Copiado!", description: "Senha copiada para a área de transferência" });
        setTimeout(() => setCopiedField(false), 2000);
      } catch {
        toast({ title: "Erro ao copiar", variant: "destructive" });
      }
    }
  }, [cacheKey, encrypted, getCached, requestDecrypt, onCopy, toast]);

  const displayValue = (() => {
    if (parentMasked) return "••••••";
    if (!encrypted) return "";
    if (visible && isDecrypted(cacheKey)) return getCached(cacheKey) || "";
    return "••••••••";
  })();

  return (
    <div className="flex items-center gap-1 mt-0.5">
      <code className="flex-1 text-xs bg-muted px-1.5 py-0.5 rounded truncate">
        {loading ? "..." : displayValue}
      </code>
      {encrypted && !parentMasked && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReveal}
          className="h-6 w-6 p-0 shrink-0"
          disabled={loading}
        >
          {visible && isDecrypted(cacheKey) ? (
            <EyeOff className="h-3 w-3" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="h-6 w-6 p-0 shrink-0"
        disabled={loading || !encrypted}
      >
        {copiedField ? (
          <Check className="h-3 w-3 text-success" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}
