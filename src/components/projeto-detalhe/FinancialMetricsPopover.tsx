import { useMemo, useState } from "react";
import { differenceInDays, parseISO, format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { FinancialDrillDownModal } from "./FinancialDrillDownModal";
import {
  DollarSign,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  TrendingUp,
  Clock,
  ArrowRightLeft,
  Gift,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Users,
  Building2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";


interface FinancialMetricsPopoverProps {
  projetoId: string;
  dateRange?: { from: string; to: string } | null;
}

interface LedgerEntry {
  valor: number;
  valor_confirmado?: number | null;
  moeda: string;
}

function applyDateFilter<T extends { gte: (col: string, val: string) => T; lte: (col: string, val: string) => T }>(
  query: T,
  dateRange?: { from: string; to: string } | null,
  dateColumn = "data_transacao"
): T {
  if (!dateRange) return query;
  const startUTC = `${dateRange.from}T00:00:00.000Z`;
  const endUTC = `${dateRange.to}T23:59:59.999Z`;
  return query.gte(dateColumn, startUTC).lte(dateColumn, endUTC);
}

async function fetchFinancialMetricsRaw(projetoId: string, dateRange?: { from: string; to: string } | null) {
  const { data: bookmakers } = await supabase
    .from("bookmakers")
    .select("id, saldo_atual, moeda, investidor_id")
    .eq("projeto_id", projetoId);

  // Keep investidor_id for saldo breakdown
  const bookmakerSaldos = (bookmakers || []).map(b => ({
    saldo_atual: b.saldo_atual || 0,
    moeda: b.moeda || "BRL",
    isInvestor: !!b.investidor_id,
  }));
  const investorBookmakerIds = (bookmakers || []).filter(b => !!b.investidor_id).map(b => b.id);

  const depositoQ = applyDateFilter(
    supabase.from("cash_ledger").select("valor, moeda, destino_bookmaker_id, tipo_transacao")
      .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL"])
      .eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    dateRange
  );

  const saqueQ = applyDateFilter(
    supabase.from("cash_ledger").select("valor, valor_confirmado, moeda, origem_bookmaker_id")
      .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
      .eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    dateRange
  );

  // Include origem_bookmaker_id for pending breakdown
  const saquePendQ = applyDateFilter(
    supabase.from("cash_ledger").select("valor, moeda, origem_bookmaker_id")
      .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
      .eq("status", "PENDENTE").eq("projeto_id_snapshot", projetoId),
    dateRange
  );

  const [depositos, saques, saquesPend, cashbackM, cashbackE, giros, ajustes, perdasOp, perdasFx, ganhosFx] = await Promise.all([
    depositoQ.limit(10000),
    saqueQ.limit(10000),
    saquePendQ.limit(10000),
    applyDateFilter(supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "CASHBACK_MANUAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId), dateRange).limit(10000),
    applyDateFilter(supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "CASHBACK_ESTORNO").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId), dateRange).limit(10000),
    applyDateFilter(supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "GIRO_GRATIS").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId), dateRange).limit(10000),
    applyDateFilter(supabase.from("cash_ledger").select("valor, moeda, ajuste_direcao")
      .eq("tipo_transacao", "AJUSTE_SALDO").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId), dateRange).limit(10000),
    applyDateFilter(supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "PERDA_OPERACIONAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId), dateRange).limit(10000),
    applyDateFilter(supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "PERDA_CAMBIAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId), dateRange).limit(10000),
    applyDateFilter(supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "GANHO_CAMBIAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId), dateRange).limit(10000),
  ]);

  // Include bookmaker IDs in timeline for internal-only break-even
  const timelineQ = applyDateFilter(
    supabase
      .from("cash_ledger")
      .select("valor, valor_confirmado, moeda, data_transacao, tipo_transacao, destino_bookmaker_id, origem_bookmaker_id")
      .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL", "SAQUE", "SAQUE_VIRTUAL"])
      .eq("status", "CONFIRMADO")
      .eq("projeto_id_snapshot", projetoId)
      .order("data_transacao", { ascending: true }),
    dateRange
  ).limit(10000);

  const { data: timelineData } = await timelineQ;

  let bonusQuery = supabase
    .from("project_bookmaker_link_bonuses")
    .select("bonus_amount, currency")
    .eq("project_id", projetoId)
    .in("status", ["credited", "finalized"]);
  
  if (dateRange) {
    bonusQuery = bonusQuery.gte("credited_at", dateRange.from).lte("credited_at", dateRange.to);
  }
  
  const { data: bonusGanhosData } = await bonusQuery;

  return {
    bookmakerSaldos,
    investorBookmakerIds,
    depositos: (depositos.data || []) as (LedgerEntry & { destino_bookmaker_id?: string | null; tipo_transacao?: string })[],
    saques: (saques.data || []) as (LedgerEntry & { origem_bookmaker_id?: string | null })[],
    saquesPendentes: (saquesPend.data || []) as (LedgerEntry & { origem_bookmaker_id?: string | null })[],
    reconciliation: {
      cashbackManual: (cashbackM.data || []) as { valor: number; moeda: string }[],
      cashbackEstorno: (cashbackE.data || []) as { valor: number; moeda: string }[],
      girosGratis: (giros.data || []) as { valor: number; moeda: string }[],
      ajusteSaldo: (ajustes.data || []) as { valor: number; moeda: string; ajuste_direcao?: string | null }[],
      perdaOperacional: (perdasOp.data || []) as { valor: number; moeda: string }[],
      perdaCambial: (perdasFx.data || []) as { valor: number; moeda: string }[],
      ganhoCambial: (ganhosFx.data || []) as { valor: number; moeda: string }[],
    },
    breakEvenTimeline: (timelineData || []) as { valor: number; valor_confirmado?: number | null; moeda: string; data_transacao: string; tipo_transacao: string; destino_bookmaker_id?: string | null; origem_bookmaker_id?: string | null }[],
    bonusGanhos: (bonusGanhosData || []) as { bonus_amount: number; currency: string }[],
  };
}

function MetricRow({ label, value, colorClass = "text-foreground", bold = false, indent = false, tooltip }: {
  label: string;
  value: string;
  colorClass?: string;
  bold?: boolean;
  indent?: boolean;
  tooltip?: string;
}) {
  const labelEl = (
    <span className={`text-[11px] ${bold ? "font-medium text-foreground" : "text-muted-foreground"} ${tooltip ? "border-b border-dotted border-muted-foreground/40 cursor-help" : ""}`}>
      {label}
    </span>
  );

  return (
    <div className={`flex items-center justify-between gap-4 ${indent ? "pl-3" : ""}`}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{labelEl}</TooltipTrigger>
          <TooltipContent side="left" className="max-w-[240px] text-xs">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      ) : labelEl}
      <span className={`text-[11px] font-mono tabular-nums ${bold ? "font-bold" : "font-semibold"} ${colorClass}`}>
        {value}
      </span>
    </div>
  );
}

