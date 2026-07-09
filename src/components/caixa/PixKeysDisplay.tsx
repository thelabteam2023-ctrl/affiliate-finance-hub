import { useState } from "react";
import { Copy, Check, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface PixKeyItem {
  tipo: string;
  chave: string;
}

interface PixKeysDisplayProps {
  keys?: PixKeyItem[] | null;
  /** fallback legacy field `pix_key` (string) */
  legacyKey?: string | null;
  className?: string;
}

const TIPO_LABEL: Record<string, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  telefone: "Telefone",
  aleatoria: "Aleatória",
};

function inferTipo(chave: string): string {
  const s = chave.trim();
  if (/^\d{11}$|^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(s)) return "cpf";
  if (/^\d{14}$|^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(s)) return "cnpj";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "email";
  if (/^\+?\d[\d\s()-]{7,}$/.test(s)) return "telefone";
  return "aleatoria";
}

export function PixKeysDisplay({ keys, legacyKey, className }: PixKeysDisplayProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const normalized: PixKeyItem[] = (() => {
    const list: PixKeyItem[] = [];
    if (Array.isArray(keys)) {
      for (const k of keys) {
        if (k && typeof k.chave === "string" && k.chave.trim()) {
          list.push({ tipo: k.tipo || inferTipo(k.chave), chave: k.chave.trim() });
        }
      }
    }
    if (list.length === 0 && legacyKey && legacyKey.trim()) {
      list.push({ tipo: inferTipo(legacyKey), chave: legacyKey.trim() });
    }
    return list;
  })();

  const copy = async (chave: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(chave);
      setCopiedIdx(idx);
      toast.success("Chave PIX copiada");
      setTimeout(() => setCopiedIdx((v) => (v === idx ? null : v)), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className={"mt-2 rounded-md border border-border/50 bg-muted/20 p-2 " + (className ?? "")}>
      <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <KeyRound className="h-3 w-3" />
        Chaves PIX
      </div>
      {normalized.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-1">
          Nenhuma chave PIX cadastrada para esta conta.
        </p>
      ) : (
        <ul className="space-y-1">
          {normalized.map((k, idx) => (
            <li
              key={`${k.tipo}-${idx}`}
              className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/30 transition-colors"
            >
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                {TIPO_LABEL[k.tipo] ?? k.tipo.toUpperCase()}
              </Badge>
              <span className="flex-1 min-w-0 truncate font-mono text-xs text-foreground">
                {k.chave}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => copy(k.chave, idx)}
                title="Copiar chave PIX"
              >
                {copiedIdx === idx ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
