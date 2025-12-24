import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Gift, Target, TrendingUp, Shield, CheckCircle2, BarChart3 } from "lucide-react";
import { ApostaOperacionalFreebet } from "./types";
import { ResultadoPill } from "../ResultadoPill";

interface FreebetApostasListProps {
  apostas: ApostaOperacionalFreebet[];
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

export function FreebetApostasList({ 
  apostas, 
  formatCurrency,
  onResultadoUpdated,
  onEditClick
}: FreebetApostasListProps) {
  if (apostas.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-muted/5">
        <Target className="mx-auto h-10 w-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">Nenhuma aposta encontrada</p>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Tipo</th>
                <th className="text-left p-3 font-medium">Evento</th>
                <th className="text-left p-3 font-medium">Seleção</th>
                <th className="text-right p-3 font-medium">Odd</th>
                <th className="text-right p-3 font-medium">Stake</th>
                <th className="text-right p-3 font-medium">P/L</th>
                <th className="text-left p-3 font-medium">Casa</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {apostas.map((aposta) => {
                const operationType = getOperationType(aposta);
                
                return (
                  <tr 
                    key={aposta.id} 
                    className="border-b hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-1 flex-wrap">
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
                      </div>
                    </td>
                    <td className="p-3 max-w-[200px] truncate uppercase" title={aposta.evento}>
                      {aposta.evento}
                    </td>
                    <td className="p-3 max-w-[150px] truncate" title={aposta.selecao}>
                      {aposta.selecao}
                    </td>
                    <td className="p-3 text-right font-medium">
                      @{aposta.odd.toFixed(2)}
                    </td>
                    <td className="p-3 text-right text-amber-400 font-medium">
                      {formatCurrency(aposta.stake)}
                    </td>
                    <td className="p-3 text-right">
                      {aposta.status === "LIQUIDADA" && aposta.lucro_prejuizo !== null ? (
                        <span className={`font-medium ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCurrency(aposta.lucro_prejuizo)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3 max-w-[120px] truncate" title={aposta.bookmaker_nome}>
                      {aposta.bookmaker_nome}
                    </td>
                    <td className="p-3 text-center">
                      <ResultadoPill
                        apostaId={aposta.id}
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
                        valorFreebetGerada={aposta.valor_freebet_gerada || undefined}
                        onResultadoUpdated={onResultadoUpdated}
                        onEditClick={() => onEditClick(aposta)}
                      />
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {format(parseLocalDateTime(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}