function SectionHeader({ icon: Icon, label, iconClass = "text-muted-foreground" }: {
  icon: React.ElementType;
  label: string;
  iconClass?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <Icon className={`h-3 w-3 ${iconClass}`} />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

function ExtrasCollapsible({ metrics, formatCurrency }: { metrics: any; formatCurrency: (v: number) => string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between gap-4 w-full group"
      >
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          Créditos Extras
          <ChevronDown className={`h-3 w-3 text-muted-foreground/60 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
        <span className="text-[11px] font-mono tabular-nums font-semibold text-emerald-500">
          {formatCurrency(metrics.extrasPositivos)}
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-border/30 ml-1">
          {Math.abs(metrics.bonusGanhos) >= 0.01 && (
            <MetricRow label="Bônus Ganhos" value={formatCurrency(metrics.bonusGanhos)} colorClass="text-emerald-500" indent tooltip="Valor total de bônus creditados nas casas de apostas. Representa o capital promocional recebido que contribui para o patrimônio do projeto." />
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
            <MetricRow label="Ajustes de Saldo" value={formatCurrency(metrics.ajustes)} colorClass={metrics.ajustes >= 0 ? "text-emerald-500" : "text-red-500"} indent tooltip="Correções feitas quando o saldo da casa diverge do esperado — por exemplo, variações de odds em décimos durante a operação que geram pequenas diferenças. O ajuste garante que o lucro real seja apurado corretamente." />
          )}
          {(() => {
            const fxLiquido = metrics.ganhoFx - metrics.perdaFx;
            return Math.abs(fxLiquido) >= 0.01 ? (
              <MetricRow label="Resultado Cambial" value={fxLiquido < 0 ? `−${formatCurrency(Math.abs(fxLiquido))}` : formatCurrency(fxLiquido)} colorClass={fxLiquido >= 0 ? "text-emerald-500" : "text-red-500"} indent tooltip="Diferença entre o valor solicitado no saque e o valor efetivamente recebido, causada por variação cambial entre a data do pedido e a data de confirmação. Ganhos e perdas são apurados automaticamente na conciliação." />
            ) : null;
          })()}
          {Math.abs(metrics.perdaOp) >= 0.01 && (
            <MetricRow label="Perdas Operacionais" value={`−${formatCurrency(metrics.perdaOp)}`} colorClass="text-red-500" indent tooltip="Capital perdido por incidentes operacionais — como contas bloqueadas, saldos retidos ou fundos irrecuperáveis. Registrado via ocorrências ou ação rápida de perda." />
          )}
        </div>
      )}
    </div>
  );
}

/** Helper to compute break-even from a timeline */
function computeBreakEven(
  timeline: { valor: number; valor_confirmado?: number | null; moeda: string; data_transacao: string; tipo_transacao: string }[],
  convertToConsolidationOficial: (valor: number, moeda: string) => number,
) {
  let cumulativeFlow = 0;
  let breakEvenDate: string | null = null;
  let firstTransactionDate: string | null = null;
  for (const entry of timeline) {
    if (!firstTransactionDate) firstTransactionDate = entry.data_transacao;
    const isSaque = entry.tipo_transacao === "SAQUE" || entry.tipo_transacao === "SAQUE_VIRTUAL";
    const valor = isSaque
      ? convertToConsolidationOficial(entry.valor_confirmado ?? entry.valor, entry.moeda)
      : convertToConsolidationOficial(entry.valor, entry.moeda);
    cumulativeFlow += isSaque ? valor : -valor;
    if (cumulativeFlow >= 0 && !breakEvenDate) breakEvenDate = entry.data_transacao;
    if (cumulativeFlow < 0) breakEvenDate = null;
  }
  const breakEvenDays = breakEvenDate && firstTransactionDate
    ? differenceInDays(parseISO(breakEvenDate), parseISO(firstTransactionDate))
    : null;
  return { breakEvenDate, breakEvenDays, fluxoFinal: cumulativeFlow };
}

export function FinancialMetricsPopover({ projetoId, dateRange }: FinancialMetricsPopoverProps) {
  const { formatCurrency, convertToConsolidationOficial, cotacaoOficialUSD } = useProjetoCurrency(projetoId);

  const { data: rawMetrics, isLoading } = useQuery({
    queryKey: ["projeto-financial-metrics", projetoId, dateRange?.from, dateRange?.to],
    queryFn: () => fetchFinancialMetricsRaw(projetoId, dateRange),
    staleTime: 30_000,
    gcTime: 60_000,
  });

  const metrics = useMemo(() => {
    if (!rawMetrics) return null;

    // ─── Saldo nas casas: total + breakdown ───
    const saldoCasas = rawMetrics.bookmakerSaldos.reduce(
      (acc, b) => acc + convertToConsolidationOficial(b.saldo_atual, b.moeda), 0
    );
    const saldoCasasInvestidor = rawMetrics.bookmakerSaldos
      .filter(b => b.isInvestor)
      .reduce((acc, b) => acc + convertToConsolidationOficial(b.saldo_atual, b.moeda), 0);
    const saldoCasasInterno = saldoCasas - saldoCasasInvestidor;

    // ─── Depósitos: total + breakdown ───
    const depositosTotal = rawMetrics.depositos.reduce(
      (acc, d) => acc + convertToConsolidationOficial(d.valor, d.moeda), 0
    );
    const depositosReais = rawMetrics.depositos
      .filter(d => d.tipo_transacao === 'DEPOSITO')
      .reduce((acc, d) => acc + convertToConsolidationOficial(d.valor, d.moeda), 0);
    const depositosVirtuais = rawMetrics.depositos
      .filter(d => d.tipo_transacao === 'DEPOSITO_VIRTUAL')
      .reduce((acc, d) => acc + convertToConsolidationOficial(d.valor, d.moeda), 0);
    const depositosInvestidor = rawMetrics.depositos
      .filter(d => d.destino_bookmaker_id && rawMetrics.investorBookmakerIds.includes(d.destino_bookmaker_id))
      .reduce((acc, d) => acc + convertToConsolidationOficial(d.valor, d.moeda), 0);
    const depositosInterno = depositosTotal - depositosInvestidor;

    // ─── Saques confirmados: total + breakdown ───
    const saquesRecebidos = rawMetrics.saques.reduce(
      (acc, s) => acc + convertToConsolidationOficial(s.valor_confirmado ?? s.valor, s.moeda), 0
    );
    const saquesInvestidor = rawMetrics.saques
      .filter(s => s.origem_bookmaker_id && rawMetrics.investorBookmakerIds.includes(s.origem_bookmaker_id))
      .reduce((acc, s) => acc + convertToConsolidationOficial(s.valor_confirmado ?? s.valor, s.moeda), 0);
    const saquesInterno = saquesRecebidos - saquesInvestidor;

    // ─── Saques pendentes: total + breakdown ───
    const saquesPendentes = rawMetrics.saquesPendentes.reduce(
      (acc, s) => acc + convertToConsolidationOficial(s.valor, s.moeda), 0
    );
    const saquesPendentesInvestidor = rawMetrics.saquesPendentes
      .filter(s => s.origem_bookmaker_id && rawMetrics.investorBookmakerIds.includes(s.origem_bookmaker_id))
      .reduce((acc, s) => acc + convertToConsolidationOficial(s.valor, s.moeda), 0);
    const saquesPendentesInterno = saquesPendentes - saquesPendentesInvestidor;

    const ganhoConfirmacao = rawMetrics.saques.reduce((acc, s) => {
      if (s.valor_confirmado != null && s.valor_confirmado !== s.valor) {
        return acc + convertToConsolidationOficial(s.valor_confirmado - s.valor, s.moeda);
      }
      return acc;
    }, 0);

    const r = rawMetrics.reconciliation;
    const sumConvert = (arr: { valor: number; moeda: string }[]) =>
      arr.reduce((acc, e) => acc + convertToConsolidationOficial(e.valor, e.moeda), 0);

    const cashbackLiquido = sumConvert(r.cashbackManual) - sumConvert(r.cashbackEstorno);
    const girosGratis = sumConvert(r.girosGratis);
    const ajustes = r.ajusteSaldo.reduce((acc, e) => {
      const sinal = e.ajuste_direcao === 'SAIDA' ? -1 : 1;
      return acc + convertToConsolidationOficial(e.valor * sinal, e.moeda);
    }, 0);
    const perdaOp = sumConvert(r.perdaOperacional);
    const perdaFx = sumConvert(r.perdaCambial);
    const ganhoFx = sumConvert(r.ganhoCambial);

    const bonusGanhos = rawMetrics.bonusGanhos.reduce(
      (acc, b) => acc + convertToConsolidationOficial(b.bonus_amount, b.currency || 'BRL'), 0
    );

    // ─── Fluxo consolidado ───
    const fluxoCaixaLiquido = saquesRecebidos - depositosTotal;
    const extrasPositivos = cashbackLiquido + girosGratis + ajustes + ganhoConfirmacao + ganhoFx + bonusGanhos;
    const capitalTotal = depositosTotal + extrasPositivos;
    const fluxoLiquidoAjustado = fluxoCaixaLiquido;
    const patrimonio = saldoCasas + saquesRecebidos + saquesPendentes;
    const lucroFinanceiro = patrimonio - depositosTotal;

    // ─── Fluxo INTERNO (sem investidor) ───
    const fluxoInternoLiquido = saquesInterno - depositosInterno;

    // ─── Break-even CONSOLIDADO ───
    const beConsolidado = computeBreakEven(
      rawMetrics.breakEvenTimeline,
      convertToConsolidationOficial,
    );

    // ─── Break-even INTERNO (exclui transações do investidor) ───
    const investorIds = rawMetrics.investorBookmakerIds;
    const timelineInterno = rawMetrics.breakEvenTimeline.filter(entry => {
      const isSaque = entry.tipo_transacao === "SAQUE" || entry.tipo_transacao === "SAQUE_VIRTUAL";
      const bmId = isSaque ? entry.origem_bookmaker_id : entry.destino_bookmaker_id;
      return !bmId || !investorIds.includes(bmId);
    });
    const beInterno = computeBreakEven(
      timelineInterno,
      convertToConsolidationOficial,
    );

    const hasInvestorCapital = depositosInvestidor > 0 || saquesInvestidor > 0 || saldoCasasInvestidor > 0;

    return {
      depositosTotal, depositosReais, depositosVirtuais, depositosInvestidor, depositosInterno,
      saquesRecebidos, saquesInvestidor, saquesInterno,
      saquesPendentes, saquesPendentesInvestidor, saquesPendentesInterno,
      saldoCasas, saldoCasasInvestidor, saldoCasasInterno,
      fluxoCaixaLiquido, fluxoLiquidoAjustado, capitalTotal, extrasPositivos,
      fluxoInternoLiquido,
      cashbackLiquido, girosGratis, ajustes, ganhoConfirmacao, ganhoFx, perdaOp, perdaFx,
      bonusGanhos,
      patrimonio, lucroFinanceiro,
      // Break-even consolidado
      breakEvenDate: beConsolidado.breakEvenDate,
      breakEvenDays: beConsolidado.breakEvenDays,
      // Break-even interno
      breakEvenInternoDate: beInterno.breakEvenDate,
      breakEvenInternoDays: beInterno.breakEvenDays,
      fluxoInternoFinal: beInterno.fluxoFinal,
      hasInvestorCapital,
    };
  }, [rawMetrics, convertToConsolidationOficial, cotacaoOficialUSD]);

  if (isLoading || !metrics) {
    return (
      <div className="p-5 space-y-3 w-[340px]">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const breakEvenReached = metrics.fluxoCaixaLiquido >= 0;
  const breakEvenInternoReached = metrics.fluxoInternoLiquido >= 0;
  const hasExtras = Math.abs(metrics.extrasPositivos) >= 0.01;

  return (
    <div className="p-4 w-[340px] space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10">
            <DollarSign className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-xs font-bold tracking-tight">Indicadores Financeiros</span>
        </div>
        {dateRange && (
          <span className="text-[9px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
            {format(parseISO(dateRange.from), "dd/MM")} – {format(parseISO(dateRange.to), "dd/MM")}
          </span>
        )}
      </div>

      {/* ─── Seção 1: Fluxo de Caixa ─── */}
      <div className="space-y-1 pb-3">
        <SectionHeader icon={ArrowRightLeft} label="Fluxo de Caixa" />
        {metrics.depositosReais > 0 && (
          <MetricRow 
            label="Depósitos Reais" 
            value={formatCurrency(metrics.depositosReais)}
            indent
            tooltip="Dinheiro efetivamente transferido para as casas neste projeto"
          />
        )}
        {metrics.depositosVirtuais > 0 && (
          <MetricRow 
            label="Capital Inicial (vinculação)" 
            value={formatCurrency(metrics.depositosVirtuais)}
            indent
            colorClass="text-muted-foreground"
            tooltip="Saldo já existente nas casas no momento da vinculação ao projeto. Não representa dinheiro novo — é a baseline contábil."
          />
        )}
        <MetricRow 
          label="Total Depósitos" 
          value={formatCurrency(metrics.depositosTotal)}
          bold
          tooltip={metrics.hasInvestorCapital ? `Interno: ${formatCurrency(metrics.depositosInterno)} · Investidor: ${formatCurrency(metrics.depositosInvestidor)}` : "Soma de depósitos reais + capital inicial das casas vinculadas"}
        />
        {hasExtras && (
          <ExtrasCollapsible metrics={metrics} formatCurrency={formatCurrency} />
        )}
        <MetricRow 
          label="Saques Recebidos" 
          value={formatCurrency(metrics.saquesRecebidos)}
          tooltip={metrics.hasInvestorCapital ? `Interno: ${formatCurrency(metrics.saquesInterno)} · Investidor: ${formatCurrency(metrics.saquesInvestidor)}` : undefined}
        />
        {metrics.saquesPendentes > 0 && (
          <MetricRow 
            label="Saques Pendentes" 
            value={formatCurrency(metrics.saquesPendentes)} 
            colorClass="text-amber-500"
            tooltip={metrics.hasInvestorCapital ? `Interno: ${formatCurrency(metrics.saquesPendentesInterno)} · Investidor: ${formatCurrency(metrics.saquesPendentesInvestidor)}` : undefined}
          />
        )}
        <div className="border-t border-border/30 mt-1.5 pt-1.5">
          <MetricRow 
            label={hasExtras ? "Fluxo Líquido Ajustado" : "Fluxo Líquido"} 
            value={formatCurrency(hasExtras ? metrics.fluxoLiquidoAjustado : metrics.fluxoCaixaLiquido)} 
            colorClass={(hasExtras ? metrics.fluxoLiquidoAjustado : metrics.fluxoCaixaLiquido) >= 0 ? "text-emerald-500" : "text-red-500"}
            bold
            tooltip={metrics.hasInvestorCapital ? `Consolidado (Interno + Investidor). Interno: ${formatCurrency(metrics.fluxoInternoLiquido)}` : undefined}
          />
          {hasExtras && (
            <p className="text-[9px] text-muted-foreground/70 mt-0.5">
              Saques − Depósitos
            </p>
          )}
          {/* Fluxo interno separado quando há investidor */}
          {metrics.hasInvestorCapital && (
            <div className="mt-1.5 pt-1.5 border-t border-dashed border-border/20">
              <MetricRow
                label="↳ Fluxo Interno"
                value={formatCurrency(metrics.fluxoInternoLiquido)}
                colorClass={metrics.fluxoInternoLiquido >= 0 ? "text-emerald-500" : "text-red-500"}
                bold
                tooltip="Apenas movimentações de capital interno (sem investidor). Reflete o retorno real do seu próprio capital."
              />
            </div>
          )}
        </div>
      </div>

      {/* ─── Seção 4: Retorno de Capital ─── */}
      <div className="border-t border-border/40 pt-3 space-y-2">
        {/* Break-even CONSOLIDADO */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            {breakEvenReached ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            ) : (
              <AlertCircle className="h-3 w-3 text-amber-500" />
            )}
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Lucro Realizado
              {metrics.hasInvestorCapital && (
                <span className="ml-1 text-[9px] font-normal normal-case text-muted-foreground/60">(consolidado)</span>
              )}
            </span>
          </div>
          
          {breakEvenReached ? (
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 px-3 py-2">
              <p className="text-[11px] text-foreground font-medium">
                Capital recuperado em {metrics.breakEvenDays ?? "—"} dias
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Saques superaram depósitos em{" "}
                {metrics.breakEvenDate && format(parseISO(metrics.breakEvenDate), "dd/MM/yyyy")}.
                O caixa já recebeu de volta todo o valor investido.
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 px-3 py-2">
              <p className="text-[11px] text-foreground font-medium">
                Faltam {formatCurrency(Math.abs(metrics.fluxoCaixaLiquido))} para recuperar
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Saques recebidos ainda não cobriram os depósitos realizados.
              </p>
            </div>
          )}
        </div>

        {/* Break-even INTERNO — apenas quando há investidor */}
        {metrics.hasInvestorCapital && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              {breakEvenInternoReached ? (
                <Building2 className="h-3 w-3 text-emerald-500" />
              ) : (
                <Building2 className="h-3 w-3 text-amber-500" />
              )}
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Capital Interno
                <span className="ml-1 text-[9px] font-normal normal-case text-muted-foreground/60">(sem investidor)</span>
              </span>
            </div>

            {breakEvenInternoReached ? (
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 px-3 py-2">
                <p className="text-[11px] text-foreground font-medium">
                  Capital interno recuperado em {metrics.breakEvenInternoDays ?? "—"} dias
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Saques de contas internas já cobriram todos os depósitos internos.
                  {metrics.breakEvenInternoDate && ` Alcançado em ${format(parseISO(metrics.breakEvenInternoDate), "dd/MM/yyyy")}.`}
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 px-3 py-2">
                <p className="text-[11px] text-foreground font-medium">
                  Faltam {formatCurrency(Math.abs(metrics.fluxoInternoLiquido))} (capital interno)
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Saques de contas internas ainda não cobriram os depósitos internos.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
