import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Zap, TrendingUp, Target, ArrowLeftRight, Coins, Gift, CheckCircle2, Clock } from "lucide-react";
import { ApostaPernasResumo, ApostaPernasInline, getModeloOperacao, Perna } from "./ApostaPernasResumo";
import { cn } from "@/lib/utils";

// Tipos de estratégia para badge
export type EstrategiaType = 
  | "DUPLO_GREEN" 
  | "SUREBET" 
  | "VALUEBET" 
  | "NORMAL" 
  | "FREEBET" 
  | "BONUS"
  | "COBERTURA_LAY"
  | "EXCHANGE_BACK"
  | "EXCHANGE_LAY"
  | string;

// Dados da aposta para o card
export interface ApostaCardData {
  id: string;
  evento: string;
  esporte: string;
  selecao?: string;
  odd?: number;
  stake: number;
  stake_total?: number;
  data_aposta: string;
  resultado?: string | null;
  status?: string;
  lucro_prejuizo?: number | null;
  estrategia?: string | null;
  modelo?: string | null;
  pernas?: Perna[];
  bookmaker_nome?: string;
  operador_nome?: string;
}

interface ApostaCardProps {
  aposta: ApostaCardData;
  estrategia: EstrategiaType;
  onClick?: () => void;
  variant?: "card" | "list";
  accentColor?: string;
  className?: string;
}

// Configuração de cores por estratégia
const ESTRATEGIA_CONFIG: Record<string, { label: string; icon: typeof Zap; color: string; bgColor: string; borderColor: string }> = {
  DUPLO_GREEN: {
    label: "DG",
    icon: Zap,
    color: "text-teal-400",
    bgColor: "bg-teal-500/20",
    borderColor: "border-teal-500/30",
  },
  SUREBET: {
    label: "SUREBET",
    icon: ArrowLeftRight,
    color: "text-amber-400",
    bgColor: "bg-amber-500/20",
    borderColor: "border-amber-500/30",
  },
  VALUEBET: {
    label: "VB",
    icon: TrendingUp,
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
    borderColor: "border-purple-500/30",
  },
  FREEBET: {
    label: "FREEBET",
    icon: Gift,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/20",
    borderColor: "border-cyan-500/30",
  },
  BONUS: {
    label: "BÔNUS",
    icon: Coins,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/20",
    borderColor: "border-yellow-500/30",
  },
  NORMAL: {
    label: "NORMAL",
    icon: Target,
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    borderColor: "border-blue-500/30",
  },
};

