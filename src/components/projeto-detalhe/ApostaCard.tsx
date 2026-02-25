import { Card, CardContent } from "@/components/ui/card";
import { Badge, SelectionBadge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Zap, TrendingUp, Target, ArrowLeftRight, Coins, Gift, CheckCircle2, Clock, Layers, X, CircleSlash, Loader2 } from "lucide-react";
import { ApostaPernasResumo, ApostaPernasInline, getModeloOperacao, Perna } from "./ApostaPernasResumo";
import { cn, getFirstLastName } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { parseLocalDateTime } from "@/utils/dateUtils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { BetRowActionsMenu, type BetResultado } from "@/components/apostas/BetRowActionsMenu";

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

// Seleção para apostas múltiplas
export interface Selecao {
  descricao: string;
  odd: number | string;
  resultado?: string;
}

// Dados da aposta para o card
export interface ApostaCardData {
  id: string;
  evento: string;
  esporte: string;
  selecao?: string;
  odd?: number;
  odd_final?: number;
  stake: number;
  stake_total?: number;
  data_aposta: string;
  resultado?: string | null;
  status?: string;
  lucro_prejuizo?: number | null;
  estrategia?: string | null;
  modelo?: string | null;
  pernas?: Perna[];
  selecoes?: Selecao[];
  tipo_multipla?: string;
  bookmaker_nome?: string;
  parceiro_nome?: string;
  operador_nome?: string;
  moeda?: string; // Moeda da operação
  logo_url?: string | null; // URL do logo da bookmaker
}

interface ApostaCardProps {
  aposta: ApostaCardData;
  estrategia: EstrategiaType;
  /** Callback para abrir o formulário de edição (via menu híbrido) */
  onEdit?: (apostaId: string) => void;
  onQuickResolve?: (apostaId: string, resultado: string) => void;
  /** Callback para excluir aposta (abre modal de confirmação) */
  onDelete?: (apostaId: string) => void;
  /** Callback para duplicar aposta */
  onDuplicate?: (apostaId: string) => void;
  variant?: "card" | "list";
  accentColor?: string;
  className?: string;
  /** Função de formatação de moeda (usa moeda do projeto quando fornecida) */
  formatCurrency?: (value: number) => string;
}

// Configuração de cores por estratégia
const ESTRATEGIA_CONFIG: Record<string, { label: string; icon: typeof Zap; color: string; bgColor: string; borderColor: string }> = {
  DUPLO_GREEN: {
    label: "DG",
    icon: Zap,
    color: "text-teal-700 dark:text-teal-400",
    bgColor: "bg-teal-500/15 dark:bg-teal-500/20",
    borderColor: "border-teal-600/30 dark:border-teal-500/30",
  },
  SUREBET: {
    label: "SUREBET",
    icon: ArrowLeftRight,
    color: "text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-500/15 dark:bg-amber-500/20",
    borderColor: "border-amber-600/30 dark:border-amber-500/30",
  },
  VALUEBET: {
    label: "VB",
    icon: TrendingUp,
    color: "text-purple-700 dark:text-purple-400",
    bgColor: "bg-purple-500/15 dark:bg-purple-500/20",
    borderColor: "border-purple-600/30 dark:border-purple-500/30",
  },
  PUNTER: {
    label: "PUNTER",
    icon: Target,
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-500/15 dark:bg-blue-500/20",
    borderColor: "border-blue-600/30 dark:border-blue-500/30",
  },
  FREEBET: {
    label: "FREEBET",
    icon: Gift,
    color: "text-cyan-700 dark:text-cyan-400",
    bgColor: "bg-cyan-500/15 dark:bg-cyan-500/20",
    borderColor: "border-cyan-600/30 dark:border-cyan-500/30",
  },
  EXTRACAO_FREEBET: {
    label: "EXT. FREEBET",
    icon: Gift,
    color: "text-cyan-700 dark:text-cyan-400",
    bgColor: "bg-cyan-500/15 dark:bg-cyan-500/20",
    borderColor: "border-cyan-600/30 dark:border-cyan-500/30",
  },
  BONUS: {
    label: "BÔNUS",
    icon: Coins,
    color: "text-yellow-700 dark:text-yellow-400",
    bgColor: "bg-yellow-500/15 dark:bg-yellow-500/20",
    borderColor: "border-yellow-600/30 dark:border-yellow-500/30",
  },
  EXTRACAO_BONUS: {
    label: "EXT. BÔNUS",
    icon: Coins,
    color: "text-yellow-700 dark:text-yellow-400",
    bgColor: "bg-yellow-500/15 dark:bg-yellow-500/20",
    borderColor: "border-yellow-600/30 dark:border-yellow-500/30",
  },
  NORMAL: {
    label: "NORMAL",
    icon: Target,
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-500/15 dark:bg-blue-500/20",
    borderColor: "border-blue-600/30 dark:border-blue-500/30",
  },
};

