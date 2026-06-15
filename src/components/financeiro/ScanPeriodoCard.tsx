import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  totalScanPeriodo: number;
  countScanPeriodo: number;
  patrimonioTotal: number;
  lucroOperacional: number;
  formatCurrency: (value: number, currency?: string) => string;
}

export function ScanPeriodoCard({
  totalScanPeriodo,
  countScanPeriodo,
  patrimonioTotal,
  lucroOperacional,
  formatCurrency,
}: Props) {
  const pctPatrimonio = patrimonioTotal > 0 ? (totalScanPeriodo / patrimonioTotal) * 100 : 0;
  const pctLucro = lucroOperacional > 0 ? (totalScanPeriodo / lucroOperacional) * 100 : 0;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-500" />
          Scan no Período
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {formatCurrency(totalScanPeriodo)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {countScanPeriodo > 0
              ? `${countScanPeriodo} ocorrência${countScanPeriodo > 1 ? "s" : ""} de perda no período`
              : "Nenhuma perda registrada no período"}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              % do Patrimônio
            </div>
            <div className="text-lg font-semibold">
              {pctPatrimonio.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              % do Lucro Op.
            </div>
            <div className="text-lg font-semibold">
              {lucroOperacional > 0 ? `${pctLucro.toFixed(2)}%` : "—"}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Inclui perdas do tipo <span className="font-medium">PERDA_OPERACIONAL</span> (scan/fraude) registradas no Caixa Operacional dentro do período selecionado.
        </p>
      </CardContent>
    </Card>
  );
}