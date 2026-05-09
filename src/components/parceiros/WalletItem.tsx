import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { WalletDisplayItem } from "../wallets/WalletDisplayItem";

interface WalletItemProps {
  wallet: {
    id: string;
    exchange?: string;
    network: string;
    endereco: string;
    moeda?: string[];
  };
  variant?: "card" | "list";
}

export function WalletItem({ wallet, variant = "card" }: WalletItemProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(wallet.endereco);
    setCopied(true);
    toast({ title: "Endereço copiado!" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex items-center justify-between gap-2 bg-accent/30 rounded-lg group ${variant === "card" ? "p-2.5" : "px-3 py-2"}`}>
      <WalletDisplayItem
        nickname={wallet.exchange}
        network={wallet.network}
        address={wallet.endereco}
        size="sm"
        showIcon={false}
        variant="list"
        className="flex-1"
      />
      <button
        onClick={copyToClipboard}
        className="shrink-0 p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
        title="Copiar endereço"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        )}
      </button>
    </div>
  );
}
