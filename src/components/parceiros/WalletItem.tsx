import { Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  
  const exchangeName = wallet.exchange || wallet.network;
  const formattedName = exchangeName
    .split(/[-\s]/)
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .toUpperCase();
  
  const truncatedAddress = `${wallet.endereco.slice(0, 6)}...${wallet.endereco.slice(-6)}`;

  return (
    <div className={`flex items-center justify-between text-xs bg-accent/30 rounded ${variant === "card" ? "p-2" : "px-2 py-1.5"}`}>
      <div className="flex-1 min-w-0">
        <p className="font-medium">{formattedName}</p>
        {wallet.moeda && wallet.moeda.length > 0 && (
          <p className="text-[10px] text-primary font-semibold">
            {wallet.moeda.join(", ")}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground font-mono">
          {truncatedAddress}
        </p>
      </div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(wallet.endereco);
          toast({ title: "Endereço copiado!" });
        }}
        className="ml-2 p-1 hover:bg-accent rounded transition-colors"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}