function ResultadoBadge({ resultado }: { resultado: string | null | undefined }) {
  const getConfig = (r: string | null | undefined) => {
    switch (r) {
      case "GREEN": return { label: "Green", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 };
      case "RED": return { label: "Red", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: CheckCircle2 };
      case "MEIO_GREEN": return { label: "½ Green", color: "bg-teal-500/20 text-teal-400 border-teal-500/30", icon: CheckCircle2 };
      case "MEIO_RED": return { label: "½ Red", color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: CheckCircle2 };
      case "VOID": return { label: "Void", color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: CheckCircle2 };
      default: return { label: "Pendente", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Clock };
    }
  };
  
  const config = getConfig(resultado);
  const Icon = config.icon;
  
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 flex items-center gap-0.5", config.color)}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </Badge>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function ApostaCard({ 
  aposta, 
  estrategia, 
  onClick, 
  variant = "card",
  accentColor,
  className 
}: ApostaCardProps) {
  const config = ESTRATEGIA_CONFIG[estrategia] || ESTRATEGIA_CONFIG.NORMAL;
  const Icon = config.icon;
  
  const hasPernas = aposta.pernas && aposta.pernas.length > 1;
  const stake = hasPernas ? (aposta.stake_total ?? aposta.stake) : aposta.stake;
  const roi = stake > 0 && aposta.lucro_prejuizo !== null && aposta.lucro_prejuizo !== undefined
    ? (aposta.lucro_prejuizo / stake) * 100 
    : null;
  
  const hoverBorderColor = accentColor ? `hover:border-[${accentColor}]/30` : "hover:border-primary/30";

  if (variant === "list") {
    return (
      <div 
        className={cn(
          "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors",
          hoverBorderColor,
          className
        )}
        onClick={onClick}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* Badges */}
          <div className="flex items-center gap-1 shrink-0">
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 flex items-center gap-0.5", config.bgColor, config.color, config.borderColor)}>
              <Icon className="h-2.5 w-2.5" />
              {config.label}
            </Badge>
            {hasPernas && aposta.modelo && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400 bg-amber-500/20">
                {aposta.modelo}
              </Badge>
            )}
            {hasPernas && !aposta.modelo && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400 bg-amber-500/20">
                {getModeloOperacao(aposta.pernas as Perna[])}
              </Badge>
            )}
            <ResultadoBadge resultado={aposta.resultado} />
          </div>
          
          {/* Data */}
          <div className="text-xs text-muted-foreground w-20 shrink-0">
            {format(new Date(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
          </div>
          
          {/* Evento e Seleção */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate uppercase">{aposta.evento}</p>
            {hasPernas ? (
              <ApostaPernasInline pernas={aposta.pernas as Perna[]} className="truncate" />
            ) : (
              <p className="text-xs text-muted-foreground truncate">
                {aposta.selecao} @{(aposta.odd ?? 0).toFixed(2)}
              </p>
            )}
          </div>
          
          {/* Stake */}
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">{formatCurrency(stake)}</p>
          </div>
        </div>
        
        {/* Lucro/ROI */}
        <div className="flex items-center gap-2 ml-4 shrink-0">
          {aposta.lucro_prejuizo !== null && aposta.lucro_prejuizo !== undefined && (
            <>
              <span className={cn("text-sm font-medium", aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {formatCurrency(aposta.lucro_prejuizo)}
              </span>
              {roi !== null && (
                <span className={cn("text-xs", roi >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  ({roi >= 0 ? '+' : ''}{roi.toFixed(1)}%)
                </span>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Variant: card (padrão)
  return (
    <Card 
      className={cn("cursor-pointer transition-colors", hoverBorderColor, className)}
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Header: Badges */}
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 flex items-center gap-0.5", config.bgColor, config.color, config.borderColor)}>
            <Icon className="h-2.5 w-2.5" />
            {config.label}
          </Badge>
          {hasPernas && aposta.modelo && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400 bg-amber-500/20">
              {aposta.modelo}
            </Badge>
          )}
          {hasPernas && !aposta.modelo && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400 bg-amber-500/20">
              {getModeloOperacao(aposta.pernas as Perna[])}
            </Badge>
          )}
          <ResultadoBadge resultado={aposta.resultado} />
        </div>
        
        {/* Identificação: Evento e Esporte */}
        <div className="mb-2">
          <p className="font-medium text-sm truncate uppercase">{aposta.evento}</p>
          <p className="text-xs text-muted-foreground">{aposta.esporte}</p>
        </div>
        
        {/* Detalhamento: Pernas ou Seleção Simples */}
        {hasPernas ? (
          <ApostaPernasResumo 
            pernas={aposta.pernas as Perna[]} 
            variant="card" 
            showStake 
            showResultado 
            className="mb-2" 
          />
        ) : (
          <div className="flex justify-between items-center text-sm mb-2">
            <span className="text-muted-foreground truncate">{aposta.selecao}</span>
            <span className="font-medium">@{(aposta.odd ?? 0).toFixed(2)}</span>
          </div>
        )}
        
        {/* Rodapé: Data, Stake, Lucro, ROI */}
        <div className="flex justify-between items-center pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            {format(new Date(aposta.data_aposta), "dd/MM/yy", { locale: ptBR })}
          </span>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Stake: {formatCurrency(stake)}</p>
            {aposta.lucro_prejuizo !== null && aposta.lucro_prejuizo !== undefined && (
              <div className="flex items-center gap-2 justify-end">
                <span className={cn("text-sm font-medium", aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {formatCurrency(aposta.lucro_prejuizo)}
                </span>
                {roi !== null && (
                  <span className={cn("text-xs", roi >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    ({roi >= 0 ? '+' : ''}{roi.toFixed(1)}%)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ApostaCard;