interface ResultadoBadgeProps {
  resultado: string | null | undefined;
  apostaId?: string;
  onQuickResolve?: (apostaId: string, resultado: string) => void;
}

const RESULT_OPTIONS_SIMPLE = [
  { value: "GREEN", label: "Green", icon: CheckCircle2, color: "text-emerald-700 dark:text-emerald-400", bg: "hover:bg-emerald-500/15 dark:hover:bg-emerald-500/20", pillBg: "bg-emerald-500/15 border-emerald-600/30 dark:border-emerald-500/30" },
  { value: "RED", label: "Red", icon: X, color: "text-red-700 dark:text-red-400", bg: "hover:bg-red-500/15 dark:hover:bg-red-500/20", pillBg: "bg-red-500/15 border-red-600/30 dark:border-red-500/30" },
  { value: "MEIO_GREEN", label: "½ Green", icon: CheckCircle2, color: "text-teal-700 dark:text-teal-400", bg: "hover:bg-teal-500/15 dark:hover:bg-teal-500/20", pillBg: "bg-teal-500/15 border-teal-600/30 dark:border-teal-500/30" },
  { value: "MEIO_RED", label: "½ Red", icon: X, color: "text-orange-700 dark:text-orange-400", bg: "hover:bg-orange-500/15 dark:hover:bg-orange-500/20", pillBg: "bg-orange-500/15 border-orange-600/30 dark:border-orange-500/30" },
  { value: "VOID", label: "Void", icon: CircleSlash, color: "text-muted-foreground", bg: "hover:bg-muted", pillBg: "bg-muted border-border" },
];

function getSimpleResultConfig(resultado: string | null | undefined) {
  const found = RESULT_OPTIONS_SIMPLE.find(o => o.value === resultado);
  if (found) return found;
  return {
    value: "PENDENTE",
    label: "Pendente",
    icon: Clock,
    color: "text-blue-700 dark:text-blue-400",
    bg: "hover:bg-blue-500/15 dark:hover:bg-blue-500/20",
    pillBg: "bg-blue-500/15 border-blue-600/30 dark:border-blue-500/30",
  };
}

function ResultadoBadge({ resultado, apostaId, onQuickResolve }: ResultadoBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const config = getSimpleResultConfig(resultado);
  const Icon = config.icon;
  const canEdit = onQuickResolve && apostaId;
  
  const handleSelect = async (newResultado: string) => {
    if (newResultado === resultado) {
      setIsOpen(false);
      return;
    }
    if (onQuickResolve && apostaId) {
      setLoading(true);
      try {
        onQuickResolve(apostaId, newResultado);
        setIsOpen(false);
      } finally {
        setLoading(false);
      }
    }
  };
  
  if (canEdit) {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            disabled={loading}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border cursor-pointer transition-all shrink-0",
              config.pillBg,
              config.color,
              "hover:ring-1 hover:ring-current/30",
              loading && "opacity-50 cursor-not-allowed"
            )}
          >
            {loading ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <Icon className="h-2.5 w-2.5" />
            )}
            {config.label}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-32 p-1"
          align="end"
          side="bottom"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-0.5">
            {RESULT_OPTIONS_SIMPLE.map((opt) => {
              const OptIcon = opt.icon;
              const isActive = opt.value === resultado;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  disabled={loading}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors",
                    isActive ? "bg-muted font-medium" : opt.bg,
                    opt.color
                  )}
                >
                  <OptIcon className="h-3.5 w-3.5" />
                  {opt.label}
                  {isActive && <span className="ml-auto text-[10px] opacity-60">✓</span>}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
  }
  
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 flex items-center gap-0.5", config.pillBg, config.color)}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </Badge>
  );
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

