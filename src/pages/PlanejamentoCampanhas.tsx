import { CalendarRange } from "lucide-react";
import { PlanejamentoCalendario } from "@/components/planejamento/PlanejamentoCalendario";

export default function PlanejamentoCampanhas() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="shrink-0 border-b border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" />
          <h1 className="font-semibold text-foreground text-sm">Planejamento de Campanhas</h1>
          <span className="text-[11px] text-muted-foreground hidden md:inline">
            • Organize depósitos mensais por casa, com IP, perfil e carteira vinculados.
          </span>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <PlanejamentoCalendario />
      </main>
    </div>
  );
}
