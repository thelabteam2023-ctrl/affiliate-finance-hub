import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, Copy, Check, ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { SwapCryptoDialog } from "@/components/caixa/SwapCryptoDialog";

interface CryptoWalletCardProps {
  wallet: {
    label?: string;
    moeda: string[];
    network: string;
    endereco: string;
    exchange?: string;
    saldo?: number;
    saldoCoin?: string;
  };
  parceiroId?: string | null;
}

export function CryptoWalletCard({ wallet, parceiroId }: CryptoWalletCardProps) {
  const [copied, setCopied] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const { toast } = useToast();
  
  const truncateAddress = (addr: string) => {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
  };

  const formatExchangeName = (name: string) => {
    return name
      .split(/[-\s]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
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
    <>
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
              <div className="flex flex-col min-w-0">
                <h3 className="font-semibold text-foreground truncate">
                  {wallet.label || formatExchangeName(wallet.exchange || "Wallet")}
                </h3>
                {wallet.label && wallet.exchange && (
                  <p className="text-xs text-muted-foreground truncate">
                    {formatExchangeName(wallet.exchange)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <div className="flex items-center gap-2">
                {parceiroId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSwapOpen(true);
                    }}
                    title="Swap Crypto"
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                  </Button>
                )}
                <Badge variant="outline" className="bg-accent/20 text-accent-foreground uppercase text-xs">
                  {wallet.network}
                </Badge>
              </div>
              {typeof wallet.saldo === "number" && (
                <div className="flex items-center gap-1.5">
                  <Wallet className="w-3 h-3 text-muted-foreground" />
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      wallet.saldo > 0
                        ? "text-success"
                        : wallet.saldo < 0
                        ? "text-destructive"
                        : "text-foreground"
                    }`}
                  >
                    {wallet.saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 })} {wallet.saldoCoin || "USDT"}
                  </span>
                </div>
              )}
            </div>
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

      {parceiroId && (
        <SwapCryptoDialog
          open={swapOpen}
          onClose={() => setSwapOpen(false)}
          onSuccess={() => setSwapOpen(false)}
          caixaParceiroId={parceiroId}
        />
      )}
    </>
  );
}
