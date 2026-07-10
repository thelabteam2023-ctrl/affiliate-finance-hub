import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, SelectionBadge } from "@/components/ui/badge";
import { format as formatDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeftRight, Zap, CheckCircle2, Clock, Coins, ChevronDown, ChevronUp, Layers, Building2, TrendingUp, Target, Gift, Bug, AlertTriangle } from "lucide-react";
import { cn, getFirstLastName } from "@/lib/utils";
import { formatBookmakerDisplay } from "@/lib/bookmaker-display";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { parseLocalDateTime } from "@/utils/dateUtils";
import { SurebetRowActionsMenu, type SurebetQuickResult } from "@/components/apostas/SurebetRowActionsMenu";
import { SurebetPernaResultPill } from "@/components/apostas/SurebetPernaResultPill";
import { formatCurrency as formatCurrencyUtil } from "@/utils/formatCurrency";
import { CurrencyBadge } from "@/components/ui/currency-display";
import { SurebetTracePanel } from "./SurebetTracePanel";
import { liquidationQueue } from "@/utils/surebetLiquidationQueue";
import { expandLegsWithSubEntries, generateLiquidationOptions } from "@/utils/surebetLiquidationUtils";
import { calculatePnlProjections } from "@/utils/surebetPnlProjection";
import { useProjetoWorkingRates } from "@/hooks/useProjetoWorkingRates";
import { useCotacoes } from "@/hooks/useCotacoes";
import { getSafeWorkingRate } from "@/utils/exchangeRateGuard";
import { useAuth } from "@/hooks/useAuth";
import { TeamLogo } from "@/components/ui/team-logo";
import { useLogoFallback } from "@/hooks/useLogoFallback";
import { esporteToSportKey } from "@/utils/esporteToSportKey";


import { validateBalanceForOperation } from "@/utils/surebetBalanceValidator";
import { exposureOf } from "@/utils/pernaLayHelpers";
// publishTabRender é invocado pelos Tabs (ProjetoSurebetTab/ProjetoApostasTab)
// onde a origem da renderização é conhecida — não dentro do card.


// Estrutura de entrada individual (para múltiplas entradas)
export interface SurebetPernaEntry {
  /** ID da perna no banco (apostas_pernas.id) — necessário para liquidação individual */
  id?: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  moeda: string;
  odd: number;
  stake: number;
  // NOVO: Seleção/linha por entrada
  selecao_livre?: string;
  /** Fonte do saldo: REAL ou FREEBET */
  fonte_saldo?: string;
  parceiro_nome?: string | null;
  instance_identifier?: string | null;
  logo_url?: string | null;
  resultado?: string | null;
  lucro_prejuizo?: number | null;
  stake_brl_referencia?: number | null;
  lucro_prejuizo_brl_referencia?: number | null;
  cotacao_snapshot?: number | null;
}

export interface SurebetPerna {
  id: string;
  selecao: string;
  selecao_livre?: string;
  odd: number;
  stake: number;
  resultado: string | null;
  /** Lucro nominal da perna na moeda original */
  lucro_prejuizo?: number | null;
  bookmaker_nome: string;
  bookmaker_id?: string;
  parceiro_nome?: string | null;
  instance_identifier?: string | null;
  logo_url?: string | null;
  moeda?: string;
  /** Fonte do saldo: REAL ou FREEBET */
  fonte_saldo?: string;
  /** Lado da operação. Default 'back' quando ausente. */
  tipo?: "back" | "lay" | null;
  /** Comissão decimal da exchange (lay). Default 0. */
  comissao?: number | null;
  /** Stake real (não-freebet) da perna — fonte canônica de custo */
  stake_real?: number;
  /** Stake de freebet (SNR) da perna — não é custo, gera lucro líquido stake*(odd-1) */
  stake_freebet?: number;
  // Campos para múltiplas entradas
  entries?: SurebetPernaEntry[];
  odd_media?: number;
  stake_total?: number;
  stake_brl_referencia?: number | null;
  lucro_prejuizo_brl_referencia?: number | null;
  cotacao_snapshot?: number | null;
}

export interface SurebetData {
  id: string;
  workspace_id?: string;
  forma_registro?: string | null;
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
  /** Snapshot imutável do lucro consolidado congelado na transição para LIQUIDADA. */
  lucro_realizado?: number | null;
  /** Snapshot imutável do ROI realizado, congelado junto com lucro_realizado. */
  roi_realizado?: number | null;
  /** Lucro consolidado na moeda de consolidação (pode diferir da moeda do projeto!) */
  pl_consolidado?: number | null;
  /** Stake consolidado na moeda de consolidação */
  stake_consolidado?: number | null;
  /** Moeda em que pl_consolidado/stake_consolidado estão denominados */
  consolidation_currency?: string | null;
  status: string;
  resultado: string | null;
  observacoes: string | null;
  pernas?: SurebetPerna[];
  time_casa?: string | null;
  time_fora?: string | null;
  home_team_logo_url?: string | null;
  away_team_logo_url?: string | null;
  league_logo_url?: string | null;
}

/** Callback para alterar resultado de uma perna individual */
export interface PernaResultChangeInput {
  pernaId: string;
  surebetId: string;
  bookmarkerId: string;
  resultado: string;
  stake: number;
  odd: number;
  moeda: string;
  resultadoAnterior: string | null;
  workspaceId: string;
  /** Nome da bookmaker para exibição em toasts */
  bookmakerNome?: string;
  /** Quando true, não exibe toast individual (usado em batch/quick resolve) */
  silent?: boolean;
}

