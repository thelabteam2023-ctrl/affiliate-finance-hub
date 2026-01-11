import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Play, 
  CheckCircle2, 
  Clock, 
  Target, 
  Zap,
  RotateCcw
} from "lucide-react";

export type CicloFilterStatus = "TODOS" | "EM_ANDAMENTO" | "FECHADO" | "FUTURO";
export type CicloFilterTipo = "TODOS" | "TEMPO" | "META" | "META_PRAZO";

interface CicloFiltersProps {
  activeStatusFilter: CicloFilterStatus;
  activeTipoFilter: CicloFilterTipo;
  onStatusFilterChange: (filter: CicloFilterStatus) => void;
  onTipoFilterChange: (filter: CicloFilterTipo) => void;
  counts: {
    emAndamento: number;
    fechados: number;
    futuros: number;
    porTempo: number;
    porMeta: number;
    metaPrazo: number;
  };
}

export function CicloFilters({
  activeStatusFilter,
  activeTipoFilter,
  onStatusFilterChange,
  onTipoFilterChange,
  counts,
}: CicloFiltersProps) {
  const hasActiveFilters = activeStatusFilter !== "TODOS" || activeTipoFilter !== "TODOS";

  return (
    <div className="space-y-3">
      {/* Filtros por Status */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium mr-1">Status:</span>
        
        <Button
          variant={activeStatusFilter === "TODOS" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => onStatusFilterChange("TODOS")}
        >
          Todos
        </Button>
        
        <Button
          variant={activeStatusFilter === "EM_ANDAMENTO" ? "default" : "ghost"}
          size="sm"
          className={`h-7 text-xs gap-1.5 ${
            activeStatusFilter === "EM_ANDAMENTO" 
              ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30" 
              : ""
          }`}
          onClick={() => onStatusFilterChange("EM_ANDAMENTO")}
        >
          <Play className="h-3 w-3" />
          Em Andamento
          {counts.emAndamento > 0 && (
            <Badge variant="outline" className="h-4 px-1 text-[10px] ml-0.5">
              {counts.emAndamento}
            </Badge>
          )}
        </Button>
        
        <Button
          variant={activeStatusFilter === "FECHADO" ? "default" : "ghost"}
          size="sm"
          className={`h-7 text-xs gap-1.5 ${
            activeStatusFilter === "FECHADO" 
              ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30" 
              : ""
          }`}
          onClick={() => onStatusFilterChange("FECHADO")}
        >
          <CheckCircle2 className="h-3 w-3" />
          Concluídos
          {counts.fechados > 0 && (
            <Badge variant="outline" className="h-4 px-1 text-[10px] ml-0.5">
              {counts.fechados}
            </Badge>
          )}
        </Button>
        
        <Button
          variant={activeStatusFilter === "FUTURO" ? "default" : "ghost"}
          size="sm"
          className={`h-7 text-xs gap-1.5 ${
            activeStatusFilter === "FUTURO" 
              ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30" 
              : ""
          }`}
          onClick={() => onStatusFilterChange("FUTURO")}
        >
          <Clock className="h-3 w-3" />
          Futuros
          {counts.futuros > 0 && (
            <Badge variant="outline" className="h-4 px-1 text-[10px] ml-0.5">
              {counts.futuros}
            </Badge>
          )}
        </Button>
      </div>

      {/* Filtros por Tipo de Gatilho */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium mr-1">Tipo:</span>
        
        <Button
          variant={activeTipoFilter === "TODOS" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => onTipoFilterChange("TODOS")}
        >
          Todos
        </Button>
        
        <Button
          variant={activeTipoFilter === "TEMPO" ? "default" : "ghost"}
          size="sm"
          className={`h-7 text-xs gap-1.5 ${
            activeTipoFilter === "TEMPO" 
              ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30" 
              : ""
          }`}
          onClick={() => onTipoFilterChange("TEMPO")}
        >
          <Clock className="h-3 w-3" />
          Por Prazo
          {counts.porTempo > 0 && (
            <Badge variant="outline" className="h-4 px-1 text-[10px] ml-0.5">
              {counts.porTempo}
            </Badge>
          )}
        </Button>
        
        <Button
          variant={activeTipoFilter === "META" ? "default" : "ghost"}
          size="sm"
          className={`h-7 text-xs gap-1.5 ${
            activeTipoFilter === "META" 
              ? "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30" 
              : ""
          }`}
          onClick={() => onTipoFilterChange("META")}
        >
          <Target className="h-3 w-3" />
          Por Meta
          {counts.porMeta > 0 && (
            <Badge variant="outline" className="h-4 px-1 text-[10px] ml-0.5">
              {counts.porMeta}
            </Badge>
          )}
        </Button>
        
        <Button
          variant={activeTipoFilter === "META_PRAZO" ? "default" : "ghost"}
          size="sm"
          className={`h-7 text-xs gap-1.5 ${
            activeTipoFilter === "META_PRAZO" 
              ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30" 
              : ""
          }`}
          onClick={() => onTipoFilterChange("META_PRAZO")}
        >
          <Zap className="h-3 w-3" />
          Meta + Prazo
          {counts.metaPrazo > 0 && (
            <Badge variant="outline" className="h-4 px-1 text-[10px] ml-0.5">
              {counts.metaPrazo}
            </Badge>
          )}
        </Button>

        {/* Botão para limpar filtros */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => {
              onStatusFilterChange("TODOS");
              onTipoFilterChange("TODOS");
            }}
          >
            <RotateCcw className="h-3 w-3" />
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}
