import { useState } from "react";
import { ShieldAlert, TrendingUp, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { GlobalLimitationSection } from "./GlobalLimitationSection";
import { PerformancePorCasaSection } from "./PerformancePorCasaSection";

export type RegFilter = "todas" | "REGULAMENTADA" | "NAO_REGULAMENTADA";

const REG_OPTIONS: { value: RegFilter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "REGULAMENTADA", label: "Regulamentadas" },
  { value: "NAO_REGULAMENTADA", label: "Não Regulamentadas" },
];

const tabs = [
  { id: "limitacao", label: "Limitação", icon: ShieldAlert },
  { id: "performance", label: "Performance por Casa", icon: TrendingUp },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function EstatisticasTab() {
  const [activeTab, setActiveTab] = useState<TabId>("limitacao");
  const [regFilter, setRegFilter] = useState<RegFilter>("todas");
  const { workspaceId } = useWorkspace();

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

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            Inteligência de Limitação Global
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Análise consolidada de comportamento e resultados por casa de apostas
        </p>
      </div>

      {/* Content-level tabs + regulation filter */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors duration-200",
                  "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Shared regulation filter */}
        <div className="flex items-center gap-1 rounded-lg border border-border p-1 mb-1">
          {REG_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setRegFilter(opt.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                regFilter === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="animate-fade-in">
        {activeTab === "limitacao" && <GlobalLimitationSection regFilter={regFilter} regMap={regMap} />}
        {activeTab === "performance" && <PerformancePorCasaSection regFilter={regFilter} regMap={regMap} />}
      </div>
    </div>
  );
}
