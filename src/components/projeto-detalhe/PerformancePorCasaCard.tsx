import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Building2, Layers, Users, Info, TrendingUp } from "lucide-react";
import { CurrencyBreakdownTooltip, type CurrencyBreakdownItem } from "@/components/ui/currency-breakdown-tooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { aggregateBookmakerUsage } from "@/utils/bookmakerUsageAnalytics";

/**
 * VISÕES DE PERFORMANCE
 * 
 * 1. estrategia: Agrupa por ESTRATÉGIA/ABA de negócio (não por técnica)
 *    - Bônus, Surebet, Duplo Green, ValueBet, Apostas Livres
 *    - Cada aba representa uma estratégia distinta com objetivos e métricas próprias
 *    - "Arbitragem" é técnica operacional, não estratégia de negócio
 * 
 * 2. casa_consolidada: Agrupa por nome da casa, independente do parceiro
 *    - Todas as contas Bet365 viram uma linha "Bet365"
 *    - Foco: performance do bookmaker no projeto
 * 
 * 3. casa_parceiro: Cada conta é uma linha separada (casa + parceiro)
 *    - Bet365 (João) e Bet365 (Maria) são linhas distintas
 *    - Foco: auditoria detalhada por conta
 */

type PerformanceView = "estrategia" | "casa_consolidada" | "casa_parceiro";

// Mapeamento de estratégia técnica para nome exibido (Aba)
const ESTRATEGIA_LABELS: Record<string, string> = {
  "EXTRACAO_BONUS": "Bônus",
  "SUREBET": "Surebet",
  "DUPLO_GREEN": "Duplo Green",
  "VALUEBET": "ValueBet",
  "EXTRACAO_FREEBET": "Freebets",
  "PUNTER": "Todas Apostas",
  "NORMAL": "Todas Apostas",
};

interface ApostaUnificada {
  id: string;
  data_aposta: string;
  lucro_prejuizo: number | null;
  pl_consolidado?: number | null;
  resultado: string | null;
  stake: number;
  stake_total: number | null;
  /** Volume já consolidado na moeda do projeto (Cotação de Trabalho snapshot) */
  stake_consolidado?: number | null;
  consolidation_currency?: string | null;
  moeda_operacao?: string | null;
  esporte: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
  forma_registro: string | null;
  estrategia?: string | null;
  bonus_id?: string | null;
  pernas?: {
    bookmaker_id?: string;
    bookmaker_nome?: string;
    parceiro_nome?: string | null;
    logo_url?: string | null;
    stake?: number;
    lucro_prejuizo?: number | null;
    resultado?: string | null;
  }[];
}


interface PerformanceMetrics {
  key: string;
  nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
  totalOperacoes: number; // Número de operações/apostas/participações
  totalStake: number;
  lucro: number;
  greens: number;
  reds: number;
  voids: number;
  roi: number;
  /** Breakdown de lucro por moeda original (para tooltip multi-moeda) */
  lucroBreakdown?: Record<string, number>;
}

interface ExtraLucroEntry {
  data: string;
  valor: number;
  moeda?: string;
  tipo: string;
  bookmaker_id?: string;
  bookmaker_nome?: string;
}

interface PerformancePorCasaCardProps {
  apostasUnificadas: ApostaUnificada[];
  extrasLucro?: ExtraLucroEntry[];
  formatCurrency: (value: number) => string;
  getLogoUrl: (nome: string) => string | undefined;
  moedaConsolidacao?: string;
  /** Função de conversão para moeda de consolidação (usando cotação de trabalho) */
  convertToConsolidation?: (valor: number, moedaOrigem: string) => number;
}

const VIEW_LABELS: Record<PerformanceView, { label: string; tooltip: string }> = {
  estrategia: {
    label: "Estratégia",
    tooltip: "Performance por aba de negócio (Bônus, Surebet, ValueBet, etc). Cada estratégia tem métricas e objetivos distintos.",
  },
  casa_consolidada: {
    label: "Casa",
    tooltip: "Performance por bookmaker, agregando todas as contas/parceiros da mesma casa.",
  },
  casa_parceiro: {
    label: "Casa + Parceiro",
    tooltip: "Visão detalhada por conta específica. Resultados individuais podem não representar o lucro final de operações compostas.",
  },
};

