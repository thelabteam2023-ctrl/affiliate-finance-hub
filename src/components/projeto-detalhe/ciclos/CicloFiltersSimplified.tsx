import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, CheckCircle2, Clock } from "lucide-react";

export type CicloStatusFilter = "ATIVO" | "CONCLUIDO" | "FUTURO";
export type CicloTipoFilter = "TODOS" | "META" | "PRAZO" | "META_PRAZO";

interface CicloFiltersSimplifiedProps {
  activeStatus: CicloStatusFilter;
  activeTipo: CicloTipoFilter;
  onStatusChange: (status: CicloStatusFilter) => void;
  onTipoChange: (tipo: CicloTipoFilter) => void;
}

export function CicloFiltersSimplified({
  activeStatus,
  activeTipo,
  onStatusChange,
  onTipoChange,
}: CicloFiltersSimplifiedProps) {
  return (
    <div className="flex flex-wrap items-center gap-6">
      {/* Filtro Status - Exclusivo, um clique */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground font-medium mr-1">Status:</span>
        
        <Button
          variant={activeStatus === "ATIVO" ? "default" : "ghost"}
          size="sm"
          className={`h-8 text-xs gap-1.5 ${
            activeStatus === "ATIVO" 
              ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30" 
              : "text-muted-foreground"
          }`}
          onClick={() => onStatusChange("ATIVO")}
        >
          <Play className="h-3 w-3" />
          Ativo
        </Button>
        
        <Button
          variant={activeStatus === "CONCLUIDO" ? "default" : "ghost"}
          size="sm"
          className={`h-8 text-xs gap-1.5 ${
            activeStatus === "CONCLUIDO" 
              ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30" 
              : "text-muted-foreground"
          }`}
          onClick={() => onStatusChange("CONCLUIDO")}
        >
          <CheckCircle2 className="h-3 w-3" />
          Concluído
        </Button>
        
        <Button
          variant={activeStatus === "FUTURO" ? "default" : "ghost"}
          size="sm"
          className={`h-8 text-xs gap-1.5 ${
            activeStatus === "FUTURO" 
              ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30" 
              : "text-muted-foreground"
          }`}
          onClick={() => onStatusChange("FUTURO")}
        >
          <Clock className="h-3 w-3" />
          Futuro
        </Button>
      </div>

      {/* Separador visual */}
      <div className="h-6 w-px bg-border" />

      {/* Filtro Tipo - Select */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">Tipo:</span>
        
        <Select value={activeTipo} onValueChange={(value) => onTipoChange(value as CicloTipoFilter)}>
          <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos</SelectItem>
            <SelectItem value="META">Por Meta</SelectItem>
            <SelectItem value="PRAZO">Por Prazo</SelectItem>
            <SelectItem value="META_PRAZO">Meta + Prazo</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
