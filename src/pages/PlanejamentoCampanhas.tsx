import { useEffect, useState } from "react";
 import { CalendarRange, CalendarCheck2, Sparkles, ListTodo } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTopBar } from "@/contexts/TopBarContext";
 import { PlanejamentoCalendario } from "@/components/planejamento/PlanejamentoCalendario";
 import { PlanejamentoList } from "@/components/planejamento/PlanejamentoList";
import { CalendarioSimulado } from "@/components/planejamento/CalendarioSimulado";
import { usePlanningRealtimeSync } from "@/hooks/usePlanningRealtimeSync";

export default function PlanejamentoCampanhas() {
  const { setContent: setTopBarContent } = useTopBar();
   const [tab, setTab] = useState<"real" | "lista" | "simulado">("real");

  // Ativa a sincronização em tempo real para o planejamento
  usePlanningRealtimeSync();

  useEffect(() => {
    setTopBarContent(
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-default">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <CalendarRange className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-sm">Planejamento de Campanhas</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Organize depósitos mensais por casa, com IP, perfil e carteira vinculados.
        </TooltipContent>
      </Tooltip>
    );
    return () => setTopBarContent(null);
  }, [setTopBarContent]);

  return (
    <TooltipProvider>
      <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-background">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "real" | "simulado")} className="flex-1 flex flex-col min-h-0">
          <div className="px-3 pt-2 border-b bg-card/50">
            <TabsList className="h-9 bg-muted/50 p-1">
              <TabsTrigger value="lista" className="text-xs gap-1.5">
                <ListTodo className="h-3.5 w-3.5" />
                Histórico Detalhado
              </TabsTrigger>
              <TabsTrigger value="real" className="text-xs gap-1.5">
                <CalendarCheck2 className="h-3.5 w-3.5" />
                Calendário Real
              </TabsTrigger>
              <TabsTrigger value="simulado" className="text-xs gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Calendário Simulado
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="lista" className="flex-1 overflow-hidden m-0 outline-none">
            <PlanejamentoList />
          </TabsContent>
          <TabsContent value="real" className="flex-1 overflow-hidden m-0 outline-none">
            <PlanejamentoCalendario />
          </TabsContent>
          <TabsContent value="simulado" className="flex-1 overflow-hidden m-0 outline-none">
            <CalendarioSimulado />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
