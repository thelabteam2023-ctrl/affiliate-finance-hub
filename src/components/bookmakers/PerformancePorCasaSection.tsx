import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Building2, TrendingUp, TrendingDown, DollarSign, BarChart3, Hash, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { RegFilter } from "./EstatisticasTab";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCotacoes } from "@/hooks/useCotacoes";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$", USD: "$", EUR: "€", GBP: "£", MYR: "RM", USDT: "$", USDC: "$",
};

function fmt(value: number, moeda: string): string {
  const symbol = CURRENCY_SYMBOLS[moeda] || moeda || "R$";
  const formatted = Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? "-" : ""}${symbol} ${formatted}`;
}

interface CasaPerformance {
  bookmaker_catalogo_id: string;
  nome: string;
  logo_url: string | null;
  moeda: string;
  volume_total: number;
  lucro_prejuizo: number;
  roi: number;
  total_apostas: number;
  total_greens: number;
  total_reds: number;
  saldo_atual: number;
  ticket_medio: number;
}

interface PerformancePorCasaSectionProps {
  regFilter: RegFilter;
  regMap: Map<string, string>;
}

export function PerformancePorCasaSection({ regFilter, regMap }: PerformancePorCasaSectionProps) {
  const { workspaceId } = useWorkspace();
  const { convertToBRL } = useCotacoes();

  const { data: performances = [], isLoading } = useQuery({
    queryKey: ["performance-por-casa", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      const [bookmakersResult, resultadosResult] = await Promise.all([
        supabase
          .from("bookmakers")
          .select("id, nome, moeda, saldo_atual, bookmaker_catalogo_id, bookmakers_catalogo(nome, logo_url)")
          .eq("workspace_id", workspaceId),
        supabase
          .from("v_bookmaker_resultado_operacional")
          .select("bookmaker_id, resultado_operacional_total, qtd_apostas, qtd_greens, qtd_reds")
          .eq("workspace_id", workspaceId),
      ]);

      if (bookmakersResult.error) throw bookmakersResult.error;

      const bookmakerIds = (bookmakersResult.data || []).map(b => b.id);
      let stakeMap = new Map<string, number>();
      
      if (bookmakerIds.length > 0) {
        const { data: apostasData } = await supabase
          .from("apostas_unificada")
          .select("bookmaker_id, stake")
          .eq("workspace_id", workspaceId)
          .in("bookmaker_id", bookmakerIds)
          .not("status", "eq", "CANCELADA");

        if (apostasData) {
          for (const a of apostasData) {
            if (a.bookmaker_id && a.stake) {
              stakeMap.set(a.bookmaker_id, (stakeMap.get(a.bookmaker_id) || 0) + Number(a.stake));
            }
          }
        }
      }

      const resultadoMap = new Map<string, any>();
      if (!resultadosResult.error && resultadosResult.data) {
        for (const r of resultadosResult.data) {
          resultadoMap.set(r.bookmaker_id, r);
        }
      }

      const catalogoMap = new Map<string, CasaPerformance>();

      for (const bm of bookmakersResult.data || []) {
        const catId = bm.bookmaker_catalogo_id;
        if (!catId) continue;

        const catalogo = bm.bookmakers_catalogo as { nome: string; logo_url: string | null } | null;
        const resultado = resultadoMap.get(bm.id);
        const volume = stakeMap.get(bm.id) || 0;

        const existing = catalogoMap.get(catId);
        if (existing) {
          existing.volume_total += volume;
          existing.lucro_prejuizo += Number(resultado?.resultado_operacional_total || 0);
          existing.total_apostas += Number(resultado?.qtd_apostas || 0);
          existing.total_greens += Number(resultado?.qtd_greens || 0);
          existing.total_reds += Number(resultado?.qtd_reds || 0);
          existing.saldo_atual += Number(bm.saldo_atual || 0);
        } else {
          catalogoMap.set(catId, {
            bookmaker_catalogo_id: catId,
            nome: catalogo?.nome || bm.nome,
            logo_url: catalogo?.logo_url || null,
            moeda: bm.moeda || "BRL",
            volume_total: volume,
            lucro_prejuizo: Number(resultado?.resultado_operacional_total || 0),
            roi: 0,
            total_apostas: Number(resultado?.qtd_apostas || 0),
            total_greens: Number(resultado?.qtd_greens || 0),
            total_reds: Number(resultado?.qtd_reds || 0),
            saldo_atual: Number(bm.saldo_atual || 0),
            ticket_medio: 0,
          });
        }
      }

      const result = Array.from(catalogoMap.values()).map(p => ({
        ...p,
        roi: p.volume_total > 0 ? (p.lucro_prejuizo / p.volume_total) * 100 : 0,
        ticket_medio: p.total_apostas > 0 ? p.volume_total / p.total_apostas : 0,
      }));

      return result.sort((a, b) => b.volume_total - a.volume_total);
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Filter by regulation
  const filteredPerformances = useMemo(() => {
    if (regFilter === "todas") return performances;
    return performances.filter(p => {
      const status = regMap.get(p.bookmaker_catalogo_id);
      return status === regFilter;
    });
  }, [performances, regFilter, regMap]);

  // KPIs por moeda
  const currencyBreakdown = useMemo(() => {
    const byMoeda: Record<string, { volume: number; pl: number }> = {};
    
    for (const p of filteredPerformances) {
      const m = p.moeda || "BRL";
      if (!byMoeda[m]) byMoeda[m] = { volume: 0, pl: 0 };
      byMoeda[m].volume += p.volume_total;
      byMoeda[m].pl += p.lucro_prejuizo;
    }
    
    return Object.entries(byMoeda)
      .map(([moeda, vals]) => ({ moeda, ...vals }))
      .sort((a, b) => {
        // BRL first, then by volume desc
        if (a.moeda === "BRL") return -1;
        if (b.moeda === "BRL") return 1;
        return b.volume - a.volume;
      });
  }, [filteredPerformances]);

  // Consolidado em BRL
  const consolidatedBRL = useMemo(() => {
    let totalVolume = 0;
    let totalPL = 0;
    for (const item of currencyBreakdown) {
      totalVolume += convertToBRL(item.volume, item.moeda);
      totalPL += convertToBRL(item.pl, item.moeda);
    }
    return { volume: totalVolume, pl: totalPL };
  }, [currencyBreakdown, convertToBRL]);

  const hasMultipleCurrencies = currencyBreakdown.length > 1;
  const totalApostas = filteredPerformances.reduce((s, p) => s + p.total_apostas, 0);
  const totalCasas = filteredPerformances.length;

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          Carregando performance...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Volume por moeda */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <DollarSign className="h-3.5 w-3.5" />
              Volume Total
            </div>
            <div className="space-y-1.5">
              {currencyBreakdown.map(item => (
                <div key={item.moeda} className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                    {item.moeda}
                  </Badge>
                  <span className="text-sm font-semibold tabular-nums">
                    {fmt(item.volume, item.moeda)}
                  </span>
                </div>
              ))}
              {hasMultipleCurrencies && (
                <>
                  <div className="border-t border-border/50 my-1.5" />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <ArrowRight className="h-2.5 w-2.5" />
                      Consolidado
                    </span>
                    <span className="text-lg font-bold tabular-nums">
                      {fmt(consolidatedBRL.volume, "BRL")}
                    </span>
                  </div>
                </>
              )}
              {!hasMultipleCurrencies && currencyBreakdown.length === 1 && (
                <div className="text-lg font-bold tabular-nums mt-1">
                  {fmt(currencyBreakdown[0].volume, currencyBreakdown[0].moeda)}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* P&L por moeda */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <BarChart3 className="h-3.5 w-3.5" />
              Lucro / Prejuízo
            </div>
            <div className="space-y-1.5">
              {currencyBreakdown.map(item => (
                <div key={item.moeda} className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                    {item.moeda}
                  </Badge>
                  <span className={`text-sm font-semibold tabular-nums ${item.pl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {fmt(item.pl, item.moeda)}
                  </span>
                </div>
              ))}
              {hasMultipleCurrencies && (
                <>
                  <div className="border-t border-border/50 my-1.5" />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <ArrowRight className="h-2.5 w-2.5" />
                      Consolidado
                    </span>
                    <span className={`text-lg font-bold tabular-nums ${consolidatedBRL.pl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {fmt(consolidatedBRL.pl, "BRL")}
                    </span>
                  </div>
                </>
              )}
              {!hasMultipleCurrencies && currencyBreakdown.length === 1 && (
                <div className={`text-lg font-bold tabular-nums mt-1 ${currencyBreakdown[0].pl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {fmt(currencyBreakdown[0].pl, currencyBreakdown[0].moeda)}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Apostas */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Hash className="h-3.5 w-3.5" />
              Total de Apostas
            </div>
            <div className="text-2xl font-bold">{totalApostas.toLocaleString("pt-BR")}</div>
          </CardContent>
        </Card>

        {/* Casas */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Building2 className="h-3.5 w-3.5" />
              Casas
            </div>
            <div className="text-2xl font-bold">{totalCasas}</div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Resultado por Bookmaker</CardTitle>
          <CardDescription>Métricas financeiras consolidadas por casa de apostas</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredPerformances.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Nenhum dado de performance disponível.
            </div>
          ) : (
            <div className="rounded-md border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Bookmaker</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">Lucro/Prejuízo</TableHead>
                    <TableHead className="text-center">ROI</TableHead>
                    <TableHead className="text-center">Apostas</TableHead>
                    <TableHead className="text-right">Ticket Médio</TableHead>
                    <TableHead className="text-right">Saldo Atual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPerformances.map((p) => (
                    <TableRow key={p.bookmaker_catalogo_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            {p.logo_url ? <AvatarImage src={p.logo_url} /> : null}
                            <AvatarFallback className="text-[8px]">
                              <Building2 className="h-3 w-3" />
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-sm truncate max-w-[130px]">
                            {p.nome}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {fmt(p.volume_total, p.moeda)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        <span className={`flex items-center justify-end gap-1 ${p.lucro_prejuizo > 0 ? "text-emerald-500" : p.lucro_prejuizo < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          {p.lucro_prejuizo > 0 && <TrendingUp className="h-3 w-3" />}
                          {p.lucro_prejuizo < 0 && <TrendingDown className="h-3 w-3" />}
                          {fmt(p.lucro_prejuizo, p.moeda)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={`text-xs ${p.roi > 0 ? "border-emerald-500/30 text-emerald-500" : p.roi < 0 ? "border-red-500/30 text-red-500" : ""}`}
                        >
                          {p.roi > 0 ? "+" : ""}{p.roi.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm tabular-nums">
                        {p.total_apostas.toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {fmt(p.ticket_medio, p.moeda)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {fmt(p.saldo_atual, p.moeda)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
