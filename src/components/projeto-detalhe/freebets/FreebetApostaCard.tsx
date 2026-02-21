import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Gift, Target, TrendingUp, Shield, CheckCircle2, BarChart3, Layers } from "lucide-react";
import { ApostaOperacionalFreebet } from "./types";
import { ResultadoPill } from "../ResultadoPill";
import { parseLocalDateTime } from "@/utils/dateUtils";
import { cn, getFirstLastName } from "@/lib/utils";

interface FreebetApostaCardProps {
  aposta: ApostaOperacionalFreebet;
  projetoId: string;
  compact?: boolean;
  formatCurrency: (value: number) => string;
  onResultadoUpdated: () => void;
  onEditClick: (aposta: ApostaOperacionalFreebet) => void;
}

// Badge de estratégia (prioridade máxima quando gera freebet = Qualificadora)
function getEstrategiaBadge(aposta: ApostaOperacionalFreebet) {
  // PRIORIDADE 1: Se gerou freebet, é uma Qualificadora
  if (aposta.gerou_freebet) {
    return (
      <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30 text-[10px] px-1.5 py-0">
        <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
        QB
      </Badge>
    );
  }
  
  // PRIORIDADE 2: Outras estratégias (se definidas)
  const estrategia = aposta.estrategia;
  if (estrategia === "SUREBET") {
    return (
      <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px] px-1.5 py-0">
        <Shield className="h-2.5 w-2.5 mr-0.5" />
        SB
      </Badge>
    );
  }
  if (estrategia === "DUPLO_GREEN") {
    return (
      <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/30 text-[10px] px-1.5 py-0">
        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
        DG
      </Badge>
    );
  }
  if (estrategia === "VALUEBET") {
    return (
      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0">
        <BarChart3 className="h-2.5 w-2.5 mr-0.5" />
        VB
      </Badge>
    );
  }
  
  // Nenhuma estratégia definida, retorna null
  return null;
}

// Badge de contexto (origem do saldo - exibido apenas quando não há estratégia de Qualificadora)
function getContextoBadge(aposta: ApostaOperacionalFreebet) {
  // Se gerou freebet, não mostrar badge de contexto (a estratégia Qualificadora já é mostrada)
  if (aposta.gerou_freebet) {
    return null;
  }
  
  // Se usa freebet (contexto operacional FREEBET ou tipo_freebet definido)
  if (aposta.contexto_operacional === "FREEBET" || aposta.tipo_freebet) {
    return (
      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
        <Gift className="h-2.5 w-2.5 mr-0.5" />
        FB
      </Badge>
    );
  }
  
  return null;
}

// Badge de tipo operacional (BACK, LAY, BACK/LAY)
function getTipoOperacionalBadge(aposta: ApostaOperacionalFreebet) {
  const ladoAposta = aposta.lado_aposta?.toUpperCase();
  const mercado = aposta.mercado?.toUpperCase();
  
  // Verifica se é cobertura (BACK/LAY)
  if (mercado?.includes("COBERTURA") || ladoAposta === "COBERTURA") {
    return (
      <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 text-[10px] px-1.5 py-0">
        <Shield className="h-2.5 w-2.5 mr-0.5" />
        BACK/LAY
      </Badge>
    );
  }
  
  if (ladoAposta === "BACK") {
    return (
      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0">
        BACK
      </Badge>
    );
  }
  
  if (ladoAposta === "LAY") {
    return (
      <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 text-[10px] px-1.5 py-0">
        LAY
      </Badge>
    );
  }
  
  return null;
}

// Determina o operationType baseado nos dados da aposta
function getOperationType(aposta: ApostaOperacionalFreebet): "bookmaker" | "back" | "lay" | "cobertura" {
  const modoEntrada = aposta.lado_aposta?.toUpperCase();
  
  // Detectar Cobertura: tem lay_exchange + lay_odd
  if (aposta.lay_exchange && aposta.lay_odd) {
    return "cobertura";
  }
  
  // Exchange Back
  if (modoEntrada === "BACK" && aposta.back_em_exchange) {
    return "back";
  }
  
  // Exchange Lay
  if (modoEntrada === "LAY") {
    return "lay";
  }
  
  // Default: bookmaker tradicional
  return "bookmaker";
}

