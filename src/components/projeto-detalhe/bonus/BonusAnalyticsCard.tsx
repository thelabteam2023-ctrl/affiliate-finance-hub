import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trophy, RefreshCw, AlertTriangle, Shield, Bell } from "lucide-react";
import { ProjectBonus } from "@/hooks/useProjectBonuses";
import {
  ExtracaoTab,
  ConversaoTab,
  ProblemasTab,
  ConfiabilidadeTab,
  AlertasTab,
  DateRangeResult,
} from "./analytics";

interface BonusAnalyticsCardProps {
  bonuses: ProjectBonus[];
  dateRange?: DateRangeResult | null;
}

export function BonusAnalyticsCard({ bonuses, dateRange }: BonusAnalyticsCardProps) {
  const [activeTab, setActiveTab] = useState("extracao");

  const tabItems = [
    { value: "extracao", label: "Extração", icon: Trophy },
    { value: "conversao", label: "Conversão", icon: RefreshCw },
    { value: "problemas", label: "Problemas", icon: AlertTriangle },
    { value: "confiabilidade", label: "Confiabilidade", icon: Shield },
    { value: "alertas", label: "Alertas", icon: Bell },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          Central de Análise de Bônus
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Métricas e rankings consolidados por casa no período selecionado
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full h-9 p-1 bg-muted/50 mb-4">
            {tabItems.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex-1 text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <tab.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="extracao" className="mt-0 animate-fade-in">
            <ExtracaoTab bonuses={bonuses} dateRange={dateRange} />
          </TabsContent>

          <TabsContent value="conversao" className="mt-0 animate-fade-in">
            <ConversaoTab bonuses={bonuses} dateRange={dateRange} />
          </TabsContent>

          <TabsContent value="problemas" className="mt-0 animate-fade-in">
            <ProblemasTab bonuses={bonuses} dateRange={dateRange} />
          </TabsContent>

          <TabsContent value="confiabilidade" className="mt-0 animate-fade-in">
            <ConfiabilidadeTab bonuses={bonuses} dateRange={dateRange} />
          </TabsContent>

          <TabsContent value="alertas" className="mt-0 animate-fade-in">
            <AlertasTab bonuses={bonuses} dateRange={dateRange} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
