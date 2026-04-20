import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, SelectionBadge } from "@/components/ui/badge";
import { format as formatDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeftRight, Zap, CheckCircle2, Clock, Coins, ChevronDown, ChevronUp, Layers, Building2, TrendingUp, Target, Gift } from "lucide-react";
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
import type { SupportedCurrency } from "@/hooks/useCurrencySnapshot";
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
  moeda?: string;
  /** Fonte do saldo: REAL ou FREEBET */
  fonte_saldo?: string;
  /** Stake real (não-freebet) da perna — fonte canônica de custo */
  stake_real?: number;
  /** Stake de freebet (SNR) da perna — não é custo, gera lucro líquido stake*(odd-1) */
  stake_freebet?: number;
  // Campos para múltiplas entradas
  entries?: SurebetPernaEntry[];
  odd_media?: number;
  stake_total?: number;
}

export interface SurebetData {
  id: string;
  workspace_id?: string;
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
  getLogoUrl 
}: { 
  nome: string; 
  getLogoUrl: (name: string) => string | null;
}) {
  const logoUrl = getLogoUrl(nome);
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
  const displayOdd = perna.odd_media || perna.odd;
  const displayStake = perna.stake_total || perna.stake;
  
  // formatBookmakerDisplay imported from @/lib/bookmaker-display
  
  // Enriquecer nome do bookmaker: usar mapa canônico se disponível, senão usar o que está salvo
  const enrichedBookmakerNome = (perna.bookmaker_id && bookmakerNomeMap?.has(perna.bookmaker_id))
    ? bookmakerNomeMap.get(perna.bookmaker_id)!
    : perna.bookmaker_nome;
  
  const bookmakerDisplay = formatBookmakerDisplay(enrichedBookmakerNome);
  
  if (!hasMultipleEntries) {
    // Layout: [Badge Seleção Fixa] [Logo] [Nome Casa] [Odd + Stake à direita] - Responsivo
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
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm sm:text-base font-medium whitespace-nowrap w-[60px] text-right tabular-nums">@{perna.odd.toFixed(2)}</span>
            <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap w-[90px] text-right tabular-nums">{formatPernaValue(perna.stake, perna.moeda)}</span>
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
            <span className="text-sm font-medium">@{displayOdd.toFixed(2)}</span>
            <span className="text-xs text-muted-foreground">
              {(() => {
                // Check if entries have mixed currencies
                const entryCurrencies = new Set(perna.entries?.map(e => e.moeda) || []);
                if (entryCurrencies.size > 1 && convertToConsolidation) {
                  // Convert each entry's stake to consolidation currency
                  const consolidated = perna.entries!.reduce((sum, e) => sum + convertToConsolidation(e.stake, e.moeda), 0);
                  return formatValue(consolidated);
                }
                return formatPernaValue(displayStake, perna.moeda);
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
              resultado={perna.resultado}
              onResultChange={onResultChange}
            />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="animate-in slide-in-from-top-1 duration-200">
        <div className="mt-2 space-y-2 ml-[4.75rem] pl-4 border-l-2 border-primary/20">
          {perna.entries?.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-3 text-xs">
              {/* Logo menor */}
              <div className="h-8 w-8 shrink-0">
                <SurebetBookmakerLogo nome={entry.bookmaker_nome} getLogoUrl={getLogoUrl} />
              </div>
              
              {/* Nome + FB badge + linha opcional - com vínculo abreviado */}
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
                {entry.selecao_livre && (
                  <span className="text-primary/70 text-[9px] shrink-0">({entry.selecao_livre})</span>
                )}
              </div>
              
              {/* Odd + Stake */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-medium text-foreground">@{entry.odd.toFixed(2)}</span>
                <span className="text-muted-foreground">{formatPernaValue(entry.stake, entry.moeda)}</span>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SurebetCard({ surebet, onEdit, onQuickResolve, onPernaResultChange, onSimpleQuickResolve, onDelete, onDuplicate, className, formatCurrency, convertToConsolidation, moedaConsolidacao, isBonusContext, bookmakerNomeMap }: SurebetCardProps) {
  // Hook para buscar logos das casas
  const { getLogoUrl } = useBookmakerLogoMap();
  
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
  const isSimplesMultiEntry = isPunter || isDuploGreen || isFreebetStrat || isSimples
    || surebet.estrategia === "VALUEBET" || surebet.estrategia === "EXTRACAO_BONUS";
  
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
      const s = p.stake_total || p.stake || 0;
      const isFB = isPernaFreebet(p);
      const sConv = (isMulticurrency && convertToConsolidation)
        ? convertToConsolidation(s, p.moeda || "BRL")
        : s;
      stakeTotal += sConv;
      if (!isFB) stakeRealTotal += sConv;
    });

    if (stakeTotal <= 0) return null;

    // Para cada cenário (cada perna ganhando), calcular o lucro
    const cenarios = surebet.pernas.map(perna => {
      const oddEfetiva = perna.odd_media || perna.odd || 0;
      const stakeNessaPerna = perna.stake_total || perna.stake || 0;
      const isFB = isPernaFreebet(perna);

      // SNR: Freebet payout líquido = stake*(odd-1); aposta real payout = stake*odd
      const retornoLocal = isFB ? stakeNessaPerna * (oddEfetiva - 1) : stakeNessaPerna * oddEfetiva;

      // Converter retorno para moeda de consolidação se multicurrency
      const retorno = (isMulticurrency && convertToConsolidation)
        ? convertToConsolidation(retornoLocal, perna.moeda || "BRL")
        : retornoLocal;

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
  // Liquidada: pl_consolidado (RPC atômica) > lucro_real > fallback
  // Pendente: PRIORIZAR cálculo runtime (que detecta freebet/multi-entrada corretamente).
  //   Só usa lucro_esperado do banco como fallback quando não há pernas para calcular.
  //   Motivo: lucro_esperado pode estar desatualizado em apostas legadas criadas antes
  //   das correções de detecção de freebet (mem://finance/surebet-freebet-detection-canonical).
  const lucroExibir = isLiquidada 
    ? (typeof lucroConsolidadoEfetivo === "number" ? lucroConsolidadoEfetivo : surebet.lucro_real)
    : (piorCenarioCalculado?.lucro ?? surebet.lucro_esperado ?? null);

  const roiExibir = (() => {
    if (isLiquidada) {
      // Priorizar ROI derivado do pl_consolidado (fonte de verdade)
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
      className={cn("transition-colors overflow-hidden", className)}
    >
      <CardContent className="p-5 sm:p-6">
        {/* LINHA 1: Evento (título destacado) - com tooltip */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-base sm:text-lg font-semibold truncate uppercase leading-tight mb-1.5 cursor-default">{surebet.evento || 'Operação'}</p>
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
                pernas={(surebet.pernas || [])
                  .filter(p => p.bookmaker_id && p.odd && p.odd > 0)
                  .map((p, idx) => ({
                    id: p.id,
                    ordem: idx,
                    selecao: p.selecao_livre || p.selecao || `Perna ${idx + 1}`,
                    bookmaker_nome: p.bookmaker_nome,
                  }))}
                onEdit={() => onEdit?.(surebet)}
                onDuplicate={onDuplicate ? () => onDuplicate(surebet.id) : undefined}
                onQuickResolve={(result) => onQuickResolve?.(surebet.id, result)}
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
              .map((perna) => (
                <PernaItem 
                  key={perna.id} 
                  perna={perna} 
                  formatValue={formatValue}
                  getLogoUrl={getLogoUrl}
                  bookmakerNomeMap={bookmakerNomeMap}
                  convertToConsolidation={convertToConsolidation}
                  onResultChange={
                    // CASO 1: Aposta simples multi-entry (PUNTER, VALUEBET, DUPLO_GREEN, EXTRACAO_BONUS, FREEBET, SIMPLES)
                    // → resultado é único para toda a aposta. O badge dispara reliquidação global via reliquidar_aposta_v6.
                    isSimplesMultiEntry && onSimpleQuickResolve ? async (resultado: string) => {
                      await onSimpleQuickResolve(surebet.id, resultado);
                    }
                    // CASO 2: Surebet/Múltipla real → liquidação por perna individual
                    : !isSimplesMultiEntry && onPernaResultChange && perna.bookmaker_id ? async (resultado: string) => {
                    // CORREÇÃO: Para pernas agrupadas (múltiplas entradas/casas),
                    // liquidar TODAS as sub-entradas, não apenas a primeira.
                    if (perna.entries && perna.entries.length > 1) {
                      for (const entry of perna.entries) {
                        if (!entry.id || !entry.bookmaker_id) continue;
                        await onPernaResultChange({
                          pernaId: entry.id,
                          surebetId: surebet.id,
                          bookmarkerId: entry.bookmaker_id,
                          resultado,
                          stake: entry.stake,
                          odd: entry.odd,
                          moeda: entry.moeda || 'BRL',
                          resultadoAnterior: perna.resultado,
                          workspaceId: surebet.workspace_id || '',
                          bookmakerNome: entry.bookmaker_nome,
                          silent: true,
                        });
                      }
                    } else {
                      await onPernaResultChange({
                        pernaId: perna.id,
                        surebetId: surebet.id,
                        bookmarkerId: perna.bookmaker_id!,
                        resultado,
                        stake: perna.stake,
                        odd: perna.odd,
                        moeda: perna.moeda || 'BRL',
                        resultadoAnterior: perna.resultado,
                        workspaceId: surebet.workspace_id || '',
                        bookmakerNome: perna.bookmaker_nome,
                      });
                    }
                  } : undefined}
                />
              ))}
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
      </CardContent>
    </Card>
  );
}
