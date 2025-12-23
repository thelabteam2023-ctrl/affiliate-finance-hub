import { ApostaOperacionalFreebet, FreebetRecebida } from "./types";
import { CurvaExtracaoChart } from "./CurvaExtracaoChart";
import { BarChart3 } from "lucide-react";

interface FreebetGraficosProps {
  apostas: ApostaOperacionalFreebet[];
  formatCurrency: (value: number) => string;
  dateRange: { start: Date; end: Date } | null;
  freebets?: FreebetRecebida[];
}

export function FreebetGraficos({ apostas, formatCurrency, dateRange, freebets = [] }: FreebetGraficosProps) {
  if (apostas.length === 0 && freebets.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-muted/5">
        <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">Sem dados suficientes para gráficos</p>
      </div>
    );
  }

  return (
    <CurvaExtracaoChart
      apostas={apostas}
      freebets={freebets}
      formatCurrency={formatCurrency}
      dateRange={dateRange}
    />
  );
}
