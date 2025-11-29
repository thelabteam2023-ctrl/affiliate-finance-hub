import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, Copy, Check } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface CryptoWalletCardProps {
  wallet: {
    moeda: string[];
    network: string;
    endereco: string;
    exchange?: string;
  };
}

export function CryptoWalletCard({ wallet }: CryptoWalletCardProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  
  const truncateAddress = (addr: string) => {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: "Copiado!",
        description: "Endereço copiado para a área de transferência.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar para a área de transferência.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground uppercase">
              {wallet.exchange || "Wallet"}
            </h3>
          </div>
          <Badge variant="outline" className="bg-accent/20 text-accent-foreground uppercase text-xs">
            {wallet.network}
          </Badge>
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Moeda</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {wallet.moeda.map((coin, idx) => (
                <Badge key={idx} className="bg-primary/20 text-primary border-primary/30">
                  {coin}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Endereço</p>
            <p 
              className="text-sm text-foreground font-mono font-semibold mt-1 cursor-pointer hover:text-primary transition-colors flex items-center gap-2"
              onClick={() => copyToClipboard(wallet.endereco)}
              title="Clique para copiar"
            >
              {truncateAddress(wallet.endereco)}
              {copied ? (
                <Check className="w-3 h-3 text-primary" />
              ) : (
                <Copy className="w-3 h-3 opacity-50" />
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
