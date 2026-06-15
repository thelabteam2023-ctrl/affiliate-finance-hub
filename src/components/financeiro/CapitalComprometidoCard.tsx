import { AlertTriangle, Building2, Landmark, Wallet, Wallet2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCapitalEmDisputa } from "@/hooks/useCapitalEmDisputa";

interface Props {
  patrimonioTotal: number;
  formatCurrency: (value: number, currency?: string) => string;
}

export function CapitalComprometidoCard({ patrimonioTotal, formatCurrency }: Props) {
  const { bySegment, totalBRL, loading } = useCapitalEmDisputa();

  const segs = [
    { id: "bookmakers", label: "Bookmakers", icon: Building2, value: bySegment.bookmakers },
    { id: "contas-parc", label: "Bancos / Parceiros", icon: Landmark, value: bySegment["contas-parc"] },
    { id: "caixa-op", label: "Caixa Operacional", icon: Wallet, value: bySegment["caixa-op"] },
    { id: "wallets", label: "Wallets Crypto", icon: Wallet2, value: bySegment.wallets },
  ].filter(s => s.value > 0);

  const pctPatrimonio = patrimonioTotal > 0 ? (totalBRL / patrimonioTotal) * 100 : 0;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Capital Comprometido
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatCurrency(totalBRL)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {pctPatrimonio > 0
              ? `${pctPatrimonio.toFixed(1)}% do patrimônio total`
              : "Sem exposição em aberto"}
          </div>
        </div>

        {loading ? (
          <div className="text-xs text-muted-foreground">Carregando ocorrências…</div>
        ) : segs.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Nenhuma ocorrência aberta no momento.
          </div>
        ) : (
          <div className="space-y-2">
            {segs.map(s => {
              const Icon = s.icon;
              const pct = totalBRL > 0 ? (s.value / totalBRL) * 100 : 0;
              return (
                <div key={s.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                      {s.label}
                    </span>
                    <span className="font-medium">{formatCurrency(s.value)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-amber-500/70 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}