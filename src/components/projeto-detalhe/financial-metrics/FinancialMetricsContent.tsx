import { useState, type ElementType } from "react";
import { format, parseISO } from "date-fns";
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  DollarSign,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { FinancialMetricsComputed } from "./useFinancialMetrics";

function MetricRow({
  label,
  value,
  colorClass = "text-foreground",
  bold = false,
  indent = false,
  tooltip,
}: {
  label: string;
  value: string;
  colorClass?: string;
  bold?: boolean;
  indent?: boolean;
  tooltip?: string;
}) {
  const labelEl = (
    <span
      className={cn(
        "text-[11px]",
        bold ? "font-medium text-foreground" : "text-muted-foreground",
        tooltip && "border-b border-dotted border-muted-foreground/40 cursor-help"
      )}
    >
      {label}
    </span>
  );

  return (
    <div className={cn("flex items-center justify-between gap-4", indent && "pl-3")}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{labelEl}</TooltipTrigger>
          <TooltipContent side="left" className="max-w-[240px] text-xs">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      ) : (
        labelEl
      )}
      <span className={cn("text-[11px] font-mono tabular-nums", bold ? "font-bold" : "font-semibold", colorClass)}>
        {value}
      </span>
    </div>
  );
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

function ExtrasCollapsible({
  metrics,
  formatCurrency,
}: {
  metrics: FinancialMetricsComputed;
  formatCurrency: (v: number) => string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center justify-between gap-4 w-full group">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            Resultado Extras
            <ChevronDown className={cn("h-3 w-3 text-muted-foreground/60 transition-transform", open && "rotate-180")} />
          </span>
          <span
            className={cn(
              "text-[11px] font-mono tabular-nums font-semibold",
              metrics.resultadoExtras >= 0 ? "text-emerald-500" : "text-red-500"
            )}
          >
            {formatCurrency(metrics.resultadoExtras)}
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-1 space-y-0.5 pl-2 border-l-2 border-border/30 ml-1">
        {Math.abs(metrics.bonusGanhos) >= 0.01 && (
          <MetricRow
            label="Bônus Ganhos"
            value={formatCurrency(metrics.bonusGanhos)}
            colorClass="text-emerald-500"
            indent
          />
        )}
        {Math.abs(metrics.cashbackLiquido) >= 0.01 && (
          <MetricRow label="Cashback Líquido" value={formatCurrency(metrics.cashbackLiquido)} colorClass="text-emerald-500" indent />
        )}
        {Math.abs(metrics.girosGratis) >= 0.01 && (
          <MetricRow label="Giros Grátis" value={formatCurrency(metrics.girosGratis)} colorClass="text-emerald-500" indent />
        )}
        {Math.abs(metrics.ganhoConfirmacao) >= 0.01 && (
          <MetricRow label="Ganho de Confirmação" value={formatCurrency(metrics.ganhoConfirmacao)} colorClass="text-emerald-500" indent />
        )}
        {Math.abs(metrics.ajustes) >= 0.01 && (
          <MetricRow
            label="Ajustes de Saldo"
            value={formatCurrency(metrics.ajustes)}
            colorClass={metrics.ajustes >= 0 ? "text-emerald-500" : "text-red-500"}
            indent
          />
        )}
        {(() => {
          const fxLiquido = metrics.ganhoFx - metrics.perdaFx;
          return Math.abs(fxLiquido) >= 0.01 ? (
            <MetricRow
              label="Resultado Cambial"
              value={fxLiquido < 0 ? `−${formatCurrency(Math.abs(fxLiquido))}` : formatCurrency(fxLiquido)}
              colorClass={fxLiquido >= 0 ? "text-emerald-500" : "text-red-500"}
              indent
            />
          ) : null;
        })()}
        {Math.abs(metrics.perdaOp) >= 0.01 && (
          <MetricRow
            label="Perdas Operacionais"
            value={`−${formatCurrency(metrics.perdaOp)}`}
            colorClass="text-red-500"
            indent
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface FinancialMetricsContentProps {
  metrics: FinancialMetricsComputed;
  formatCurrency: (v: number) => string;
  className?: string;
}

export function FinancialMetricsContent({ metrics, formatCurrency, className }: FinancialMetricsContentProps) {
  const breakEvenReached = metrics.lucroRealizado >= 0;
  const hasExtras = Math.abs(metrics.resultadoExtras) >= 0.01;

  return (
    <div className={cn("p-4 w-[340px] space-y-0", className)}>
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-md bg-primary/10">
          <DollarSign className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-xs font-bold tracking-tight">Indicadores Financeiros</span>
      </div>

      <div className="space-y-1 pb-3">
        <SectionHeader icon={ArrowRightLeft} label="Fluxo de Caixa" />
        <MetricRow label="Depósitos Confirmados" value={formatCurrency(metrics.depositosTotal)} />
        {hasExtras && <ExtrasCollapsible metrics={metrics} formatCurrency={formatCurrency} />}
        <MetricRow label="Saques Recebidos" value={formatCurrency(metrics.saquesRecebidos)} />
        {metrics.saquesPendentes > 0 && (
          <MetricRow label="Saques Pendentes" value={formatCurrency(metrics.saquesPendentes)} colorClass="text-amber-500" />
        )}
        <div className="border-t border-border/30 mt-1.5 pt-1.5">
          <MetricRow
            label="Fluxo Líquido"
            value={formatCurrency(metrics.lucroRealizado)}
            colorClass={metrics.lucroRealizado >= 0 ? "text-emerald-500" : "text-red-500"}
            bold
          />
          <p className="text-[9px] text-muted-foreground/70 mt-0.5">Saques Confirmados − Depósitos Confirmados</p>
        </div>
      </div>

      <div className="border-t border-border/40 pt-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          {breakEvenReached ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          ) : (
            <AlertCircle className="h-3 w-3 text-amber-500" />
          )}
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lucro Realizado</span>
        </div>

        {breakEvenReached ? (
          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 px-3 py-2">
            <p className="text-[11px] text-foreground font-medium">Capital recuperado em {metrics.breakEvenDays ?? "—"} dias</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Saques superaram depósitos em {metrics.breakEvenDate && format(parseISO(metrics.breakEvenDate), "dd/MM/yyyy")}. O caixa já recebeu de volta todo o valor investido.
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 px-3 py-2">
            <p className="text-[11px] text-foreground font-medium">Faltam {formatCurrency(Math.abs(metrics.lucroRealizado))} para recuperar</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Saques recebidos ainda não cobriram os depósitos realizados.</p>
          </div>
        )}
      </div>
    </div>
  );
}
