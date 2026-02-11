import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Zap, BarChart3, Building2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  type GlobalLimitationStats,
} from "@/hooks/useLimitationEvents";
import { LimitationGlobalRankingTable } from "@/components/projeto-detalhe/limitation/LimitationGlobalRankingTable";

type RegFilter = "todas" | "REGULAMENTADA" | "NAO_REGULAMENTADA";

export function GlobalLimitationSection() {
  const { workspaceId } = useWorkspace();
  const [regFilter, setRegFilter] = useState<RegFilter>("todas");

  // Fetch regulation status for each bookmaker_catalogo_id
  const { data: regMap = new Map() } = useQuery({
    queryKey: ["bookmakers-catalogo-regulation", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookmakers_catalogo")
        .select("id, status");
      const map = new Map<string, string>();
      (data || []).forEach((b: any) => map.set(b.id, b.status));
      return map;
    },
    enabled: !!workspaceId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: globalStats = [], isLoading } = useQuery({
    queryKey: ["limitation-stats-global", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      const [globalResult, withdrawalResult, volumeResult] = await Promise.all([
        supabase
          .from("v_limitation_stats_global")
          .select("*")
          .eq("workspace_id", workspaceId),
        supabase.rpc("get_avg_withdrawal_duration_by_catalogo" as any, {
          p_workspace_id: workspaceId,
        }),
        supabase.rpc("get_volume_pl_by_catalogo_limitadas" as any, {
          p_workspace_id: workspaceId,
        }),
      ]);

      if (globalResult.error) throw globalResult.error;

      const withdrawalMap = new Map<string, { avg_days: number; total: number }>();
      if (!withdrawalResult.error && withdrawalResult.data) {
        for (const row of (withdrawalResult.data as unknown as any[])) {
          withdrawalMap.set(row.bookmaker_catalogo_id, {
            avg_days: Number(row.avg_days) || 0,
            total: Number(row.total_confirmed) || 0,
          });
        }
      }

      const volumeMap = new Map<string, { volume: number; pl: number; moeda: string }>();
      if (!volumeResult.error && volumeResult.data) {
        for (const row of (volumeResult.data as unknown as any[])) {
          volumeMap.set(row.bookmaker_catalogo_id, {
            volume: Number(row.total_volume) || 0,
            pl: Number(row.total_pl) || 0,
            moeda: row.moeda || 'BRL',
          });
        }
      }

      return (globalResult.data || []).map((s: any) => ({
        ...s,
        avg_withdrawal_days: withdrawalMap.get(s.bookmaker_catalogo_id)?.avg_days ?? null,
        total_confirmed_withdrawals: withdrawalMap.get(s.bookmaker_catalogo_id)?.total ?? 0,
        volume_total: volumeMap.get(s.bookmaker_catalogo_id)?.volume ?? 0,
        lucro_prejuizo_total: volumeMap.get(s.bookmaker_catalogo_id)?.pl ?? 0,
        moeda_volume: volumeMap.get(s.bookmaker_catalogo_id)?.moeda ?? 'BRL',
      })) as GlobalLimitationStats[];
    },
    enabled: !!workspaceId,
  });

  // Filter by regulation
  const filteredStats = useMemo(() => {
    if (regFilter === "todas") return globalStats;
    return globalStats.filter(s => {
      const status = regMap.get(s.bookmaker_catalogo_id);
      return status === regFilter;
    });
  }, [globalStats, regFilter, regMap]);

  // Compute KPIs from global stats
  const totalEvents = filteredStats.reduce((sum, s) => sum + s.total_events, 0);
  const totalCasas = filteredStats.length;
  const avgBets = totalEvents > 0
    ? Math.round(filteredStats.reduce((sum, s) => sum + s.avg_bets_before_limitation * s.total_events, 0) / totalEvents * 10) / 10
    : 0;
  const earlyLimiters = filteredStats.filter(s => s.strategic_profile === "early_limiter").length;
  const earlyPct = totalCasas > 0 ? Math.round((earlyLimiters / totalCasas) * 100) : 0;

  const REG_OPTIONS: { value: RegFilter; label: string }[] = [
    { value: "todas", label: "Todas" },
    { value: "REGULAMENTADA", label: "Regulamentadas" },
    { value: "NAO_REGULAMENTADA", label: "Não Regulamentadas" },
  ];

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          Carregando dados de limitação...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Regulation filter */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          {REG_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setRegFilter(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                regFilter === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-red-500 mb-1">
              <ShieldAlert className="h-3.5 w-3.5" />
              Total de Eventos
            </div>
            <div className="text-2xl font-bold">{totalEvents}</div>
            <div className="text-xs text-muted-foreground">em {totalCasas} casa{totalCasas !== 1 ? "s" : ""}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-emerald-500 mb-1">
              <BarChart3 className="h-3.5 w-3.5" />
              Média de Apostas
            </div>
            <div className="text-2xl font-bold">{avgBets}</div>
            <div className="text-xs text-muted-foreground">antes da limitação</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-yellow-500 mb-1">
              <Zap className="h-3.5 w-3.5" />
              Early Limiters
            </div>
            <div className="text-2xl font-bold">{earlyPct}%</div>
            <div className="text-xs text-muted-foreground">{earlyLimiters} de {totalCasas} casas</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-blue-500 mb-1">
              <Building2 className="h-3.5 w-3.5" />
              Casas Analisadas
            </div>
            <div className="text-2xl font-bold">{totalCasas}</div>
            <div className="text-xs text-muted-foreground">com dados de limitação</div>
          </CardContent>
        </Card>
      </div>

      {/* Global Ranking Table */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ranking Global por Casa</CardTitle>
          <CardDescription>
            Classificação estratégica longitudinal e tempo médio de saque por bookmaker
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LimitationGlobalRankingTable stats={filteredStats} />
        </CardContent>
      </Card>
    </div>
  );
}
