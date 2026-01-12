import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format as formatDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeftRight, Zap, CheckCircle2, Clock, Coins, ChevronDown, ChevronUp, Layers, Building2 } from "lucide-react";
import { cn, getFirstLastName } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { parseLocalDateTime } from "@/utils/dateUtils";

// Estrutura de entrada individual (para múltiplas entradas)
export interface SurebetPernaEntry {
  bookmaker_id: string;
  bookmaker_nome: string;
  moeda: string;
  odd: number;
  stake: number;
  // NOVO: Seleção/linha por entrada
  selecao_livre?: string;
}

export interface SurebetPerna {
  id: string;
  selecao: string;
  selecao_livre?: string;
  odd: number;
  stake: number;
  resultado: string | null;
  bookmaker_nome: string;
  bookmaker_id?: string;
  // Campos para múltiplas entradas
  entries?: SurebetPernaEntry[];
  odd_media?: number;
  stake_total?: number;
}

export interface SurebetData {
  id: string;
  data_operacao: string;
  evento: string;
  esporte: string;
  modelo: string;
  mercado?: string | null;
  estrategia?: string | null;
  stake_total: number;
  spread_calculado: number | null;
  roi_esperado: number | null;
  lucro_esperado: number | null;
  lucro_real: number | null;
  roi_real: number | null;
  status: string;
  resultado: string | null;
  observacoes: string | null;
  pernas?: SurebetPerna[];
}

interface SurebetCardProps {
  surebet: SurebetData;
  onEdit?: (surebet: SurebetData) => void;
  className?: string;
  formatCurrency?: (value: number) => string;
  /** Quando true, exibe badge "Bônus" no lugar de "SUREBET" */
  isBonusContext?: boolean;
}

// Fallback para formatação de moeda quando não é passada via props
const defaultFormatCurrency = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

