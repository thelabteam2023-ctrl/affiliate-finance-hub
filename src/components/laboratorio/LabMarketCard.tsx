import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Metrics } from "@/hooks/useValueBetLabData";

interface LabMarketCardProps {
  name: string;
  metrics: Metrics;
  onClick?: () => void;
  className?: string;
  totalVolume?: number;
}

export function LabMarketCard({ name, metrics, onClick, className, totalVolume }: LabMarketCardProps) {

  const isPositive = metrics.profit >= 0;
  const progressValue = metrics.validas > 0 ? (metrics.greens / metrics.validas) * 100 : 0;
  const volumeShare = totalVolume && totalVolume > 0 ? (metrics.stake / totalVolume) * 100 : 0;


  return (
    <Card 
      className={cn(
        "cursor-pointer hover:border-primary/50 transition-all bg-card/50 border-border/40",
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <h3 className="text-lg font-bold truncate max-w-[180px]">{name}</h3>
            <p className="text-[10px] text-muted-foreground uppercase font-medium">
              {metrics.total} APOSTAS • R$ {metrics.stake.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              {volumeShare > 0 && (
                <span className="ml-1 text-primary font-black">
                  ({volumeShare.toFixed(1)}%)
                </span>
              )}

            </p>
          </div>
          <div className={cn(
            "text-xl font-black tabular-nums",
            isPositive ? "text-green-500" : "text-red-500"
          )}>
            {metrics.roi > 0 ? "+" : ""}{metrics.roi.toFixed(2)}%
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 pt-2 space-y-4">
        {/* Grid metrics */}
        <div className="grid grid-cols-3 gap-2 py-2 border-y border-border/20">
          <div className="text-center">
            <p className="text-[9px] text-muted-foreground uppercase font-bold">Lucro</p>
            <p className={cn("text-sm font-bold", isPositive ? "text-green-400" : "text-red-400")}>
              R$ {metrics.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[9px] text-muted-foreground uppercase font-bold">Win Rate</p>
            <p className="text-sm font-bold">{metrics.winRate.toFixed(1)}%</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] text-muted-foreground uppercase font-bold">Voids</p>
            <p className="text-sm font-bold text-muted-foreground">{metrics.voids}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] font-bold">
            <span className="text-green-500 uppercase">Greens</span>
            <span className="text-muted-foreground">{progressValue.toFixed(1)}%</span>
          </div>
          <Progress value={progressValue} className="h-1.5 bg-muted/30" />
        </div>

        {/* Result badges */}
        <div className="flex flex-wrap gap-1.5">
          <ResultBadge label="G" count={metrics.greens} color="bg-green-500" />
          <ResultBadge label="MG" count={metrics.meioGreens} color="bg-teal-500" />
          <ResultBadge label="MR" count={metrics.meioReds} color="bg-orange-500" />
          <ResultBadge label="R" count={metrics.reds} color="bg-red-500" />
          <ResultBadge label="V" count={metrics.voids} color="bg-slate-500" />
        </div>
      </CardContent>
    </Card>
  );
}

function ResultBadge({ label, count, color }: { label: string, count: number, color: string }) {
  return (
    <Badge 
      variant="outline" 
      className="text-[9px] font-bold h-5 px-1.5 border-none bg-muted/20 flex gap-1 items-center"
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", color)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{count}</span>
    </Badge>
  );
}