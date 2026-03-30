import { Card } from "@/components/ui/card";
import { Building2, TrendingUp, Zap, Percent, Hash } from "lucide-react";

interface VinculoData {
  vinculo: string;
  apostas: number;
  volume: number;
  lucro: number;
  roi: number;
}

interface CasaCardData {
  casa: string;
  apostas: number;
  volume: number;
  lucro: number;
  roi: number;
  vinculos: VinculoData[];
}

interface CasaAnalyticsCardProps {
  casa: CasaCardData;
  logoUrl?: string | null;
  formatValue: (value: number) => string;
  formatPercent: (value: number) => string;
  onClick: () => void;
  accentHoverClass?: string;
}

export function CasaAnalyticsCard({ casa, logoUrl, formatValue, formatPercent, onClick, accentHoverClass = "hover:border-primary/40" }: CasaAnalyticsCardProps) {
  const lucroColor = casa.lucro >= 0 ? "text-emerald-500" : "text-red-500";
  const roiColor = casa.roi >= 0 ? "text-emerald-500" : "text-red-500";
  const lucroBg = casa.lucro >= 0 ? "bg-emerald-500/10" : "bg-red-500/10";
  const roiBg = casa.roi >= 0 ? "bg-emerald-500/10" : "bg-red-500/10";

  return (
    <Card
      className={`cursor-pointer transition-all duration-200 border-border/50 ${accentHoverClass} hover:shadow-lg hover:shadow-primary/5`}
      onClick={onClick}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-muted/50 border border-border/40 flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt={casa.casa} className="w-8 h-8 object-contain" />
            ) : (
              <Building2 className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm uppercase tracking-wide truncate">{casa.casa}</p>
            <p className="text-[10px] text-muted-foreground">
              {casa.vinculos.length} {casa.vinculos.length === 1 ? 'conta' : 'contas'} · {casa.apostas} apostas
            </p>
          </div>
        </div>

        {/* KPI Grid - 2x2 */}
        <div className="grid grid-cols-2 gap-2">
          {/* Volume */}
          <div className="rounded-lg border border-border/30 bg-muted/15 p-2.5 flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-medium">Volume</p>
              <p className="text-xs font-bold tabular-nums mt-1 truncate">{formatValue(casa.volume)}</p>
            </div>
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 ml-1">
              <TrendingUp className="h-3 w-3 text-primary" />
            </div>
          </div>

          {/* Apostas */}
          <div className="rounded-lg border border-border/30 bg-muted/15 p-2.5 flex items-start justify-between">
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-medium">Apostas</p>
              <p className="text-xs font-bold tabular-nums mt-1">{casa.apostas}</p>
            </div>
            <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0 ml-1">
              <Hash className="h-3 w-3 text-blue-400" />
            </div>
          </div>

          {/* Lucro */}
          <div className="rounded-lg border border-border/30 bg-muted/15 p-2.5 flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-medium">Lucro</p>
              <p className={`text-xs font-bold tabular-nums mt-1 truncate ${lucroColor}`}>
                {casa.lucro >= 0 ? '+' : ''}{formatValue(casa.lucro)}
              </p>
            </div>
            <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ml-1 ${lucroBg}`}>
              <Zap className={`h-3 w-3 ${lucroColor}`} />
            </div>
          </div>

          {/* ROI */}
          <div className="rounded-lg border border-border/30 bg-muted/15 p-2.5 flex items-start justify-between">
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-medium">ROI</p>
              <p className={`text-xs font-bold tabular-nums mt-1 ${roiColor}`}>
                {formatPercent(casa.roi)}
              </p>
            </div>
            <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ml-1 ${roiBg}`}>
              <Percent className={`h-3 w-3 ${roiColor}`} />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
