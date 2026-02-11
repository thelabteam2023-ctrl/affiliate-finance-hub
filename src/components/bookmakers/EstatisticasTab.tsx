import { useState, useMemo } from "react";
import { ShieldAlert, TrendingUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { GlobalLimitationSection } from "./GlobalLimitationSection";
import { PerformancePorCasaSection } from "./PerformancePorCasaSection";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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

const TAB_META: Record<TabId, { title: string; subtitle: string }> = {
  limitacao: {
    title: "Análise Estratégica de Limitações",
    subtitle: "Visão consolidada do comportamento de limitação e padrões operacionais das casas.",
  },
  performance: {
    title: "Performance Financeira por Casa",
    subtitle: "Análise consolidada de volume, lucro, eventos e eficiência operacional por bookmaker.",
  },
};

export function EstatisticasTab() {
  const [activeTab, setActiveTab] = useState<TabId>("limitacao");
  const [regFilter, setRegFilter] = useState<RegFilter>("todas");
  const [regOpen, setRegOpen] = useState(false);
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

  const meta = TAB_META[activeTab];
  const regLabel = REG_OPTIONS.find(o => o.value === regFilter)?.label ?? "Todas";

  return (
    <div className="space-y-5">
      {/* Dynamic title + subtitle */}
      <div className="space-y-0.5">
        <h2
          key={activeTab}
          className="text-lg font-semibold text-foreground animate-fade-in"
        >
          {meta.title}
        </h2>
        <p
          key={`sub-${activeTab}`}
          className="text-sm text-muted-foreground animate-fade-in"
        >
          {meta.subtitle}
        </p>
      </div>

      {/* Tabs + dropdown filter in single row */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors duration-200",
                  "hover:text-foreground focus-visible:outline-none",
                  isActive ? "text-foreground" : "text-muted-foreground"
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

        {/* Dropdown filter */}
        <Popover open={regOpen} onOpenChange={setRegOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 mb-1 rounded-md text-xs font-medium transition-colors",
                "border border-border hover:bg-muted/50",
                regFilter !== "todas"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground"
              )}
            >
              <span className="text-muted-foreground">Regulamentação:</span>
              <span>{regLabel}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            {REG_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => {
                  setRegFilter(opt.value);
                  setRegOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
                  regFilter === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {/* Tab content */}
      <div className="animate-fade-in" key={activeTab}>
        {activeTab === "limitacao" && <GlobalLimitationSection regFilter={regFilter} regMap={regMap} />}
        {activeTab === "performance" && <PerformancePorCasaSection regFilter={regFilter} regMap={regMap} />}
      </div>
    </div>
  );
}
