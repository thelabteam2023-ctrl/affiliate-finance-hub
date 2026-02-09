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

export function GlobalLimitationSection() {
  const { workspaceId } = useWorkspace();

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

      const volumeMap = new Map<string, { volume: number; pl: number }>();
      if (!volumeResult.error && volumeResult.data) {
        for (const row of (volumeResult.data as unknown as any[])) {
          volumeMap.set(row.bookmaker_catalogo_id, {
            volume: Number(row.total_volume) || 0,
            pl: Number(row.total_pl) || 0,
          });
        }
      }

      return (globalResult.data || []).map((s: any) => ({
        ...s,
        avg_withdrawal_days: withdrawalMap.get(s.bookmaker_catalogo_id)?.avg_days ?? null,
        total_confirmed_withdrawals: withdrawalMap.get(s.bookmaker_catalogo_id)?.total ?? 0,
        volume_total: volumeMap.get(s.bookmaker_catalogo_id)?.volume ?? 0,
        lucro_prejuizo_total: volumeMap.get(s.bookmaker_catalogo_id)?.pl ?? 0,
      })) as GlobalLimitationStats[];
    },
    enabled: !!workspaceId,
  });

  // Compute KPIs from global stats
  const totalEvents = globalStats.reduce((sum, s) => sum + s.total_events, 0);
  const totalCasas = globalStats.length;
  const avgBets = totalEvents > 0
    ? Math.round(globalStats.reduce((sum, s) => sum + s.avg_bets_before_limitation * s.total_events, 0) / totalEvents * 10) / 10
    : 0;
  const earlyLimiters = globalStats.filter(s => s.strategic_profile === "early_limiter").length;
  const earlyPct = totalCasas > 0 ? Math.round((earlyLimiters / totalCasas) * 100) : 0;

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
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
          <ShieldAlert className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Inteligência de Limitação Global</h3>
          <p className="text-sm text-muted-foreground">
            Visão consolidada de limitações em todas as bookmakers do workspace
          </p>
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
          <LimitationGlobalRankingTable stats={globalStats} />
        </CardContent>
      </Card>
    </div>
  );
}
