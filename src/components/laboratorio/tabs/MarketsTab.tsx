import { useState } from "react";
import { MarketStats, RawBet } from "@/hooks/useValueBetLabData";
import { LabMarketCard } from "../LabMarketCard";
import { MarketDrillDownModal } from "../MarketDrillDownModal";

interface MarketsTabProps {
  markets: Record<string, MarketStats>;
  bets?: RawBet[];
  selectedSport?: string | null;
}

export function MarketsTab({ markets, bets = [], selectedSport }: MarketsTabProps) {
  const marketList = Object.values(markets).sort((a, b) => b.total - a.total);
  const totalVolume = marketList.reduce((acc, m) => acc + m.stake, 0);
  const [openMarket, setOpenMarket] = useState<string | null>(null);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {marketList.map((market) => (
          <LabMarketCard 
            key={market.name} 
            name={market.name} 
            metrics={market} 
            totalVolume={totalVolume}
            onClick={() => setOpenMarket(market.name)}
          />
        ))}
      </div>

      <MarketDrillDownModal
        open={!!openMarket}
        onOpenChange={(v) => !v && setOpenMarket(null)}
        marketName={openMarket}
        sportLabel={selectedSport ?? "Todos os esportes"}
        bets={bets}
      />
    </div>
  );
}
