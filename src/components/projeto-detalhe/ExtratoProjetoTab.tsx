import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useProjectCurrencyFormat } from "@/hooks/useProjectCurrencyFormat";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { invalidateCanonicalCaches } from "@/lib/invalidateCanonicalCaches";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  Wallet,
  Search,
  Clock,
  CalendarDays,
  ArrowRightLeft,
  Info,
  Sparkles,
  Gift,
  RefreshCcw,
  Eye,
  EyeOff,
  Wrench,
  Globe,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import { CURRENCY_SYMBOLS, type SupportedCurrency } from "@/types/currency";

interface ExtratoProjetoTabProps {
  projetoId: string;
}

interface ProjetoTransaction {
  id: string;
  tipo_transacao: string;
  valor: number;
  moeda: string;
  tipo_moeda: string;
  valor_usd: number | null;
  cotacao: number | null;
  /** Cotação real congelada (snapshot) — preferir sobre `cotacao` legado */
  cotacao_efetiva: number | null;
  /** Equivalente em USD do valor (snapshot) — usado no popover do card */
  valor_usd_referencia: number | null;
  status: string;
  data_transacao: string;
  created_at: string;
  descricao: string | null;
  bookmaker_nome: string | null;
  bookmaker_id: string | null;
  parceiro_nome: string | null;
  origem_tipo: string | null;
  destino_tipo: string | null;
  ajuste_motivo: string | null;
  ajuste_direcao: string | null;
  /** Classificação de AJUSTE_SALDO: define em qual KPI ele entra */
  ajuste_natureza: 'RECONCILIACAO_OPERACIONAL' | 'EFEITO_FINANCEIRO' | 'EXTRAORDINARIO' | null;
  evento_promocional_tipo: string | null;
  /**
   * Classificação de auditoria — define visualização e KPIs.
   *  - EFFECTIVE: entra em todos os fluxos/KPIs.
   *  - BASELINE_EXCLUDED: DV BASELINE confirmado (saldo inicial — não conta no KPI).
   *  - RECONCILED_PHANTOM: SV cancelada por revínculo neutralizado (mesmo projeto, sem uso).
   *  - RECONCILED_DUPLICATE: DV cancelado classificado como BASELINE em auditoria_metadata.
   *  - RECONCILED_OTHER: outras SV/DV canceladas.
   */
  audit_class:
    | "EFFECTIVE"
    | "BASELINE_EXCLUDED"
    | "RECONCILED_PHANTOM"
    | "RECONCILED_DUPLICATE"
    | "RECONCILED_OTHER";
  cancelled_reason: string | null;
}

// Metrics separated by currency
interface CurrencyMetrics {
  moeda: string;
  depositos: number;
  saques: number;
  ajustes: number;
}

interface ProjetoFlowMetrics {
  byCurrency: CurrencyMetrics[];
  /** Totais já convertidos para a moeda de consolidação do projeto via Cotação de Trabalho */
  depositosTotal: number;
  saquesTotal: number;
  ajustesTotal: number;
  saldoCasasTotal: number;
  resultadoCaixa: number;
  /** Quantidade de DEPOSITO_VIRTUAL classificados como BASELINE (excluídos do KPI) */
  baselineExcluidoCount: number;
  /** Soma (já convertida) dos baselines excluídos — apenas para tooltip informativo */
  baselineExcluidoTotalConvertido: number;
  /** Equivalente LIVE (mark-to-market) dos depósitos — para comparativo no popover */
  depositosLiveEquivalente: number;
  /** Diferença cambial: depositosLiveEquivalente − depositosTotal(snapshot) */
  variacaoCambialDepositos: number;
}

function getSymbol(moeda: string) {
  return CURRENCY_SYMBOLS[moeda as SupportedCurrency] || moeda;
}

/**
 * Botão informativo (ⓘ) para KPI: explica metodologia e divergências esperadas.
 * Usado em todos os cards do Extrato para deixar claro o "ponto de vista" de cada número.
 */
