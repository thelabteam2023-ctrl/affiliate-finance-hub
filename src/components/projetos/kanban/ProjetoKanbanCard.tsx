import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  FolderKanban, 
  Calendar, 
  Users, 
  Edit, 
  Trash2, 
  Eye, 
  Star,
  GripVertical,
  TrendingUp,
  TrendingDown,
  CircleDollarSign,
  Info,
  Briefcase,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { getFinancialDisplay } from "@/lib/financial-display";
import { FinancialMetricsPopover } from "@/components/projeto-detalhe/FinancialMetricsPopover";

type SaldoByMoeda = Record<string, number>;

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
  lucro_operacional?: number;
  perdas_confirmadas?: number;
  lucro_realizado?: number;
  display_order?: number;
  moeda_consolidacao?: string;
}

interface ProjetoKanbanCardProps {
  projeto: Projeto;
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
  isBroker?: boolean;
  onReceberContas?: () => void;
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

const MOEDA_SYMBOLS: Record<string, string> = {
  BRL: 'R$', USD: '$', EUR: '€', GBP: '£', MYR: 'RM', MXN: 'MX$', ARS: 'AR$', COP: 'COL$',
};

const formatByMoeda = (value: number, moeda: string) => {
  const m = (moeda || 'BRL').toUpperCase();
  const symbol = MOEDA_SYMBOLS[m] || m;
  return `${symbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export function ProjetoKanbanCard({
  projeto,
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
  isBroker,
  onReceberContas,
}: ProjetoKanbanCardProps) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const lucroOperacional = projeto.lucro_operacional || 0;
  const lucroRealizado = projeto.lucro_realizado || 0;
  const moedaConsolidacao = projeto.moeda_consolidacao || 'BRL';

  const lucroOpDisplay = getFinancialDisplay(lucroOperacional);
  const lucroRealizadoDisplay = getFinancialDisplay(lucroRealizado);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("projetoId", projeto.id);
    e.dataTransfer.effectAllowed = "move";
    onDragStart();
  };

  return (
    <Card 
      ref={cardRef}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-grab active:cursor-grabbing transition-all duration-200 overflow-hidden border-border/40",
        "bg-gradient-to-br from-card to-card/80",
        "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
        isDragging && "opacity-50 scale-95 rotate-2 shadow-lg border-primary"
      )}
      style={{ contain: "layout paint" }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground/30 flex-shrink-0 mt-1" />
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FolderKanban className="h-4.5 w-4.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 
                className="text-sm font-semibold tracking-wide truncate cursor-pointer hover:text-primary transition-colors"
                onClick={() => navigate(`/projeto/${projeto.id}`)}
              >
                {projeto.nome}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
                  className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <Star className={cn("h-3.5 w-3.5", isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/50 hover:text-yellow-400")} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="z-[100]">
                {isFavorite ? "Remover dos atalhos" : "Adicionar aos atalhos"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); onVisualizarOperadores(); }}
                  className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <Eye className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-primary" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="z-[100]">Ver detalhes</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Status + Meta */}
      <div className="px-4 pb-3 space-y-2">
        <Badge className={cn(getStatusColor(projeto.status), "text-[10px] font-medium px-2 py-0.5")}>
          {getStatusLabel(projeto.status)}
        </Badge>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {projeto.data_inicio && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
              <span>Início: {format(new Date(projeto.data_inicio), "dd/MM/yyyy", { locale: ptBR })}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Users className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
            <span>{projeto.operadores_ativos || 0} operador(es) • {projeto.total_bookmakers || 0} bookmaker(s)</span>
          </div>
        </div>
      </div>

      {/* Lucro Operacional - Hero Metric */}
      <div className="mx-4 mb-3 rounded-lg bg-muted/20 border border-border/30 p-3">
        <div className="flex items-center justify-center gap-2 mb-1">
          {lucroOpDisplay?.isPositive || lucroOpDisplay?.isZero
            ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            : <TrendingDown className="h-3.5 w-3.5 text-red-500" />
          }
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
            Lucro Operacional
          </span>
        </div>
        <div className="text-center">
          <span className={cn("text-xl font-bold tracking-tight", lucroOpDisplay?.colorClass)}>
            {lucroOpDisplay?.isPositive ? '+' : lucroOperacional < 0 ? '-' : ''}{formatByMoeda(lucroOperacional, moedaConsolidacao)}
          </span>
        </div>
      </div>

      {/* Lucro Realizado */}
      <div className="mx-4 mb-3">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center justify-center gap-2 py-2 bg-muted/15 border border-border/20 rounded-lg w-full hover:bg-muted/30 transition-colors cursor-pointer">
              {lucroRealizadoDisplay?.isPositive || lucroRealizadoDisplay?.isZero
                ? <TrendingUp className={cn("h-3.5 w-3.5", lucroRealizadoDisplay?.colorClass || 'text-muted-foreground')} />
                : <TrendingDown className={cn("h-3.5 w-3.5", lucroRealizadoDisplay?.colorClass || 'text-muted-foreground')} />
              }
              <span className="text-[11px] text-muted-foreground">Realizado:</span>
              <span className={cn("text-sm font-semibold", lucroRealizadoDisplay?.colorClass)}>
                {lucroRealizado > 0 ? '+' : ''}{formatByMoeda(lucroRealizado, moedaConsolidacao)}
              </span>
              <Info className="h-3 w-3 text-muted-foreground/40" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="center" className="p-0 w-auto z-[100]" sideOffset={8}>
            <FinancialMetricsPopover projetoId={projeto.id} />
          </PopoverContent>
        </Popover>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center border-t border-border/30">
        {isBroker && onReceberContas && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-primary hover:bg-muted/30 transition-colors"
                onClick={(e) => { e.stopPropagation(); onReceberContas(); }}
              >
                <Briefcase className="h-3.5 w-3.5" />
                <span>Receber</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>Receber Contas</TooltipContent>
          </Tooltip>
        )}
        {canEdit && (
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
        )}
        {canDelete && (
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </Card>
  );
}