// Mapeamento de tipos de extras para nome exibido
const EXTRAS_LABELS: Record<string, string> = {
  "cashback": "Cashback",
  "giro_gratis": "Giros Grátis",
  "freebet": "Freebets",
  "bonus": "Bônus Creditados",
  "promocional": "Promoções",
  "ajuste_saldo": "Ajustes de Saldo",
  "resultado_cambial": "Resultado Cambial",
  "conciliacao": "Conciliações",
};

export function PerformancePorCasaCard({
  apostasUnificadas,
  extrasLucro = [],
  formatCurrency,
  getLogoUrl,
  moedaConsolidacao = "BRL",
  convertToConsolidation,
}: PerformancePorCasaCardProps) {
  const [view, setView] = useState<PerformanceView>("estrategia");

  /**
   * VISÃO ESTRATÉGIA - Agrupa por Estratégia/Aba de Negócio
   * - Bônus, Surebet, Duplo Green, ValueBet, Apostas Livres
   * - NÃO agrupa por técnica (Arbitragem é técnica, não estratégia)
   * - Cada aba tem objetivos e métricas distintas
   */
  const estrategiaMetrics = useMemo(() => {
    const estrategiaMap: Record<string, PerformanceMetrics> = {};

    // 1. Processar apostas unificadas
    apostasUnificadas.forEach((aposta) => {
      // Determina a estratégia de negócio (aba) com base no campo estrategia
      const estrategiaCodigo = aposta.estrategia || "PUNTER";
      const estrategiaNome = ESTRATEGIA_LABELS[estrategiaCodigo] || "Todas Apostas";

      if (!estrategiaMap[estrategiaNome]) {
        estrategiaMap[estrategiaNome] = {
          key: estrategiaNome,
          nome: estrategiaNome,
          parceiro_nome: null,
          logo_url: null,
          totalOperacoes: 0,
          totalStake: 0,
          lucro: 0,
          greens: 0,
          reds: 0,
          voids: 0,
          roi: 0,
        };
      }

      estrategiaMap[estrategiaNome].totalOperacoes++;
      
      // CANÔNICO: Volume usa stake_consolidado (snapshot Cotação de Trabalho) quando disponível
      // Fallback: converte stake_total/stake da moeda_operacao para moeda de consolidação
      // Última opção: valor bruto sem conversão (mesma moeda)
      const stakeRaw = aposta.stake_total || aposta.stake || 0;
      const moedaOp = aposta.moeda_operacao || moedaConsolidacao;
      let stakeOperacao: number;
      if (aposta.stake_consolidado != null && aposta.consolidation_currency === moedaConsolidacao) {
        stakeOperacao = aposta.stake_consolidado;
      } else if (moedaOp !== moedaConsolidacao && convertToConsolidation && stakeRaw !== 0) {
        stakeOperacao = convertToConsolidation(stakeRaw, moedaOp);
      } else {
        stakeOperacao = stakeRaw;
      }
      
      estrategiaMap[estrategiaNome].totalStake += stakeOperacao || 0;
      // Usa pl_consolidado se disponível, senão lucro_prejuizo
      estrategiaMap[estrategiaNome].lucro += (aposta.pl_consolidado ?? aposta.lucro_prejuizo) || 0;

      if (aposta.resultado === "GREEN" || aposta.resultado === "MEIO_GREEN") {
        estrategiaMap[estrategiaNome].greens++;
      }
      if (aposta.resultado === "RED" || aposta.resultado === "MEIO_RED") {
        estrategiaMap[estrategiaNome].reds++;
      }
      if (aposta.resultado === "VOID" || aposta.resultado === "REEMBOLSO") {
        estrategiaMap[estrategiaNome].voids++;
      }
    });

    // 2. Processar extras (cashback, giros grátis, freebets, bônus, promoções)
    // Esses lucros não têm stake associado, então aparecem como linhas separadas
    extrasLucro.forEach((extra) => {
      const tipoNome = EXTRAS_LABELS[extra.tipo] || "Outros";
      
      if (!estrategiaMap[tipoNome]) {
        estrategiaMap[tipoNome] = {
          key: tipoNome,
          nome: tipoNome,
          parceiro_nome: null,
          logo_url: null,
          totalOperacoes: 0,
          totalStake: 0,
          lucro: 0,
          greens: 0,
          reds: 0,
          voids: 0,
          roi: 0,
          lucroBreakdown: {},
        };
      }

      estrategiaMap[tipoNome].totalOperacoes++;
      // CRÍTICO: Converter valor para moeda de consolidação
      const moedaExtra = extra.moeda || "BRL";
      let valorConvertido = extra.valor || 0;
      if (moedaExtra !== moedaConsolidacao && convertToConsolidation && valorConvertido !== 0) {
        valorConvertido = convertToConsolidation(valorConvertido, moedaExtra);
      }
      estrategiaMap[tipoNome].lucro += valorConvertido;
      
      // Rastrear breakdown por moeda original
      const moedaOriginal = extra.moeda || "BRL";
      if (!estrategiaMap[tipoNome].lucroBreakdown) {
        estrategiaMap[tipoNome].lucroBreakdown = {};
      }
      estrategiaMap[tipoNome].lucroBreakdown![moedaOriginal] = 
        (estrategiaMap[tipoNome].lucroBreakdown![moedaOriginal] || 0) + (extra.valor || 0);
      
      // Extras NÃO são apostas — não contam como greens/reds
      // totalOperacoes conta as entradas, mas greens/reds ficam em 0
    });

    return Object.values(estrategiaMap)
      .map((m) => ({ ...m, roi: m.totalStake > 0 ? (m.lucro / m.totalStake) * 100 : 0 }))
      .sort((a, b) => b.totalOperacoes - a.totalOperacoes);
  }, [apostasUnificadas, extrasLucro, moedaConsolidacao, convertToConsolidation]);

  /**
   * VISÃO CASA CONSOLIDADA - Agrupa por nome da casa, independente do parceiro
   * - Arbitragem: cada perna é distribuída para sua respectiva casa
   * - Apostas simples: contadas normalmente
   */
  const casaConsolidadaMetrics = useMemo(() => {
    return aggregateBookmakerUsage(apostasUnificadas, {
      moedaConsolidacao,
      convertToConsolidation,
      resolveLogo: getLogoUrl,
    })
      .map((m) => ({
        key: m.casa,
        nome: m.casa,
        parceiro_nome: null,
        logo_url: m.logo_url || null,
        totalOperacoes: m.apostas,
        totalStake: m.volume,
        lucro: m.lucro,
        greens: m.greens || 0,
        reds: m.reds || 0,
        voids: m.voids || 0,
        roi: m.roi,
      }))
      .sort((a, b) => b.totalOperacoes - a.totalOperacoes);
  }, [apostasUnificadas, moedaConsolidacao, convertToConsolidation, getLogoUrl]);

  /**
   * VISÃO CASA + PARCEIRO - Cada conta é uma linha separada
   * - Chave única: bookmaker_id (que já representa casa + conta específica)
   * - Arbitragem: cada perna é distribuída para sua respectiva conta
   */
  const casaParceiroMetrics = useMemo(() => {
    return aggregateBookmakerUsage(apostasUnificadas, {
      moedaConsolidacao,
      convertToConsolidation,
      resolveLogo: getLogoUrl,
    })
      .flatMap((casa) => casa.vinculos.map((vinculo) => ({
        key: `${casa.casa}:${vinculo.vinculo}`,
        nome: casa.casa,
        parceiro_nome: vinculo.vinculo === "Principal" ? null : vinculo.vinculo,
        logo_url: casa.logo_url || null,
        totalOperacoes: vinculo.apostas,
        totalStake: vinculo.volume,
        lucro: vinculo.lucro,
        greens: 0,
        reds: 0,
        voids: 0,
        roi: vinculo.roi,
      })))
      .sort((a, b) => b.totalOperacoes - a.totalOperacoes);
  }, [apostasUnificadas, moedaConsolidacao, convertToConsolidation, getLogoUrl]);

  // Selecionar métricas baseado na visão atual
  const displayMetrics = useMemo(() => {
    switch (view) {
      case "estrategia":
        return estrategiaMetrics;
      case "casa_consolidada":
        return casaConsolidadaMetrics;
      case "casa_parceiro":
        return casaParceiroMetrics;
      default:
        return estrategiaMetrics;
    }
  }, [view, estrategiaMetrics, casaConsolidadaMetrics, casaParceiroMetrics]);

  // Labels dinâmicos para header
  const headerLabels = useMemo(() => {
    switch (view) {
      case "estrategia":
        return { col1: "Estratégia", count: "Operações" };
      case "casa_consolidada":
        return { col1: "Casa", count: "Participações" };
      case "casa_parceiro":
        return { col1: "Conta", count: "Participações" };
      default:
        return { col1: "Estratégia", count: "Operações" };
    }
  }, [view]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            <CardTitle>Performance</CardTitle>
          </div>
          
          <div className="flex items-center gap-2 overflow-hidden">
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => v && setView(v as PerformanceView)}
              className="grid w-full grid-cols-3 bg-muted/30 p-0.5 rounded-lg sm:flex sm:w-auto"
            >
              {(Object.keys(VIEW_LABELS) as PerformanceView[]).map((v) => (
                <TooltipProvider key={v} delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem
                        value={v}
                        className="min-w-0 px-1.5 py-1.5 text-[11px] sm:text-xs sm:px-3 data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-md transition-all"
                      >
                        {v === "estrategia" && <Layers className="h-3.5 w-3.5 shrink-0 sm:mr-1.5" />}
                        {v === "casa_consolidada" && <Building2 className="h-3.5 w-3.5 shrink-0 sm:mr-1.5" />}
                        {v === "casa_parceiro" && <Users className="h-3.5 w-3.5 shrink-0 sm:mr-1.5" />}
                        <span className="truncate">{VIEW_LABELS[v].label}</span>
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[260px]">
                      <p className="text-xs">{VIEW_LABELS[v].tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </ToggleGroup>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <ScrollArea className="h-[280px]">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-5 gap-2 px-6 pb-2 text-xs text-muted-foreground font-medium border-b border-border/50">
            <div className="col-span-1">{headerLabels.col1}</div>
            <div className="text-right">{headerLabels.count}</div>
            <div className="text-right">Volume</div>
            <div className="text-right">Lucro</div>
            <div className="text-right">ROI</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-border/30">
            {displayMetrics.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                Nenhum dado disponível
              </div>
            ) : (
              displayMetrics.map((item) => {
                // Tentar buscar logo do catálogo global (apenas para visões de casa)
                const logoFromCatalog = view !== "estrategia" ? getLogoUrl(item.nome) : undefined;
                const displayLogo = item.logo_url || logoFromCatalog;

                return (
                  <div
                    key={item.key}
                    className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-2 px-4 sm:px-6 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="col-span-2 sm:col-span-1 flex items-center gap-2 min-w-0">
                      {view !== "estrategia" && displayLogo ? (
                        <img
                          src={displayLogo}
                          alt={item.nome}
                          className="w-6 h-6 rounded object-contain bg-muted/50 p-0.5 flex-shrink-0"
                        />
                      ) : view !== "estrategia" ? (
                        <div className="w-6 h-6 rounded bg-muted/50 flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Layers className="h-3 w-3 text-primary" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{item.nome}</p>
                        {item.parceiro_nome && view === "casa_parceiro" && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {item.parceiro_nome}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-[10px] text-muted-foreground sm:hidden">{headerLabels.count}</p>
                      <p className="text-sm font-mono">{item.totalOperacoes}</p>
                      <p className="text-xs text-muted-foreground">
                        {(item.greens > 0 || item.reds > 0 || item.voids > 0) 
                          ? `${item.greens}G / ${item.reds}R${item.voids > 0 ? ` / ${item.voids}V` : ''}` 
                          : '–'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground sm:hidden">Volume</p>
                      <p className="text-sm font-mono">{item.totalStake > 0 ? formatCurrency(item.totalStake) : '–'}</p>
                    </div>
                    <div className="text-left sm:text-right flex flex-col sm:flex-row sm:items-center sm:justify-end gap-1">
                      <p className="text-[10px] text-muted-foreground sm:hidden">Lucro</p>
                      <p
                        className={`text-sm font-mono font-medium ${
                          item.lucro >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {formatCurrency(item.lucro)}
                      </p>
                      {item.lucroBreakdown && Object.keys(item.lucroBreakdown).length > 0 && (
                        <CurrencyBreakdownTooltip
                          breakdown={Object.entries(item.lucroBreakdown).map(([moeda, valor]) => ({ moeda, valor }))}
                          moedaConsolidacao={moedaConsolidacao}
                        />
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground sm:hidden">ROI</p>
                      <p
                        className={`text-sm font-mono font-medium ${
                          item.roi >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {item.roi.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Aviso contextual para visão Casa + Parceiro */}
        {view === "casa_parceiro" && (
          <div className="px-6 py-2 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Info className="h-3 w-3" />
              <span>
                Em operações compostas (Surebet/Arbitragem), os resultados individuais podem parecer 
                extremos (+100%/-100%), mas o resultado real é consolidado na operação.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
