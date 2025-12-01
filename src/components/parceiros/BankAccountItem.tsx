import { useState } from "react";
import { Eye, EyeOff, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BankAccountItemProps {
  conta: {
    id: string;
    banco: string;
    pix_key?: string;
    pix_keys?: Array<{ tipo: string; chave: string }>;
  };
  variant?: "card" | "list";
}

export function BankAccountItem({ conta, variant = "card" }: BankAccountItemProps) {
  const [showPix, setShowPix] = useState(false);
  const { toast } = useToast();
  
  const pixKey = conta.pix_keys?.[0] || (conta.pix_key ? { tipo: 'CPF', chave: conta.pix_key } : null);

  if (!pixKey) {
    return (
      <div className={`flex items-center justify-between text-xs bg-accent/30 rounded ${variant === "card" ? "p-2" : "px-2 py-1.5"}`}>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{conta.banco} - Sem PIX</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between text-xs bg-accent/30 rounded ${variant === "card" ? "p-2" : "px-2 py-1.5"}`}>
      <div className="flex-1 min-w-0">
        <p className={`font-medium truncate ${variant === "list" ? "max-w-[200px]" : ""}`}>
          {conta.banco} - PIX {pixKey.tipo}: {showPix ? pixKey.chave : '***'}
        </p>
      </div>
      <div className="flex items-center gap-1 ml-2">
        <button
          onClick={() => setShowPix(!showPix)}
          className="p-1 hover:bg-accent rounded transition-colors"
        >
          {showPix ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(pixKey.chave);
            toast({ title: "PIX copiado!" });
          }}
          className="p-1 hover:bg-accent rounded transition-colors"
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
