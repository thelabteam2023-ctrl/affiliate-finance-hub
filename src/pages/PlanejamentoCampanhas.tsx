import { PlanejamentoCalendario } from "@/components/planejamento/PlanejamentoCalendario";

export default function PlanejamentoCampanhas() {
  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-background">
      <div className="px-4 py-2 border-b">
        <h1 className="text-xl font-bold">Planejamento de Campanhas</h1>
        <p className="text-xs text-muted-foreground">Organize depósitos mensais por casa, com IP, perfil e carteira vinculados.</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <PlanejamentoCalendario />
      </div>
    </div>
  );
}
