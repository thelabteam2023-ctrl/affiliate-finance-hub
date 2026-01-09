import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, TrendingUp, Clock, BarChart3 } from "lucide-react";
import { CashbackPorBookmaker } from "@/types/cashback";
import { cn } from "@/lib/utils";

interface CashbackPorCasaSectionProps {
  data: CashbackPorBookmaker[];
  formatCurrency: (value: number) => string;
}

export function CashbackPorCasaSection({ data, formatCurrency }: CashbackPorCasaSectionProps) {
  if (data.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8">
          <div className="text-center">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              Nenhum dado por casa disponível
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Ordenar por total recebido
  const sortedData = [...data].sort((a, b) => b.totalRecebido - a.totalRecebido);

  return (
    <div className="space-y-3">
      {sortedData.map((item) => (
        <Card key={item.bookmaker_id} className="hover:border-primary/30 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              {/* Casa */}
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{item.bookmaker_nome}</h3>
                  <p className="text-xs text-muted-foreground">
                    {item.registros} registro(s)
                  </p>
                </div>
              </div>

              {/* Métricas */}
              <div className="flex items-center gap-6">
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
                    <BarChart3 className="h-3 w-3" />
                    Volume
                  </p>
                  <p className="text-sm font-medium">
                    {formatCurrency(item.volumeElegivel)}
                  </p>
                </div>

                <div className="text-right hidden md:block">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
                    <Clock className="h-3 w-3" />
                    Pendente
                  </p>
                  <p className={cn(
                    "text-sm font-medium",
                    item.totalPendente > 0 ? "text-amber-500" : "text-muted-foreground"
                  )}>
                    {formatCurrency(item.totalPendente)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
                    <TrendingUp className="h-3 w-3" />
                    Recebido
                  </p>
                  <p className="text-sm font-bold text-emerald-500">
                    {formatCurrency(item.totalRecebido)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">% Médio</p>
                  <p className="text-sm font-medium text-foreground">
                    {item.percentualMedio.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
