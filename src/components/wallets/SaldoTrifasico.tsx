import { ArrowDownLeft, ArrowUpRight, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

type Variant = "compact" | "stacked" | "detailed";

interface Balance {
  coin: string;
  amount: number;
}

interface SaldoTrifasicoProps {
  /** Saldos disponíveis (confirmados no ledger, prontos para operar) */
  disponivel: Balance[];
  /**
   * Valor em trânsito **líquido** em USD (entradas − saídas).
   * Preferir `transitInUsd`/`transitOutUsd` para exibição segregada.
   */
  emTransitoUsd?: number;
  /** Entradas pendentes em USD (⬇ chegando — não somam ao disponível) */
  transitInUsd?: number;
  /** Saídas pendentes em USD (⬆ saindo — já descontadas do disponível) */
  transitOutUsd?: number;
  /** Total consolidado em USD (opcional; usado no detailed) */
  totalUsd?: number;
  variant?: Variant;
  className?: string;
}

const fmt = (n: number, min = 2, max = 6) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });

const fmtUsd = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Exibição padronizada do saldo tri-fásico de uma wallet:
 *   Disponível (verde) + Em Trânsito (âmbar) + Total (opcional).
 *
 * Regra de negócio: valores "Em Trânsito" NUNCA devem ser tratados como
 * disponíveis para operação. São condicionais e podem falhar.
 */
export function SaldoTrifasico({
  disponivel,
  emTransitoUsd,
  transitInUsd,
  transitOutUsd,
  totalUsd,
  variant = "stacked",
  className,
}: SaldoTrifasicoProps) {
  // Retrocompat: se só recebemos o líquido antigo e ele é positivo,
  // tratamos como "chegando"; se negativo, como "saindo".
  const inUsd = typeof transitInUsd === "number"
    ? transitInUsd
    : (typeof emTransitoUsd === "number" && emTransitoUsd > 0 ? emTransitoUsd : 0);
  const outUsd = typeof transitOutUsd === "number"
    ? transitOutUsd
    : (typeof emTransitoUsd === "number" && emTransitoUsd < 0 ? -emTransitoUsd : 0);

  const hasOut = outUsd > 0;
  const hasIn = inUsd > 0;

  const outChip = hasOut && (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 cursor-help">
            <ArrowUpRight className="h-3 w-3 text-amber-500" />
            <span className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-medium">
              Saindo
            </span>
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
              ≈ ${fmtUsd(outUsd)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          Valores em envio ficam bloqueados até conciliação — já foram descontados do Disponível.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const inChip = hasIn && (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 cursor-help">
            <ArrowDownLeft className="h-3 w-3 text-sky-500" />
            <span className="text-[10px] uppercase tracking-wider text-sky-600 dark:text-sky-400 font-medium">
              Chegando
            </span>
            <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 tabular-nums">
              ≈ ${fmtUsd(inUsd)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          Valores a caminho aguardando conciliação. Não estão disponíveis para operar até serem confirmados.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const transitChips = (hasOut || hasIn) && (
    <div className="flex flex-wrap gap-1.5">
      {outChip}
      {inChip}
    </div>
  );
  const hasTransit = hasOut || hasIn;

  if (variant === "compact") {
    const primary = disponivel[0];
    return (
      <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
        <span className="text-sm font-semibold text-emerald-500 tabular-nums">
          {primary ? `${fmt(primary.amount)} ${primary.coin}` : "0,00"}
        </span>
        {transitChips}
      </span>
    );
  }

  if (variant === "detailed") {
    return (
      <div className={`space-y-2 ${className ?? ""}`}>
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Disponível</p>
          {disponivel.length > 0 ? disponivel.map((b) => (
            <div key={b.coin} className="text-lg font-bold text-emerald-500 tabular-nums leading-tight">
              {fmt(b.amount)}
              <span className="ml-1 text-xs font-medium text-muted-foreground">{b.coin}</span>
            </div>
          )) : (
            <div className="text-lg font-bold text-muted-foreground tabular-nums">0,00</div>
          )}
        </div>
        {hasTransit && (
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Em Trânsito</p>
            {transitChips}
          </div>
        )}
        {typeof totalUsd === "number" && (
          <div className="pt-1 border-t border-border/40 space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
            <div className="text-sm font-semibold text-foreground tabular-nums">
              ≈ ${fmtUsd(totalUsd)}
            </div>
          </div>
        )}
      </div>
    );
  }

  // stacked (default)
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Disponível</p>
      <div className="flex flex-col gap-0.5">
        {disponivel.length > 0 ? disponivel.map((b) => (
          <span key={b.coin} className="text-lg font-bold text-emerald-500 tabular-nums leading-tight">
            {fmt(b.amount)}
            <span className="ml-1 text-xs font-medium text-muted-foreground">{b.coin}</span>
          </span>
        )) : (
          <span className="text-lg font-bold text-muted-foreground tabular-nums">0,00</span>
        )}
      </div>
      {hasTransit && <div className="mt-2">{transitChips}</div>}
    </div>
  );
}