export function FreebetApostaCard({ 
  aposta, 
  projetoId,
  compact = false, 
  formatCurrency,
  onResultadoUpdated,
  onEditClick
}: FreebetApostaCardProps) {
  
  const operationType = getOperationType(aposta);
  const isMultipla = aposta.tipo === "multipla";
  
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
  
  // Compact mode - row style (igual ApostaCard list variant) - Responsivo
  if (compact) {
    return (
      <div 
        className="rounded-lg border cursor-pointer transition-colors p-3 hover:border-primary/30 overflow-hidden"
        onClick={() => onEditClick(aposta)}
      >
        {/* Layout Padronizado: 3 linhas igual ApostaCard */}
        <div className="flex flex-col gap-2">
          
          {/* LINHA 1: Evento + Badges - Responsivo */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate uppercase">{aposta.evento || 'Aposta'}</p>
              {aposta.esporte && (
                <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">• {aposta.esporte}</span>
              )}
            </div>
            
            {/* Badges - wrap on mobile */}
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {getEstrategiaBadge(aposta) || getContextoBadge(aposta)}
              {getTipoOperacionalBadge(aposta)}
              {isMultipla && (
                <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px] px-1.5 py-0 flex items-center gap-0.5">
                  <Layers className="h-2.5 w-2.5" />
                  MULT
                </Badge>
              )}
              {!isMultipla && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-400 bg-blue-500/20">
                  SIMPLES
                </Badge>
              )}
              <ResultadoPill
                apostaId={aposta.id}
                bookmarkerId={aposta.bookmaker_id}
                projetoId={projetoId}
                layExchangeBookmakerId={operationType === "cobertura" ? aposta.lay_exchange : undefined}
                resultado={aposta.resultado}
                status={aposta.status}
                stake={aposta.stake}
                odd={aposta.odd}
                operationType={operationType}
                layLiability={aposta.lay_liability || undefined}
                layOdd={aposta.lay_odd || undefined}
                layStake={aposta.lay_stake || undefined}
                layComissao={aposta.lay_comissao || undefined}
                gerouFreebet={aposta.gerou_freebet || false}
                valorFreebetGerada={aposta.valor_freebet_gerada || undefined}
                contextoOperacional={aposta.contexto_operacional}
                estrategia={aposta.estrategia}
                onResultadoUpdated={onResultadoUpdated}
                onEditClick={() => onEditClick(aposta)}
              />
            </div>
          </div>
          
          {/* LINHA 2: Badge Seleção + Logo + Casa + Odd + Stake - Responsivo */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 overflow-hidden">
            {/* Top row: Logo + Casa */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden">
              {/* Badge de seleção - hidden on small */}
              {aposta.selecao && !isMultipla && (
                <div className="hidden sm:block w-14 md:w-16 shrink-0">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary bg-primary/10 truncate max-w-full">
                    {aposta.selecao.length > 8 ? aposta.selecao.substring(0, 8) + '...' : aposta.selecao}
                  </Badge>
                </div>
              )}
              
              {/* Logo */}
              {aposta.logo_url ? (
                <img 
                  src={aposta.logo_url} 
                  alt={aposta.bookmaker_nome || ''} 
                  className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg object-contain logo-blend p-1 shrink-0"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                  <Target className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                </div>
              )}
              
              {/* Nome da casa + Vínculo abreviado */}
              <span className="text-xs sm:text-sm text-muted-foreground truncate flex-1 min-w-0 uppercase">
                {bookmakerDisplay || 'Casa'}
              </span>
            </div>
            
            {/* Mobile: Selection badge */}
            {aposta.selecao && !isMultipla && (
              <div className="sm:hidden">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary bg-primary/10 truncate max-w-[100px]">
                  {aposta.selecao.length > 12 ? aposta.selecao.substring(0, 12) + '...' : aposta.selecao}
                </Badge>
              </div>
            )}
            
            {/* Múltipla - exibe seleções inline */}
            {isMultipla && aposta.selecao && (
              <p className="text-xs text-muted-foreground truncate uppercase flex-1 hidden sm:block">
                {aposta.selecao}
              </p>
            )}
            
            {/* Odd + Stake à direita */}
            <div className="flex items-center gap-2 shrink-0 justify-end sm:justify-start">
              <span className="text-sm font-medium whitespace-nowrap">@{aposta.odd.toFixed(2)}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{formatCurrency(aposta.stake)}</span>
            </div>
          </div>
          
          {/* LINHA 3: Data/Hora + Lucro/ROI - Responsivo */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50 gap-2">
            <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-wrap">
              <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                {format(parseLocalDateTime(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
              </span>
              {aposta.gerou_freebet && aposta.valor_freebet_gerada && (
                <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px] px-1.5 py-0 flex items-center gap-0.5">
                  <Gift className="h-2.5 w-2.5" />
                  +{formatCurrency(aposta.valor_freebet_gerada)}
                </Badge>
              )}
            </div>
            
            {aposta.lucro_prejuizo !== null && aposta.status === "LIQUIDADA" && (
              <div className="flex items-center gap-1 shrink-0">
                <span className={cn("text-xs sm:text-sm font-semibold whitespace-nowrap", aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {formatCurrency(aposta.lucro_prejuizo)}
                </span>
                {aposta.stake > 0 && (
                  <span className={cn("text-[9px] sm:text-[10px] whitespace-nowrap", aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    ({aposta.lucro_prejuizo >= 0 ? '+' : ''}{((aposta.lucro_prejuizo / aposta.stake) * 100).toFixed(1)}%)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Card mode - identical layout to compact (list) for consistency - Responsivo
  return (
    <div 
      className="rounded-lg border cursor-pointer transition-colors p-3 hover:border-primary/30 overflow-hidden"
      onClick={() => onEditClick(aposta)}
    >
      {/* Layout Padronizado: 3 linhas igual ApostaCard */}
      <div className="flex flex-col gap-2">
        
        {/* LINHA 1: Evento + Badges - Responsivo */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate uppercase">{aposta.evento || 'Aposta'}</p>
            {aposta.esporte && (
              <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">• {aposta.esporte}</span>
            )}
          </div>
          
          {/* Badges - wrap on mobile */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            {getEstrategiaBadge(aposta) || getContextoBadge(aposta)}
            {getTipoOperacionalBadge(aposta)}
            {isMultipla && (
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px] px-1.5 py-0 flex items-center gap-0.5">
                <Layers className="h-2.5 w-2.5" />
                MULT
              </Badge>
            )}
            {!isMultipla && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-400 bg-blue-500/20">
                SIMPLES
              </Badge>
            )}
            <ResultadoPill
              apostaId={aposta.id}
              projetoId={projetoId}
              bookmarkerId={aposta.bookmaker_id}
              layExchangeBookmakerId={operationType === "cobertura" ? aposta.lay_exchange : undefined}
              resultado={aposta.resultado}
              status={aposta.status}
              stake={aposta.stake}
              odd={aposta.odd}
              operationType={operationType}
              layLiability={aposta.lay_liability || undefined}
              layOdd={aposta.lay_odd || undefined}
              layStake={aposta.lay_stake || undefined}
              layComissao={aposta.lay_comissao || undefined}
              gerouFreebet={aposta.gerou_freebet || false}
              contextoOperacional={aposta.contexto_operacional}
              estrategia={aposta.estrategia}
              onResultadoUpdated={onResultadoUpdated}
              onEditClick={() => onEditClick(aposta)}
            />
          </div>
        </div>
        
        {/* LINHA 2: Badge Seleção + Logo + Casa + Odd + Stake - Responsivo */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 overflow-hidden">
          {/* Top row: Logo + Casa */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden">
            {/* Badge de seleção - hidden on small */}
            {aposta.selecao && !isMultipla && (
              <div className="hidden sm:block w-14 md:w-16 shrink-0">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary bg-primary/10 truncate max-w-full">
                  {aposta.selecao.length > 8 ? aposta.selecao.substring(0, 8) + '...' : aposta.selecao}
                </Badge>
              </div>
            )}
            
            {/* Logo */}
            {aposta.logo_url ? (
              <img 
                src={aposta.logo_url} 
                alt={aposta.bookmaker_nome || ''} 
                className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg object-contain logo-blend p-1 shrink-0"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                <Target className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              </div>
            )}
            
            {/* Nome da casa + Vínculo abreviado */}
            <span className="text-xs sm:text-sm text-muted-foreground truncate flex-1 min-w-0 uppercase">
              {bookmakerDisplay || 'Casa'}
            </span>
          </div>
          
          {/* Mobile: Selection badge */}
          {aposta.selecao && !isMultipla && (
            <div className="sm:hidden">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary bg-primary/10 truncate max-w-[100px]">
                {aposta.selecao.length > 12 ? aposta.selecao.substring(0, 12) + '...' : aposta.selecao}
              </Badge>
            </div>
          )}
          
          {/* Múltipla - exibe seleções inline */}
          {isMultipla && aposta.selecao && (
            <p className="text-xs text-muted-foreground truncate uppercase flex-1 hidden sm:block">
              {aposta.selecao}
            </p>
          )}
          
          {/* Odd + Stake à direita */}
          <div className="flex items-center gap-2 shrink-0 justify-end sm:justify-start">
            <span className="text-sm font-medium whitespace-nowrap">@{aposta.odd.toFixed(2)}</span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">{formatCurrency(aposta.stake)}</span>
          </div>
        </div>
        
        {/* LINHA 3: Data/Hora + Lucro/ROI - Responsivo */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50 gap-2">
          <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-wrap">
            <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
              {format(parseLocalDateTime(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
            </span>
            {aposta.gerou_freebet && aposta.valor_freebet_gerada && (
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px] px-1.5 py-0 flex items-center gap-0.5">
                <Gift className="h-2.5 w-2.5" />
                +{formatCurrency(aposta.valor_freebet_gerada)}
              </Badge>
            )}
          </div>
          
          {aposta.lucro_prejuizo !== null && aposta.status === "LIQUIDADA" && (
            <div className="flex items-center gap-1 shrink-0">
              <span className={cn("text-xs sm:text-sm font-semibold whitespace-nowrap", aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {formatCurrency(aposta.lucro_prejuizo)}
              </span>
              {aposta.stake > 0 && (
                <span className={cn("text-[9px] sm:text-[10px] whitespace-nowrap", aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  ({aposta.lucro_prejuizo >= 0 ? '+' : ''}{((aposta.lucro_prejuizo / aposta.stake) * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
