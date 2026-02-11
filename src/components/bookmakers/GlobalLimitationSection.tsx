import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldAlert, Zap, BarChart3, Building2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  type GlobalLimitationStats,
} from "@/hooks/useLimitationEvents";
import { LimitationGlobalRankingTable } from "@/components/projeto-detalhe/limitation/LimitationGlobalRankingTable";
import type { RegFilter } from "./EstatisticasTab";

interface GlobalLimitationSectionProps {
  regFilter: RegFilter;
  regMap: Map<string, string>;
}

export function GlobalLimitationSection({ regFilter, regMap }: GlobalLimitationSectionProps) {
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

      const withdrawalMap = new Map<string, { avg_days: number; total_confirmed: number }>();
      if (!withdrawalResult.error && withdrawalResult.data) {
        for (const w of withdrawalResult.data as any[]) {
          withdrawalMap.set(w.bookmaker_catalogo_id, {
            avg_days: Number(w.avg_withdrawal_days),
            total_confirmed: Number(w.total_confirmed_withdrawals),
          });
        }
      }

      const volumeMap = new Map<string, { volume: number; pl: number; moeda: string }>();
      if (!volumeResult.error && volumeResult.data) {
        for (const v of volumeResult.data as any[]) {
          volumeMap.set(v.bookmaker_catalogo_id, {
            volume: Number(v.total_volume),
            pl: Number(v.total_pl),
            moeda: v.moeda || "BRL",
          });
        }
      }

      return (globalResult.data || []).map((s: any): GlobalLimitationStats => {
        const wd = withdrawalMap.get(s.bookmaker_catalogo_id);
        const vol = volumeMap.get(s.bookmaker_catalogo_id);
        return {
          ...s,
          avg_withdrawal_days: wd?.avg_days ?? null,
          total_confirmed_withdrawals: wd?.total_confirmed ?? 0,
          volume_total: vol?.volume ?? null,
          lucro_prejuizo_total: vol?.pl ?? null,
          moeda_volume: vol?.moeda ?? null,
        };
      });
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
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
      {/* KPI Cards — compact 4-col */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-border/50">
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11px] text-red-500 mb-0.5">
              <ShieldAlert className="h-3 w-3" />
              Total de Eventos
            </div>
            <div className="text-xl font-bold leading-tight">{totalEvents}</div>
            <div className="text-[11px] text-muted-foreground">em {totalCasas} casa{totalCasas !== 1 ? "s" : ""}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-500 mb-0.5">
              <BarChart3 className="h-3 w-3" />
              Média de Apostas
            </div>
            <div className="text-xl font-bold leading-tight">{avgBets}</div>
            <div className="text-[11px] text-muted-foreground">antes da limitação</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11px] text-yellow-500 mb-0.5">
              <Zap className="h-3 w-3" />
              Early Limiters
            </div>
            <div className="text-xl font-bold leading-tight">{earlyPct}%</div>
            <div className="text-[11px] text-muted-foreground">{earlyLimiters} de {totalCasas} casas</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11px] text-blue-500 mb-0.5">
              <Building2 className="h-3 w-3" />
              Casas Analisadas
            </div>
            <div className="text-xl font-bold leading-tight">{totalCasas}</div>
            <div className="text-[11px] text-muted-foreground">com dados de limitação</div>
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
