import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  FolderKanban, 
  Calendar, 
  Users, 
  Edit, 
  Trash2, 
  Eye, 
  Star,
  GripVertical
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ProjectFinancialDisplay } from "@/components/projetos/ProjectFinancialDisplay";
import { cn } from "@/lib/utils";

interface SaldoByMoeda {
  BRL: number;
  USD: number;
}

interface Projeto {
  id: string;
  nome: string;
  descricao?: string | null;
  status: string;
  data_inicio: string | null;
  operadores_ativos?: number;
  total_bookmakers?: number;
  saldo_bookmakers_by_moeda?: SaldoByMoeda;
  lucro_by_moeda?: SaldoByMoeda;
  perdas_confirmadas?: number;
  display_order?: number;
}

interface ProjetoKanbanCardProps {
  projeto: Projeto;
  cotacaoUSD: number;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onVisualizarOperadores: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
  isDragging?: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "PLANEJADO": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "EM_ANDAMENTO": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "PAUSADO": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "FINALIZADO": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    case "ARQUIVADO": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "PLANEJADO": return "Planejado";
    case "EM_ANDAMENTO": return "Em Andamento";
    case "PAUSADO": return "Pausado";
    case "FINALIZADO": return "Finalizado";
    case "ARQUIVADO": return "Arquivado";
    default: return status;
  }
};

export function ProjetoKanbanCard({
  projeto,
  cotacaoUSD,
  isFavorite,
  onToggleFavorite,
  onVisualizarOperadores,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
  isDragging,
  onDragStart,
  onDragEnd,
}: ProjetoKanbanCardProps) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);

  const saldoBRL = projeto.saldo_bookmakers_by_moeda?.BRL || 0;
  const saldoUSD = projeto.saldo_bookmakers_by_moeda?.USD || 0;
  const totalSaldoConsolidado = saldoBRL + (saldoUSD * cotacaoUSD);
  
  const lucroBRL = projeto.lucro_by_moeda?.BRL || 0;
  const lucroUSD = projeto.lucro_by_moeda?.USD || 0;
  const perdas = projeto.perdas_confirmadas || 0;
  const lucroConsolidado = lucroBRL + (lucroUSD * cotacaoUSD) - perdas;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("projetoId", projeto.id);
    e.dataTransfer.effectAllowed = "move";
    onDragStart();
  };

  const handleDragEnd = () => {
    onDragEnd();
  };

  return (
    <Card 
      ref={cardRef}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={cn(
        "cursor-grab active:cursor-grabbing transition-all duration-200 overflow-hidden",
        "hover:border-primary/50 hover:shadow-md",
        isDragging && "opacity-50 scale-95 rotate-2 shadow-lg border-primary"
      )}
      style={{ contain: "layout paint" }}
    >
      <CardHeader className="pb-2 space-y-2">
        {/* Header: Grip + Icon + Name + Actions */}
        <div className="flex items-start gap-2">
          <div className="flex items-center gap-1">
            <GripVertical className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FolderKanban className="h-4 w-4 text-primary" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <CardTitle 
                className="text-sm flex-1 cursor-pointer hover:text-primary transition-colors"
                onClick={() => navigate(`/projeto/${projeto.id}`)}
              >
                {projeto.nome}
              </CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite();
                    }}
                    className="p-1 rounded hover:bg-muted transition-colors flex-shrink-0"
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${
                        isFavorite
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground hover:text-yellow-400"
                      }`}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-[100]">
                  {isFavorite ? "Remover dos atalhos" : "Adicionar aos atalhos"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onVisualizarOperadores();
                    }}
                    className="p-1 rounded hover:bg-muted transition-colors flex-shrink-0"
                  >
                    <Eye className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-[100]">Ver detalhes</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
        
        {/* Status Badge */}
        <div>
          <Badge className={`${getStatusColor(projeto.status)} text-[10px]`}>
            {getStatusLabel(projeto.status)}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-2">
          {projeto.data_inicio && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3 flex-shrink-0" />
              <span>
                Início: {format(new Date(projeto.data_inicio), "dd/MM/yyyy", { locale: ptBR })}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3 w-3 flex-shrink-0" />
            <span>{projeto.operadores_ativos || 0} operador(es) • {projeto.total_bookmakers || 0} bookmaker(s)</span>
          </div>
        
          <div className="pt-2 border-t space-y-2">
            <ProjectFinancialDisplay
              type="saldo"
              breakdown={{ BRL: saldoBRL, USD: saldoUSD }}
              totalConsolidado={totalSaldoConsolidado}
              cotacaoPTAX={cotacaoUSD}
              isMultiCurrency={saldoUSD > 0}
            />
            
            <ProjectFinancialDisplay
              type="lucro"
              breakdown={{ BRL: lucroBRL, USD: lucroUSD }}
              totalConsolidado={lucroConsolidado}
              cotacaoPTAX={cotacaoUSD}
              isMultiCurrency={lucroUSD !== 0}
            />
          </div>
        </div>
        
        <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t">
          {canEdit && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editar Projeto</TooltipContent>
            </Tooltip>
          )}
          {canDelete && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Excluir Projeto</TooltipContent>
            </Tooltip>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
