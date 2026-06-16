import { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TrendingUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fluxoLiquido: number;
  lucroOperacionalTeorico: number;
  formatCurrency: (value: number) => string;
  periodBadge?: ReactNode;
}

export function FluxoLiquidoDetalheDialog({
  open,
  onOpenChange,
  fluxoLiquido,
  lucroOperacionalTeorico,
  formatCurrency,
  periodBadge,
}: Props) {
  const diferenca = lucroOperacionalTeorico - fluxoLiquido;
  const realizadoAcimaDoTeorico = diferenca < 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>Fluxo Líquido vs. Lucro Operacional Teórico</DialogTitle>
            {periodBadge}
          </div>
          <DialogDescription>
            Compara o que <strong>já saiu em caixa</strong> com o que a operação{" "}
            <strong>produziu contabilmente</strong> no período.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border bg-card p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              Caixa Real
            </div>
            <div
              className={cn(
                "text-2xl font-bold tabular-nums",
                fluxoLiquido >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400",
              )}
            >
              {formatCurrency(fluxoLiquido)}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Caixa que de fato saiu dos projetos no período.
            </p>
          </div>

          <div className="rounded-lg border bg-card p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Lucro Operacional Teórico
            </div>
            <div
              className={cn(
                "text-2xl font-bold tabular-nums",
                lucroOperacionalTeorico >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400",
              )}
            >
              {formatCurrency(lucroOperacionalTeorico)}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Lucro contábil das apostas liquidadas, ainda represado em saldos.
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-muted/40 p-4 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Diferença</span>
            <span className="font-semibold tabular-nums">
              {formatCurrency(Math.abs(diferenca))}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {realizadoAcimaDoTeorico
              ? "Você já realizou em caixa todo o lucro teórico do período (e mais)."
              : "Esse valor já foi produzido pela operação, mas ainda não virou caixa — está represado em saldos de bookmakers, parceiros e wallets."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}