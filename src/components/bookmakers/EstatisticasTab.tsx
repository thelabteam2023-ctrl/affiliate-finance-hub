import { useState } from "react";
import { ShieldAlert, TrendingUp, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlobalLimitationSection } from "./GlobalLimitationSection";
import { PerformancePorCasaSection } from "./PerformancePorCasaSection";

const tabs = [
  { id: "limitacao", label: "Limitação", icon: ShieldAlert },
  { id: "performance", label: "Performance por Casa", icon: TrendingUp },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function EstatisticasTab() {
  const [activeTab, setActiveTab] = useState<TabId>("limitacao");

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

      {/* Content-level tabs */}
      <div className="flex items-center gap-1 border-b border-border">
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

      {/* Tab content */}
      <div className="animate-fade-in">
        {activeTab === "limitacao" && <GlobalLimitationSection />}
        {activeTab === "performance" && <PerformancePorCasaSection />}
      </div>
    </div>
  );
}
