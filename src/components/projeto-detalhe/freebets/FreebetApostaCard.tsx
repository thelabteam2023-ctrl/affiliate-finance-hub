import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gift, Target, TrendingUp, Shield, CheckCircle2, BarChart3 } from "lucide-react";
import { ApostaOperacionalFreebet } from "./types";
import { ResultadoPill } from "../ResultadoPill";

interface FreebetApostaCardProps {
  aposta: ApostaOperacionalFreebet;
  projetoId: string;
  compact?: boolean;
  formatCurrency: (value: number) => string;
  onResultadoUpdated: () => void;
  onEditClick: (aposta: ApostaOperacionalFreebet) => void;
}

// Parse local datetime without timezone conversion
function parseLocalDateTime(dateString: string): Date {
  if (!dateString) return new Date();
  const date = new Date(dateString);
  return date;
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
  
  // Compact mode - row style
  if (compact) {
    return (
      <div className="flex items-center gap-3 p-2 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate uppercase">{aposta.evento}</p>
          <p className="text-xs text-muted-foreground truncate">{aposta.selecao}</p>
        </div>
        
        {/* Valores */}
        <div className="text-right">
          <p className="text-sm font-semibold">@{aposta.odd.toFixed(2)}</p>
          <p className="text-xs text-amber-400">{formatCurrency(aposta.stake)}</p>
        </div>
        
        {/* P/L */}
        <div className="text-right min-w-[70px]">
          {aposta.status === "LIQUIDADA" && aposta.lucro_prejuizo !== null ? (
            <p className={`text-sm font-semibold ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCurrency(aposta.lucro_prejuizo)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">-</p>
          )}
        </div>
        
        {/* Badges + ResultadoPill */}
        <div className="flex items-center gap-1">
          {/* Badge de estratégia (prioridade) ou contexto (fallback) */}
          {getEstrategiaBadge(aposta) || getContextoBadge(aposta)}
          {/* Badge de tipo operacional */}
          {getTipoOperacionalBadge(aposta)}
          {/* Badge múltipla */}
          {aposta.tipo === "multipla" && (
            <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 text-[10px] px-1.5 py-0">
              MULT
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
    );
  }

  // Card mode - identical to Apostas Livres
  return (
    <Card className="hover:border-primary/50 transition-colors cursor-default">
      <CardHeader className="pb-1 pt-3 px-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm truncate uppercase">{aposta.evento}</CardTitle>
            <p className="text-xs text-muted-foreground truncate">
              {aposta.mercado || (aposta.tipo === "multipla" ? `${aposta.selecao.split(" + ").length} seleções` : "Aposta")}
            </p>
          </div>
          <div className="flex gap-1 flex-shrink-0 items-center">
            {/* Badge de estratégia (prioridade) ou contexto (fallback) */}
            {getEstrategiaBadge(aposta) || getContextoBadge(aposta)}
            {/* Badge de tipo operacional */}
            {getTipoOperacionalBadge(aposta)}
            {/* Badge de tipo múltipla */}
            {aposta.tipo === "multipla" && (
              <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 text-[10px] px-1.5 py-0">
                MULT
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
      </CardHeader>
      <CardContent className="pt-1 pb-3 px-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground truncate flex-1">{aposta.selecao}</span>
            <span className="font-medium ml-2">@{aposta.odd.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Stake</span>
            <span className="font-medium text-amber-400">{formatCurrency(aposta.stake)}</span>
          </div>
          {aposta.lucro_prejuizo !== null && aposta.status === "LIQUIDADA" && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">P/L</span>
              <span className={`font-medium ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(aposta.lucro_prejuizo)}
              </span>
            </div>
          )}
          {/* Gerou Freebet Info */}
          {aposta.gerou_freebet && aposta.valor_freebet_gerada && (
            <div className="flex items-center justify-between text-xs p-1.5 rounded bg-purple-500/10 border border-purple-500/20">
              <span className="text-purple-400 flex items-center gap-1">
                <Gift className="h-3 w-3" />
                Gerou Freebet
              </span>
              <span className="font-bold text-purple-400">
                {formatCurrency(aposta.valor_freebet_gerada)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
            <span className="text-muted-foreground">
              {format(parseLocalDateTime(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
            </span>
            <span className="text-muted-foreground truncate ml-2 max-w-[100px]">
              {aposta.bookmaker_nome}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}