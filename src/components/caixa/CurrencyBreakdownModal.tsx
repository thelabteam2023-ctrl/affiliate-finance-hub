import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
 import { getCurrencySymbol, formatCurrencyValue } from "@/types/currency";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
 import { Copy, CheckCircle2, Bitcoin } from "lucide-react";
 import { useState, useMemo } from "react";
 import { useCotacoes } from "@/hooks/useCotacoes";
import { toast } from "sonner";

interface CurrencyBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: string;
  currency: string;
  workspaceId: string | null;
  filterCoin?: string | null;
}

export function CurrencyBreakdownModal({ isOpen, onClose, category, currency, workspaceId }: CurrencyBreakdownModalProps) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const { getCryptoUSDValue, cryptoPrices } = useCotacoes();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['currency-breakdown', category, currency, workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      let result: any[] = [];

      if (category === "Bookmakers" || category === "Broker") {
        const isBroker = category === "Broker";
        const { data } = await supabase
          .from("bookmakers")
          .select("nome, saldo_atual, moeda, parceiro_id")
          .eq("workspace_id", workspaceId)
          .eq("moeda", currency)
          .eq("is_broker_account", isBroker)
          .in("status", ["ativo", "limitada", "AGUARDANDO_SAQUE"]);
        
        if (data && data.length > 0) {
          const partnerIds = data.map(d => d.parceiro_id).filter(Boolean) as string[];
          const { data: partners } = await supabase
            .from("parceiros")
            .select("id, nome")
            .in("id", partnerIds);
            
          result = data.map(d => ({
            nome: d.nome,
            parceiro: partners?.find(p => p.id === d.parceiro_id)?.nome || 'N/A',
            valor: d.saldo_atual || 0,
            type: 'bookmaker'
          }));
        }
      } else if (category === "Wallets Parceiros" || (category === "Caixa Operacional" && currency === "CRYPTO")) {
        const isCaixa = category === "Caixa Operacional";
        
        const { data } = await supabase
          .from("v_saldo_parceiro_wallets")
          .select("exchange, saldo_coin, saldo_usd, parceiro_nome, parceiro_id, wallet_id, endereco, coin")
          .eq("workspace_id", workspaceId);
        
        const { data: partners } = await supabase
          .from("parceiros")
          .select("id, is_caixa_operacional")
          .eq("workspace_id", workspaceId);
        
        const filtered = data?.filter(d => {
          const p = partners?.find(p => p.id === d.parceiro_id);
          return isCaixa ? p?.is_caixa_operacional === true : p?.is_caixa_operacional === false;
        }) || [];

        const grouped: Record<string, any> = {};
        filtered.forEach(d => {
          const key = d.wallet_id || d.exchange || 'wallet';
          if (!grouped[key]) {
            grouped[key] = {
              nome: d.exchange || 'Wallet',
              parceiro: d.parceiro_nome || 'N/A',
              valor: 0,
              endereco: d.endereco,
              coins: [],
              type: 'wallet'
            };
          }
           const currentCoinUsd = getCryptoUSDValue(d.coin, d.saldo_coin || 0, d.saldo_usd || 0);
           grouped[key].valor += currentCoinUsd;
          
          const existingCoin = grouped[key].coins.find((c: any) => c.coin === d.coin);
          if (existingCoin) {
             existingCoin.quantidade += d.saldo_coin || 0;
             existingCoin.valor += currentCoinUsd;
          } else {
            grouped[key].coins.push({
              coin: d.coin,
               quantidade: d.saldo_coin || 0,
               valor: currentCoinUsd
            });
          }
        });
        
        result = Object.values(grouped);
      } else if (category === "Contas Parceiros" || category === "Caixa Operacional") {
        const isCaixa = category === "Caixa Operacional";
        
        const { data } = await supabase
          .from("v_saldo_parceiro_contas")
          .select("banco, saldo, parceiro_nome, parceiro_id, moeda")
          .eq("workspace_id", workspaceId)
          .eq("moeda", currency);
        
        const { data: partners } = await supabase
          .from("parceiros")
          .select("id, is_caixa_operacional")
          .eq("workspace_id", workspaceId);

        result = data
          ?.filter(d => {
            const p = partners?.find(p => p.id === d.parceiro_id);
            return isCaixa ? p?.is_caixa_operacional === true : p?.is_caixa_operacional === false;
          })
          .map(d => ({
            nome: d.banco || 'Conta',
            parceiro: d.parceiro_nome || 'N/A',
            valor: d.saldo || 0,
            type: 'account'
          })) || [];
      }

      return result.sort((a, b) => b.valor - a.valor);
    },
    enabled: isOpen && !!workspaceId,
  });

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    toast.success("Endereço copiado!");
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const formatAddress = (addr: string) => {
    if (!addr) return "";
    if (addr.length <= 15) return addr;
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 5)}`;
  };

  const totalConsolidado = items.reduce((sum, item) => sum + item.valor, 0);
   const isCryptoCategory = category === "Wallets Parceiros" || (category === "Caixa Operacional" && currency === "CRYPTO");
   const symbol = (currency === "CRYPTO" || isCryptoCategory) ? "$" : getCurrencySymbol(currency);
   const displayCurrency = (currency === "CRYPTO" || isCryptoCategory) ? "USD" : currency;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-[#0F1115] border-white/10 text-white p-0 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh] gap-0">
        <div className="p-6 border-b border-white/5 bg-white/[0.02]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <span className="text-primary">{displayCurrency}</span>
              <span className="text-white/40 font-light">—</span>
              <span className="font-mono">{symbol} {totalConsolidado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-6 max-h-[calc(100vh-280px)] sm:max-h-[calc(90vh-180px)]">
          <div className="py-6 space-y-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 rounded-xl border border-white/5 bg-white/[0.01] space-y-3">
                  <div className="flex justify-between">
                    <Skeleton className="h-5 w-32 bg-white/5" />
                    <Skeleton className="h-5 w-24 bg-white/5" />
                  </div>
                  <Skeleton className="h-4 w-48 bg-white/5" />
                </div>
              ))
            ) : items.length > 0 ? (
              items.map((item, index) => {
                const percentual = totalConsolidado > 0 ? (item.valor / totalConsolidado) * 100 : 0;
                const isCrypto = item.type === 'wallet';

                return (
                  <div key={index} className="group relative">
                    <div className="flex flex-col gap-1 p-4 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10 transition-all duration-200">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="font-bold text-lg text-white group-hover:text-primary transition-colors truncate">
                            {item.nome}
                          </span>
                          <span className="text-white/40 text-sm font-medium leading-tight">
                            {item.parceiro}
                          </span>
                        </div>
                        <div className="flex flex-col items-end shrink-0">
                          <span className="font-mono font-bold text-lg text-white">
                            {symbol} {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 text-white/40">
                            {percentual.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {isCrypto && item.endereco && (
                        <div className="mt-3 pt-3 border-t border-white/5 space-y-3">
                          <div className="flex items-center gap-2 text-primary/80 bg-primary/5 px-3 py-2 rounded-lg w-fit border border-primary/10">
                            <code className="text-xs font-mono tracking-wider">
                              {formatAddress(item.endereco)}
                            </code>
                            <button 
                              onClick={() => handleCopy(item.endereco)}
                              className="p-1 hover:bg-white/10 rounded transition-colors"
                              title="Copiar endereço"
                            >
                              {copiedAddress === item.endereco ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {item.coins && item.coins.length > 0 && (
                            <div className="grid grid-cols-1 gap-1.5 pl-2">
                              {item.coins.map((coin: any, cIdx: number) => (
                                <div key={cIdx} className="grid grid-cols-[60px_1fr_auto] items-center gap-4 text-xs py-1.5 border-b border-white/[0.02] last:border-0">
                                  <span className="font-bold text-white/50 uppercase tracking-wider">{coin.coin}</span>
                                  <span className="font-mono text-white/40 text-left">
                                    {coin.quantidade.toLocaleString('pt-BR', { 
                                      minimumFractionDigits: coin.quantidade < 1 ? 8 : 2,
                                      maximumFractionDigits: coin.quantidade < 1 ? 8 : 2 
                                    })}
                                  </span>
                                  <span className="font-mono font-medium text-white/80">
                                    $ {coin.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                  <span className="text-white/20 text-2xl">?</span>
                </div>
                <p className="text-white/40 font-medium">Nenhum registro encontrado para esta moeda.</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 bg-white/[0.04] border-t border-white/10 flex items-center justify-between shrink-0">
          <span className="text-white/40 text-sm font-medium uppercase tracking-wider">Total Consolidado</span>
          <div className="flex flex-col items-end">
            <span className="text-2xl font-mono font-bold text-white">
              {symbol} {totalConsolidado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
