import { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Categoria {
  name: string;
  value: number;
  color?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categorias: Categoria[];
  totalCustos: number;
  formatCurrency: (value: number) => string;
  periodBadge?: ReactNode;
  onVerCompleto?: () => void;
}

export function CustosDetalheDialog({
  open,
  onOpenChange,
  categorias,
  totalCustos,
  formatCurrency,
  periodBadge,
  onVerCompleto,
}: Props) {
  const ordenadas = [...categorias]
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
  const max = ordenadas[0]?.value || 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>Custos do Período</DialogTitle>
            {periodBadge}
          </div>
          <DialogDescription>
            Como os custos se distribuíram entre as categorias.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">
              −{formatCurrency(totalCustos)}
            </span>
          </div>
        </div>

        <div className="space-y-2.5">
          {ordenadas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Sem custos registrados no período.
            </p>
          ) : (
            ordenadas.map((cat) => {
              const pct = (cat.value / totalCustos) * 100;
              const barPct = (cat.value / max) * 100;
              return (
                <div key={cat.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{cat.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatCurrency(cat.value)}{" "}
                      <span className="opacity-60">({pct.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${barPct}%`,
                        backgroundColor: cat.color || "hsl(var(--primary))",
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {onVerCompleto ? (
          <div className="pt-2 text-right">
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onVerCompleto();
              }}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Ver detalhamento completo →
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}