import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TrendingUp,
  BarChart3,
  Scale,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  Gift,
  Percent,
  Dices,
  Target,
  Settings,
  Globe,
  TrendingDown,
  Megaphone,
} from "lucide-react";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useKpiBreakdowns } from "@/hooks/useKpiBreakdowns";
import { useProjetoDashboardData } from "@/hooks/useProjetoDashboardData";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ICON_MAP: Record<string, React.ElementType> = {
  Target, Gift, Percent, Dices, Settings, Globe, TrendingDown, Megaphone, Scale,
};

interface LucroProjetadoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  lucroProjetado: number;
  saldoCasas: number;
  saquesRecebidos: number;
  saquesPendentes: number;
  depositosTotal: number;
}

function ReconciliationRow({
  label,
  value,
  formatCurrency,
  bold = false,
  icon: Icon,
  tooltip,
}: {
  label: string;
  value: number;
  formatCurrency: (v: number) => string;
  bold?: boolean;
  icon?: React.ElementType;
  tooltip?: string;
}) {
  if (Math.abs(value) < 0.005 && !bold) return null;

  const colorClass = bold
    ? value >= 0 ? "text-emerald-500" : "text-red-500"
    : value >= 0 ? "text-emerald-400" : "text-red-400";

  const labelEl = (
    <span className={`text-[11px] flex items-center gap-1.5 ${bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      {label}
    </span>
  );

  return (
    <div className="flex items-center justify-between gap-4">
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="border-b border-dotted border-muted-foreground/40 cursor-help">
              {labelEl}
            </span>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-[240px] text-xs">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      ) : labelEl}
      <span className={`text-[11px] font-mono tabular-nums ${bold ? "font-bold" : "font-semibold"} ${colorClass}`}>
        {value < 0 ? `−${formatCurrency(Math.abs(value))}` : formatCurrency(value)}
      </span>
    </div>
  );
}

export function LucroProjetadoModal({
  open,
  onOpenChange,
  projetoId,
  lucroProjetado,
  saldoCasas,
  saquesRecebidos,
  saquesPendentes,
  depositosTotal,
}: LucroProjetadoModalProps) {
  const { formatCurrency } = useProjetoCurrency(projetoId);
  const { data: rawData } = useProjetoDashboardData(projetoId);
  const { breakdowns } = useKpiBreakdowns({
    projetoId,
    dataInicio: undefined,
    dataFim: undefined,
  });

  const lucroOperacional = breakdowns?.lucro?.total ?? 0;
  const divergencia = lucroProjetado - lucroOperacional;

  const contributions = breakdowns?.lucro?.contributions ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            Reconciliação de Lucro
          </DialogTitle>
          <p className="text-[10px] text-muted-foreground mt-1">
            Comparação entre o lucro financeiro (se sacássemos tudo) e o lucro operacional (KPI).
          </p>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-4 mt-3">
          {/* Composição do Lucro Projetado */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Lucro Projetado (Financeiro)
              </span>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2.5 space-y-1">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Wallet className="h-3 w-3 shrink-0" />Saldo em Bookmakers
                </span>
                <span className="text-[11px] font-mono tabular-nums font-semibold">
                  {formatCurrency(saldoCasas)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <ArrowUpCircle className="h-3 w-3 shrink-0" />Saques Recebidos
                </span>
                <span className="text-[11px] font-mono tabular-nums font-semibold">
                  {formatCurrency(saquesRecebidos)}
                </span>
              </div>
              {saquesPendentes > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3 w-3 shrink-0" />Saques Pendentes
                  </span>
                  <span className="text-[11px] font-mono tabular-nums font-semibold text-amber-500">
                    {formatCurrency(saquesPendentes)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <ArrowDownCircle className="h-3 w-3 shrink-0" />(−) Depósitos
                </span>
                <span className="text-[11px] font-mono tabular-nums font-semibold">
                  {formatCurrency(depositosTotal)}
                </span>
              </div>
              <div className="border-t border-border/40 mt-1.5 pt-1.5">
                <ReconciliationRow
                  label="Total"
                  value={lucroProjetado}
                  formatCurrency={formatCurrency}
                  bold
                  icon={TrendingUp}
                />
              </div>
            </div>
          </div>

          {/* Composição do Lucro Operacional */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 mb-2">
              <BarChart3 className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Lucro Operacional (KPI)
              </span>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2.5 space-y-1">
              {contributions.map((c) => {
                const IconComp = ICON_MAP[c.icon || ''] || Target;
                return (
                  <ReconciliationRow
                    key={c.moduleId}
                    label={c.moduleName}
                    value={c.value}
                    formatCurrency={formatCurrency}
                    icon={IconComp}
                  />
                );
              })}
              <div className="border-t border-border/40 mt-1.5 pt-1.5">
                <ReconciliationRow
                  label="Total"
                  value={lucroOperacional}
                  formatCurrency={formatCurrency}
                  bold
                  icon={BarChart3}
                />
              </div>
            </div>
          </div>

          {/* Divergência */}
          <div className="rounded-lg border px-3 py-2.5 space-y-1"
            style={{
              borderColor: Math.abs(divergencia) < 0.01
                ? 'hsl(var(--border))' 
                : divergencia > 0
                  ? 'hsl(142 76% 36% / 0.3)'
                  : 'hsl(0 84% 60% / 0.3)',
              backgroundColor: Math.abs(divergencia) < 0.01
                ? 'hsl(var(--muted) / 0.3)'
                : divergencia > 0
                  ? 'hsl(142 76% 36% / 0.05)'
                  : 'hsl(0 84% 60% / 0.05)',
            }}
          >
            <ReconciliationRow
              label="Divergência (Δ)"
              value={divergencia}
              formatCurrency={formatCurrency}
              bold
              icon={Scale}
              tooltip="Diferença entre o lucro projetado (financeiro) e o lucro operacional (KPI). Causada por variações cambiais na conversão de moedas, ganhos/perdas de confirmação de saques, ou arredondamentos."
            />
            {Math.abs(divergencia) >= 0.01 && (
              <p className="text-[9px] text-muted-foreground/80 mt-1">
                {Math.abs(divergencia) < 1
                  ? "Diferença mínima — provavelmente arredondamentos de conversão cambial."
                  : "Essa diferença pode ser causada por variações cambiais entre o momento da operação e a cotação atual, ou por ganhos/perdas de confirmação de saques."}
              </p>
            )}
            {Math.abs(divergencia) < 0.01 && (
              <p className="text-[9px] text-muted-foreground/80 mt-1">
                ✓ Lucro projetado e operacional estão perfeitamente alinhados.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
