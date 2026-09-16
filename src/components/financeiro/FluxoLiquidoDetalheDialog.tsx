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

interface ProjetoLinha {
  projetoId: string;
  nome: string;
  moeda: string;
  valor: number;
  valorBRL: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fluxoLiquido: number;
  lucroOperacionalTeorico: number;
  formatCurrency: (value: number) => string;
  periodBadge?: ReactNode;
  /** Composição do Lucro Operacional Teórico por projeto (já em BRL) */
  projetos?: ProjetoLinha[];
  /** Composição por componente (apostas, bonus, cashback, ...) já em BRL */
  componentes?: Record<string, number>;
}

const COMPONENTE_LABELS: Record<string, string> = {
  apostas: "Apostas liquidadas",
  bonus: "Bônus",
  cancelamento_bonus: "Cancelamento de bônus",
  cashback: "Cashback",
  giros: "Giros grátis",
  promocionais: "Promocionais",
  perdas: "Perdas operacionais",
  ajustes: "Ajustes de saldo",
  conciliacao: "Conciliação",
};

export function FluxoLiquidoDetalheDialog({
  open,
  onOpenChange,
  fluxoLiquido,
  lucroOperacionalTeorico,
  formatCurrency,
  periodBadge,
  projetos = [],
  componentes = {},
}: Props) {
  const componentesLista = Object.entries(componentes)
    .filter(([, v]) => Math.abs(v) >= 0.01)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
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

        {(componentesLista.length > 0 || projetos.length > 0) && (
          <div className="max-h-[40vh] overflow-y-auto space-y-4 pr-1">
            {componentesLista.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Composição do Lucro Operacional Teórico
                </div>
                {componentesLista.map(([chave, valor]) => (
                  <div key={chave} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {COMPONENTE_LABELS[chave] ?? chave}
                    </span>
                    <span
                      className={cn(
                        "font-medium tabular-nums",
                        valor >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {formatCurrency(valor)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {projetos.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Por projeto
                </div>
                {projetos.map((p) => (
                  <div key={p.projetoId} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-muted-foreground">
                      {p.nome}
                      {p.moeda !== "BRL" && (
                        <span className="ml-1 text-xs">
                          ({p.moeda} {p.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "font-medium tabular-nums",
                        p.valorBRL >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {formatCurrency(p.valorBRL)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}