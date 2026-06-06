import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { SwapCryptoDialog } from "./SwapCryptoDialog";
import ParceiroDialog from "@/components/parceiros/ParceiroDialog";
import { CurrencyBreakdownModal } from "./CurrencyBreakdownModal";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";
import { RefreshCw, Plus, TrendingUp, Info } from "lucide-react";

interface WalletInfo {
  wallet_id: string;
  exchange: string | null;
  coins: Array<{ coin: string; saldo_coin: number; saldo_usd: number }>;
  totalUsd: number;
}

interface ExposicaoCryptoCardProps {
  caixaParceiroId: string | null;
  cryptoPrices: Record<string, number>;
  getCryptoUSDValue: (coin: string, saldoCoin: number, saldoUsd: number) => number;
  formatCurrency: (value: number, currency: string) => string;
  onDataChanged: () => void;
}

export function ExposicaoCryptoCard({
  caixaParceiroId,
  cryptoPrices,
  getCryptoUSDValue,
  formatCurrency,
  onDataChanged,
}: ExposicaoCryptoCardProps) {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [isSwapDialogOpen, setIsSwapDialogOpen] = useState(false);
  const [isParceiroDialogOpen, setIsParceiroDialogOpen] = useState(false);
  const [parceiroCompleto, setParceiroCompleto] = useState<any>(null);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
  const { workspaceId } = useTabWorkspace();

  const fetchWallets = useCallback(async () => {
    if (!caixaParceiroId) return;
    const { data } = await supabase.from("v_saldo_parceiro_wallets").select("*").eq("parceiro_id", caixaParceiroId);
    
    const grouped: Record<string, WalletInfo> = {};
    (data || []).forEach((w: any) => {
      if (!grouped[w.wallet_id]) {
        grouped[w.wallet_id] = { wallet_id: w.wallet_id, exchange: w.exchange, coins: [], totalUsd: 0 };
      }
      if (w.coin) {
        grouped[w.wallet_id].coins.push({ coin: w.coin, saldo_coin: w.saldo_coin || 0, saldo_usd: w.saldo_usd || 0 });
        grouped[w.wallet_id].totalUsd += (w.saldo_usd || 0);
      }
    });
    setWallets(Object.values(grouped));
  }, [caixaParceiroId]);

  const fetchParceiroCompleto = async () => {
    if (!caixaParceiroId) return;
    const { data } = await supabase
      .from("parceiros")
      .select(`
        *,
        contas_bancarias (*),
        wallets_crypto (*)
      `)
      .eq("id", caixaParceiroId)
      .single();
    
    if (data) {
      setParceiroCompleto(data);
      setIsParceiroDialogOpen(true);
    }
  };

  useEffect(() => { fetchWallets(); }, [fetchWallets]);

  // Aggregate coins
  const coinMap: Record<string, { saldo_coin: number; saldo_usd: number }> = {};
  wallets.forEach(w => w.coins.forEach(c => {
    if (!coinMap[c.coin]) coinMap[c.coin] = { saldo_coin: 0, saldo_usd: 0 };
    coinMap[c.coin].saldo_coin += c.saldo_coin;
    coinMap[c.coin].saldo_usd += c.saldo_usd;
  }));

  const coinEntries = Object.entries(coinMap).slice(0, 4); // Limit to top 4 for UI design
  const totalUSD = Object.entries(coinMap).reduce((acc, [coin, v]) => acc + getCryptoUSDValue(coin, v.saldo_coin, v.saldo_usd), 0);

  const getCoinStyle = (coin: string) => {
    const c = coin.toUpperCase();
    if (c === 'ETH') return { bg: '#0e2d36', text: '#0e7490' };
    if (c === 'USDC' || c === 'USDT') return { bg: '#0c2a1a', text: '#22c55e' };
    if (c === 'BTC') return { bg: '#1a1a0a', text: '#eab308' };
    if (c === 'LTC') return { bg: '#1a1f2a', text: '#94a3b8' };
    return { bg: 'var(--bg-input)', text: 'var(--text-muted)' };
  };

  return (
    <>
      <Card className="bg-transparent border-[0.5px] border-[var(--border-default)] rounded-[12px] p-[16px_18px] relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-crypto)]" aria-hidden="true"></div>
            <span className="text-[11px] font-medium tracking-[0.06em] uppercase text-[var(--text-faint)]">
              Caixa Crypto
            </span>
            {wallets.length > 0 && (
              <span className="bg-[var(--border-default)] text-[var(--text-muted)] text-[9px] px-1.5 py-0.5 rounded-[4px] font-medium">
                {wallets.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button 
              className="p-1 hover:bg-white/5 rounded-md text-[var(--text-faint)] hover:text-[var(--accent-crypto)] transition-colors"
              onClick={() => setIsSwapDialogOpen(true)}
              title="Trocar Moedas (Swap)"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button 
              className="p-1 hover:bg-white/5 rounded-md text-[var(--text-faint)] hover:text-[var(--accent-crypto)] transition-colors"
              onClick={fetchParceiroCompleto}
              title="Adicionar Wallet"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button 
              className="p-1 hover:bg-white/5 rounded-md text-[var(--text-faint)] hover:text-[var(--accent-crypto)] transition-colors"
              onClick={() => {
                setSelectedCoin(null);
                setIsBreakdownOpen(true);
              }}
              title="Ver Wallets"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="mb-2.5">
          <p className="text-[22px] font-medium text-[var(--accent-crypto)] tabular-nums">
            {formatCurrency(totalUSD, "USD")}
          </p>
        </div>

        {/* Coin List */}
        <div className="space-y-1.5 mt-2">
          {coinEntries.map(([coin, data]) => {
            const style = getCoinStyle(coin);
            const price = cryptoPrices[coin.toUpperCase()] || 0;
            const usdValue = getCryptoUSDValue(coin, data.saldo_coin, data.saldo_usd);
            
            return (
              <div 
                key={coin} 
                className="grid grid-cols-[50px_1fr_auto] gap-2 items-center cursor-pointer hover:bg-white/[0.02] p-1 -mx-1 rounded-md transition-colors group"
                onClick={() => {
                  setSelectedCoin(coin);
                  setIsBreakdownOpen(true);
                }}
              >
                <span 
                  className="text-[10px] font-bold py-0.5 px-1.5 rounded-[4px] text-center"
                  style={{ backgroundColor: style.bg, color: style.text }}
                >
                  {coin}
                </span>
                <span className="text-[11px] text-[var(--text-muted)] tabular-nums group-hover:text-[var(--text-primary)]">
                  {data.saldo_coin.toLocaleString('pt-BR', { 
                    minimumFractionDigits: coin.toUpperCase() === 'BTC' ? 4 : 2,
                    maximumFractionDigits: coin.toUpperCase() === 'BTC' ? 4 : 2 
                  })}
                </span>
                <div className="flex flex-col items-end">
                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums leading-none group-hover:text-[var(--text-primary)]">
                    ≈ {formatCurrency(usdValue, "USD")}
                  </span>
                  <span className="text-[10px] text-[var(--text-faint)] tabular-nums mt-0.5">
                    ${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <SwapCryptoDialog
        open={isSwapDialogOpen}
        onClose={() => setIsSwapDialogOpen(false)}
        onSuccess={() => {
          onDataChanged();
          fetchWallets();
        }}
        caixaParceiroId={caixaParceiroId}
      />

      <ParceiroDialog
        open={isParceiroDialogOpen}
        onClose={() => {
          setIsParceiroDialogOpen(false);
          setParceiroCompleto(null);
          onDataChanged();
          fetchWallets();
        }}
        parceiro={parceiroCompleto}
        initialTab="crypto"
      />
    </>
  );
}

