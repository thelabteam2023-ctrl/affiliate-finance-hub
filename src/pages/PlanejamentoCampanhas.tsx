import { useEffect } from "react";
import { CalendarRange } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTopBar } from "@/contexts/TopBarContext";
import { PlanejamentoCalendario } from "@/components/planejamento/PlanejamentoCalendario";

export default function PlanejamentoCampanhas() {
  const { setContent: setTopBarContent } = useTopBar();

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
        <div className="flex-1 overflow-hidden">
          <PlanejamentoCalendario />
        </div>
      </div>
    </TooltipProvider>
  );
}
