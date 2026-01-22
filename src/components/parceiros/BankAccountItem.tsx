import { Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BankAccountItemProps {
  conta: {
    id: string;
    banco: string;
    pix_key?: string;
    pix_keys?: Array<{ tipo: string; chave: string }>;
  };
  variant?: "card" | "list";
  showSensitiveData?: boolean;
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

export function BankAccountItem({ conta, variant = "card", showSensitiveData = false }: BankAccountItemProps) {
  const { toast } = useToast();
  
  // Support multiple PIX keys from JSONB column
  const pixKeys = conta.pix_keys?.filter(k => k.tipo && k.chave) || 
    (conta.pix_key ? [{ tipo: 'CPF', chave: conta.pix_key }] : []);

  if (pixKeys.length === 0) {
    return (
      <div className={`flex items-center justify-between text-xs bg-accent/30 rounded ${variant === "card" ? "p-2" : "px-2 py-1.5"}`}>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{conta.banco} - Sem PIX</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-1 text-xs bg-accent/30 rounded ${variant === "card" ? "p-2" : "px-2 py-1.5"}`}>
      <p className="font-medium truncate">{conta.banco}</p>
      {pixKeys.map((pixKey, index) => {
        const maskedValue = showSensitiveData ? pixKey.chave : maskPixKey(pixKey.chave, pixKey.tipo);
        return (
          <div key={index} className="flex items-center justify-between">
            <p className={`truncate ${variant === "list" ? "max-w-[200px]" : ""}`}>
              <span className="text-muted-foreground">PIX {pixKey.tipo}: </span>
              <span className="font-mono">{maskedValue}</span>
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(pixKey.chave);
                toast({ title: "PIX copiado!" });
              }}
              className="ml-2 p-1 hover:bg-accent rounded transition-colors"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