function KpiInfoButton({
  title,
  body,
  divergencia,
}: {
  title: string;
  body: React.ReactNode;
  divergencia?: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto text-muted-foreground/60 hover:text-foreground transition-colors"
          aria-label="Sobre este KPI"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-80 text-xs space-y-2 p-3">
        <p className="font-semibold text-sm">{title}</p>
        <div className="text-muted-foreground leading-relaxed space-y-1.5">{body}</div>
        {divergencia && (
          <div className="pt-2 mt-2 border-t border-border/40">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-amber-400 mb-1">
              Por que diverge do Saldo Operável?
            </p>
            <div className="text-muted-foreground leading-relaxed">{divergencia}</div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function formatVal(value: number, moeda: string = "BRL") {
  const symbol = getSymbol(moeda);
  return `${symbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getTransactionIcon(tipo: string) {
  if (tipo.includes("DEPOSITO")) return <ArrowDownToLine className="h-3.5 w-3.5 text-red-400" />;
  if (tipo.includes("SAQUE")) return <ArrowUpFromLine className="h-3.5 w-3.5 text-emerald-400" />;
  if (tipo === "AJUSTE") return <ArrowRightLeft className="h-3.5 w-3.5 text-blue-400" />;
  if (tipo === "CASHBACK") return <Sparkles className="h-3.5 w-3.5 text-purple-400" />;
  if (tipo === "BONUS") return <Gift className="h-3.5 w-3.5 text-amber-400" />;
  if (tipo === "ESTORNO") return <RefreshCcw className="h-3.5 w-3.5 text-orange-400" />;
  if (tipo === "PERDA_CAMBIAL") return <ArrowRightLeft className="h-3.5 w-3.5 text-red-400" />;
  if (tipo === "GANHO_CAMBIAL") return <ArrowRightLeft className="h-3.5 w-3.5 text-emerald-400" />;
  return <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />;
}

/**
 * Label visual para o tipo de transação.
 * Para PERDA_CAMBIAL / GANHO_CAMBIAL geradas pela conciliação de mesma moeda,
 * exibimos como "Perda/Crédito de Trânsito" porque a diferença não é câmbio,
 * é taxa cobrada pela casa no recebimento (ex: depositou 200 USD, casa creditou 198 USD).
 * Para diferenças vindas de cross-currency real (origem≠destino), mantém "cambial".
 */
function getTransactionLabel(tipo: string, descricao?: string | null) {
  if (tipo === "PERDA_CAMBIAL") {
    const d = (descricao || "").toLowerCase();
    if (d.includes("conciliação")) return "Perda no recebimento";
    return "Perda cambial";
  }
  if (tipo === "GANHO_CAMBIAL") {
    const d = (descricao || "").toLowerCase();
    if (d.includes("conciliação")) return "Crédito no recebimento";
    return "Ganho cambial";
  }
  switch (tipo) {
    case "DEPOSITO": return "Depósito";
    case "DEPOSITO_VIRTUAL": return "Depósito Virtual";
    case "SAQUE": return "Saque";
    case "SAQUE_VIRTUAL": return "Saque Virtual";
    case "AJUSTE": return "Ajuste";
    case "AJUSTE_SALDO": return "Ajuste de Saldo";
    case "CASHBACK": return "Cashback";
    case "BONUS": return "Bônus";
    case "ESTORNO": return "Estorno";
    default: return tipo;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "CONFIRMADO":
      return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px]">Confirmado</Badge>;
    case "PENDENTE":
      return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-[10px]">Pendente</Badge>;
    case "EM_TRANSITO":
      return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/20 text-[10px]">Em Trânsito</Badge>;
    case "CANCELADO":
      return <Badge className="bg-red-500/15 text-red-400 border-red-500/20 text-[10px]">Cancelado</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

function getTransactionSign(tipo: string, ajusteDirecao?: string | null): "positive" | "negative" | "neutral" {
  if (tipo.includes("SAQUE")) return "positive";
  if (tipo.includes("DEPOSITO")) return "negative";
  if (tipo === "AJUSTE" || tipo === "AJUSTE_SALDO") {
    if (ajusteDirecao === "CREDITO") return "positive";
    if (ajusteDirecao === "DEBITO") return "negative";
    return "neutral";
  }
  if (tipo === "CASHBACK" || tipo === "BONUS") return "positive";
  if (tipo === "ESTORNO") return "negative";
  if (tipo === "PERDA_CAMBIAL") return "negative";
  if (tipo === "GANHO_CAMBIAL") return "positive";
  return "neutral";
}

function useProjetoExtrato(
  projetoId: string,
  convertToConsolidation: (valor: number, moedaOrigem: string) => number,
  moedaConsolidacao: string,
) {
  const { workspaceId } = useWorkspace();

  const historyQuery = useQuery({
    queryKey: ["projeto-extrato-history", projetoId],
    queryFn: async () => {
      const { data: ledger, error } = await supabase
        .from("cash_ledger")
        .select(`
          id, tipo_transacao, valor, valor_destino, moeda, tipo_moeda,
          valor_usd, valor_usd_referencia,
          cotacao, cotacao_origem_usd, cotacao_destino_usd, status,
          data_transacao, created_at, descricao,
          origem_bookmaker_id, destino_bookmaker_id, origem_tipo, destino_tipo,
          ajuste_motivo, ajuste_direcao, evento_promocional_tipo,
          auditoria_metadata
        `)
        .eq("projeto_id_snapshot", projetoId)
        // Mantemos cancelados APENAS quando são SV/DV — para auditoria de
        // reconciliações automáticas (revínculo, baseline duplicado).
        // Demais cancelados (DEPOSITO, SAQUE, AJUSTE...) seguem ocultos.
        .or(
          "status.neq.CANCELADO,tipo_transacao.in.(SAQUE_VIRTUAL,DEPOSITO_VIRTUAL)"
        )
        .order("data_transacao", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      // Collect bookmaker IDs
      const bmIds = new Set<string>();
      (ledger || []).forEach((e: any) => {
        if (e.origem_bookmaker_id) bmIds.add(e.origem_bookmaker_id);
        if (e.destino_bookmaker_id) bmIds.add(e.destino_bookmaker_id);
      });

      let bmMap: Record<string, { nome: string; parceiro_nome: string | null }> = {};
      if (bmIds.size > 0) {
        const { data: bms } = await supabase
          .from("bookmakers")
          .select("id, nome, instance_identifier, parceiros(nome)")
          .in("id", Array.from(bmIds));
        (bms || []).forEach((b: any) => {
          bmMap[b.id] = {
            nome: b.instance_identifier ? `${b.nome} (${b.instance_identifier})` : b.nome,
            parceiro_nome: b.parceiros?.nome || null,
          };
        });
      }

      return (ledger || []).map((e: any): ProjetoTransaction => {
        const bmId = e.destino_bookmaker_id || e.origem_bookmaker_id;
        const bm = bmId ? bmMap[bmId] : null;
        // Cotação efetiva: para moeda estrangeira, usar snapshot real
        // (cotacao_destino_usd → unidades USD por 1 unidade da moeda).
        // Ex: EUR → 1.1787 (1 EUR = 1.1787 USD), MXN → 0.0572.
        // O campo legado `cotacao` quase sempre vem 1.0000 e não reflete a verdade.
        let cotacaoEfetiva: number | null = null;
        if (e.moeda && e.moeda !== "USD") {
          // Snapshot moeda→USD
          const c = Number(e.cotacao_destino_usd ?? 0);
          if (c > 0) cotacaoEfetiva = c;
        }
        if (cotacaoEfetiva == null && e.cotacao != null && Number(e.cotacao) !== 1) {
          cotacaoEfetiva = Number(e.cotacao);
        }
        // === Classificação de auditoria ===
        const meta = (e.auditoria_metadata || {}) as Record<string, any>;
        const cancelledReason: string | null = meta.cancelled_reason ?? null;
        let auditClass: ProjetoTransaction["audit_class"] = "EFFECTIVE";
        if (e.status === "CANCELADO") {
          if (
            e.tipo_transacao === "SAQUE_VIRTUAL" &&
            cancelledReason === "ping_pong_neutralized_by_usage"
          ) {
            auditClass = "RECONCILED_PHANTOM";
          } else if (
            e.tipo_transacao === "DEPOSITO_VIRTUAL" &&
            (meta.origem_tipo === "BASELINE" || cancelledReason === "phantom_link_unused")
          ) {
            auditClass = "RECONCILED_DUPLICATE";
          } else {
            auditClass = "RECONCILED_OTHER";
          }
        } else if (
          e.tipo_transacao === "DEPOSITO_VIRTUAL" &&
          (e.origem_tipo === "BASELINE" || e.origem_tipo == null)
        ) {
          auditClass = "BASELINE_EXCLUDED";
        }
        return {
          id: e.id,
          tipo_transacao: e.tipo_transacao,
          valor: e.valor,
          moeda: e.moeda,
          tipo_moeda: e.tipo_moeda,
          valor_usd: e.valor_usd,
          cotacao: e.cotacao,
          cotacao_efetiva: cotacaoEfetiva,
          valor_usd_referencia: e.valor_usd_referencia ?? null,
          status: e.status,
          data_transacao: e.data_transacao,
          created_at: e.created_at,
          descricao: e.descricao,
          bookmaker_nome: bm?.nome || null,
          bookmaker_id: bmId,
          parceiro_nome: bm?.parceiro_nome || null,
          origem_tipo: e.origem_tipo,
          destino_tipo: e.destino_tipo,
          ajuste_motivo: e.ajuste_motivo,
          ajuste_direcao: e.ajuste_direcao,
          evento_promocional_tipo: e.evento_promocional_tipo,
          audit_class: auditClass,
          cancelled_reason: cancelledReason,
        };
      });
    },
    enabled: !!projetoId && !!workspaceId,
    staleTime: 30_000,
  });

  const metricsQuery = useQuery({
    queryKey: ["projeto-extrato-metrics", projetoId, moedaConsolidacao],
    queryFn: async () => {
      // Get confirmed ledger entries for metrics
      const { data: ledger, error } = await supabase
        .from("cash_ledger")
        .select(
          "tipo_transacao, valor, valor_confirmado, valor_destino, moeda, tipo_moeda, valor_usd, valor_usd_referencia, cotacao_origem_usd, cotacao_destino_usd, cotacao_snapshot_at, cotacao, ajuste_direcao, origem_tipo, descricao"
        )
        .eq("projeto_id_snapshot", projetoId)
        .eq("status", "CONFIRMADO");
      if (error) throw error;

      // === CLASSIFICAÇÃO CANÔNICA (memory: virtual-deposit-origin-classification) ===
      // Depósitos efetivos = DEPOSITO real + DEPOSITO_VIRTUAL onde origem_tipo='MIGRACAO'
      // Saques efetivos    = SAQUE real    + SAQUE_VIRTUAL    onde origem_tipo='MIGRACAO'
      // EXCLUI: BASELINE (primeira vinculação) e NULL (rebaselines antigos sem classificação)
      // ============================================================================
      const isBaselineDV = (e: any) =>
        e.tipo_transacao === "DEPOSITO_VIRTUAL" &&
        (e.origem_tipo === "BASELINE" || e.origem_tipo == null);

      const isMigracaoDV = (e: any) =>
        e.tipo_transacao === "DEPOSITO_VIRTUAL" && e.origem_tipo === "MIGRACAO";

      const isMigracaoSV = (e: any) =>
        e.tipo_transacao === "SAQUE_VIRTUAL" && e.origem_tipo === "MIGRACAO";

      // Aggregate by currency (apenas o que conta como movimento efetivo)
      const currencyMap = new Map<string, CurrencyMetrics>();
      const ensureCM = (moeda: string) => {
        if (!currencyMap.has(moeda)) {
          currencyMap.set(moeda, { moeda, depositos: 0, saques: 0, ajustes: 0 });
        }
        return currencyMap.get(moeda)!;
      };

      let baselineExcluidoCount = 0;
      let baselineExcluidoTotalConvertido = 0;

      // Acumuladores em moeda de consolidação usando SNAPSHOT (valor_usd_referencia).
      // Hierarquia (memory: analytics-snapshot-conversion-hierarchy):
      //   1º  valor_usd_referencia → cotação congelada no momento do registro
      //   2º  Cotação de Trabalho do projeto (convertToConsolidation)
      //   3º  PTAX/live (já dentro do convertToConsolidation como fallback)
      let depositosConsolidadoSnap = 0;
      let saquesConsolidadoSnap = 0;
      let ajustesConsolidadoSnap = 0;

      // Converte snapshot USD → moeda de consolidação do projeto (USD ou BRL).
      // Para USD: passthrough. Para BRL: usa Cotação de Trabalho USD→BRL do projeto
      // (estável dentro do ciclo, não flutua com PTAX live).
      const snapshotToConsolidacao = (valorUsdSnap: number): number => {
        if (!valorUsdSnap) return 0;
        if (moedaConsolidacao === "USD") return valorUsdSnap;
        // Converter USD → moeda consolidação via Cotação de Trabalho
        return convertToConsolidation(valorUsdSnap, "USD");
      };

      // Resolve o valor consolidado de UM evento usando hierarquia snapshot → trabalho.
      const resolveConsolidado = (e: any, valorBase: number, moeda: string): number => {
        const snap = Number(e.valor_usd_referencia ?? 0);
        if (snap > 0) {
          // Snapshot congelado existe → fonte da verdade histórica
          return snapshotToConsolidacao(snap);
        }
        // Fallback (registros antigos sem snapshot): Cotação de Trabalho
        return convertToConsolidation(valorBase, moeda);
      };

      (ledger || []).forEach((e: any) => {
        const moeda = e.moeda || "BRL";
        // Fonte canônica na MOEDA ORIGINAL do registro:
        //   valor_destino  → reflexo cross-currency, sempre na moeda do destino
        //   valor          → fallback para o lançamento original
        // Em cross-currency (cotacao_destino_usd ou cotacao_origem_usd != null), o
        // `valor_confirmado` é o equivalente em outra moeda, NÃO podemos usá-lo.
        // Em mesma moeda (sem snapshot cross), `valor_confirmado` < `valor` indica
        // PERDA NO TRÂNSITO (taxa, IOF, fee) e DEVE refletir no KPI.
        const isCrossCurrency =
          e.cotacao_destino_usd != null || e.cotacao_origem_usd != null;
        const valorLancado = Number(e.valor_destino ?? e.valor ?? 0);
        const valorConfirmado = e.valor_confirmado != null ? Number(e.valor_confirmado) : null;
        // Se mesma moeda E valor_confirmado existir → usa o real recebido (pode ser menor por taxa)
        const valorBase =
          !isCrossCurrency && valorConfirmado != null && valorConfirmado > 0
            ? valorConfirmado
            : valorLancado;

        // 1) Baseline DV: NÃO entra no KPI (seria duplicação do DEPOSITO real)
        if (isBaselineDV(e)) {
          baselineExcluidoCount += 1;
          baselineExcluidoTotalConvertido += resolveConsolidado(e, valorBase, moeda);
          return;
        }

        // 2) Depósito efetivo
        if (e.tipo_transacao === "DEPOSITO" || isMigracaoDV(e)) {
          ensureCM(moeda).depositos += valorBase;
          depositosConsolidadoSnap += resolveConsolidado(e, valorBase, moeda);
          return;
        }

        // 3) Saque efetivo
        if (e.tipo_transacao === "SAQUE" || isMigracaoSV(e)) {
          ensureCM(moeda).saques += valorBase;
          saquesConsolidadoSnap += resolveConsolidado(e, valorBase, moeda);
          return;
        }

        // 4) SAQUE_VIRTUAL não-MIGRACAO (raros) — ignora no KPI; aparece só no histórico
        if (e.tipo_transacao === "SAQUE_VIRTUAL") return;

        // 5) Demais (AJUSTE_*, CASHBACK, BONUS, ESTORNO, PERDA_CAMBIAL, GANHO_CAMBIAL)
        // O sinal define se é entrada ou saída do caixa do projeto. Tudo isso é
        // responsabilidade do projeto (não da empresa) e PRECISA influenciar o
        // Resultado de Caixa para o fechamento final refletir a realidade.
        const cm = ensureCM(moeda);
        const consolidadoEv = resolveConsolidado(e, valorBase, moeda);

        // Sinal explícito por tipo (sobrepõe ajuste_direcao quando o tipo é claro)
        let sinal: 1 | -1 = 1;
        if (e.tipo_transacao === "PERDA_CAMBIAL" || e.tipo_transacao === "ESTORNO") {
          sinal = -1;
        } else if (e.tipo_transacao === "GANHO_CAMBIAL" || e.tipo_transacao === "CASHBACK" || e.tipo_transacao === "BONUS") {
          sinal = 1;
        } else if (e.ajuste_direcao === "SAIDA" || e.ajuste_direcao === "DEBITO") {
          sinal = -1;
        } else if (e.ajuste_direcao === "ENTRADA" || e.ajuste_direcao === "CREDITO") {
          sinal = 1;
        }

        cm.ajustes += sinal * valorBase;
        ajustesConsolidadoSnap += sinal * consolidadoEv;
      });

      // Saldo REAL atual das casas vinculadas (somente saldo_atual; freebet à parte)
      const { data: balances } = await supabase
        .from("bookmakers")
        .select("saldo_atual, moeda")
        .eq("projeto_id", projetoId)
        .in("status", [
          "ativo",
          "ATIVO",
          "EM_USO",
          "limitada",
          "LIMITADA",
          "AGUARDANDO_SAQUE",
        ]);

      // Saldo Casas convertido p/ moeda de consolidação
      let saldoCasasTotal = 0;
      (balances || []).forEach((b: any) => {
        saldoCasasTotal += convertToConsolidation(
          Number(b.saldo_atual || 0),
          b.moeda || "BRL"
        );
      });

      const byCurrency = Array.from(currencyMap.values());

      // Totais GLOBAIS na moeda de consolidação usam SNAPSHOT (cotação congelada
      // no momento de cada registro), não cotação live. Garante que KPIs históricos
      // não flutuem com mudanças de Cotação de Trabalho ou PTAX.
      const depositosTotal = depositosConsolidadoSnap;
      const saquesTotal = saquesConsolidadoSnap;
      const ajustesTotal = ajustesConsolidadoSnap;

      // Equivalente LIVE (mark-to-market) dos depósitos — usado apenas
      // para mostrar a diferença cambial vs snapshot no popover informativo.
      let depositosLiveEquivalente = 0;
      Array.from(currencyMap.values()).forEach((cm) => {
        depositosLiveEquivalente += convertToConsolidation(cm.depositos, cm.moeda);
      });
      const variacaoCambialDepositos = depositosLiveEquivalente - depositosConsolidadoSnap;

      // Resultado de Caixa (NÃO é Lucro Operacional canônico — é fluxo de caixa do projeto):
      //   saques + saldo casas + ajustes − depósitos
      const resultadoCaixa =
        saquesTotal + saldoCasasTotal + ajustesTotal - depositosTotal;

      return {
        byCurrency,
        depositosTotal,
        saquesTotal,
        ajustesTotal,
        saldoCasasTotal,
        resultadoCaixa,
        baselineExcluidoCount,
        baselineExcluidoTotalConvertido,
        depositosLiveEquivalente,
        variacaoCambialDepositos,
      } as ProjetoFlowMetrics;
    },
    enabled: !!projetoId && !!workspaceId,
    staleTime: 30_000,
  });

  return {
    transactions: historyQuery.data || [],
    metrics: metricsQuery.data,
    isLoading: historyQuery.isLoading || metricsQuery.isLoading,
  };
}

export function ExtratoProjetoTab({ projetoId }: ExtratoProjetoTabProps) {
  const {
    convertToConsolidation,
    moedaConsolidacao,
    formatCurrency: formatConsolidated,
    getSymbol: getConsolidatedSymbol,
  } = useProjetoCurrency(projetoId);

  const { transactions, metrics, isLoading } = useProjetoExtrato(
    projetoId,
    convertToConsolidation,
    moedaConsolidacao,
  );
  const { workspaceId } = useWorkspace();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("todos");
  const [filterStatus, setFilterStatus] = useState<string>("todos");

  // Toggle de visibilidade de reconciliações (default OFF, persistido por workspace).
  // Reconciliações = SV/DV canceladas pelo motor (revínculo neutralizado, baseline duplicado).
  // NÃO entram em KPIs — toggle é puramente visual/auditoria.
  const showReconciledStorageKey = `extrato:show-reconciled:${workspaceId || "anon"}`;
  const [showReconciled, setShowReconciled] = useState<boolean>(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem(showReconciledStorageKey);
      if (v != null) setShowReconciled(v === "1");
    } catch {
      /* ignore */
    }
  }, [showReconciledStorageKey]);
  const toggleShowReconciled = (next: boolean) => {
    setShowReconciled(next);
    try {
      localStorage.setItem(showReconciledStorageKey, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const reconciledHiddenCount = useMemo(
    () =>
      transactions.filter((t) => t.audit_class.startsWith("RECONCILED_")).length,
    [transactions],
  );

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // Reconciliações ficam ocultas até o usuário ligar o toggle.
      if (!showReconciled && t.audit_class.startsWith("RECONCILED_")) return false;
      if (filterType !== "todos") {
        if (filterType === "depositos" && !t.tipo_transacao.includes("DEPOSITO")) return false;
        if (filterType === "saques" && !t.tipo_transacao.includes("SAQUE")) return false;
        if (filterType === "ajustes" && !["AJUSTE", "AJUSTE_SALDO", "CASHBACK", "BONUS", "ESTORNO", "PERDA_CAMBIAL", "GANHO_CAMBIAL"].includes(t.tipo_transacao)) return false;
      }
      if (filterStatus !== "todos" && t.status !== filterStatus) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        if (
          !t.bookmaker_nome?.toLowerCase().includes(s) &&
          !t.parceiro_nome?.toLowerCase().includes(s) &&
          !t.descricao?.toLowerCase().includes(s) &&
          !getTransactionLabel(t.tipo_transacao).toLowerCase().includes(s)
        ) return false;
      }
      return true;
    });
  }, [transactions, filterType, filterStatus, searchTerm, showReconciled]);

  // Detect multi-currency
  const currencies = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => set.add(t.moeda));
    return Array.from(set);
  }, [transactions]);
  const isMultiCurrency = currencies.length > 1;

  // Group transactions by date
  const grouped = useMemo(() => {
    const map = new Map<string, ProjetoTransaction[]>();
    filteredTransactions.forEach((t) => {
      const date = new Date(t.data_transacao).toLocaleDateString("pt-BR");
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(t);
    });
    return Array.from(map.entries());
  }, [filteredTransactions]);

  // Currency-aware KPI rendering
  const renderCurrencyBreakdown = (byCurrency: CurrencyMetrics[] | undefined, field: keyof CurrencyMetrics) => {
    if (!byCurrency || byCurrency.length <= 1) return null;
    return (
      <div className="space-y-0.5">
        {byCurrency.filter(c => Math.abs(c[field] as number) > 0.01).map((c) => (
          <div key={c.moeda} className="flex justify-between gap-3">
            <span className="text-muted-foreground">{c.moeda}:</span>
            <span>{formatVal(c[field] as number, c.moeda)}</span>
          </div>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      {/* Mobile: 2 colunas, com Resultado de Caixa em destaque (col-span-2) */}
      {/* Tablet: 3 colunas. Desktop: 5 colunas em linha única */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownToLine className="h-3.5 w-3.5 text-red-400" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Depósitos</span>
              <KpiInfoButton
                title="Depósitos"
                body={
                  <>
                    <p>Soma do que <strong>realmente entrou na casa</strong> em cada depósito (já descontando taxas de trânsito), usando a <strong>cotação do dia</strong>.</p>
                    <p>Se você lançou 200 e a casa creditou 198, o card mostra 198. Os 2 perdidos no caminho aparecem como diferença no Resultado de Caixa.</p>
                    <p>Esse valor é histórico: não muda com o câmbio depois.</p>
                    <p className="text-[10px] text-muted-foreground/80">Reconciliações automáticas (revínculo da mesma casa ao mesmo projeto sem operações entre) <strong>não entram aqui</strong> — você pode visualizá-las marcando “Mostrar reconciliações” nos filtros.</p>
                  </>
                }
                divergencia={
                  <p>O Saldo Operável (em Vínculos) usa cotação <strong>atual</strong>. Por isso, mesmo sem você operar, os números podem ficar diferentes conforme o câmbio se move.</p>
                }
              />
            </div>
            <p className="text-lg font-bold text-foreground">
              {formatConsolidated(metrics?.depositosTotal || 0)}
            </p>
            {isMultiCurrency && metrics?.byCurrency && (
              <div className="mt-1 flex flex-wrap gap-1">
                {metrics.byCurrency.filter(c => c.depositos > 0.01).map(c => (
                  <Badge key={c.moeda} variant="outline" className="text-[9px] px-1 py-0">
                    {formatVal(c.depositos, c.moeda)}
                  </Badge>
                ))}
              </div>
            )}
            {!!metrics?.baselineExcluidoCount && (
              <p className="mt-1 text-[9px] text-muted-foreground/70">
                +{metrics.baselineExcluidoCount} saldo(s) inicial(is) de vinculação não contado(s) ({formatConsolidated(metrics.baselineExcluidoTotalConvertido)})
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpFromLine className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Saques</span>
              <KpiInfoButton
                title="Saques"
                body={
                  <>
                    <p>Soma de tudo que saiu das casas para o seu caixa, usando a <strong>cotação do dia de cada saque</strong>.</p>
                    <p>Também é histórico: não recalcula com a cotação de hoje.</p>
                    <p className="text-[10px] text-muted-foreground/80">Reconciliações automáticas (revínculo da mesma casa ao mesmo projeto sem operações entre) <strong>não entram aqui</strong> — você pode visualizá-las marcando “Mostrar reconciliações” nos filtros.</p>
                  </>
                }
                divergencia={
                  <p>Cada saque guarda a cotação do dia em que foi feito, então o total não muda com o câmbio.</p>
                }
              />
            </div>
            <p className="text-lg font-bold text-foreground">
              {formatConsolidated(metrics?.saquesTotal || 0)}
            </p>
            {isMultiCurrency && metrics?.byCurrency && (
              <div className="mt-1 flex flex-wrap gap-1">
                {metrics.byCurrency.filter(c => c.saques > 0.01).map(c => (
                  <Badge key={c.moeda} variant="outline" className="text-[9px] px-1 py-0">
                    {formatVal(c.saques, c.moeda)}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Saldo Casas</span>
              <KpiInfoButton
                title="Saldo Casas (Mark-to-Market)"
                body={
                  <>
                    <p>Soma de <strong>tudo que está nas casas vinculadas agora</strong>, convertido pela <strong>cotação de hoje</strong>.</p>
                    <p>É o quanto você teria se sacasse tudo neste momento.</p>
                  </>
                }
                divergencia={
                  <p>Esse card usa a cotação <strong>de hoje</strong>, enquanto Depósitos e Saques usam a cotação <strong>do dia em que aconteceram</strong>. Essa diferença de "ponto de vista" é o que aparece como variação cambial no Resultado de Caixa.</p>
                }
              />
            </div>
            <p className="text-lg font-bold text-foreground">
              {formatConsolidated(metrics?.saldoCasasTotal || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowRightLeft className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Extras</span>
              <KpiInfoButton
                title="Extras (Ajustes / Cashback / Bônus)"
                body={
                  <>
                    <p>Soma tudo o que entra ou sai do caixa do projeto <strong>fora</strong> de depósitos e saques: ajustes manuais, cashbacks, bônus creditados, perdas no recebimento e variações cambiais reconciliadas.</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      <li><strong>Entradas</strong> (cashback, bônus, ganho cambial) somam.</li>
                      <li><strong>Saídas</strong> (perda no recebimento, estorno, perda cambial) subtraem.</li>
                    </ul>
                    <p>Esses valores são <strong>responsabilidade do projeto</strong> (não da empresa) e por isso entram diretamente no Resultado de Caixa, refletindo o que você realmente terá no fechamento.</p>
                    <p>Convertido pela cotação do dia de cada lançamento.</p>
                  </>
                }
              />
            </div>
            <p className={`text-lg font-bold ${(metrics?.ajustesTotal || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatConsolidated(metrics?.ajustesTotal || 0)}
            </p>
            {isMultiCurrency && metrics?.byCurrency && (
              <div className="mt-1 flex flex-wrap gap-1">
                {metrics.byCurrency.filter(c => Math.abs(c.ajustes) > 0.01).map(c => (
                  <Badge key={c.moeda} variant="outline" className="text-[9px] px-1 py-0">
                    {formatVal(c.ajustes, c.moeda)}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 col-span-2 sm:col-span-3 lg:col-span-1 bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Resultado de Caixa</span>
              <KpiInfoButton
                title="Resultado de Caixa"
                body={
                  <>
                    <p><strong>Conta:</strong> Saques + Saldo Casas + Extras − Depósitos.</p>
                    <p>Mostra a realidade do caixa hoje, considerando tudo que afeta o fechamento do projeto. Pode ficar negativo antes de operar por dois motivos:</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      <li><strong>Perda no recebimento:</strong> a casa creditou menos do que você enviou (taxa de rede, fee da casa). Já entra como saída em <em>Extras</em>.</li>
                      <li><strong>Variação cambial:</strong> o dinheiro nas casas vale menos hoje do que custou para colocar lá (ou mais, se valorizou).</li>
                    </ul>
                    <p className="text-[10px] text-muted-foreground/80">Essas perdas/ganhos são <strong>do projeto</strong>, não da empresa — quando você sacar, vai sacar com o câmbio do dia. Por isso entram no fechamento final.</p>
                    {metrics && Math.abs(metrics.variacaoCambialDepositos) > 0.01 && (
                      <div className="mt-2 p-2 rounded bg-muted/50 space-y-1">
                        <p className="text-[10px] uppercase tracking-wide font-semibold">Variação cambial estimada</p>
                        <div className="flex justify-between gap-2">
                          <span>Depósitos pela cotação do dia:</span>
                          <span>{formatConsolidated(metrics.depositosTotal)}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span>Mesmos depósitos pela cotação de hoje:</span>
                          <span>{formatConsolidated(metrics.depositosLiveEquivalente)}</span>
                        </div>
                        <div className={`flex justify-between gap-2 font-semibold ${metrics.variacaoCambialDepositos >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          <span>Diferença:</span>
                          <span>{metrics.variacaoCambialDepositos >= 0 ? "+" : ""}{formatConsolidated(metrics.variacaoCambialDepositos)}</span>
                        </div>
                      </div>
                    )}
                  </>
                }
                divergencia={
                  <p>Não é Lucro Operacional. É o reflexo do caixa do projeto considerando o câmbio do dia. Para a performance real das operações, use a Visão Geral.</p>
                }
              />
            </div>
            <p className={`text-lg font-bold ${(metrics?.resultadoCaixa || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatConsolidated(metrics?.resultadoCaixa || 0)}
            </p>
            <p className="mt-1 text-[9px] text-muted-foreground/70">
              saques + saldo + extras − depósitos · não é Lucro Operacional
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-full sm:min-w-[200px] sm:max-w-xs order-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por casa, parceiro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 flex-1 sm:flex-initial sm:w-auto sm:min-w-[140px] text-xs order-2">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="depositos">Depósitos</SelectItem>
            <SelectItem value="saques">Saques</SelectItem>
            <SelectItem value="ajustes">Extras (ajustes, cashback, câmbio)</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 flex-1 sm:flex-initial sm:w-auto sm:min-w-[140px] text-xs order-3">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            <SelectItem value="CONFIRMADO">Confirmado</SelectItem>
            <SelectItem value="PENDENTE">Pendente</SelectItem>
            <SelectItem value="EM_TRANSITO">Em Trânsito</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-[11px] text-muted-foreground ml-auto order-4 w-full sm:w-auto text-right">
          {filteredTransactions.length} / {transactions.length} registros
        </span>

        {(reconciledHiddenCount > 0 || showReconciled) && (
          <button
            type="button"
            onClick={() => toggleShowReconciled(!showReconciled)}
            className={`order-5 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] transition-colors ${
              showReconciled
                ? "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/15"
                : "bg-muted/40 border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            title={
              showReconciled
                ? "Ocultar reconciliações automáticas (revínculo, baselines duplicados)"
                : "Mostrar reconciliações automáticas (revínculo, baselines duplicados) — não afetam KPIs"
            }
          >
            {showReconciled ? (
              <>
                <EyeOff className="h-3 w-3" />
                Ocultar reconciliações
              </>
            ) : (
              <>
                <RefreshCcw className="h-3 w-3" />
                {reconciledHiddenCount} reconciliaç{reconciledHiddenCount === 1 ? "ão oculta" : "ões ocultas"}
              </>
            )}
          </button>
        )}
      </div>

      {/* Transaction List */}
      {grouped.length === 0 ? (
        <Card className="border-dashed border-border/30">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Depósitos, saques e ajustes aparecerão aqui conforme forem realizados
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, txns]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{date}</span>
                <div className="flex-1 h-px bg-border/30" />
              </div>
              <div className="space-y-1.5">
                {txns.map((t) => {
                  const sign = getTransactionSign(t.tipo_transacao, t.ajuste_direcao);
                  const isForeign = t.moeda !== "BRL";
                  const isReconciled = t.audit_class.startsWith("RECONCILED_");
                  const isBaselineExcluded = t.audit_class === "BASELINE_EXCLUDED";
                  const reconciledLabel =
                    t.audit_class === "RECONCILED_PHANTOM"
                      ? "🔁 Reconciliada (revínculo)"
                      : t.audit_class === "RECONCILED_DUPLICATE"
                        ? "🧹 Baseline limpo (duplicava depósito)"
                        : "⊘ Cancelada";
                  const reconciledTooltip =
                    t.audit_class === "RECONCILED_PHANTOM"
                      ? "Esta transação foi neutralizada automaticamente: a casa foi desvinculada e revinculada ao mesmo projeto sem operações entre. Mantida no histórico para auditoria. NÃO entra em Saques / Depósitos / Resultado de Caixa."
                      : t.audit_class === "RECONCILED_DUPLICATE"
                        ? "Saldo inicial de vinculação cancelado pelo motor (já contado pelo depósito real correspondente). NÃO entra em Saques / Depósitos / Resultado de Caixa."
                        : "Transação cancelada. NÃO entra em Saques / Depósitos / Resultado de Caixa.";

                  return (
                    <Card
                      key={t.id}
                      className={`border-border/30 hover:border-border/60 transition-colors ${
                        isReconciled ? "opacity-60 border-dashed border-amber-500/30" : ""
                      }`}
                    >
                      <CardContent className="p-3">
                        {/* Mobile-first: ícone + título/valor empilhado em 2 linhas; desktop volta a 1 linha */}
                        <div className="flex items-start gap-3">
                          {/* Icon */}
                          <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                            isReconciled ? "bg-amber-500/10" : "bg-muted/50"
                          }`}>
                            {getTransactionIcon(t.tipo_transacao)}
                          </div>

                          {/* Conteúdo principal */}
                          <div className="flex-1 min-w-0">
                            {/* Linha 1: label + valor (sempre lado a lado) */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                                <span className="text-sm font-medium text-foreground">
                                  {getTransactionLabel(t.tipo_transacao, t.descricao)}
                                </span>
                                {isForeign && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 text-blue-400 border-blue-400/30">
                                    {t.moeda}
                                  </Badge>
                                )}
                                {t.evento_promocional_tipo && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 text-purple-400 border-purple-400/30">
                                    {t.evento_promocional_tipo}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-sm font-semibold whitespace-nowrap ${
                                  isReconciled ? "line-through text-muted-foreground" :
                                  sign === "positive" ? "text-emerald-400" :
                                  sign === "negative" ? "text-red-400" : "text-foreground"
                                }`}>
                                  {sign === "positive" ? "+" : sign === "negative" ? "-" : ""}
                                  {formatVal(t.valor, t.moeda)}
                                </p>
                                {isForeign && t.cotacao_efetiva && t.cotacao_efetiva !== 1 && (
                                  <p className="text-[9px] text-muted-foreground/60 whitespace-nowrap">
                                    1 {t.moeda} ≈ {t.cotacao_efetiva < 0.01
                                      ? t.cotacao_efetiva.toFixed(6)
                                      : t.cotacao_efetiva.toFixed(4)} USD
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Linha 2: descrição (bookmaker · parceiro · obs) */}
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {t.bookmaker_nome || "—"}
                              {t.parceiro_nome && ` · ${t.parceiro_nome}`}
                              {t.tipo_transacao === "DEPOSITO_VIRTUAL"
                                ? t.origem_tipo === "MIGRACAO"
                                  ? " · Saldo migrado de outro projeto"
                                  : " · Saldo inicial da vinculação"
                                : t.tipo_transacao === "SAQUE_VIRTUAL"
                                ? " · Saldo transferido (desvinculação)"
                                : t.descricao ? ` · ${t.descricao}` : ""}
                              {t.ajuste_motivo && ` · ${t.ajuste_motivo}`}
                            </p>

                            {/* Linha 3: status + horário */}
                            <div className="flex items-center justify-between gap-2 mt-1.5">
                              {isReconciled ? (
                                <TooltipProvider delayDuration={150}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px] cursor-help">
                                        {reconciledLabel}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs text-xs">
                                      {reconciledTooltip}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : isBaselineExcluded ? (
                                <TooltipProvider delayDuration={150}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/30 text-[10px] cursor-help">
                                        📥 Saldo inicial · não contabilizado
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs text-xs">
                                      Saldo já existente na casa no momento da vinculação. Como não saiu do caixa do projeto, NÃO entra em Depósitos / Resultado de Caixa. Aparece aqui apenas para transparência da formação do saldo da casa.
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                getStatusBadge(t.status)
                              )}
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(t.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
