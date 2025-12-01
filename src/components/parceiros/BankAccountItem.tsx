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

const maskPixKey = (chave: string, tipo: string): string => {
  if (!chave) return "•••";
  
  switch (tipo.toUpperCase()) {
    case "CPF":
      // Format: •••.296.•••-••
      const cpf = chave.replace(/\D/g, "");
      if (cpf.length === 11) {
        return `•••.${cpf.slice(3, 6)}.•••-••`;
      }
      return "•••.•••.•••-••";
      
    case "CNPJ":
      // Format: ••.•••.•••/••••-••
      const cnpj = chave.replace(/\D/g, "");
      if (cnpj.length === 14) {
        return `••.${cnpj.slice(2, 5)}.•••/••••-••`;
      }
      return "••.•••.•••/••••-••";
      
    case "EMAIL":
      // Format: u••••@domain.com (show first char and domain)
      const emailParts = chave.split("@");
      if (emailParts.length === 2) {
        return `${emailParts[0].charAt(0)}••••@${emailParts[1]}`;
      }
      return "•••••@•••.•••";
      
    case "PHONE":
    case "TELEFONE":
      // Format: (••) •••••-••34
      const phone = chave.replace(/\D/g, "");
      if (phone.length >= 4) {
        return `(••) •••••-••${phone.slice(-2)}`;
      }
      return "(••) •••••-••••";
      
    case "RANDOM":
    case "RANDOM KEY":
    case "CHAVE ALEATORIA":
      // Format: show first 4 and last 4 chars
      if (chave.length > 8) {
        return `${chave.slice(0, 4)}••••${chave.slice(-4)}`;
      }
      return "••••••••";
      
    default:
      return "•••";
  }
};

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

  const maskedValue = showPix ? pixKey.chave : maskPixKey(pixKey.chave, pixKey.tipo);

  return (
    <div className={`flex items-center justify-between text-xs bg-accent/30 rounded ${variant === "card" ? "p-2" : "px-2 py-1.5"}`}>
      <div className="flex-1 min-w-0">
        <p className={`truncate ${variant === "list" ? "max-w-[200px]" : ""}`}>
          <span className="font-medium">{conta.banco}</span>
          <span className="text-muted-foreground"> - {pixKey.tipo}: </span>
          <span className="font-mono">{maskedValue}</span>
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
