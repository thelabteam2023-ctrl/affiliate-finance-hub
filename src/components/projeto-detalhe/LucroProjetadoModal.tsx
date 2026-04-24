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
  Target,
  Gift,
  Percent,
  Dices,
  Settings,
  Globe,
  TrendingDown,
  Megaphone,
  AlertTriangle,
  Info,
  Sparkles,
  Wrench,
  Handshake,
} from "lucide-react";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useKpiBreakdowns } from "@/hooks/useKpiBreakdowns";
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
  depositosEfetivos: number;
  depositosBaseline: number;
  ganhoConfirmacaoDeposito: number;
  bonusGanhosFinanceiro: number;
  girosGratisFinanceiro: number;
  cashbackFinanceiro: number;
  ajustesFinanceiro: number;
  perdaOpFinanceiro: number;
  resultadoFxFinanceiro: number;
  // Segregação conceitual (Performance vs FX vs Ajustes)
  performancePura?: number;
  efeitosFinanceiros?: number;
  ajustesExtraordinarios?: number;
}

function ReconciliationRow({
  label,
  value,
  formatCurrency,
  bold = false,
  icon: Icon,
  tooltip,
  muted = false,
}: {
  label: string;
  value: number;
  formatCurrency: (v: number) => string;
  bold?: boolean;
  icon?: React.ElementType;
  tooltip?: string;
  muted?: boolean;
}) {
  if (Math.abs(value) < 0.005 && !bold) return null;

  const colorClass = muted
    ? "text-muted-foreground"
    : bold
      ? value >= 0 ? "text-emerald-500" : "text-red-500"
      : value >= 0 ? "text-emerald-400" : "text-red-400";

  const labelEl = (
    <span className={`text-[11px] flex items-center gap-1.5 ${bold ? "font-semibold text-foreground" : "text-muted-foreground"} ${tooltip ? "border-b border-dotted border-muted-foreground/40 cursor-help" : ""}`}>
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      {label}
    </span>
  );

  return (
    <div className="flex items-center justify-between gap-4">
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{labelEl}</TooltipTrigger>
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

interface DivergenceFactor {
  label: string;
  value: number;
  icon: React.ElementType;
  tooltip: string;
}

function computeDivergenceFactors(
  divergencia: number,
  props: LucroProjetadoModalProps,
  lucroOperacional: number,
  formatCurrency: (v: number) => string,
): DivergenceFactor[] {
  const factors: DivergenceFactor[] = [];

  // 1. Ganho/Perda de confirmação de saque: Diferença entre valor solicitado e confirmado.
  if (Math.abs(props.ganhoConfirmacaoDeposito) >= 0.005) {
    factors.push({
      label: "Δ Confirmação de Saques",
      value: props.ganhoConfirmacaoDeposito,
      icon: ArrowUpCircle,
      tooltip: "Diferença entre o valor solicitado e o valor confirmado nos saques. Causada por variação cambial entre a data do pedido e a data de liquidação.",
    });
  }

  // 2. Residual FX (diferença de conversão temporal)
  const knownFactors = factors.reduce((acc, f) => acc + f.value, 0);
  const residual = divergencia - knownFactors;
  if (Math.abs(residual) >= 0.005) {
    factors.push({
      label: "Δ Conversão Cambial",
      value: residual,
      icon: Globe,
      tooltip: "Diferença residual causada pela conversão de moedas. O lucro projetado usa a cotação atual (spot) para valorar saldos, enquanto o lucro operacional usa a cotação no momento de cada operação.",
    });
  }

  return factors;
}

export function LucroProjetadoModal(props: LucroProjetadoModalProps) {
  const {
    open,
    onOpenChange,
    projetoId,
    lucroProjetado,
    saldoCasas,
    saquesRecebidos,
    saquesPendentes,
    depositosEfetivos,
    depositosBaseline,
  } = props;
  const { formatCurrency, convertToConsolidationOficial, cotacaoOficialUSD, moedaConsolidacao } = useProjetoCurrency(projetoId);
  const { breakdowns } = useKpiBreakdowns({
    projetoId,
    dataInicio: undefined,
    dataFim: undefined,
    moedaConsolidacao: moedaConsolidacao || 'BRL',
    convertToConsolidation: convertToConsolidationOficial,
    cotacaoKey: cotacaoOficialUSD,
  });

  const lucroOperacional = breakdowns?.lucro?.total ?? 0;
  const divergencia = lucroProjetado - lucroOperacional;
  const contributions = breakdowns?.lucro?.contributions ?? [];

  const hasBaseline = Math.abs(depositosBaseline) >= 0.005;

  // Segregação conceitual (fallbacks para retrocompatibilidade)
  const performancePura = props.performancePura ?? lucroOperacional;
  const efeitosFinanceiros = props.efeitosFinanceiros ?? props.resultadoFxFinanceiro;
  const ajustesExtraordinarios = props.ajustesExtraordinarios ?? (props.ajustesFinanceiro - props.perdaOpFinanceiro);
  const naoOperacional = efeitosFinanceiros + ajustesExtraordinarios;
  const totalProjeto = performancePura + naoOperacional;
  const hasNaoOperacional = Math.abs(naoOperacional) >= 0.01;

  const divergenceFactors = computeDivergenceFactors(
    divergencia,
    props,
    lucroOperacional,
    formatCurrency,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            Reconciliação de Lucro
          </DialogTitle>
          <p className="text-[10px] text-muted-foreground mt-1">
            Por que o Patrimônio (mark-to-market) difere do Lucro Operacional (juice das apostas)? Aqui está a ponte.
          </p>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-4 mt-3">
          {/* Camada 2: Patrimônio (Mark-to-Market) */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Patrimônio Líquido (se sacar agora)
              </span>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2.5 space-y-1">
              <ReconciliationRow label="Saldo em Bookmakers" value={saldoCasas} formatCurrency={formatCurrency} icon={Wallet} />
              <ReconciliationRow label="Saques Recebidos" value={saquesRecebidos} formatCurrency={formatCurrency} icon={ArrowUpCircle} />
              {saquesPendentes > 0 && (
                <ReconciliationRow label="Saques Pendentes" value={saquesPendentes} formatCurrency={formatCurrency} icon={Clock} />
              )}
              <ReconciliationRow
                label="(−) Depósitos Efetivos"
                value={depositosEfetivos}
                formatCurrency={formatCurrency}
                icon={ArrowDownCircle}
                muted
                tooltip="Dinheiro novo + recebido de outros projetos. Exclui o saldo inicial adotado (baseline contábil)."
              />
              {hasBaseline && (
                <ReconciliationRow
                  label="(−) Saldo inicial adotado"
                  value={depositosBaseline}
                  formatCurrency={formatCurrency}
                  icon={Info}
                  muted
                  tooltip="Saldo já existente quando uma casa foi vinculada ao projeto. Não é dinheiro novo — é a baseline contábil."
                />
              )}
              <div className="border-t border-border/40 mt-1.5 pt-1.5">
                <ReconciliationRow label="Patrimônio Líquido" value={lucroProjetado} formatCurrency={formatCurrency} bold icon={TrendingUp} />
              </div>
            </div>
          </div>

          {/* Camada 3: Operacional (Juice) */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 mb-2">
              <BarChart3 className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Lucro Operacional (juice das apostas)
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
                <ReconciliationRow label="Lucro Operacional" value={lucroOperacional} formatCurrency={formatCurrency} bold icon={BarChart3} />
              </div>
            </div>
          </div>

          {/* Divergência com breakdown */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className={`h-3 w-3 ${Math.abs(divergencia) < 0.01 ? "text-emerald-500" : "text-amber-500"}`} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Ponte de Reconciliação (Δ)
              </span>
            </div>
            <div
              className="rounded-lg border px-3 py-2.5 space-y-1"
              style={{
                borderColor: Math.abs(divergencia) < 0.01
                  ? 'hsl(var(--border))'
                  : 'hsl(45 93% 47% / 0.3)',
                backgroundColor: Math.abs(divergencia) < 0.01
                  ? 'hsl(var(--muted) / 0.3)'
                  : 'hsl(45 93% 47% / 0.05)',
              }}
            >
              {Math.abs(divergencia) < 0.01 ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-emerald-500 font-semibold">✓ Perfeitamente alinhados</span>
                </div>
              ) : (
                <>
                  {divergenceFactors.map((factor, i) => (
                    <ReconciliationRow
                      key={i}
                      label={factor.label}
                      value={factor.value}
                      formatCurrency={formatCurrency}
                      icon={factor.icon}
                      tooltip={factor.tooltip}
                    />
                  ))}
                  <div className="border-t border-border/40 mt-1.5 pt-1.5">
                    <ReconciliationRow
                      label="Δ Total (Patrimônio − Operacional)"
                      value={divergencia}
                      formatCurrency={formatCurrency}
                      bold
                      icon={Scale}
                    />
                  </div>
                  <p className="text-[9px] text-muted-foreground/80 mt-1.5">
                    {Math.abs(divergencia) < 1
                      ? "Diferença mínima — arredondamentos de conversão cambial."
                      : "A diferença entre Patrimônio (mark-to-market live) e Operacional (juice puro) vem de variação cambial e ganhos/perdas em confirmação de saques. Não é erro — é a realidade econômica do projeto."}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
