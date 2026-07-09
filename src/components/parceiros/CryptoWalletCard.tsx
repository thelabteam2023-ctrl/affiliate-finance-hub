import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Check, ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { SwapCryptoDialog } from "@/components/caixa/SwapCryptoDialog";
import { WalletDisplayItem } from "../wallets/WalletDisplayItem";

interface CryptoWalletCardProps {
  wallet: {
    label?: string;
    nickname?: string;
    identificacao_wallet?: string;
    moeda: string[];
    network: string;
    endereco: string;
    exchange?: string;
    balances?: Array<{ coin: string; saldo: number; saldoUsd: number }>;
  };
  parceiroId?: string | null;
}

export function CryptoWalletCard({ wallet, parceiroId }: CryptoWalletCardProps) {
  const [copied, setCopied] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const { toast } = useToast();
  
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
          <div className="flex items-start justify-between gap-3 min-w-0">
            <WalletDisplayItem
              label={wallet.label}
              nickname={wallet.nickname}
              identificacao_wallet={wallet.identificacao_wallet}
              exchange={wallet.exchange}
              network={wallet.network}
              address={wallet.endereco}
              size="lg"
              variant="default"
              className="flex-1"
            />
            
            <div className="flex flex-col items-end gap-1.5 shrink-0">
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
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saldo Atual</p>
              <div className="flex flex-col gap-0.5">
                {(wallet.balances && wallet.balances.length > 0) ? (
                  wallet.balances.map((b) => (
                    <span key={b.coin} className="text-lg font-bold text-primary tabular-nums leading-tight">
                      {b.saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                      <span className="ml-1 text-xs font-medium text-muted-foreground">{b.coin}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-lg font-bold text-muted-foreground tabular-nums">
                    0,00
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Moedas Suportadas</p>
              <div className="flex flex-wrap gap-1">
                {wallet.moeda.map((coin, idx) => (
                  <Badge key={idx} variant="outline" className="text-[10px] px-1 py-0 h-4 uppercase">
                    {coin}
                  </Badge>
                ))}
              </div>
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

            <div 
              className="bg-muted/30 rounded-lg p-2 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => copyToClipboard(wallet.endereco)}
              title="Clique para copiar o endereço completo"
            >
              <div className="flex flex-col">
                <span className="text-[9px] text-muted-foreground uppercase font-medium">Endereço da Carteira</span>
                <span className="text-sm font-mono text-foreground break-all leading-tight pr-4">
                  {wallet.endereco}
                </span>
              </div>
              <div className="shrink-0">
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground opacity-50" />
                )}
              </div>
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
