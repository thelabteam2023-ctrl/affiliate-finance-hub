import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format as formatDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeftRight, Zap, CheckCircle2, Clock, Coins, ChevronDown, ChevronUp, Layers, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";

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
      case "GREEN": return { label: "Green", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 };
      case "MEIO_GREEN": return { label: "½ Green", color: "bg-teal-500/20 text-teal-400 border-teal-500/30", icon: CheckCircle2 };
      case "RED": return { label: "Red", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: CheckCircle2 };
      case "MEIO_RED": return { label: "½ Red", color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: CheckCircle2 };
      case "VOID": return { label: "Void", color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: CheckCircle2 };
      case "EMPATE": return { label: "Empate", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: CheckCircle2 };
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

// Componente helper para exibir logo da casa
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
        className="h-6 w-6 rounded object-contain bg-white/10 p-0.5 shrink-0"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  
  return (
    <div className="h-6 w-6 rounded bg-muted/30 flex items-center justify-center shrink-0">
      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}

// Componente para exibir uma perna com suporte a múltiplas entradas
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
  
  if (!hasMultipleEntries) {
    // Exibição simples para entrada única
    return (
      <div className="flex items-center gap-2 text-xs">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-primary/30 text-primary bg-primary/10">
          {perna.selecao_livre || perna.selecao}
        </Badge>
        <BookmakerLogo nome={perna.bookmaker_nome} getLogoUrl={getLogoUrl} />
        <span className="text-muted-foreground truncate flex-1 uppercase">
          {perna.bookmaker_nome}
        </span>
        <span className="font-medium shrink-0">@{perna.odd.toFixed(2)}</span>
        <span className="text-muted-foreground shrink-0">• {formatValue(perna.stake)}</span>
      </div>
    );
  }
  
  // Exibição expandível para múltiplas entradas
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button 
          className="w-full flex items-center gap-2 text-xs hover:bg-muted/30 rounded-md p-1 -mx-1 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-primary/30 text-primary bg-primary/10">
            {perna.selecao_livre || perna.selecao}
          </Badge>
          <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 border-amber-500/30 text-amber-400 bg-amber-500/10 flex items-center gap-0.5">
            <Layers className="h-2.5 w-2.5" />
            {perna.entries?.length}
          </Badge>
          <span className="text-muted-foreground flex-1 text-left">
            <span className="text-[9px]">média:</span>
          </span>
          <span className="font-medium shrink-0">@{displayOdd.toFixed(2)}</span>
          <span className="text-muted-foreground shrink-0">• {formatValue(displayStake)}</span>
          {isOpen ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="animate-in slide-in-from-top-1 duration-200">
        <div className="pl-4 border-l-2 border-primary/20 ml-2 mt-1 space-y-1">
          {perna.entries?.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <BookmakerLogo nome={entry.bookmaker_nome} getLogoUrl={getLogoUrl} />
              <span className="truncate flex-1 uppercase">{entry.bookmaker_nome}</span>
              {/* Mostrar linha se diferente entre entradas */}
              {entry.selecao_livre && (
                <span className="text-primary/70 text-[9px] shrink-0">({entry.selecao_livre})</span>
              )}
              <span className="font-medium text-foreground">@{entry.odd.toFixed(2)}</span>
              <span>• {formatValue(entry.stake)}</span>
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

  const parseLocalDateTime = (dateString: string): Date => {
    if (!dateString) return new Date();
    const cleanDate = dateString.replace(/\+00:00$/, '').replace(/Z$/, '').replace(/\+\d{2}:\d{2}$/, '');
    const [datePart, timePart] = cleanDate.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = (timePart || '00:00').split(':').map(Number);
    return new Date(year, month - 1, day, hours || 0, minutes || 0);
  };

  return (
    <Card 
      className={cn("cursor-pointer transition-colors hover:border-primary/30", className)}
      onClick={() => onEdit?.(surebet)}
    >
      <CardContent className="p-4">
        {/* Header: Badges */}
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 flex items-center gap-0.5", estrategiaConfig.bgColor, estrategiaConfig.color, estrategiaConfig.borderColor)}>
            <Icon className="h-2.5 w-2.5" />
            {estrategiaConfig.label}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400 bg-amber-500/20">
            {surebet.modelo}
          </Badge>
          <ResultadoBadge resultado={isLiquidada ? surebet.resultado : null} />
        </div>
        
        {/* Identificação: Evento e Esporte */}
        <div className="mb-2">
          <p className="font-medium text-sm truncate uppercase">{surebet.evento || 'Operação'}</p>
          <p className="text-xs text-muted-foreground">
            {surebet.esporte}{surebet.mercado ? ` • ${surebet.mercado}` : ''}
          </p>
        </div>
        
        {/* Detalhamento: Pernas com suporte a múltiplas entradas */}
        {surebet.pernas && surebet.pernas.length > 0 && (
          <div className="space-y-1.5 mb-2">
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
        
        {/* Rodapé: Data, Stake, Lucro, ROI */}
        <div className="flex justify-between items-center pt-2 border-t">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">
              {formatDate(parseLocalDateTime(surebet.data_operacao), "dd/MM/yy", { locale: ptBR })}
            </span>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Stake: {formatValue(surebet.stake_total)}</p>
          {lucroExibir !== null && lucroExibir !== undefined && (
              <div className="flex items-center gap-2 justify-end">
                <span className={cn(
                  "text-sm font-medium",
                  lucroExibir >= 0 ? 'text-emerald-400' : 'text-red-400',
                  !isLiquidada && 'opacity-30'
                )}>
                  {formatValue(lucroExibir)}
                </span>
                {roiExibir !== null && roiExibir !== undefined && (
                  <span className={cn(
                    "text-xs",
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
