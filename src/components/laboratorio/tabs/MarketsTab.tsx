import { MarketStats } from "@/hooks/useValueBetLabData";
import { LabMarketCard } from "../LabMarketCard";

interface MarketsTabProps {
  markets: Record<string, MarketStats>;
}

export function MarketsTab({ markets }: MarketsTabProps) {
  const marketList = Object.values(markets).sort((a, b) => b.total - a.total);
  
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {marketList.map((market) => (
          <LabMarketCard 
            key={market.name} 
            name={market.name} 
            metrics={market} 
          />
        ))}
      </div>
    </div>
  );
}
