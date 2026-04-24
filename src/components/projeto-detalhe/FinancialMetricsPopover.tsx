import { useMemo, useState } from "react";
import { getConsolidatedLucroDirect, PernaConsolidavel } from "@/utils/consolidatedValues";
import { differenceInDays, parseISO, format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { FinancialDrillDownModal } from "./FinancialDrillDownModal";
import { LucroProjetadoModal } from "./LucroProjetadoModal";
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
  Sparkles,
  Globe,
  Wrench,
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
    supabase.from("cash_ledger").select("valor, moeda, destino_bookmaker_id, tipo_transacao, origem_tipo")
      .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL"])
      .eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    dateRange
  );

  const saqueQ = applyDateFilter(
    supabase.from("cash_ledger").select("valor, valor_confirmado, moeda, origem_bookmaker_id, tipo_moeda, tipo_transacao")
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

  // Query de apostas liquidadas por estratégia (para juice breakdown)
  // CRÍTICO: incluir id e is_multicurrency para buscar pernas e usar getConsolidatedLucroDirect
  let apostasPorEstrategiaQ = supabase
    .from("apostas_unificada")
    .select("id, estrategia, lucro_prejuizo, pl_consolidado, moeda_operacao, consolidation_currency, is_multicurrency")
    .eq("projeto_id", projetoId)
    .eq("status", "LIQUIDADA");
  if (dateRange) {
    apostasPorEstrategiaQ = apostasPorEstrategiaQ
      .gte("data_aposta", dateRange.from)
      .lte("data_aposta", dateRange.to);
  }

  const [depositos, saques, saquesPend, cashbackM, cashbackE, giros, girosEstorno, ajustes, perdasOp, perdasFx, ganhosFx, apostasPorEstrategia] = await Promise.all([
    depositoQ.limit(10000),
    saqueQ.limit(10000),
    saquePendQ.limit(10000),
    applyDateFilter(supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "CASHBACK_MANUAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId), dateRange).limit(10000),
    applyDateFilter(supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "CASHBACK_ESTORNO").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId), dateRange).limit(10000),
    applyDateFilter(supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "GIRO_GRATIS").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId), dateRange).limit(10000),
    applyDateFilter(supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "GIRO_GRATIS_ESTORNO").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId), dateRange).limit(10000),
    applyDateFilter(supabase.from("cash_ledger").select("valor, moeda, ajuste_direcao, ajuste_natureza")
      .eq("tipo_transacao", "AJUSTE_SALDO").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId), dateRange).limit(10000),
    applyDateFilter(supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "PERDA_OPERACIONAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId), dateRange).limit(10000),
    applyDateFilter(supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "PERDA_CAMBIAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId), dateRange).limit(10000),
    applyDateFilter(supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "GANHO_CAMBIAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId), dateRange).limit(10000),
    apostasPorEstrategiaQ.limit(10000),
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

  // Fetch pernas para apostas multicurrency (conversão direta, sem pivot BRL)
  const apostasArr = (apostasPorEstrategia.data || []) as { id: string; estrategia: string; lucro_prejuizo: number | null; pl_consolidado: number | null; moeda_operacao: string | null; consolidation_currency: string | null; is_multicurrency: boolean | null }[];
  const multicurrencyIds = apostasArr.filter(a => a.is_multicurrency).map(a => a.id);
  
  let pernasMap: Record<string, PernaConsolidavel[]> = {};
  if (multicurrencyIds.length > 0) {
    // Buscar em chunks de 100 para evitar URI too long
    for (let i = 0; i < multicurrencyIds.length; i += 100) {
      const chunk = multicurrencyIds.slice(i, i + 100);
      const { data: pernas } = await supabase
        .from("apostas_pernas")
        .select("aposta_id, moeda, lucro_prejuizo, resultado")
        .in("aposta_id", chunk);
      if (pernas) {
        for (const p of pernas) {
          if (!pernasMap[p.aposta_id]) pernasMap[p.aposta_id] = [];
          pernasMap[p.aposta_id].push(p);
        }
      }
    }
  }

  return {
    bookmakerSaldos,
    investorBookmakerIds,
    depositos: (depositos.data || []) as (LedgerEntry & { destino_bookmaker_id?: string | null; tipo_transacao?: string })[],
    saques: (saques.data || []) as (LedgerEntry & { origem_bookmaker_id?: string | null; tipo_moeda?: string | null; tipo_transacao?: string })[],
    saquesPendentes: (saquesPend.data || []) as (LedgerEntry & { origem_bookmaker_id?: string | null })[],
    reconciliation: {
      cashbackManual: (cashbackM.data || []) as { valor: number; moeda: string }[],
      cashbackEstorno: (cashbackE.data || []) as { valor: number; moeda: string }[],
      girosGratis: (giros.data || []) as { valor: number; moeda: string }[],
      girosGratisEstorno: (girosEstorno.data || []) as { valor: number; moeda: string }[],
      ajusteSaldo: (ajustes.data || []) as { valor: number; moeda: string; ajuste_direcao?: string | null; ajuste_natureza?: string | null }[],
      perdaOperacional: (perdasOp.data || []) as { valor: number; moeda: string }[],
      perdaCambial: (perdasFx.data || []) as { valor: number; moeda: string }[],
      ganhoCambial: (ganhosFx.data || []) as { valor: number; moeda: string }[],
    },
    breakEvenTimeline: (timelineData || []) as { valor: number; valor_confirmado?: number | null; moeda: string; data_transacao: string; tipo_transacao: string; destino_bookmaker_id?: string | null; origem_bookmaker_id?: string | null }[],
    bonusGanhos: (bonusGanhosData || []) as { bonus_amount: number; currency: string }[],
    apostasPorEstrategia: apostasArr,
    apostasPernasMap: pernasMap,
  };
}

function MetricRow({ label, value, colorClass = "text-foreground", bold = false, indent = false, tooltip, onClick }: {
  label: string;
  value: string;
  colorClass?: string;
  bold?: boolean;
  indent?: boolean;
  tooltip?: string;
  onClick?: () => void;
}) {
  const isClickable = !!onClick;
  const labelEl = (
    <span className={`text-[11px] ${bold ? "font-medium text-foreground" : "text-muted-foreground"} ${tooltip ? "border-b border-dotted border-muted-foreground/40 cursor-help" : ""} ${isClickable ? "group-hover:text-primary transition-colors" : ""}`}>
      {label}
    </span>
  );

  return (
    <div
      className={`flex items-center justify-between gap-4 ${indent ? "pl-3" : ""} ${isClickable ? "group cursor-pointer hover:bg-muted/40 -mx-1 px-1 rounded transition-colors" : ""}`}
      onClick={onClick}
      role={isClickable ? "button" : undefined}
    >
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{labelEl}</TooltipTrigger>
          <TooltipContent side="left" className="max-w-[240px] text-xs">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      ) : labelEl}
      <span className={`text-[11px] font-mono tabular-nums ${bold ? "font-bold" : "font-semibold"} ${colorClass} ${isClickable ? "group-hover:text-primary transition-colors" : ""}`}>
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

function SegregatedExtrasBlock({
  metrics,
  formatCurrency,
  onDrillDown,
}: {
  metrics: any;
  formatCurrency: (v: number) => string;
  onDrillDown?: (key: string, value: number) => void;
}) {
  const [openPerf, setOpenPerf] = useState(false);
  const [openFx, setOpenFx] = useState(false);
  const [openAdj, setOpenAdj] = useState(false);

  const fmtSigned = (v: number) =>
    v < 0 ? `−${formatCurrency(Math.abs(v))}` : formatCurrency(v);

  const hasPerf = Math.abs(metrics.creditosPerformance) >= 0.01;
  const hasFx = Math.abs(metrics.efeitosFinanceiros) >= 0.01;
  const hasAdj = Math.abs(metrics.ajustesExtraordinarios) >= 0.01;

  if (!hasPerf && !hasFx && !hasAdj) return null;

  return (
    <div className="space-y-1">
      {/* 🟢 PERFORMANCE — Créditos da operação */}
      {hasPerf && (
        <div>
          <button
            onClick={() => setOpenPerf(!openPerf)}
            className="flex items-center justify-between gap-4 w-full group"
          >
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-emerald-500/80" />
              Créditos de Performance
              <ChevronDown className={`h-3 w-3 text-muted-foreground/60 transition-transform ${openPerf ? "rotate-180" : ""}`} />
            </span>
            <span className="text-[11px] font-mono tabular-nums font-semibold text-emerald-500">
              {formatCurrency(metrics.creditosPerformance)}
            </span>
          </button>
          {openPerf && (
            <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-emerald-500/30 ml-1">
              {Math.abs(metrics.bonusGanhos) >= 0.01 && (
                <MetricRow label="Bônus Ganhos" value={formatCurrency(metrics.bonusGanhos)} colorClass="text-emerald-500" indent tooltip="Valor total de bônus creditados nas casas. Capital promocional que contribui para o patrimônio." onClick={() => onDrillDown?.("bonusGanhos", metrics.bonusGanhos)} />
              )}
              {Math.abs(metrics.cashbackLiquido) >= 0.01 && (
                <MetricRow label="Cashback Líquido" value={formatCurrency(metrics.cashbackLiquido)} colorClass="text-emerald-500" indent onClick={() => onDrillDown?.("cashbackLiquido", metrics.cashbackLiquido)} />
              )}
              {Math.abs(metrics.girosGratis) >= 0.01 && (
                <MetricRow label="Giros Grátis" value={formatCurrency(metrics.girosGratis)} colorClass="text-emerald-500" indent onClick={() => onDrillDown?.("girosGratis", metrics.girosGratis)} />
              )}
            </div>
          )}
        </div>
      )}

      {/* 🟡 EFEITOS FINANCEIROS — FX */}
      {hasFx && (
        <div>
          <button
            onClick={() => setOpenFx(!openFx)}
            className="flex items-center justify-between gap-4 w-full group"
          >
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Globe className="h-3 w-3 text-amber-500/80" />
              Efeitos Financeiros (FX)
              <ChevronDown className={`h-3 w-3 text-muted-foreground/60 transition-transform ${openFx ? "rotate-180" : ""}`} />
            </span>
            <span className={`text-[11px] font-mono tabular-nums font-semibold ${metrics.efeitosFinanceiros >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {fmtSigned(metrics.efeitosFinanceiros)}
            </span>
          </button>
          {openFx && (
            <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-amber-500/30 ml-1">
              {(() => {
                const fxLiquido = metrics.ganhoFx - metrics.perdaFx;
                return Math.abs(fxLiquido) >= 0.01 ? (
                  <MetricRow label="Resultado Cambial" value={fmtSigned(fxLiquido)} colorClass={fxLiquido >= 0 ? "text-emerald-500" : "text-red-500"} indent tooltip="Diferença entre valor solicitado e valor recebido nos saques, causada por variação cambial entre pedido e confirmação. Não é performance — é efeito macro." onClick={() => onDrillDown?.("resultadoCambial", fxLiquido)} />
                ) : null;
              })()}
              {Math.abs(metrics.ganhoConfirmacao) >= 0.01 && (
                <MetricRow label="Ganho/Perda de Confirmação" value={fmtSigned(metrics.ganhoConfirmacao)} colorClass={metrics.ganhoConfirmacao >= 0 ? "text-emerald-500" : "text-red-500"} indent tooltip="Diferença entre o valor solicitado e o valor confirmado em depósitos. Variação cambial implícita na liquidação." onClick={() => onDrillDown?.("ganhoConfirmacao", metrics.ganhoConfirmacao)} />
              )}
            </div>
          )}
          <p className="text-[9px] text-muted-foreground/60 mt-0.5 pl-4">
            Variação de moeda. Fora do controle do operador.
          </p>
        </div>
      )}

      {/* 🟠 EXTRAORDINÁRIOS */}
      {hasAdj && (
        <div>
          <button
            onClick={() => setOpenAdj(!openAdj)}
            className="flex items-center justify-between gap-4 w-full group"
          >
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Wrench className="h-3 w-3 text-orange-500/80" />
              Extraordinários
              <ChevronDown className={`h-3 w-3 text-muted-foreground/60 transition-transform ${openAdj ? "rotate-180" : ""}`} />
            </span>
            <span className={`text-[11px] font-mono tabular-nums font-semibold ${metrics.ajustesExtraordinarios >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {fmtSigned(metrics.ajustesExtraordinarios)}
            </span>
          </button>
          {openAdj && (
            <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-orange-500/30 ml-1">
              {Math.abs(metrics.ajustesExtraord) >= 0.01 && (
                <MetricRow label="Ajustes Extraordinários" value={fmtSigned(metrics.ajustesExtraord)} colorClass={metrics.ajustesExtraord >= 0 ? "text-emerald-500" : "text-red-500"} indent tooltip="Ajustes de saldo classificados como administrativos/sem vínculo operacional (estornos, correções de lançamento). Reclassifique no Extrato se necessário." onClick={() => onDrillDown?.("ajustes", metrics.ajustesExtraord)} />
              )}
              {Math.abs(metrics.perdaOp) >= 0.01 && (
                <MetricRow label="Perdas Operacionais" value={`−${formatCurrency(metrics.perdaOp)}`} colorClass="text-red-500" indent tooltip="Capital perdido por incidentes (contas bloqueadas, saldos retidos). Evento extraordinário, fora da performance recorrente." onClick={() => onDrillDown?.("perdaOp", metrics.perdaOp)} />
              )}
            </div>
          )}
          <p className="text-[9px] text-muted-foreground/60 mt-0.5 pl-4">
            Incidentes e ajustes administrativos. Afeta o caixa, mas não é performance.
          </p>
        </div>
      )}
    </div>
  );
}

const ESTRATEGIA_LABELS: Record<string, string> = {
  SUREBET: "Surebet",
  VALUEBET: "Value Bet",
  DUPLO_GREEN: "Duplo Green",
  SIMPLES: "Simples",
  BONUS: "Bônus",
  FREEBET: "Freebet (SNR)",
  MULTIPLA: "Múltipla",
  TRADING: "Trading",
  OUTROS: "Outros",
};

function LucroOperacionalCollapsible({ metrics, formatCurrency }: { metrics: any; formatCurrency: (v: number) => string }) {
  const [openJuice, setOpenJuice] = useState(false);
  const fmtSigned = (v: number) =>
    v < 0 ? `−${formatCurrency(Math.abs(v))}` : formatCurrency(v);

  const hasFx = Math.abs(metrics.efeitosFinanceiros) >= 0.01;
  const hasAdj = Math.abs(metrics.ajustesExtraordinarios) >= 0.01;

  return (
    <div className="space-y-2">
      {/* 🟢 Performance Pura (numerador de ROI) */}
      <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.03] px-2.5 py-2">
        <div className="flex items-center gap-1.5 mb-1">
          <Sparkles className="h-3 w-3 text-emerald-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500/90">Performance Pura</span>
        </div>
        <button
          onClick={() => setOpenJuice(!openJuice)}
          className="flex items-center justify-between gap-4 w-full group"
        >
          <span className="text-[11px] font-medium text-foreground flex items-center gap-1">
            Lucro de Apostas (juice)
            <ChevronDown className={`h-3 w-3 text-muted-foreground/60 transition-transform ${openJuice ? "rotate-180" : ""}`} />
          </span>
          <span className={`text-[11px] font-mono tabular-nums font-semibold ${metrics.lucroApostasPuro >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {fmtSigned(metrics.lucroApostasPuro)}
          </span>
        </button>
        {openJuice && metrics.estrategiaBreakdown.length > 0 && (
          <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-emerald-500/30 ml-1">
            {metrics.estrategiaBreakdown.map(([key, val]: [string, number]) => (
              <MetricRow
                key={key}
                label={ESTRATEGIA_LABELS[key] || key}
                value={fmtSigned(val)}
                colorClass={val >= 0 ? "text-emerald-500" : "text-red-500"}
                indent
              />
            ))}
          </div>
        )}
        {Math.abs(metrics.bonusGanhos) >= 0.01 && (
          <MetricRow label="Bônus Ganhos" value={formatCurrency(metrics.bonusGanhos)} colorClass="text-emerald-500" />
        )}
        {Math.abs(metrics.cashbackLiquido) >= 0.01 && (
          <MetricRow label="Cashback Líquido" value={fmtSigned(metrics.cashbackLiquido)} colorClass={metrics.cashbackLiquido >= 0 ? "text-emerald-500" : "text-red-500"} />
        )}
        {Math.abs(metrics.girosGratis) >= 0.01 && (
          <MetricRow label="Giros Grátis" value={formatCurrency(metrics.girosGratis)} colorClass="text-emerald-500" />
        )}
        <div className="border-t border-emerald-500/15 mt-1.5 pt-1.5">
          <div className="flex items-center justify-between gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[11px] font-bold text-foreground border-b border-dotted border-muted-foreground/40 cursor-help">
                  Performance Total
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[260px] text-xs">
                Numerador de ROI. Mede a qualidade da operação: juice + créditos promocionais. Não inclui FX nem ajustes.
              </TooltipContent>
            </Tooltip>
            <span className={`text-[11px] font-mono tabular-nums font-bold ${metrics.performancePura >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {fmtSigned(metrics.performancePura)}
            </span>
          </div>
          <p className="text-[9px] text-muted-foreground/70 mt-0.5">
            Esta é a parcela atribuída ao trabalho do operador
          </p>
        </div>
      </div>

      {/* 🟡 Efeitos Financeiros */}
      {hasFx && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.03] px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Globe className="h-3 w-3 text-amber-500" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/90 border-b border-dotted border-amber-500/40 cursor-help">
                    Efeitos Financeiros (FX)
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[260px] text-xs">
                  Variação cambial e ganho/perda na confirmação de saques. Não é performance — é efeito macro fora do controle do operador.
                </TooltipContent>
              </Tooltip>
            </div>
            <span className={`text-[11px] font-mono tabular-nums font-bold ${metrics.efeitosFinanceiros >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {fmtSigned(metrics.efeitosFinanceiros)}
            </span>
          </div>
        </div>
      )}

      {/* 🟠 Ajustes & Extraordinários */}
      {hasAdj && (
        <div className="rounded-md border border-orange-500/20 bg-orange-500/[0.03] px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Wrench className="h-3 w-3 text-orange-500" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-500/90 border-b border-dotted border-orange-500/40 cursor-help">
                    Ajustes & Extraordinários
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[260px] text-xs">
                  Correções contábeis (AJUSTE_SALDO) e incidentes (PERDA_OPERACIONAL). Afeta o caixa, mas não compõe a performance recorrente nem a remuneração do operador.
                </TooltipContent>
              </Tooltip>
            </div>
            <span className={`text-[11px] font-mono tabular-nums font-bold ${metrics.ajustesExtraordinarios >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {fmtSigned(metrics.ajustesExtraordinarios)}
            </span>
          </div>
        </div>
      )}

      {/* Resultado Operacional Total */}
      {(hasFx || hasAdj) && (
        <div className="border-t border-border/40 pt-2 mt-1">
          <div className="flex items-center justify-between gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[11px] font-bold text-foreground border-b border-dotted border-muted-foreground/40 cursor-help">
                  Resultado Operacional Total
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[260px] text-xs">
                Performance + Efeitos FX + Ajustes. Este é o número que reconcilia com o Patrimônio (Camada 2).
              </TooltipContent>
            </Tooltip>
            <span className={`text-[11px] font-mono tabular-nums font-bold ${metrics.resultadoOperacionalTotal >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {fmtSigned(metrics.resultadoOperacionalTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function DepositosCollapsible({ metrics, formatCurrency, onDrillDown }: { metrics: any; formatCurrency: (v: number) => string; onDrillDown?: (key: string, value: number) => void }) {
  const [open, setOpen] = useState(false);
  // Componentes do total (efetivos = reais + migração; baseline é informativo separado)
  const hasBreakdown =
    metrics.depositosReais > 0 ||
    metrics.depositosMigracao > 0 ||
    metrics.depositosBaseline > 0;

  return (
    <div>
      <button
        onClick={() => hasBreakdown && setOpen(!open)}
        className={`flex items-center justify-between gap-4 w-full ${hasBreakdown ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className="text-[11px] font-medium text-foreground flex items-center gap-1">
          Depósitos Efetivos
          {hasBreakdown && (
            <ChevronDown className={`h-3 w-3 text-muted-foreground/60 transition-transform ${open ? "rotate-180" : ""}`} />
          )}
        </span>
        <span
          className="text-[11px] font-mono tabular-nums font-bold text-foreground cursor-pointer hover:text-primary transition-colors"
          onClick={(e) => { e.stopPropagation(); onDrillDown?.("depositosTotal", metrics.depositosEfetivos); }}
        >
          {formatCurrency(metrics.depositosEfetivos)}
        </span>
      </button>
      {open && hasBreakdown && (
        <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-border/30 ml-1">
          {metrics.depositosReais > 0 && (
            <MetricRow
              label="Dinheiro novo"
              value={formatCurrency(metrics.depositosReais)}
              indent
              tooltip="Capital efetivamente transferido do caixa operacional para as casas neste projeto."
              onClick={() => onDrillDown?.("depositosReais", metrics.depositosReais)}
            />
          )}
          {metrics.depositosMigracao > 0 && (
            <MetricRow
              label="Recebido de outro projeto"
              value={formatCurrency(metrics.depositosMigracao)}
              indent
              tooltip="Saldo migrado de outro projeto ao vincular casas que já possuíam fundos. Conta como capital efetivo neste projeto."
              onClick={() => onDrillDown?.("depositosVirtuais", metrics.depositosMigracao)}
            />
          )}
          {metrics.depositosBaseline > 0 && (
            <MetricRow
              label="Saldo inicial adotado"
              value={formatCurrency(metrics.depositosBaseline)}
              indent
              colorClass="text-muted-foreground"
              tooltip="Saldo residual já existente quando uma casa foi vinculada. Não é dinheiro novo nem migração — é a baseline contábil. Não soma aos Depósitos Efetivos."
              onClick={() => onDrillDown?.("depositosVirtuais", metrics.depositosBaseline)}
            />
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
  const { formatCurrency, convertToConsolidationOficial, convertToConsolidation, cotacaoOficialUSD, moedaConsolidacao } = useProjetoCurrency(projetoId);
  const [drillDownKey, setDrillDownKey] = useState<string | null>(null);
  const [drillDownValue, setDrillDownValue] = useState(0);
  const [showLucroProjetado, setShowLucroProjetado] = useState(false);

  const openDrillDown = (key: string, value: number) => {
    setDrillDownKey(key);
    setDrillDownValue(value);
  };

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
    // Migração entre projetos: conta como capital efetivo (dinheiro real recebido)
    const depositosMigracao = rawMetrics.depositos
      .filter(d => d.tipo_transacao === 'DEPOSITO_VIRTUAL' && (d as any).origem_tipo === 'MIGRACAO')
      .reduce((acc, d) => acc + convertToConsolidationOficial(d.valor, d.moeda), 0);
    // Baseline (residual de vinculação): NÃO conta como capital efetivo
    const depositosBaseline = rawMetrics.depositos
      .filter(d => d.tipo_transacao === 'DEPOSITO_VIRTUAL' && (d as any).origem_tipo !== 'MIGRACAO')
      .reduce((acc, d) => acc + convertToConsolidationOficial(d.valor, d.moeda), 0);
    // Mantém compatibilidade com chamadas legadas
    const depositosVirtuais = depositosMigracao + depositosBaseline;
    const depositosInvestidor = rawMetrics.depositos
      .filter(d => d.destino_bookmaker_id && rawMetrics.investorBookmakerIds.includes(d.destino_bookmaker_id))
      .reduce((acc, d) => acc + convertToConsolidationOficial(d.valor, d.moeda), 0);
    const depositosInterno = depositosTotal - depositosInvestidor;
    // Efetivos internos (excluindo baselines) para fluxo interno
    const depositosEfetivosInvestidor = rawMetrics.depositos
      .filter(d => d.destino_bookmaker_id && rawMetrics.investorBookmakerIds.includes(d.destino_bookmaker_id))
      .filter(d => d.tipo_transacao === 'DEPOSITO' || (d.tipo_transacao === 'DEPOSITO_VIRTUAL' && (d as any).origem_tipo === 'MIGRACAO'))
      .reduce((acc, d) => acc + convertToConsolidationOficial(d.valor, d.moeda), 0);

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
      // Exclude crypto saques: valor_confirmado stores raw crypto amount, not fiat equivalent
      if (s.tipo_moeda === 'CRYPTO') return acc;
      if (s.valor_confirmado != null && Math.abs(s.valor_confirmado - s.valor) >= 0.01) {
        return acc + convertToConsolidationOficial(s.valor_confirmado - s.valor, s.moeda);
      }
      return acc;
    }, 0);

    const r = rawMetrics.reconciliation;
    const sumConvert = (arr: { valor: number; moeda: string }[]) =>
      arr.reduce((acc, e) => acc + convertToConsolidationOficial(e.valor, e.moeda), 0);

    const cashbackLiquido = sumConvert(r.cashbackManual) - sumConvert(r.cashbackEstorno);
    const girosGratis = sumConvert(r.girosGratis) - sumConvert(r.girosGratisEstorno);
    // Particionar AJUSTE_SALDO por natureza (default: RECONCILIACAO_OPERACIONAL)
    const sumAjustePorNatureza = (natureza: string) =>
      r.ajusteSaldo
        .filter(e => (e.ajuste_natureza || 'RECONCILIACAO_OPERACIONAL') === natureza)
        .reduce((acc, e) => {
          const sinal = e.ajuste_direcao === 'SAIDA' ? -1 : 1;
          return acc + convertToConsolidationOficial(e.valor * sinal, e.moeda);
        }, 0);
    const ajustesOperacionais = sumAjustePorNatureza('RECONCILIACAO_OPERACIONAL');
    const ajustesFx = sumAjustePorNatureza('EFEITO_FINANCEIRO');
    const ajustesExtraord = sumAjustePorNatureza('EXTRAORDINARIO');
    // Total agregado (mantido para retrocompatibilidade com FinancialDrillDownModal)
    const ajustes = ajustesOperacionais + ajustesFx + ajustesExtraord;
    const perdaOp = sumConvert(r.perdaOperacional);
    const perdaFx = sumConvert(r.perdaCambial);
    const ganhoFx = sumConvert(r.ganhoCambial);

    const bonusGanhos = rawMetrics.bonusGanhos.reduce(
      (acc, b) => acc + convertToConsolidationOficial(b.bonus_amount, b.currency || 'BRL'), 0
    );

    // ─── Lucro puro de apostas por estratégia (juice) ───
    // UNIFICADO: Usa Cotação de TRABALHO (não Oficial) para KPIs operacionais
    // Garante convergência com BonusSummaryCards, BonusVisaoGeralTab e cards individuais
    const estrategiaMap: Record<string, number> = {};
    let lucroApostasPuro = 0;
    for (const a of rawMetrics.apostasPorEstrategia) {
      const lucro = getConsolidatedLucroDirect(
        {
          lucro_prejuizo: a.lucro_prejuizo,
          moeda_operacao: a.moeda_operacao,
          pl_consolidado: a.pl_consolidado,
          consolidation_currency: a.consolidation_currency,
          is_multicurrency: a.is_multicurrency,
        },
        rawMetrics.apostasPernasMap[a.id],
        convertToConsolidation,
        moedaConsolidacao,
      );
      lucroApostasPuro += lucro;
      const key = a.estrategia || 'OUTROS';
      estrategiaMap[key] = (estrategiaMap[key] || 0) + lucro;
    }
    const estrategiaBreakdown = Object.entries(estrategiaMap)
      .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));
    const depositosEfetivos = rawMetrics.depositos
      .filter(d => d.tipo_transacao === 'DEPOSITO' || (d.tipo_transacao === 'DEPOSITO_VIRTUAL' && (d as any).origem_tipo === 'MIGRACAO'))
      .reduce((acc, d) => acc + convertToConsolidationOficial(d.valor, d.moeda), 0);

    // ─── Fluxo consolidado ───
    // Nota: o ledger é fonte da verdade — revinculações fantasma ao mesmo projeto
    // são neutralizadas pelo trigger fn_ensure_deposito_virtual_on_link, sem precisar
    // de ajustes matemáticos aqui.
    const fluxoCaixaLiquido = saquesRecebidos - depositosEfetivos;

    // ─── SEGREGAÇÃO CONCEITUAL (Performance vs FX vs Ajustes) ───
    // Performance Pura (numerador de ROI): juice + créditos promocionais + reconciliações operacionais
    // Reconciliações operacionais (centavos por arredondamento de odds, retornos fracionados)
    // SÃO parte da operação — devem entrar em performance.
    const creditosPerformance = bonusGanhos + cashbackLiquido + girosGratis;
    const performancePura = lucroApostasPuro + creditosPerformance + ajustesOperacionais;
    // Efeitos Financeiros (FX): variação cambial + ajustes classificados como FX — fora de ROI
    const efeitosFinanceiros = (ganhoFx - perdaFx) + ganhoConfirmacao + ajustesFx;
    // Extraordinários: incidentes operacionais e ajustes administrativos — fora de ROI
    const ajustesExtraordinarios = ajustesExtraord - perdaOp;
    // Resultado Operacional Total (reconcilia com Patrimônio)
    const resultadoOperacionalTotal = performancePura + efeitosFinanceiros + ajustesExtraordinarios;

    // Mantido por retrocompatibilidade (Camada 1 — créditos somados ao caixa)
    const extrasPositivos = creditosPerformance + ajustes + ganhoConfirmacao + (ganhoFx - perdaFx) - perdaOp;
    const capitalTotal = depositosEfetivos + extrasPositivos;
    const fluxoLiquidoAjustado = fluxoCaixaLiquido;
    const patrimonio = saldoCasas + saquesRecebidos + saquesPendentes;
    const lucroFinanceiro = patrimonio - depositosEfetivos;

    // ─── Fluxo INTERNO (sem investidor) ───
    const depositosEfetivosInterno = depositosEfetivos - depositosEfetivosInvestidor;
    const fluxoInternoLiquido = saquesInterno - depositosEfetivosInterno;

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
      depositosTotal, depositosReais, depositosVirtuais,
      depositosMigracao, depositosBaseline,
      depositosEfetivos, depositosInvestidor, depositosInterno,
      saquesRecebidos, saquesInvestidor, saquesInterno,
      saquesPendentes, saquesPendentesInvestidor, saquesPendentesInterno,
      saldoCasas, saldoCasasInvestidor, saldoCasasInterno,
      fluxoCaixaLiquido, fluxoLiquidoAjustado, capitalTotal, extrasPositivos,
      fluxoInternoLiquido,
      cashbackLiquido, girosGratis, ajustes, ganhoConfirmacao, ganhoFx, perdaOp, perdaFx,
      ajustesOperacionais, ajustesFx, ajustesExtraord,
      bonusGanhos,
      lucroApostasPuro, estrategiaBreakdown,
      // Segregação conceitual
      creditosPerformance, performancePura,
      efeitosFinanceiros, ajustesExtraordinarios,
      resultadoOperacionalTotal,
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
  }, [rawMetrics, convertToConsolidationOficial, cotacaoOficialUSD, moedaConsolidacao]);

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

      {/* ─── CAMADA 1: REALIZADO (Caixa) ─── */}
      <div className="space-y-1 pb-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">1. Realizado · Caixa</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[9px] text-muted-foreground/70 border-b border-dotted border-muted-foreground/40 cursor-help">o que entrou e saiu</span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[260px] text-xs">
              Fluxo de caixa puro: dinheiro que efetivamente saiu (depósitos) e voltou (saques). Não considera saldo ainda dentro das casas nem variação cambial.
            </TooltipContent>
          </Tooltip>
        </div>
        <DepositosCollapsible
          metrics={metrics}
          formatCurrency={formatCurrency}
          onDrillDown={openDrillDown}
        />
        {hasExtras && (
          <SegregatedExtrasBlock metrics={metrics} formatCurrency={formatCurrency} onDrillDown={openDrillDown} />
        )}
        <MetricRow 
          label="Saques Recebidos" 
          value={formatCurrency(metrics.saquesRecebidos)}
          tooltip={metrics.hasInvestorCapital ? `Interno: ${formatCurrency(metrics.saquesInterno)} · Investidor: ${formatCurrency(metrics.saquesInvestidor)}` : undefined}
          onClick={() => openDrillDown("saquesRecebidos", metrics.saquesRecebidos)}
        />
        {metrics.saquesPendentes > 0 && (
          <MetricRow 
            label="Saques Pendentes" 
            value={formatCurrency(metrics.saquesPendentes)} 
            colorClass="text-amber-500"
            tooltip={metrics.hasInvestorCapital ? `Interno: ${formatCurrency(metrics.saquesPendentesInterno)} · Investidor: ${formatCurrency(metrics.saquesPendentesInvestidor)}` : undefined}
            onClick={() => openDrillDown("saquesPendentes", metrics.saquesPendentes)}
          />
        )}
        <div className="border-t border-border/30 mt-1.5 pt-1.5">
          <MetricRow 
            label="Resultado Realizado" 
            value={formatCurrency(hasExtras ? metrics.fluxoLiquidoAjustado : metrics.fluxoCaixaLiquido)} 
            colorClass={(hasExtras ? metrics.fluxoLiquidoAjustado : metrics.fluxoCaixaLiquido) >= 0 ? "text-emerald-500" : "text-red-500"}
            bold
            tooltip={`Saques recebidos − Depósitos efetivos${hasExtras ? ' (já considerando créditos extras)' : ''}.${metrics.hasInvestorCapital ? ` Consolidado (Interno + Investidor). Interno: ${formatCurrency(metrics.fluxoInternoLiquido)}.` : ''}`}
          />
          <p className="text-[9px] text-muted-foreground/70 mt-0.5">
            {hasExtras ? 'Saques − Depósitos + Extras' : 'Saques − Depósitos'}
          </p>
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

      {/* ─── CAMADA 2: MARK-TO-MARKET (Patrimônio) ─── */}
      <div className="border-t border-border/40 pt-3 pb-3 space-y-1">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">2. Mark-to-Market · Patrimônio</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[9px] text-muted-foreground/70 border-b border-dotted border-muted-foreground/40 cursor-help">se sacar tudo agora</span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[260px] text-xs">
              Quanto o projeto valeria se todas as casas fossem sacadas hoje. Usa cotação live, então flutua com câmbio mesmo sem operar — isso é variação cambial real, não bug.
            </TooltipContent>
          </Tooltip>
        </div>
        <MetricRow
          label="Saldo em Bookmakers"
          value={formatCurrency(metrics.saldoCasas)}
          tooltip={metrics.hasInvestorCapital ? `Interno: ${formatCurrency(metrics.saldoCasasInterno)} · Investidor: ${formatCurrency(metrics.saldoCasasInvestidor)}` : undefined}
        />
        <MetricRow
          label="(+) Saques já recebidos"
          value={formatCurrency(metrics.saquesRecebidos)}
          colorClass="text-muted-foreground"
        />
        <MetricRow
          label="(−) Depósitos efetivos"
          value={formatCurrency(metrics.depositosEfetivos)}
          colorClass="text-muted-foreground"
          tooltip={metrics.depositosBaseline > 0 ? `Inclui dinheiro novo + migrações. Exclui ${formatCurrency(metrics.depositosBaseline)} de saldo inicial adotado (baseline contábil).` : undefined}
        />
        <div className="border-t border-border/30 mt-1.5 pt-1.5">
          <MetricRow
            label="Patrimônio Líquido"
            value={formatCurrency(metrics.lucroFinanceiro)}
            colorClass={metrics.lucroFinanceiro >= 0 ? "text-emerald-500" : "text-red-500"}
            bold
            tooltip="Resultado se todo saldo fosse sacado hoje. Clique para reconciliar com o Lucro Operacional."
            onClick={() => setShowLucroProjetado(true)}
          />
          <p className="text-[9px] text-muted-foreground/70 mt-0.5">
            Saldo + Saques − Depósitos
          </p>
        </div>
      </div>

      {/* ─── CAMADA 3: OPERACIONAL (Performance + FX + Ajustes segregados) ─── */}
      {(Math.abs(metrics.performancePura) >= 0.01 || Math.abs(metrics.efeitosFinanceiros) >= 0.01 || Math.abs(metrics.ajustesExtraordinarios) >= 0.01) && (
        <div className="border-t border-border/40 pt-3 pb-3 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">3. Operacional · Resultado Completo</span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[9px] text-muted-foreground/70 border-b border-dotted border-muted-foreground/40 cursor-help">3 blocos segregados</span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[280px] text-xs">
                Performance Pura mostra a qualidade da operação (numerador de ROI). Efeitos Financeiros (FX) e Ajustes são apresentados separados — afetam o caixa, mas não medem performance nem compõem a remuneração do operador.
              </TooltipContent>
            </Tooltip>
          </div>
          <LucroOperacionalCollapsible metrics={metrics} formatCurrency={formatCurrency} />
        </div>
      )}

      {/* ─── STATUS: Recuperação de Capital ─── */}
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

      {/* Drill-Down Modal */}
      {drillDownKey && (
        <FinancialDrillDownModal
          open={!!drillDownKey}
          onOpenChange={(open) => { if (!open) setDrillDownKey(null); }}
          indicatorKey={drillDownKey}
          projetoId={projetoId}
          dateRange={dateRange}
          totalValue={drillDownValue}
        />
      )}

      {/* Lucro Projetado Modal */}
      {showLucroProjetado && metrics && (
        <LucroProjetadoModal
          open={showLucroProjetado}
          onOpenChange={setShowLucroProjetado}
          projetoId={projetoId}
          lucroProjetado={metrics.lucroFinanceiro}
          saldoCasas={metrics.saldoCasas}
          saquesRecebidos={metrics.saquesRecebidos}
          saquesPendentes={metrics.saquesPendentes}
          depositosEfetivos={metrics.depositosEfetivos}
          depositosBaseline={metrics.depositosBaseline}
          ganhoConfirmacaoDeposito={metrics.ganhoConfirmacao}
          bonusGanhosFinanceiro={metrics.bonusGanhos}
          girosGratisFinanceiro={metrics.girosGratis}
          cashbackFinanceiro={metrics.cashbackLiquido}
          ajustesFinanceiro={metrics.ajustes}
          perdaOpFinanceiro={metrics.perdaOp}
          resultadoFxFinanceiro={metrics.ganhoFx - metrics.perdaFx}
          performancePura={metrics.performancePura}
          efeitosFinanceiros={metrics.efeitosFinanceiros}
          ajustesExtraordinarios={metrics.ajustesExtraordinarios}
        />
      )}
    </div>
  );
}