function defaultFormatCurrency(value: number, moeda: string = "BRL"): string {
  const symbol = CURRENCY_SYMBOLS[moeda] || moeda;
  return `${symbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}


export function ApostaCard({
  aposta, 
  estrategia, 
  onEdit,
  onQuickResolve,
  onDelete,
  onDuplicate,
  variant = "card",
  accentColor,
  className,
  formatCurrency: formatCurrencyProp
}: ApostaCardProps) {
  // Hook para buscar logos das casas
  const { getLogoUrl } = useBookmakerLogoMap();
  
  // Sempre usa a moeda da aposta (moeda operacional da casa), nunca a do projeto
  const formatValue = (value: number) => {
    return defaultFormatCurrency(value, aposta.moeda || "BRL");
  };
  const config = ESTRATEGIA_CONFIG[estrategia] || ESTRATEGIA_CONFIG.NORMAL;
  const Icon = config.icon;
  
  const hasPernas = aposta.pernas && aposta.pernas.length > 1;
  const hasSelecoes = aposta.selecoes && aposta.selecoes.length > 1;
  const isMultipla = hasSelecoes || !!aposta.tipo_multipla;
  const isSimples = !isMultipla && !hasPernas;
  
  // Label para múltiplas: DUPLA, TRIPLA, etc.
  const numSelecoes = aposta.selecoes?.length || (aposta.tipo_multipla === 'DUPLA' ? 2 : aposta.tipo_multipla === 'TRIPLA' ? 3 : 2);
  const tipoMultiplaLabel = numSelecoes === 2 ? 'DUPLA' : numSelecoes === 3 ? 'TRIPLA' : `${numSelecoes}x`;
  
  const stake = hasPernas ? (aposta.stake_total ?? aposta.stake) : aposta.stake;
  const displayOdd = aposta.odd_final ?? aposta.odd ?? 0;
  const moeda = aposta.moeda || "BRL";
  const isForeignCurrency = moeda !== "BRL";
  
  // Para apostas múltiplas, exibir "MÚLTIPLA" como título
  const displayEvento = isMultipla ? 'MÚLTIPLA' : (aposta.evento || '');
  
  const roi = stake > 0 && aposta.lucro_prejuizo !== null && aposta.lucro_prejuizo !== undefined
    ? (aposta.lucro_prejuizo / stake) * 100 
    : null;
  
  if (variant === "list") {
    // Extrair nome base da casa (antes do " - ") para exibição limpa
    const bookmakerBase = aposta.bookmaker_nome?.split(" - ")[0] || aposta.bookmaker_nome;
    // Extrair vínculo (parceiro) - pode vir do parceiro_nome ou da parte após " - " no bookmaker_nome
    const vinculoFull = aposta.parceiro_nome || aposta.bookmaker_nome?.split(" - ")[1]?.trim();
    // Abreviar para primeiro e último nome
    const vinculoAbreviado = vinculoFull ? getFirstLastName(vinculoFull) : null;
    
    // Formato padronizado: "CASA - PARCEIRO ABREVIADO" (igual ao SurebetCard com pernas)
    const bookmakerDisplay = vinculoAbreviado 
      ? `${bookmakerBase} - ${vinculoAbreviado}`
      : bookmakerBase;
    
    // Para operações com múltiplas pernas (3+), usa layout vertical
    const hasMultipleLegs = hasPernas && (aposta.pernas?.length || 0) >= 3;
    
    return (
      <div 
        className={cn(
          "rounded-lg border transition-colors p-3 overflow-hidden",
          className
        )}
      >
        {/* Layout Padronizado: Evento/Esporte em cima, Casa e detalhes embaixo */}
        <div className="flex flex-col gap-2">
          
          {/* LINHA 1: Evento + Esporte + Badges - Responsivo */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate uppercase">{displayEvento || 'Aposta'}</p>
              {aposta.esporte && (
                <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">• {aposta.esporte}</span>
              )}
            </div>
            
            {/* Badges + Menu de Ações - wrap on mobile */}
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 flex items-center gap-0.5", config.bgColor, config.color, config.borderColor)}>
                <Icon className="h-2.5 w-2.5" />
                {config.label}
              </Badge>
              {isMultipla && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-600/30 dark:border-purple-500/30 text-purple-700 dark:text-purple-400 bg-purple-500/15 dark:bg-purple-500/20 flex items-center gap-0.5">
                  <Layers className="h-2.5 w-2.5" />
                  {tipoMultiplaLabel}
                </Badge>
              )}
              {isSimples && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-600/30 dark:border-blue-500/30 text-blue-700 dark:text-blue-400 bg-blue-500/15 dark:bg-blue-500/20">
                  SIMPLES
                </Badge>
              )}
              {hasPernas && aposta.modelo && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-600/30 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/15 dark:bg-amber-500/20">
                  {aposta.modelo}
                </Badge>
              )}
              {hasPernas && !aposta.modelo && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-600/30 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/15 dark:bg-amber-500/20">
                  {getModeloOperacao(aposta.pernas as Perna[])}
                </Badge>
              )}
              <ResultadoBadge resultado={aposta.resultado} apostaId={aposta.id} onQuickResolve={isSimples ? onQuickResolve : undefined} />
              
              {/* Menu de Ações Rápidas */}
              {(onDelete || onDuplicate || onQuickResolve || onEdit) && (
                <BetRowActionsMenu
                  apostaId={aposta.id}
                  apostaType={isMultipla ? "multipla" : "simples"}
                  status={aposta.status || "PENDENTE"}
                  resultado={aposta.resultado || null}
                  onEdit={() => onEdit?.(aposta.id)}
                  onDuplicate={onDuplicate ? () => onDuplicate(aposta.id) : undefined}
                 onQuickResolve={(resultado) => {
                   console.log('[ApostaCard] onQuickResolve wrapper:', { apostaId: aposta.id, resultado });
                   onQuickResolve?.(aposta.id, resultado);
                 }}
                  onDelete={() => onDelete?.(aposta.id)}
                />
              )}
            </div>
          </div>
          
          {/* LINHA 2: Badge Seleção + Logo + Casa + Odd + Stake - Responsivo */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 overflow-hidden">
            {/* Top row on mobile: Logo + Casa */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden">
              {/* Para apostas simples: Badge de seleção antes do logo - hidden on very small screens */}
              {isSimples && aposta.selecao && (
                <div className="hidden sm:block w-[100px] md:w-[120px] shrink-0">
                  <SelectionBadge 
                    minWidth={80}
                    maxWidth={116}
                  >
                    {aposta.selecao}
                  </SelectionBadge>
                </div>
              )}
              
              {/* Logo */}
              {aposta.logo_url ? (
                <img 
                  src={aposta.logo_url} 
                  alt={bookmakerDisplay || ''} 
                  className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg object-contain logo-blend p-1 shrink-0"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                  <Target className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                </div>
              )}
              
              {/* Nome da casa + Parceiro - com tooltip */}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs sm:text-sm text-muted-foreground truncate flex-1 min-w-0 uppercase cursor-default">
                      {bookmakerDisplay || 'Casa'}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[300px]">
                    <p className="uppercase">{aposta.bookmaker_nome || 'Casa'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            {/* Mobile: Selection badge on separate row */}
            {isSimples && aposta.selecao && (
              <div className="sm:hidden">
                <SelectionBadge minWidth={60} maxWidth={100}>
                  {aposta.selecao}
                </SelectionBadge>
              </div>
            )}
            
            {/* Múltiplas pernas - exibe inline ou vertical */}
            {hasPernas && hasMultipleLegs ? (
              <div className="space-y-1 w-full sm:w-auto sm:flex-1 min-w-0 overflow-hidden">
                {aposta.pernas!.map((perna, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs overflow-hidden">
                    <span className="truncate flex-1">{perna.selecao_livre || perna.selecao}</span>
                    <span className="font-medium shrink-0">@{Number(perna.odd).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : hasPernas ? (
              <div className="hidden sm:block flex-1 min-w-0 overflow-hidden">
                <ApostaPernasInline pernas={aposta.pernas as Perna[]} className="truncate" getLogoUrl={getLogoUrl} />
              </div>
            ) : hasSelecoes ? (
              <div className="flex flex-col gap-0.5 flex-1 min-w-0 overflow-hidden">
                {aposta.selecoes!.map((s, idx) => (
                  <p key={idx} className="text-xs text-muted-foreground truncate uppercase">
                    {s.descricao} @{Number(s.odd).toFixed(2)}
                  </p>
                ))}
              </div>
            ) : null}
            
            {/* Odd + Stake à direita */}
            <div className="flex items-center gap-2 shrink-0 justify-end sm:justify-start">
              {isSimples && (
                <span className="text-sm font-medium">@{displayOdd.toFixed(2)}</span>
              )}
              <span className="text-xs text-muted-foreground whitespace-nowrap">{formatValue(stake)}</span>
            </div>
          </div>
          
          {/* LINHA 3: Data/Hora + Lucro/ROI */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50 gap-2">
            <div className="flex items-center gap-1 sm:gap-2 min-w-0">
              <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                {format(parseLocalDateTime(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
              </span>
              {isForeignCurrency && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 bg-blue-500/10 text-blue-400 border-blue-500/30">
                  {moeda}
                </Badge>
              )}
            </div>
            
            {aposta.lucro_prejuizo !== null && aposta.lucro_prejuizo !== undefined && (
              <div className="flex items-center gap-1 shrink-0">
                <span className={cn("text-xs sm:text-sm font-semibold whitespace-nowrap", aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {formatValue(aposta.lucro_prejuizo)}
                </span>
                {roi !== null && (
                  <span className={cn("text-[9px] sm:text-[10px] whitespace-nowrap", roi >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    ({roi >= 0 ? '+' : ''}{roi.toFixed(1)}%)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Variant: card (padrão) - Padronizado para seguir mesmo layout do "list"
  // Extrair nome base da casa (antes do " - ") para exibição limpa
  const bookmakerBaseCard = aposta.bookmaker_nome?.split(" - ")[0] || aposta.bookmaker_nome;
  // Extrair vínculo (parceiro) - pode vir do parceiro_nome ou da parte após " - " no bookmaker_nome
  const vinculoFullCard = aposta.parceiro_nome || aposta.bookmaker_nome?.split(" - ")[1]?.trim();
  // Abreviar para primeiro e último nome
  const vinculoAbreviadoCard = vinculoFullCard ? getFirstLastName(vinculoFullCard) : null;
  
  // Formato padronizado: "CASA - PARCEIRO ABREVIADO" (igual ao SurebetCard com pernas)
  const bookmakerDisplayCard = vinculoAbreviadoCard 
    ? `${bookmakerBaseCard} - ${vinculoAbreviadoCard}`
    : bookmakerBaseCard;

  return (
    <Card 
      className={cn("transition-colors overflow-hidden", className)}
    >
      <CardContent className="p-5 sm:p-6">
        {/* LINHA 1: Evento (título destacado) */}
        <p className="text-base sm:text-lg font-semibold truncate uppercase leading-tight mb-1.5">{displayEvento || 'Aposta'}</p>
        
        {/* LINHA 1b: Esporte + Badges + Menu na mesma linha */}
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          {aposta.esporte && (
            <span className="text-xs sm:text-sm text-muted-foreground">• {aposta.esporte}</span>
          )}
          
          <Badge variant="outline" className={cn("text-[10px] sm:text-xs px-1.5 py-0 flex items-center gap-0.5", config.bgColor, config.color, config.borderColor)}>
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
          {isMultipla && (
            <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0 border-purple-500/30 text-purple-400 bg-purple-500/20 flex items-center gap-0.5">
              <Layers className="h-3 w-3" />
              {tipoMultiplaLabel}
            </Badge>
          )}
          {isSimples && (
            <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0 border-blue-500/30 text-blue-400 bg-blue-500/20">
              SIMPLES
            </Badge>
          )}
          {hasPernas && aposta.modelo && (
            <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0 border-amber-500/30 text-amber-400 bg-amber-500/20">
              {aposta.modelo}
            </Badge>
          )}
          {hasPernas && !aposta.modelo && (
            <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0 border-amber-500/30 text-amber-400 bg-amber-500/20">
              {getModeloOperacao(aposta.pernas as Perna[])}
            </Badge>
          )}
          <ResultadoBadge resultado={aposta.resultado} apostaId={aposta.id} onQuickResolve={isSimples ? onQuickResolve : undefined} />
          
          <div className="ml-auto">
            {(onDelete || onDuplicate || onQuickResolve || onEdit) && (
              <BetRowActionsMenu
                apostaId={aposta.id}
                apostaType={isMultipla ? "multipla" : "simples"}
                status={aposta.status || "PENDENTE"}
                resultado={aposta.resultado || null}
                onEdit={() => onEdit?.(aposta.id)}
                onDuplicate={onDuplicate ? () => onDuplicate(aposta.id) : undefined}
               onQuickResolve={(resultado) => {
                 console.log('[ApostaCard] onQuickResolve wrapper (variant):', { apostaId: aposta.id, resultado });
                 onQuickResolve?.(aposta.id, resultado);
               }}
                onDelete={() => onDelete?.(aposta.id)}
              />
            )}
          </div>
        </div>

        {/* LINHA 2: Detalhamento da operação */}
        {hasPernas ? (
          <ApostaPernasResumo 
            pernas={aposta.pernas as Perna[]} 
            variant="card" 
            showStake 
            showResultado 
            className="mb-3"
            getLogoUrl={getLogoUrl}
          />
        ) : hasSelecoes ? (
          <div className="space-y-1.5 mb-3">
            {aposta.selecoes!.map((sel, idx) => (
              <div key={idx} className="flex justify-between items-center text-sm gap-2">
                <span className="text-muted-foreground truncate flex-1 uppercase">{sel.descricao}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-medium">@{Number(sel.odd).toFixed(2)}</span>
                  <ResultadoBadge resultado={sel.resultado} />
                </div>
              </div>
            ))}
            <div className="flex justify-end pt-1 border-t border-border/50">
              <span className="text-xs font-medium">Odd Final: @{displayOdd.toFixed(2)}</span>
            </div>
          </div>
        ) : (
          /* Layout padronizado para apostas simples: Logo + Casa/Vínculo + Odd + Stake */
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3 overflow-hidden">
            {/* Top row: Logo + Casa */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 overflow-hidden">
              {/* Badge de seleção - hidden on very small */}
              {aposta.selecao && (
                <div className="shrink-0 hidden sm:block">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary bg-primary/10 truncate max-w-[80px]">
                    {aposta.selecao}
                  </Badge>
                </div>
              )}
              
              {/* Logo da bookmaker */}
              {aposta.logo_url ? (
                <img 
                  src={aposta.logo_url} 
                  alt={bookmakerDisplayCard || ''} 
                  className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg object-contain logo-blend p-1 shrink-0"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                  <Target className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                </div>
              )}
              
              {/* Nome da casa + Vínculo/Parceiro - com tooltip */}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-sm text-muted-foreground truncate flex-1 min-w-0 uppercase cursor-default">
                      {bookmakerDisplayCard || 'Casa'}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[300px]">
                    <p className="uppercase">{aposta.bookmaker_nome || 'Casa'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            {/* Mobile: Selection badge on separate row */}
            {aposta.selecao && (
              <div className="sm:hidden">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary bg-primary/10 truncate max-w-[100px]">
                  {aposta.selecao}
                </Badge>
              </div>
            )}
            
            {/* Odd + Stake à direita */}
            <div className="flex items-center gap-2 shrink-0 justify-end sm:justify-start">
              <span className="text-sm sm:text-base font-medium whitespace-nowrap">@{displayOdd.toFixed(2)}</span>
              <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">{formatValue(stake)}</span>
            </div>
          </div>
        )}
        
        {/* LINHA 3: Data/Hora + Stake + Lucro/ROI - NUNCA CORTAR */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
              {format(parseLocalDateTime(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
            </span>
            {isForeignCurrency && (
              <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1 py-0 bg-blue-500/10 text-blue-400 border-blue-500/30">
                {moeda}
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
              Stake: {formatValue(stake)}
            </span>
            {aposta.lucro_prejuizo !== null && aposta.lucro_prejuizo !== undefined && (
              <div className="flex items-center gap-1 shrink-0">
                <span className={cn("text-sm sm:text-base font-semibold whitespace-nowrap", aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {formatValue(aposta.lucro_prejuizo)}
                </span>
                {roi !== null && (
                  <span className={cn("text-[10px] sm:text-xs whitespace-nowrap", roi >= 0 ? 'text-emerald-400' : 'text-red-400')}>
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