interface SurebetCardProps {
  surebet: SurebetData;
  onEdit?: (surebet: SurebetData) => void;
  /** Callback para liquidação rápida com informação de quais pernas ganharam */
  onQuickResolve?: (surebetId: string, result: SurebetQuickResult) => void;
  /** Callback do menu para multi-entry simples, convertendo o submenu em resultado único global */
  onSimpleMenuQuickResolve?: (apostaId: string, resultado: string) => void | Promise<void>;
  /** Callback para alterar resultado de perna individual (inline pill) */
  onPernaResultChange?: (input: PernaResultChangeInput) => Promise<void>;
  /**
   * Callback para liquidação rápida de apostas simples multi-entry (PUNTER, VALUEBET, etc.).
   * O resultado é único para toda a aposta — não há vencedores por perna individual.
   * Quando definido, o badge da perna fica clicável e dispara reliquidação global.
   */
  onSimpleQuickResolve?: (apostaId: string, resultado: string) => void | Promise<void>;
  /** Callback para excluir surebet */
  onDelete?: (surebetId: string) => void;
  /** Callback para duplicar surebet */
  onDuplicate?: (surebetId: string) => void;
  className?: string;
  formatCurrency?: (value: number) => string;
  /** Conversão fallback para consolidar pernas multimoeda em runtime */
  convertToConsolidation?: (valor: number, moedaOrigem: string) => number;
  /** Moeda de consolidação do projeto (ex: USD, BRL) */
  moedaConsolidacao?: string;
  /** Quando true, exibe badge "Bônus" no lugar de "SUREBET" */
  isBonusContext?: boolean;
  /**
   * Mapa de bookmaker_id -> nome completo com parceiro para enriquecer dados legados.
   * Formato esperado: "NOME_CASA - PRIMEIRO_NOME ULTIMO_NOME"
   */
  bookmakerNomeMap?: Map<string, string>;
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

// Tamanho padrão do logo - igual ao ApostaCard (h-10 w-10)
const LOGO_SIZE = "h-10 w-10";

// Componente helper para exibir logo da casa com tamanho padronizado
function SurebetBookmakerLogo({ 
  nome, 
  getLogoUrl,
  logoUrl: logoUrlProp,
}: { 
  nome: string; 
  getLogoUrl: (name: string) => string | null;
  logoUrl?: string | null;
}) {
  // Fonte de verdade: logo_url vindo da própria perna (join com bookmakers_catalogo via bookmaker_id).
  // Fallback por nome apenas quando a perna não tem logo persistido (dados legados).
  const logoUrl = logoUrlProp ?? getLogoUrl(nome);
  const [hasError, setHasError] = useState(false);
  
  if (logoUrl && !hasError) {
    return (
      <img 
        src={logoUrl} 
        alt={nome} 
        className={cn(LOGO_SIZE, "rounded-lg object-contain logo-blend p-1")}
        onError={() => setHasError(true)}
      />
    );
  }
  
  return (
    <div className={cn(LOGO_SIZE, "rounded-lg bg-muted/30 flex items-center justify-center")}>
      <Building2 className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}

// Cor neutra para badge de seleção - informativo, sem conotação de resultado
const NEUTRAL_SELECTION_STYLE = "bg-slate-600/25 text-slate-300 border-slate-500/40";

/**
 * Retorna o label de exibição para a seleção.
 * PRIORIDADE: selecao_livre (linha real) > selecao normalizada
 * 
 * Se selecao_livre existir, usa ela (ex: "Over 2.5", "Handicap -1.5")
 * Se não, converte termos genéricos de mercado 1X2 para 1/X/2
 */
function getSelecaoDisplay(perna: SurebetPerna): string {
  // Se tem selecao_livre, usar ela diretamente (é a linha real da aposta)
  if (perna.selecao_livre && perna.selecao_livre.trim()) {
    return perna.selecao_livre;
  }
  
  // Fallback: normalizar apenas valores genéricos de mercado 1X2
  const selecao = perna.selecao;
  const marketLabels: Record<string, string> = {
    "Casa": "1",
    "Empate": "X",
    "Fora": "2",
  };
  
  // Se é um termo genérico do mercado, converte para 1/X/2
  if (marketLabels[selecao]) {
    return marketLabels[selecao];
  }
  
  // Caso contrário, usa a seleção original
  return selecao;
}

// Formata valor usando a moeda da perna (não a do projeto)
function formatPernaValue(value: number, moeda?: string): string {
  const currency = moeda || "BRL";
  return formatCurrencyUtil(value, currency);
}

// Componente para exibir uma perna com layout de grid fixo
function PernaItem({ 
  perna, 
  formatValue,
  getLogoUrl,
  bookmakerNomeMap,
  onResultChange,
  convertToConsolidation,
  parentResultado,
  isColumn = false,
}: { 
  perna: SurebetPerna; 
  formatValue: (value: number) => string;
  getLogoUrl: (name: string) => string | null;
  bookmakerNomeMap?: Map<string, string>;
  onResultChange?: (resultado: string) => Promise<void>;
  convertToConsolidation?: (valor: number, moedaOrigem: string) => number;
  /**
   * Quando definido, força o pill de resultado a exibir esse valor (em vez de perna.resultado).
   * Usado em apostas simples multi-entry (PUNTER/VALUEBET/DUPLO_GREEN/etc.), onde o resultado
   * é único no nível do pai (apostas_unificada.resultado) e as pernas individuais ficam null.
   */
  parentResultado?: string | null;
  isColumn?: boolean;
}) {
  const hasMultipleEntries = perna.entries && perna.entries.length > 1;
  const [isOpen, setIsOpen] = useState(
    hasMultipleEntries ? (perna.entries!.length <= 3) : false
  );
  // Resultado efetivo a exibir no pill: para simples multi-entry usa o do pai;
  // para surebet/múltipla real usa o da perna individual.
  const resultadoExibir = parentResultado ?? perna.resultado;
  
  // Detectar se perna usa freebet
  const isFreebet = perna.fonte_saldo === 'FREEBET';
  const hasAnyFreebet = hasMultipleEntries 
    ? perna.entries!.some(e => e.fonte_saldo === 'FREEBET')
    : isFreebet;
  // Usar odd_media e stake_total se disponíveis, senão usar valores legados
  // Se houver múltiplas entradas, o stake_total e odd_media são as fontes de verdade
  const displayOdd = perna.odd_media || perna.odd;
  const displayStake = perna.stake_total || perna.stake;
  const isLayPerna = perna.tipo === "lay";
  const layPrefix = isLayPerna ? "Lay " : "";
  const oddClass = isLayPerna ? "text-red-400" : "";
  const layTitle = isLayPerna ? "Chance contra (Lay)" : undefined;
  const stakeLabel = isLayPerna ? "Resp: " : "";
  const stakeTitle = isLayPerna
    ? `Responsabilidade (liability) = stake × (odd − 1) — backers' stake: ${formatPernaValue(perna.stake, perna.moeda)}`
    : undefined;
  // Liability sempre derivada (stake × (odd-1)) — fonte única em pernaLayHelpers.
  const respValor = isLayPerna ? exposureOf({ odd: perna.odd, stake: perna.stake, tipo: 'lay', comissao: perna.comissao ?? 0 }) : perna.stake;
  
  // formatBookmakerDisplay imported from @/lib/bookmaker-display
  
  // Enriquecer nome do bookmaker: usar mapa canônico se disponível, senão usar o que está salvo
  const enrichedBookmakerNome = (perna.bookmaker_id && bookmakerNomeMap?.has(perna.bookmaker_id))
    ? bookmakerNomeMap.get(perna.bookmaker_id)!
    : perna.bookmaker_nome;
  
  const bookmakerDisplay = formatBookmakerDisplay(enrichedBookmakerNome);
  
  if (!hasMultipleEntries) {
    // Modo Coluna (Desktop Surebet): Similar ao layout do Dialog de edição
    if (isColumn) {
      return (
        <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-border/30 bg-muted/5 h-full">
          <div className="flex items-center justify-between gap-2">
            <SelectionBadge 
              colorClassName={NEUTRAL_SELECTION_STYLE}
              minWidth={60}
              maxWidth={110}
            >
              {getSelecaoDisplay(perna)}
            </SelectionBadge>
            {onResultChange && (
              <SurebetPernaResultPill
                resultado={resultadoExibir}
                onResultChange={onResultChange}
              />
            )}
          </div>
          
          <div className="flex items-center gap-2 min-w-0">
            <div className="shrink-0 scale-75 origin-left">
              <SurebetBookmakerLogo nome={perna.bookmaker_nome} getLogoUrl={getLogoUrl} />
            </div>
            <div className="flex-1 min-w-0">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[11px] text-muted-foreground truncate uppercase block cursor-default">
                      {bookmakerDisplay}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[300px]">
                    <p className="uppercase">{enrichedBookmakerNome}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {isFreebet && (
              <span className="shrink-0 text-amber-400" title="Freebet">
                <Gift className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          
          <div className="flex items-baseline justify-between mt-auto pt-1 border-t border-border/10">
            <span className={cn("text-sm font-bold tabular-nums", oddClass)} title={layTitle}>{layPrefix}@{perna.odd.toFixed(2)}</span>
            <div className={cn("flex flex-col items-end", isLayPerna ? "text-red-300" : "text-muted-foreground")} title={stakeTitle}>
              <span className="text-xs tabular-nums font-medium">
                {formatPernaValue(perna.stake, perna.moeda)}
              </span>
              {isLayPerna && (
                <span className="text-[10px] leading-tight text-muted-foreground/80 tabular-nums">
                  Resp {formatPernaValue(respValor, perna.moeda)}
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Layout: [Badge Seleção Fixa] [Logo] [Nome Casa] [Odd + Stake à direita] - Responsivo (Lista)
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 overflow-hidden">
        {/* Badge de seleção - responsivo */}
        <div className="hidden sm:block w-[100px] md:w-[120px] shrink-0">
          <SelectionBadge 
            colorClassName={NEUTRAL_SELECTION_STYLE}
            minWidth={80}
            maxWidth={116}
          >
            {getSelecaoDisplay(perna)}
          </SelectionBadge>
        </div>
        
        {/* Row with Logo + Nome + Odd/Stake */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 overflow-hidden">
          {/* Logo */}
          <div className="shrink-0">
            <SurebetBookmakerLogo nome={perna.bookmaker_nome} getLogoUrl={getLogoUrl} />
          </div>
          
          {/* Nome da casa + vínculo abreviado + FB badge - com tooltip */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm text-muted-foreground truncate uppercase min-w-0 cursor-default">
                    {bookmakerDisplay}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[300px]">
                  <p className="uppercase">{enrichedBookmakerNome}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {isFreebet && (
              <span className="shrink-0 text-amber-400" title="Freebet">
                <Gift className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          
          {/* Odd e Stake à direita - larguras fixas para alinhamento */}
          <div className="flex items-center gap-3 shrink-0">
            <span className={cn("text-sm sm:text-base font-medium whitespace-nowrap w-[92px] text-right tabular-nums", oddClass)} title={layTitle}>{layPrefix}@{perna.odd.toFixed(2)}</span>
            <div className={cn("flex flex-col items-end w-[120px]", isLayPerna ? "text-red-300" : "text-muted-foreground")} title={stakeTitle}>
              <span className="text-xs sm:text-sm whitespace-nowrap tabular-nums">{formatPernaValue(perna.stake, perna.moeda)}</span>
              {isLayPerna && (
                <span className="text-[10px] sm:text-[11px] leading-tight text-muted-foreground/80 whitespace-nowrap tabular-nums">
                  Resp {formatPernaValue(respValor, perna.moeda)}
                </span>
              )}
            </div>
          </div>
          
          {/* Result pill per perna */}
          {onResultChange && (
            <SurebetPernaResultPill
              resultado={resultadoExibir}
              onResultChange={onResultChange}
            />
          )}
        </div>
        
        {/* Mobile: Selection badge below */}
        <div className="sm:hidden">
          <SelectionBadge 
            colorClassName={NEUTRAL_SELECTION_STYLE}
            minWidth={60}
            maxWidth={100}
          >
            {getSelecaoDisplay(perna)}
          </SelectionBadge>
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
          {/* Badge de seleção - cor neutra informativa */}
          <div className="w-[120px] shrink-0">
            <SelectionBadge 
              colorClassName={NEUTRAL_SELECTION_STYLE}
              minWidth={100}
              maxWidth={116}
            >
              {getSelecaoDisplay(perna)}
            </SelectionBadge>
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
            <span className={cn("text-sm font-medium", oddClass)} title={layTitle}>{layPrefix}@{displayOdd.toFixed(2)}</span>
            <span className={cn("text-xs", isLayPerna ? "text-red-300" : "text-muted-foreground")} title={stakeTitle}>
              {(() => {
                // Check if entries have mixed currencies
                const entryCurrencies = new Set(perna.entries?.map(e => e.moeda) || []);
                if (entryCurrencies.size > 1 && convertToConsolidation) {
                  // Convert each entry's stake to consolidation currency
                  const consolidated = perna.entries!.reduce((sum, e) => {
                    const v = isLayPerna ? e.stake * Math.max(0, e.odd - 1) : e.stake;
                    return sum + convertToConsolidation(v, e.moeda);
                  }, 0);
                  return `${stakeLabel}${formatValue(consolidated)}`;
                }
                const v = isLayPerna ? displayStake * Math.max(0, displayOdd - 1) : displayStake;
                return `${stakeLabel}${formatPernaValue(v, perna.moeda)}`;
              })()}
            </span>
          </div>
          
          {/* Chevron */}
          {isOpen ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          
          {/* Result pill per grouped perna */}
          {onResultChange && (
            <SurebetPernaResultPill
              resultado={resultadoExibir}
              onResultChange={onResultChange}
            />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="animate-in slide-in-from-top-1 duration-200">
        <div className="mt-2 space-y-2 ml-[4.75rem] pl-4 border-l-2 border-primary/20">
          {perna.entries?.map((entry, idx) => (
            <div 
              key={idx} 
              className="flex items-center gap-3 text-xs"
              data-testid="surebet-sub-entry"
              data-moeda={entry.moeda}
              data-stake={entry.stake}
              data-odd={entry.odd}
              data-bookmaker={entry.bookmaker_nome}
            >

              {/* Logo menor */}
              <div className="h-8 w-8 shrink-0">
                <SurebetBookmakerLogo nome={entry.bookmaker_nome} getLogoUrl={getLogoUrl} />
              </div>
              
              {/* Nome + FB badge - com vínculo abreviado */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0 text-muted-foreground">
                <span className="truncate uppercase">
                  {formatBookmakerDisplay(
                    (entry.bookmaker_id && bookmakerNomeMap?.has(entry.bookmaker_id))
                      ? bookmakerNomeMap.get(entry.bookmaker_id)!
                      : entry.bookmaker_nome
                  )}
                </span>
                {entry.fonte_saldo === 'FREEBET' && (
                  <span className="shrink-0 text-amber-400" title="Freebet">
                    <Gift className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
              
              {/* Odd + Stake */}
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn("font-medium text-foreground", (entry as any).tipo === "lay" && "text-red-400")} title={(entry as any).tipo === "lay" ? "Chance contra (Lay)" : undefined}>{(entry as any).tipo === "lay" ? "Lay " : ""}@{entry.odd.toFixed(2)}</span>
                <span className="text-muted-foreground">{formatPernaValue(entry.stake, entry.moeda)}</span>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SurebetCard({ 
  surebet, 
  onEdit, 
  onQuickResolve, 
  onSimpleMenuQuickResolve, 
  onPernaResultChange, 
  onSimpleQuickResolve, 
  onDelete, 
  onDuplicate, 
  className, 
  formatCurrency, 
  convertToConsolidation, 
  moedaConsolidacao, 
  isBonusContext, 
  bookmakerNomeMap 
}: SurebetCardProps) {
  const [showDebug, setShowDebug] = useState(false);
  const { getLogoUrl } = useBookmakerLogoMap();
  const { isSystemOwner } = useAuth();

  // Fallback de logos via cache local quando o evento foi importado sem
  // home_team_logo_url/away_team_logo_url — OU quando a surebet antiga
  // não teve time_casa/time_fora persistidos (derivamos do próprio evento).
  const __parsedTeams = (() => {
    if (surebet.time_casa && surebet.time_fora) {
      return { home: surebet.time_casa, away: surebet.time_fora };
    }
    const raw = (surebet.evento || "").trim();
    if (!raw) return { home: null as string | null, away: null as string | null };
    const parts = raw.split(/\s+[xX×]\s+/);
    if (parts.length !== 2) return { home: null, away: null };
    const home = parts[0].trim();
    const away = parts[1].trim();
    if (!home || !away) return { home: null, away: null };
    return { home, away };
  })();
  const { getTeamLogo: __fallbackTeamLogo } = useLogoFallback(
    __parsedTeams.home && __parsedTeams.away ? esporteToSportKey(surebet.esporte) : null,
  );
  const __homeLogoUrl = surebet.home_team_logo_url
    || (__parsedTeams.home ? __fallbackTeamLogo(__parsedTeams.home) : null);
  const __awayLogoUrl = surebet.away_team_logo_url
    || (__parsedTeams.away ? __fallbackTeamLogo(__parsedTeams.away) : null);
  const __displayHome = __parsedTeams.home;
  const __displayAway = __parsedTeams.away;

  // Expôr para debug e automação
  const { workingRates: projectRatesRaw, refetch: refetchProjectRates } = useProjetoWorkingRates(surebet.workspace_id);

  const { getRate: getOfficialRate } = useCotacoes();

  // Mapear as taxas de trabalho do projeto com proteção contra valores inválidos
  const ratesAudit = (() => {
    if (!projectRatesRaw) {
      return {
        USD: { rate: getOfficialRate("USD") || 5.06, source: 'official_fallback' as const },
        EUR: { rate: getOfficialRate("EUR") || 6.00, source: 'official_fallback' as const },
        GBP: { rate: getOfficialRate("GBP") || 7.00, source: 'official_fallback' as const },
        MXN: { rate: getOfficialRate("MXN") || 0.29, source: 'official_fallback' as const },
        BRL: { rate: 1, source: 'working' as const },
      };
    }

    
    const currencies = ['USD', 'EUR', 'GBP', 'MYR', 'MXN', 'ARS', 'COP'];
    const result: Record<string, { rate: number; source: 'working' | 'official_fallback' | 'error'; warning?: string }> = {};
    
    currencies.forEach(curr => {
      const field = curr === 'USD' ? 'cotacao_trabalho' : `cotacao_trabalho_${curr.toLowerCase()}`;
      const rawValue = (projectRatesRaw as any)[field];
      result[curr] = getSafeWorkingRate(curr, rawValue, getOfficialRate(curr));
    });
    
    result['BRL'] = { rate: 1, source: 'working' };
    return result;
  })();

  const workingRatesMap = Object.fromEntries(
    Object.entries(ratesAudit).map(([k, v]) => [k, v.rate])
  );

  const invalidRates = Object.entries(ratesAudit)
    .filter(([currency, audit]) => {
      // BRL nunca é inválida
      if (currency === 'BRL') return false;
      // Consideramos "inválida" se for erro ou se precisou de fallback (para mostrar o banner)
      return audit.source === 'error' || audit.source === 'official_fallback';
    })
    .map(([currency, audit]) => ({
      currency,
      rate: audit.rate,
      source: audit.source,
      officialRate: getOfficialRate(currency)
    }));



  // Mapa de taxas oficiais para o alerta de drift
  const officialRatesMap = (() => {
    return {
      USD: getOfficialRate("USD") || 1,
      EUR: getOfficialRate("EUR") || 1,
      GBP: getOfficialRate("GBP") || 1,
      MXN: getOfficialRate("MXN") || 1,
      ARS: getOfficialRate("ARS") || 1,
      COP: getOfficialRate("COP") || 1,
    };
  })();

  useEffect(() => {
    if (!isSystemOwner) return;
    console.log("[SurebetCard] Audit Rates:", ratesAudit);
    console.log("[SurebetCard] Project Raw:", projectRatesRaw);
    console.log("[SurebetCard] Official Rate USD:", getOfficialRate("USD"));


    if (typeof window !== 'undefined' && (window as any).__CALC_DEBUG__) {
      const debug = (window as any).__CALC_DEBUG__;
      if (!debug.liquidationState) debug.liquidationState = {};

      debug.liquidationState = {
        ...debug.liquidationState,
        sessionId: liquidationQueue.sessionId,
        pendingActions: liquidationQueue.pendingCount,
        isProcessing: liquidationQueue.isProcessing,
        allEntries: expandLegsWithSubEntries(surebet.pernas || []),
        liquidationOptions: generateLiquidationOptions(surebet.pernas || []),
      };

      debug.auditLiquidation = () => {
        const state = debug.liquidationState;
        console.group(`Auditoria de Liquidação — Operação ${surebet.id.slice(0, 8)}`);
        console.log('Entradas expandidas:', state.allEntries.length);
        console.log('Sub-entradas incluídas:', state.allEntries.filter((e: any) => e.isSubEntry).length);
        console.log('Opções "Uma perna ganha":', state.liquidationOptions.singleWin.length);
        console.log('Opções "Duplo Green":', state.liquidationOptions.doubleGreen.length);
        console.log('Ações pendentes na fila:', state.pendingActions);
        console.groupEnd();
      };
    }
  }, [surebet, liquidationQueue.pendingCount, liquidationQueue.isProcessing, isSystemOwner]);

  // Usa formatCurrency do projeto ou fallback para BRL
  const formatValue = formatCurrency || defaultFormatCurrency;
  const isDuploGreen = surebet.estrategia === "DUPLO_GREEN";
  const isValueBet = surebet.estrategia === "VALUEBET";
  const isPunter = surebet.estrategia === "PUNTER";
  const isFreebetStrat = surebet.estrategia === "EXTRACAO_FREEBET" || surebet.estrategia === "FREEBET";
  const isSimples = surebet.estrategia === "SIMPLES" || surebet.estrategia === "NORMAL";
  const isLiquidada = surebet.status === "LIQUIDADA";

  // CRÍTICO: apostas SIMPLES multi-entry (PUNTER/DUPLO_GREEN/EXTRACAO_BONUS/VALUEBET/FREEBET/SIMPLES)
  // são UMA aposta com múltiplas casas — NÃO são surebet de verdade. O resultado é único para
  // toda a aposta (não há "perna ganhou, perna perdeu"). Portanto:
  //  - badge da perna NÃO deve ser clicável (liquidar_perna_surebet_v1 falharia, perna_id="")
  //  - quick-resolve deve ser feito pelo dropdown do menu (que chama reliquidar_aposta_v6)
  // Apenas SUREBET/MULTIPLA têm liquidação por perna independente.
  //
  // IMPORTANTE: a estratégia sozinha NÃO determina o tipo. Uma aposta com estrategia
  // "EXTRACAO_BONUS" pode ser tanto:
  //   (a) simples multi-entry — todas as pernas com a MESMA seleção (mesma aposta em várias casas)
  //   (b) SUREBET/Múltipla real — pernas com seleções DIFERENTES (ex: 1-X-2, Sim/Não/Fora)
  //
  // Distinguimos contando seleções únicas: se houver 2+ seleções distintas, é surebet/múltipla
  // real e o submenu "Uma perna ganha" deve liquidar perna a perna.
  const pernasComBookmaker = (surebet.pernas || []).filter(p => p.bookmaker_id && p.odd && p.odd > 0);
  const selecoesUnicas = new Set(
    pernasComBookmaker.map(p => (p.selecao_livre || p.selecao || '').trim().toLowerCase()).filter(Boolean)
  );
  const hasMultipleDistinctSelecoes = selecoesUnicas.size >= 2;

  const isRegistroSimples = surebet.forma_registro === "SIMPLES";
  const couldBeSimples = isRegistroSimples || isPunter || isDuploGreen || isFreebetStrat || isSimples
    || surebet.estrategia === "VALUEBET" || surebet.estrategia === "EXTRACAO_BONUS";
  const isSimplesMultiEntry = couldBeSimples && !hasMultipleDistinctSelecoes;
  
  // Detectar se alguma perna usa freebet (badge no nível do card)
  const hasAnyFreebetPerna = surebet.pernas?.some(p => 
    p.fonte_saldo === 'FREEBET' || p.entries?.some(e => e.fonte_saldo === 'FREEBET')
  ) ?? false;
  // Detectar moeda predominante das pernas (se todas iguais, usar essa; senão, usar formatValue do projeto)
  // CRITICAL: também precisa olhar entries[] dentro de cada perna (multi-entry agrupado por seleção)
  const moedaPernas = (() => {
    if (!surebet.pernas || surebet.pernas.length === 0) return null;
    const moedas = new Set<string>();
    for (const p of surebet.pernas) {
      if (p.entries && p.entries.length > 0) {
        for (const e of p.entries) moedas.add(e.moeda || "BRL");
      } else {
        moedas.add(p.moeda || "BRL");
      }
    }
    return moedas.size === 1 ? moedas.values().next().value : null;
  })();
  
  const isMulticurrency = !moedaPernas && surebet.pernas && surebet.pernas.length > 0;
  
  // Formatter para totais do card: usa moeda das pernas se uniforme, senão projeto
  // Para multicurrency, SEMPRE usar formatValue do projeto (valores já convertidos)
  const formatTotal = moedaPernas 
    ? (v: number) => formatPernaValue(v, moedaPernas)
    : formatValue;
  
  // Para multicurrency, priorizar consolidação runtime (source-of-truth por perna).
  // Quando uma perna tem entries[] com moedas diferentes (multi-entry agrupado),
  // somar cada entry individualmente convertida — JAMAIS usar stake_total bruto.
  const stakeConsolidadoFallback = (() => {
    if (!isMulticurrency || !surebet.pernas || surebet.pernas.length === 0 || !convertToConsolidation) {
      return null;
    }

    return surebet.pernas.reduce((sum, p) => {
      if (p.entries && p.entries.length > 0) {
        return sum + p.entries.reduce(
          (s, e) => s + convertToConsolidation(e.stake || 0, e.moeda || "BRL"),
          0,
        );
      }
      return sum + convertToConsolidation(p.stake_total || p.stake || 0, p.moeda || "BRL");
    }, 0);
  })();

  const stakeRealTotal = (() => {
    if (isMulticurrency) {
      if (typeof stakeConsolidadoFallback === "number") return stakeConsolidadoFallback;
      if (typeof surebet.stake_consolidado === "number") return surebet.stake_consolidado;
      return surebet.stake_total;
    }

    if (!surebet.pernas || surebet.pernas.length === 0) return surebet.stake_total;
    return surebet.pernas.reduce((sum, p) => sum + (p.stake_total || p.stake || 0), 0);
  })();
  
  // Detectar contexto de bônus pela estratégia ou prop
  const showBonusBadge = isBonusContext || surebet.estrategia === "EXTRACAO_BONUS";
  
  // Calcular cenários (pior e melhor) a partir das pernas quando pendente
  // Para multicurrency: converte cada payout para moeda de consolidação antes de comparar
  // FREEBET (SNR): stake não é custo (stake_real=0) e payout = stake*(odd-1)
  const calcularCenarios = (): { piorLucro: number; melhorLucro: number; piorRoi: number; melhorRoi: number } | null => {
    if (!surebet.pernas || surebet.pernas.length < 2) return null;

    // Detecção canônica de freebet (em ordem de prioridade):
    //  1. Campos do banco: stake_freebet > 0 e stake_real == 0
    //  2. fonte_saldo da perna === 'FREEBET'
    //  3. Todas as entries com fonte_saldo === 'FREEBET' (modo multi-entrada)
    const isPernaFreebet = (p: SurebetPerna): boolean => {
      const sf = p.stake_freebet || 0;
      const sr = p.stake_real ?? null;
      if (sf > 0 && (sr === 0 || sr === null)) return true;
      if (p.fonte_saldo === 'FREEBET') return true;
      if (p.entries && p.entries.length > 0) {
        return p.entries.every(e => (e as any).fonteSaldo === 'FREEBET' || (e as any).fonte_saldo === 'FREEBET');
      }
      return false;
    };

    // Calcular stake total e custo real (freebet não é custo)
    let stakeTotal: number = 0;
    let stakeRealTotal: number = 0;

    surebet.pernas.forEach(p => {
      const isFB = isPernaFreebet(p);
      let sConv = 0;
      
      if (p.entries && p.entries.length > 0 && convertToConsolidation) {
        // CORREÇÃO: Somar cada sub-entrada convertida individualmente
        sConv = p.entries.reduce((sum, e) => sum + convertToConsolidation(e.stake || 0, e.moeda || "BRL"), 0);
      } else {
        const s = p.stake_total || p.stake || 0;
        sConv = (isMulticurrency && convertToConsolidation)
          ? convertToConsolidation(s, p.moeda || "BRL")
          : s;
      }
      
      stakeTotal += sConv;
      if (!isFB) stakeRealTotal += sConv;
    });

    if (stakeTotal <= 0) return null;

    // Se há alguma perna lay, usar solver simétrico por perna (back+lay)
    const hasLay = surebet.pernas.some(p => p.tipo === "lay");

    if (hasLay) {
      // Para cada cenário (cada perna sendo a vencedora financeira / GREEN),
      // somar pl_local de TODAS as pernas (incluindo perdedoras).
      const cenariosLay = surebet.pernas.map((_, idx) => {
        let lucroCenario = 0;
        surebet.pernas!.forEach((p, j) => {
          const isFB = isPernaFreebet(p);
          const lay = p.tipo === "lay";
          const comissao = Number(p.comissao || 0);
          const stake = p.stake_total || p.stake || 0;
          const odd = p.odd_media || p.odd || 0;
          const venceu = j === idx;
          let plLocal: number;
          if (venceu) {
            plLocal = lay
              ? stake * (1 - comissao)
              : (isFB ? stake * (odd - 1) : stake * (odd - 1));
          } else {
            plLocal = lay
              ? -(stake * Math.max(0, odd - 1))
              : (isFB ? 0 : -stake);
          }
          const plConv = (isMulticurrency && convertToConsolidation)
            ? convertToConsolidation(plLocal, p.moeda || "BRL")
            : plLocal;
          lucroCenario += plConv;
        });
        return lucroCenario;
      });
      const piorLucro = Math.min(...cenariosLay);
      const melhorLucro = Math.max(...cenariosLay);
      // Base de ROI: exposição real (stake back + liability lay), excluindo freebet
      let exposicaoTotal = 0;
      surebet.pernas.forEach(p => {
        const isFB = isPernaFreebet(p);
        if (isFB) return;
        const stake = p.stake_total || p.stake || 0;
        const odd = p.odd_media || p.odd || 0;
        const exp = p.tipo === "lay" ? stake * Math.max(0, odd - 1) : stake;
        exposicaoTotal += (isMulticurrency && convertToConsolidation)
          ? convertToConsolidation(exp, p.moeda || "BRL")
          : exp;
      });
      const piorRoi = exposicaoTotal > 0 ? (piorLucro / exposicaoTotal) * 100 : 0;
      const melhorRoi = exposicaoTotal > 0 ? (melhorLucro / exposicaoTotal) * 100 : 0;
      return { piorLucro, melhorLucro, piorRoi, melhorRoi };
    }

    // Caminho back-only / freebet (preservado intacto)
    const cenarios = surebet.pernas.map(perna => {
      const isFB = isPernaFreebet(perna);
      let retorno = 0;

      if (perna.entries && perna.entries.length > 0 && convertToConsolidation) {
        // CORREÇÃO: Calcular payout consolidado somando cada sub-entrada convertida
        retorno = perna.entries.reduce((sum, e) => {
          const payoutLocal = isFB ? (e.stake * (e.odd - 1)) : (e.stake * e.odd);
          return sum + convertToConsolidation(payoutLocal, e.moeda || "BRL");
        }, 0);
      } else {
        const oddEfetiva = perna.odd_media || perna.odd || 0;
        const stakeNessaPerna = perna.stake_total || perna.stake || 0;
        const retornoLocal = isFB ? stakeNessaPerna * (oddEfetiva - 1) : stakeNessaPerna * oddEfetiva;
        retorno = (isMulticurrency && convertToConsolidation)
          ? convertToConsolidation(retornoLocal, perna.moeda || "BRL")
          : retornoLocal;
      }

      // Lucro = retorno da perna ganhadora - custo real (somente stakes não-freebet)
      return retorno - stakeRealTotal;
    });

    const piorLucro = Math.min(...cenarios);
    const melhorLucro = Math.max(...cenarios);
    const piorRoi = stakeRealTotal > 0 ? (piorLucro / stakeRealTotal) * 100 : 0;
    const melhorRoi = stakeRealTotal > 0 ? (melhorLucro / stakeRealTotal) * 100 : 0;

    return { piorLucro, melhorLucro, piorRoi, melhorRoi };
  };


  // Manter assinatura antiga para uso interno (apenas pior)
  const calcularPiorCenario = (): { lucro: number; roi: number } | null => {
    const c = calcularCenarios();
    return c ? { lucro: c.piorLucro, roi: c.piorRoi } : null;
  };

  const getPernaLucroNominal = (perna: SurebetPerna): number | null => {
    if (typeof perna.lucro_prejuizo === "number") return perna.lucro_prejuizo;

    const stake = perna.stake_total || perna.stake || 0;
    const odd = perna.odd || 0;
    const lay = perna.tipo === "lay";
    const comissao = Number(perna.comissao || 0);

    if (lay) {
      switch (perna.resultado) {
        case "GREEN":
          return stake * (1 - comissao);
        case "MEIO_GREEN":
          return (stake * (1 - comissao)) / 2;
        case "RED":
          return -(stake * Math.max(0, odd - 1));
        case "MEIO_RED":
          return -(stake * Math.max(0, odd - 1)) / 2;
        case "VOID":
        case "PENDENTE":
        case null:
          return 0;
        default:
          return null;
      }
    }

    switch (perna.resultado) {
      case "GREEN":
        return stake * (odd - 1);
      case "MEIO_GREEN":
        return (stake * (odd - 1)) / 2;
      case "RED":
        return -stake;
      case "MEIO_RED":
        return -stake / 2;
      case "VOID":
      case "PENDENTE":
      case null:
        return 0;
      default:
        return null;
    }
  };

  const lucroConsolidadoFallback = (() => {
    if (!isLiquidada || !isMulticurrency || !surebet.pernas || surebet.pernas.length === 0 || !convertToConsolidation) {
      return null;
    }

    let hasAnyLucro = false;
    const total = surebet.pernas.reduce((sum, perna) => {
      const lucroNominal = getPernaLucroNominal(perna);
      if (typeof lucroNominal !== "number") return sum;
      hasAnyLucro = true;
      return sum + convertToConsolidation(lucroNominal, perna.moeda || "BRL");
    }, 0);

    return hasAnyLucro ? total : null;
  })();
  
  // Usar lucro_esperado do banco (calculado com cotação congelada) como fonte primária
  // Fallback para cálculo runtime apenas se lucro_esperado não existir
  const cenariosCalculados = !isLiquidada ? calcularCenarios() : null;
  const piorCenarioCalculado = cenariosCalculados ? { lucro: cenariosCalculados.piorLucro, roi: cenariosCalculados.piorRoi } : null;
  
  // PRIORIDADE: pl_consolidado (atômico, cotação congelada) > fallback runtime
  // CRÍTICO: pl_consolidado pode estar em consolidation_currency diferente da moeda do projeto!
  // Ex: pl_consolidado=0.14 BRL mas projeto usa USD → precisa converter BRL→USD
  const plConsolidadoNormalizado = (() => {
    if (typeof surebet.pl_consolidado !== "number") return null;
    const ccurrency = surebet.consolidation_currency;
    // Se consolidation_currency === moedaConsolidacao do projeto, usar direto
    if (!ccurrency || !moedaConsolidacao || ccurrency === moedaConsolidacao) {
      return surebet.pl_consolidado;
    }
    // Converter de consolidation_currency → moedaConsolidacao do projeto
    if (convertToConsolidation) {
      return convertToConsolidation(surebet.pl_consolidado, ccurrency);
    }
    return surebet.pl_consolidado; // fallback sem conversão
  })();

  const lucroConsolidadoEfetivo = typeof plConsolidadoNormalizado === "number"
    ? plConsolidadoNormalizado
    : (typeof lucroConsolidadoFallback === "number" ? lucroConsolidadoFallback : null);

  // Para lucro exibido: FONTE ÚNICA DE VERDADE
  // Liquidada: lucro_realizado (snapshot imutável congelado pelo trigger
  //   trg_snapshot_lucro_realizado) > pl_consolidado (RPC atômica) > lucro_real > fallback.
  // Pendente: PRIORIZAR cálculo runtime (que detecta freebet/multi-entrada corretamente).
  //   Só usa lucro_esperado do banco como fallback quando não há pernas para calcular.
  //   Motivo: lucro_esperado pode estar desatualizado em apostas legadas criadas antes
  //   das correções de detecção de freebet (mem://finance/surebet-freebet-detection-canonical).
  const lucroExibir = isLiquidada
    ? (typeof surebet.lucro_realizado === "number"
        ? surebet.lucro_realizado
        : (typeof lucroConsolidadoEfetivo === "number" ? lucroConsolidadoEfetivo : surebet.lucro_real))
    : (piorCenarioCalculado?.lucro ?? surebet.lucro_esperado ?? null);

  const roiExibir = (() => {
    if (isLiquidada) {
      // Snapshot imutável tem precedência absoluta para liquidadas.
      if (typeof surebet.roi_realizado === "number") return surebet.roi_realizado;
      // Fallback: ROI derivado do pl_consolidado (fonte de verdade da RPC).
      if (typeof lucroConsolidadoEfetivo === "number" && stakeRealTotal > 0) {
        return (lucroConsolidadoEfetivo / stakeRealTotal) * 100;
      }
      return surebet.roi_real;
    }
    // Pendente: PRIORIZAR cálculo runtime (mesma justificativa do lucro)
    return piorCenarioCalculado?.roi ?? surebet.roi_esperado ?? null;
  })();
  
  // Configuração do badge principal
  const estrategiaConfig = showBonusBadge 
    ? { label: "BÔNUS", icon: Coins, color: "text-amber-400", bgColor: "bg-amber-500/20", borderColor: "border-amber-500/30" }
    : isDuploGreen 
      ? { label: "DG", icon: Zap, color: "text-teal-400", bgColor: "bg-teal-500/20", borderColor: "border-teal-500/30" }
      : isValueBet
        ? { label: "VB", icon: TrendingUp, color: "text-purple-400", bgColor: "bg-purple-500/20", borderColor: "border-purple-500/30" }
        : isPunter
          ? { label: "PUNTER", icon: Target, color: "text-blue-400", bgColor: "bg-blue-500/20", borderColor: "border-blue-500/30" }
          : isFreebetStrat
            ? { label: "FREEBET", icon: Gift, color: "text-cyan-400", bgColor: "bg-cyan-500/20", borderColor: "border-cyan-500/30" }
            : isSimples
              ? { label: "SIMPLES", icon: Target, color: "text-blue-400", bgColor: "bg-blue-500/20", borderColor: "border-blue-500/30" }
              : { label: "SUREBET", icon: ArrowLeftRight, color: "text-amber-400", bgColor: "bg-amber-500/20", borderColor: "border-amber-500/30" };
  
  const Icon = estrategiaConfig.icon;


  return (
    <Card 
      className={cn(
        "overflow-hidden border-border/40 hover:border-primary/30 transition-all duration-300 group/card bg-card/40 backdrop-blur-sm",
        className
      )}
      data-testid="surebet-card"
      data-operation-id={surebet.id}
      data-status={surebet.status}
      data-has-invalid-rates={invalidRates.length > 0 ? 'true' : 'false'}
    >
      {/* Banner de Alerta/Bloqueio por taxas inválidas — removido daqui e movido para SurebetTracePanel */}






      <CardContent className="p-5 sm:p-6">
        {/* Botão de Debug — restrito ao proprietário do sistema */}
        {isSystemOwner && (isMulticurrency || (roiExibir && (roiExibir > 50 || roiExibir < -10))) && (
          <button 
            onClick={() => setShowDebug(!showDebug)}
            className={cn(
              "absolute top-2 right-12 p-1.5 rounded-full transition-colors",
              showDebug ? "bg-primary/20 text-primary" : "text-muted-foreground/30 hover:bg-muted"
            )}
            title="Abrir Auditoria Matemática"
          >
            <Bug className="h-4 w-4" />
          </button>
        )}

        {/* LINHA 1: Evento (título destacado) - com tooltip */}

        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              {__displayHome && __displayAway ? (
                <div className="flex items-center gap-2 min-w-0 mb-1.5 cursor-default">
                  <TeamLogo logoUrl={__homeLogoUrl} alt={__displayHome} size="h-6 w-6" iconSize="h-3.5 w-3.5" />
                  <span className="text-base sm:text-lg font-semibold truncate uppercase leading-tight">{__displayHome}</span>
                  <span className="text-muted-foreground shrink-0">×</span>
                  <TeamLogo logoUrl={__awayLogoUrl} alt={__displayAway} size="h-6 w-6" iconSize="h-3.5 w-3.5" />
                  <span className="text-base sm:text-lg font-semibold truncate uppercase leading-tight">{__displayAway}</span>
                </div>
              ) : (
                <p className="text-base sm:text-lg font-semibold truncate uppercase leading-tight mb-1.5 cursor-default">{surebet.evento || 'Operação'}</p>
              )}
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[400px]">
              <p className="uppercase">{surebet.evento || 'Operação'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        {/* LINHA 2: Esporte + Mercado + Badges + Menu na mesma linha */}
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          {surebet.esporte && (
            <span className="text-xs sm:text-sm text-muted-foreground">• {surebet.esporte}</span>
          )}
          {surebet.mercado && (
            <span className="text-xs sm:text-sm text-muted-foreground">• {surebet.mercado}</span>
          )}
          <Badge variant="outline" className={cn("text-[10px] sm:text-xs px-1.5 py-0 flex items-center gap-0.5", estrategiaConfig.bgColor, estrategiaConfig.color, estrategiaConfig.borderColor)}>
            <Icon className="h-3 w-3" />
            {estrategiaConfig.label}
          </Badge>
          <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0 border-amber-500/30 text-amber-400 bg-amber-500/20">
            {surebet.modelo}
          </Badge>
          <ResultadoBadge resultado={isLiquidada ? surebet.resultado : null} />
          
          <div className="ml-auto flex-shrink-0">
            {(onEdit || onDelete || onDuplicate || onQuickResolve) && (
              <SurebetRowActionsMenu
                surebetId={surebet.id}
                status={surebet.status || "PENDENTE"}
                resultado={surebet.resultado || null}
                pernas={surebet.pernas || []}

                onEdit={() => onEdit?.(surebet)}
                onDuplicate={onDuplicate ? () => onDuplicate(surebet.id) : undefined}
                onQuickResolve={async (result) => {
                  if (isSimplesMultiEntry && (onSimpleMenuQuickResolve || onSimpleQuickResolve)) {
                    const resultadoFinal = result.type === 'all_void'
                      ? 'VOID'
                      : result.winners.length > 0
                        ? 'GREEN'
                        : 'RED';
                    void (onSimpleMenuQuickResolve || onSimpleQuickResolve)?.(surebet.id, resultadoFinal);
                    return;
                  }

                  if (!onQuickResolve && !onPernaResultChange) return;

                  // Se o pai tem onQuickResolve, delegar para ele
                  if (onQuickResolve) {
                    onQuickResolve(surebet.id, result);
                    return;
                  }

                  // Fallback: se não tiver onQuickResolve mas tiver onPernaResultChange, usar a fila local
                  const entriesToLiquidate = result.entryIds && result.entryIds.length > 0 
                    ? result.entryIds 
                    : [];

                  for (const perna of (surebet.pernas || [])) {
                    const isPernaWinner = result.winners.includes(surebet.pernas!.indexOf(perna));
                    const resultado = result.type === 'all_void' ? 'VOID' : (isPernaWinner ? 'GREEN' : 'RED');

                    // REFACTOR Modo A (v10): Liquidação agora é leg-level. 
                    // O motor do banco (liquidar_perna_surebet_v1) expande as entradas automaticamente.
                    liquidationQueue.enqueue({
                      operationId: surebet.id,
                      entryId: perna.id,
                      result: resultado,
                    });
                  }

                  await liquidationQueue.flush(async (action) => {
                    const perna = surebet.pernas?.find(p => p.id === action.entryId || p.entries?.some(e => e.id === action.entryId));
                    if (!perna) return;

                    let entryData: any = perna;
                    if (perna.entries) {
                      const sub = perna.entries.find(e => e.id === action.entryId);
                      if (sub) entryData = sub;
                    }

                    await onPernaResultChange!({
                      pernaId: action.entryId,
                      surebetId: surebet.id,
                      bookmarkerId: entryData.bookmaker_id!,
                      resultado: action.result,
                      stake: entryData.stake || entryData.stake_total || 0,
                      odd: entryData.odd || entryData.odd_media || 0,
                      moeda: entryData.moeda || 'BRL',
                      resultadoAnterior: perna.resultado,
                      workspaceId: surebet.workspace_id || '',
                      bookmakerNome: entryData.bookmaker_nome,
                      silent: perna.entries && perna.entries.length > 1,
                    });
                  });
                }}
                onDelete={() => onDelete?.(surebet.id)}
              />
            )}
          </div>
        </div>
        
        {/* LINHA 2+: Pernas - Grid alinhado com coluna de seleção fixa */}
        {surebet.pernas && surebet.pernas.length > 0 && (
          <div className="space-y-3 mb-3">
            {surebet.pernas
              .filter(perna => perna.bookmaker_id && perna.odd && perna.odd > 0)
              .map((perna, legIndex) => {
                const subCurrencies = perna.entries?.map(e => e.moeda).join(',') || '';
                return (
                  <div 
                    key={perna.id} 
                    data-testid="surebet-leg-wrapper" 
                    data-leg-index={legIndex} 
                    data-currency={perna.moeda} 
                    data-sub-entries-count={perna.entries?.length ?? 0}
                    data-sub-entries-currencies={subCurrencies}
                  >
                  <PernaItem 
                    perna={perna} 
                    formatValue={formatValue}
                    getLogoUrl={getLogoUrl}
                    bookmakerNomeMap={bookmakerNomeMap}
                    convertToConsolidation={convertToConsolidation}
                    parentResultado={isSimplesMultiEntry ? surebet.resultado : undefined}
                    onResultChange={
                      // CASO 1: Aposta simples multi-entry (PUNTER, VALUEBET, DUPLO_GREEN, EXTRACAO_BONUS, FREEBET, SIMPLES)
                      // → resultado é único para toda a aposta. O badge dispara reliquidação global via reliquidar_aposta_v6.
                      isSimplesMultiEntry && onSimpleQuickResolve ? async (resultado: string) => {
                        await onSimpleQuickResolve(surebet.id, resultado);
                      }
                      // CASO 2: Surebet/Múltipla real → liquidação por perna individual (MODO B)
                      : !isSimplesMultiEntry && onPernaResultChange && perna.bookmaker_id ? async (resultado: string) => {
                      const resFinal = resultado.toUpperCase() as any;
                      
                      // REFACTOR Modo B (v10): Liquidação agora é leg-level. 
                      // O motor do banco (liquidar_perna_surebet_v1) aplica o resultado a TODAS 
                      // as sub-entradas da perna automaticamente.
                      console.log(`[Modo B] Liquidando perna ${perna.id} como ${resFinal}. Entradas: ${perna.entries?.length || 1}`);
                      
                      await onPernaResultChange({
                        pernaId: perna.id,
                        surebetId: surebet.id,
                        bookmarkerId: perna.bookmaker_id!,
                        resultado: resFinal,
                        stake: perna.stake_total || perna.stake,
                        odd: perna.odd_media || perna.odd,
                        moeda: perna.moeda || 'BRL',
                        resultadoAnterior: perna.resultado,
                        workspaceId: surebet.workspace_id || '',
                        bookmakerNome: perna.bookmaker_nome,
                      });
                    } : undefined}
                  />
                  </div>
                );
              })}

          </div>
        )}
        
        {/* LINHA FINAL: Data/Hora + Stake + Lucro/ROI - NUNCA CORTAR */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50 gap-3">
          <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
            {formatDate(parseLocalDateTime(surebet.data_operacao), "dd/MM HH:mm", { locale: ptBR })}
          </span>
          
          <div className="flex items-center gap-3 shrink-0">
            {isMulticurrency ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap cursor-help">
                      Stake: {formatTotal(stakeRealTotal)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs space-y-0.5">
                    <p className="font-medium mb-1">Stakes por moeda:</p>
                    {Object.entries(
                      (surebet.pernas || []).reduce<Record<string, number>>((acc, p) => {
                        if (p.entries && p.entries.length > 0) {
                          for (const e of p.entries) {
                            const m = e.moeda || 'BRL';
                            acc[m] = (acc[m] || 0) + (e.stake || 0);
                          }
                        } else {
                          const m = p.moeda || 'BRL';
                          acc[m] = (acc[m] || 0) + (p.stake_total || p.stake || 0);
                        }
                        return acc;
                      }, {})
                    ).map(([m, v]) => (
                      <p key={m}>{formatPernaValue(v, m)}</p>
                    ))}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                Stake: {formatTotal(stakeRealTotal)}
              </span>
            )}
            
            {lucroExibir !== null && lucroExibir !== undefined && (() => {
              // Faixa de lucro (mín → máx) apenas quando pendente e há cenários distintos
              const showRange = !isLiquidada
                && cenariosCalculados
                && Math.abs(cenariosCalculados.melhorLucro - cenariosCalculados.piorLucro) > 0.005;
              const sign = (v: number) => (v >= 0 ? "+" : "");
              // Cor: quando há range, basear no pior cenário (se pior >= 0, operação é lucrativa em todos os cenários).
              // Quando não há range, usar lucroExibir.
              const colorBasis = showRange && cenariosCalculados ? cenariosCalculados.piorLucro : lucroExibir;
              const isPositive = colorBasis >= 0;
              return (
                <div className="flex flex-col items-end shrink-0">
                  <div className="flex items-center gap-1">
                    <span className={cn(
                      "font-semibold whitespace-nowrap",
                      showRange ? "text-xs sm:text-sm" : "text-sm sm:text-base",
                      isPositive ? 'text-emerald-400' : 'text-red-400',
                      !isLiquidada && 'opacity-60'
                    )}>
                      {showRange && cenariosCalculados ? (
                        <>
                          {sign(cenariosCalculados.piorLucro)}{formatTotal(cenariosCalculados.piorLucro)}
                          <span className="text-muted-foreground mx-0.5">→</span>
                          {sign(cenariosCalculados.melhorLucro)}{formatTotal(cenariosCalculados.melhorLucro)}
                        </>
                      ) : (
                        formatTotal(lucroExibir)
                      )}
                    </span>
                    {roiExibir !== null && roiExibir !== undefined && !showRange && (
                      <span className={cn(
                        "text-[10px] sm:text-xs whitespace-nowrap",
                        roiExibir >= 0 ? 'text-emerald-400' : 'text-red-400',
                        !isLiquidada && 'opacity-60'
                      )}>
                        ({roiExibir >= 0 ? '+' : ''}{roiExibir.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                  {showRange && cenariosCalculados && (
                    <span className={cn(
                      "text-[10px] whitespace-nowrap opacity-70",
                      cenariosCalculados.piorRoi >= 0 ? 'text-emerald-400' : 'text-red-400'
                    )}>
                      {sign(cenariosCalculados.piorRoi)}{cenariosCalculados.piorRoi.toFixed(2)}%
                      <span className="text-muted-foreground mx-0.5">→</span>
                      {sign(cenariosCalculados.melhorRoi)}{cenariosCalculados.melhorRoi.toFixed(2)}%
                    </span>
                  )}
                  {/* Equivalência na moeda de consolidação (Cotação de Trabalho) */}
                  {moedaPernas && moedaConsolidacao && moedaPernas !== moedaConsolidacao && isLiquidada && typeof lucroConsolidadoEfetivo === "number" && (
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      ≈ {formatValue(lucroConsolidadoEfetivo)}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Auditoria Visual — restrita ao proprietário do sistema */}
        {isSystemOwner && (
        <SurebetTracePanel 
          isOpen={showDebug} 
          baseCurrency={moedaConsolidacao || "BRL"}
          workingRates={workingRatesMap}
          officialRates={officialRatesMap}
          invalidRates={invalidRates}
          onReloadRates={refetchProjectRates}
          onConfirmRates={async () => {
            const { toast } = await import("sonner");
            const { supabase } = await import("@/integrations/supabase/client");
            
            try {
              const updates: any = {};
              invalidRates.forEach(r => {
                const field = r.currency === 'USD' ? 'cotacao_trabalho' : `cotacao_trabalho_${r.currency.toLowerCase()}`;
                updates[field] = r.officialRate;
              });
              
              const { error } = await supabase
                .from('projetos')
                .update(updates)
                .eq('id', surebet.workspace_id);
                
              if (error) throw error;
              toast.success("Cotações de trabalho sincronizadas com o projeto!");
              refetchProjectRates(); // Forçar atualização do UI
            } catch (err) {
              console.error(err);
              toast.error("Erro ao atualizar cotações.");
            }
          }}


          steps={(() => {
            const steps: any[] = [];
            (surebet.pernas || []).forEach((p, idx) => {
              if (p.entries && p.entries.length > 0) {
                // Agregar conversões de sub-entradas
                p.entries.forEach((e, sIdx) => {
                  if (e.moeda && e.moeda !== moedaConsolidacao) {
                    steps.push({
                      label: `P${idx+1} Casa ${sIdx+1}: ${e.bookmaker_nome}`,
                      original: `${e.moeda} ${e.stake}`,
                      rate: convertToConsolidation ? convertToConsolidation(1, e.moeda) : 1,
                      result: convertToConsolidation ? convertToConsolidation(e.stake, e.moeda).toFixed(2) : e.stake.toFixed(2),
                      type: 'conversion'
                    });
                  }
                });
                
                if (p.entries.length > 1) {
                  const totalLegConsolidated = p.entries.reduce((sum, e) => 
                    sum + (convertToConsolidation ? convertToConsolidation(e.stake, e.moeda || "BRL") : e.stake), 0
                  );
                  steps.push({
                    label: `Agregação P${idx+1} (${p.entries.length} casas)`,
                    original: p.entries.map(e => `${e.moeda || 'BRL'} ${e.stake}`).join(' + '),
                    result: totalLegConsolidated.toFixed(2),
                    type: 'aggregation'
                  });
                }
              } else if (p.moeda && p.moeda !== moedaConsolidacao) {
                steps.push({
                  label: `P${idx+1} (${p.bookmaker_nome})`,
                  original: `${p.moeda} ${p.stake_total || p.stake}`,
                  rate: convertToConsolidation ? convertToConsolidation(1, p.moeda || "BRL") : 1,
                  result: convertToConsolidation ? convertToConsolidation(p.stake_total || p.stake, p.moeda || "BRL").toFixed(2) : (p.stake_total || (p.stake as any)).toFixed(2),
                  type: 'conversion'
                });
              }
            });

            // Se for Surebet, mostrar o P&L total projetado no trace
            if (!isSimplesMultiEntry && !isLiquidada) {
              const projections = calculatePnlProjections(
                generateLiquidationOptions(surebet.pernas || []).liquidationLegs,
                workingRatesMap,
                officialRatesMap,
                moedaConsolidacao || 'USD'
              );

              projections.forEach(proj => {
                steps.push({
                  label: `P&L Projetado: ${proj.legLabel} Ganha`,
                  original: `Retorno BRL: ${proj.winnerReturnBRL.toFixed(2)}`,
                  result: proj.pnlUSD.toFixed(2),
                  type: 'pnl_projection',
                  pnlUSD: proj.pnlUSD,
                  winnerReturnUSD: proj.winnerReturnUSD,
                  totalInvestedUSD: proj.totalInvestedUSD,
                  ratesUsed: proj.ratesUsed,
                  entriesBreakdown: proj.entriesBreakdown,
                  legId: proj.legId,
                  isContaminated: proj.currencyContamination
                });
              });
            }


            return steps;
          })()}
        />
        )}
      </CardContent>
    </Card>

  );
}