function ResultadoBadge({ resultado }: { resultado: string | null | undefined }) {
  const getConfig = (r: string | null | undefined) => {
    switch (r) {
      case "GREEN": return { label: "Green", color: "bg-emerald-500 text-white border-emerald-600", icon: CheckCircle2 };
      case "MEIO_GREEN": return { label: "½ Green", color: "bg-teal-500 text-white border-teal-600", icon: CheckCircle2 };
      case "RED": return { label: "Red", color: "bg-red-500 text-white border-red-600", icon: CheckCircle2 };
      case "MEIO_RED": return { label: "½ Red", color: "bg-orange-500 text-white border-orange-600", icon: CheckCircle2 };
      case "VOID": return { label: "Void", color: "bg-gray-500 text-white border-gray-600", icon: CheckCircle2 };
      case "EMPATE": return { label: "Empate", color: "bg-yellow-500 text-white border-yellow-600", icon: CheckCircle2 };
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

// Tamanho padrão do logo - igual ao ApostaCard (h-10 w-10)
const LOGO_SIZE = "h-10 w-10";

// Componente helper para exibir logo da casa com tamanho padronizado
function BookmakerLogo({ 
  nome, 
  getLogoUrl 
}: { 
  nome: string; 
  getLogoUrl: (name: string) => string | null;
}) {
  const logoUrl = getLogoUrl(nome);
  
  if (logoUrl) {
    return (
      <img 
        src={logoUrl} 
        alt={nome} 
        className={cn(LOGO_SIZE, "rounded-lg object-contain bg-white/10 p-1")}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  
  return (
    <div className={cn(LOGO_SIZE, "rounded-lg bg-muted/30 flex items-center justify-center")}>
      <Building2 className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}

// Helper para obter estilo do badge baseado no resultado (estilo translúcido)
function getSelecaoBadgeStyle(resultado: string | null | undefined) {
  switch (resultado) {
    case "GREEN":
    case "MEIO_GREEN":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "RED":
    case "MEIO_RED":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "VOID":
    case "EMPATE":
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    default:
      return "border-primary/30 text-primary bg-primary/10";
  }
}

// Componente para exibir uma perna com layout de grid fixo
function PernaItem({ 
  perna, 
  formatValue,
  getLogoUrl
}: { 
  perna: SurebetPerna; 
  formatValue: (value: number) => string;
  getLogoUrl: (name: string) => string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const hasMultipleEntries = perna.entries && perna.entries.length > 1;
  
  // Usar odd_media e stake_total se disponíveis, senão usar valores legados
  const displayOdd = perna.odd_media || perna.odd;
  const displayStake = perna.stake_total || perna.stake;
  
  // Formatar nome da casa com vínculo abreviado
  const formatBookmakerDisplay = (nomeCompleto: string) => {
    const separatorIdx = nomeCompleto.indexOf(" - ");
    if (separatorIdx > 0) {
      const casa = nomeCompleto.substring(0, separatorIdx).trim();
      const vinculoRaw = nomeCompleto.substring(separatorIdx + 3).trim();
      const vinculoAbreviado = getFirstLastName(vinculoRaw);
      return `${casa} - ${vinculoAbreviado}`;
    }
    return nomeCompleto;
  };
  
  const bookmakerDisplay = formatBookmakerDisplay(perna.bookmaker_nome);
  const selecaoBadgeStyle = getSelecaoBadgeStyle(perna.resultado);
  
  if (!hasMultipleEntries) {
    // Layout: [Badge Seleção Fixa] [Logo] [Nome Casa] [Odd + Stake à direita]
    return (
      <div className="flex items-center gap-3">
        {/* Badge de seleção - largura fixa para alinhamento perfeito */}
        <div className="w-16 shrink-0">
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 truncate max-w-full", selecaoBadgeStyle)}>
            {perna.selecao_livre || perna.selecao}
          </Badge>
        </div>
        
        {/* Logo */}
        <div className="shrink-0">
          <BookmakerLogo nome={perna.bookmaker_nome} getLogoUrl={getLogoUrl} />
        </div>
        
        {/* Nome da casa + vínculo abreviado - flex-1 para ocupar espaço restante */}
        <span className="text-sm text-muted-foreground truncate flex-1 uppercase">
          {bookmakerDisplay}
        </span>
        
        {/* Odd e Stake à direita */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-medium">@{perna.odd.toFixed(2)}</span>
          <span className="text-xs text-muted-foreground">{formatValue(perna.stake)}</span>
        </div>
      </div>
    );
  }
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button 
          className="w-full flex items-center gap-3 hover:bg-muted/30 rounded-md py-1 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Badge de seleção - largura fixa */}
          <div className="w-16 shrink-0">
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 truncate max-w-full", selecaoBadgeStyle)}>
              {perna.selecao_livre || perna.selecao}
            </Badge>
          </div>
          
          {/* Ícone de múltiplas entradas */}
          <div className="shrink-0">
            <div className={cn(LOGO_SIZE, "rounded-lg bg-gradient-to-br from-primary/20 to-amber-500/20 flex items-center justify-center")}>
              <Layers className="h-5 w-5 text-primary" />
            </div>
          </div>
          
          {/* Indicador de múltiplas entradas */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 border-amber-500/30 text-amber-400 bg-amber-500/10">
              {perna.entries?.length} casas
            </Badge>
            <span className="text-xs text-muted-foreground">média:</span>
          </div>
          
          {/* Odd e Stake */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-medium">@{displayOdd.toFixed(2)}</span>
            <span className="text-xs text-muted-foreground">{formatValue(displayStake)}</span>
          </div>
          
          {/* Chevron */}
          {isOpen ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="animate-in slide-in-from-top-1 duration-200">
        <div className="mt-2 space-y-2 ml-[4.75rem] pl-4 border-l-2 border-primary/20">
          {perna.entries?.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-3 text-xs">
              {/* Logo menor */}
              <div className="h-8 w-8 shrink-0">
                <BookmakerLogo nome={entry.bookmaker_nome} getLogoUrl={getLogoUrl} />
              </div>
              
              {/* Nome + linha opcional - com vínculo abreviado */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0 text-muted-foreground">
                <span className="truncate uppercase">{formatBookmakerDisplay(entry.bookmaker_nome)}</span>
                {entry.selecao_livre && (
                  <span className="text-primary/70 text-[9px] shrink-0">({entry.selecao_livre})</span>
                )}
              </div>
              
              {/* Odd + Stake */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-medium text-foreground">@{entry.odd.toFixed(2)}</span>
                <span className="text-muted-foreground">{formatValue(entry.stake)}</span>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SurebetCard({ surebet, onEdit, className, formatCurrency, isBonusContext }: SurebetCardProps) {
  // Hook para buscar logos das casas
  const { getLogoUrl } = useBookmakerLogoMap();
  
  // Usa formatCurrency do projeto ou fallback para BRL
  const formatValue = formatCurrency || defaultFormatCurrency;
  const isDuploGreen = surebet.estrategia === "DUPLO_GREEN";
  const isLiquidada = surebet.status === "LIQUIDADA";
  
  // Detectar contexto de bônus pela estratégia ou prop
  const showBonusBadge = isBonusContext || surebet.estrategia === "EXTRACAO_BONUS";
  
  // Calcular pior cenário a partir das pernas quando pendente
  const calcularPiorCenario = (): { lucro: number; roi: number } | null => {
    if (!surebet.pernas || surebet.pernas.length < 2) return null;
    
    const stakeTotal = surebet.stake_total || surebet.pernas.reduce((sum, p) => sum + (p.stake_total || p.stake || 0), 0);
    if (stakeTotal <= 0) return null;
    
    // Para cada cenário (cada perna ganhando), calcular o lucro
    const cenarios = surebet.pernas.map(perna => {
      const oddEfetiva = perna.odd_media || perna.odd || 0;
      const stakeNessaPerna = perna.stake_total || perna.stake || 0;
      const retorno = stakeNessaPerna * oddEfetiva;
      const lucro = retorno - stakeTotal;
      return lucro;
    });
    
    const piorLucro = Math.min(...cenarios);
    const piorRoi = (piorLucro / stakeTotal) * 100;
    
    return { lucro: piorLucro, roi: piorRoi };
  };
  
  // Usar lucro_esperado do banco ou calcular a partir das pernas
  const piorCenarioCalculado = !isLiquidada ? calcularPiorCenario() : null;
  
  const lucroExibir = isLiquidada 
    ? surebet.lucro_real 
    : (surebet.lucro_esperado ?? piorCenarioCalculado?.lucro ?? null);
  const roiExibir = isLiquidada 
    ? surebet.roi_real 
    : (surebet.roi_esperado ?? piorCenarioCalculado?.roi ?? null);
  
  // Configuração do badge principal
  const estrategiaConfig = showBonusBadge 
    ? { label: "BÔNUS", icon: Coins, color: "text-amber-400", bgColor: "bg-amber-500/20", borderColor: "border-amber-500/30" }
    : isDuploGreen 
      ? { label: "DG", icon: Zap, color: "text-teal-400", bgColor: "bg-teal-500/20", borderColor: "border-teal-500/30" }
      : { label: "SUREBET", icon: ArrowLeftRight, color: "text-amber-400", bgColor: "bg-amber-500/20", borderColor: "border-amber-500/30" };
  
  const Icon = estrategiaConfig.icon;


  return (
    <Card 
      className={cn("cursor-pointer transition-colors hover:border-primary/30", className)}
      onClick={() => onEdit?.(surebet)}
    >
      <CardContent className="p-4">
        {/* LINHA 1: Evento + Esporte + Badges */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <p className="text-sm font-medium truncate uppercase">{surebet.evento || 'Operação'}</p>
            {surebet.esporte && (
              <span className="text-xs text-muted-foreground shrink-0">• {surebet.esporte}</span>
            )}
            {surebet.mercado && (
              <span className="text-xs text-muted-foreground shrink-0">• {surebet.mercado}</span>
            )}
          </div>
          
          {/* Badges à direita */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 flex items-center gap-0.5", estrategiaConfig.bgColor, estrategiaConfig.color, estrategiaConfig.borderColor)}>
              <Icon className="h-2.5 w-2.5" />
              {estrategiaConfig.label}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400 bg-amber-500/20">
              {surebet.modelo}
            </Badge>
            <ResultadoBadge resultado={isLiquidada ? surebet.resultado : null} />
          </div>
        </div>
        
        {/* LINHA 2+: Pernas - Grid alinhado com coluna de seleção fixa */}
        {surebet.pernas && surebet.pernas.length > 0 && (
          <div className="space-y-2 mb-3">
            {surebet.pernas.map((perna) => (
              <PernaItem 
                key={perna.id} 
                perna={perna} 
                formatValue={formatValue}
                getLogoUrl={getLogoUrl}
              />
            ))}
          </div>
        )}
        
        {/* LINHA FINAL: Data/Hora + Stake + Lucro/ROI */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground">
            {formatDate(parseLocalDateTime(surebet.data_operacao), "dd/MM/yy HH:mm", { locale: ptBR })}
          </span>
          
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">
              Stake: {formatValue(surebet.stake_total)}
            </span>
            
            {lucroExibir !== null && lucroExibir !== undefined && (
              <div className="flex items-center gap-1">
                <span className={cn(
                  "text-sm font-medium",
                  lucroExibir >= 0 ? 'text-emerald-400' : 'text-red-400',
                  !isLiquidada && 'opacity-30'
                )}>
                  {formatValue(lucroExibir)}
                </span>
                {roiExibir !== null && roiExibir !== undefined && (
                  <span className={cn(
                    "text-[10px]",
                    roiExibir >= 0 ? 'text-emerald-400' : 'text-red-400',
                    !isLiquidada && 'opacity-30'
                  )}>
                    ({roiExibir >= 0 ? '+' : ''}{roiExibir.toFixed(1)}%)
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
