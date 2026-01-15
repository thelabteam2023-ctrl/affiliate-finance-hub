import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Building2, Layers, Users, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * VISÕES DE PERFORMANCE
 * 
 * 1. operacao: Agrupa por operação - cada aposta/arbitragem conta como 1 operação
 *    - Arbitragem = 1 operação com lucro consolidado
 *    - Foco: resultado real das estratégias
 * 
 * 2. casa_consolidada: Agrupa por nome da casa, independente do parceiro
 *    - Todas as contas Bet365 viram uma linha "Bet365"
 *    - Foco: performance do bookmaker no projeto
 * 
 * 3. casa_parceiro: Cada conta é uma linha separada (casa + parceiro)
 *    - Bet365 (João) e Bet365 (Maria) são linhas distintas
 *    - Foco: auditoria detalhada por conta
 */

type PerformanceView = "operacao" | "casa_consolidada" | "casa_parceiro";

interface ApostaUnificada {
  id: string;
  data_aposta: string;
  lucro_prejuizo: number | null;
  resultado: string | null;
  stake: number;
  stake_total: number | null;
  esporte: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
  forma_registro: string | null;
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
  roi: number;
}

interface PerformancePorCasaCardProps {
  apostasUnificadas: ApostaUnificada[];
  formatCurrency: (value: number) => string;
  getLogoUrl: (nome: string) => string | undefined;
}

const VIEW_LABELS: Record<PerformanceView, { label: string; tooltip: string }> = {
  operacao: {
    label: "Operação",
    tooltip: "Resultado consolidado por operação. Surebets/Arbitragem contam como 1 operação única.",
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

export function PerformancePorCasaCard({
  apostasUnificadas,
  formatCurrency,
  getLogoUrl,
}: PerformancePorCasaCardProps) {
  const [view, setView] = useState<PerformanceView>("operacao");

  /**
   * VISÃO OPERAÇÃO - Resultado consolidado por operação
   * - Apostas simples: 1 operação por aposta
   * - Arbitragem: 1 operação com stake_total e lucro consolidado
   */
  const operacaoMetrics = useMemo(() => {
    const estrategiaMap: Record<string, PerformanceMetrics> = {};

    apostasUnificadas.forEach((aposta) => {
      // Determina o tipo de estratégia
      const estrategia = aposta.forma_registro === "ARBITRAGEM" 
        ? "Arbitragem" 
        : aposta.esporte || "Outros";

      if (!estrategiaMap[estrategia]) {
        estrategiaMap[estrategia] = {
          key: estrategia,
          nome: estrategia,
          parceiro_nome: null,
          logo_url: null,
          totalOperacoes: 0,
          totalStake: 0,
          lucro: 0,
          greens: 0,
          reds: 0,
          roi: 0,
        };
      }

      estrategiaMap[estrategia].totalOperacoes++;
      
      // Para arbitragem, usa stake_total; para simples, usa stake
      const stakeOperacao = aposta.forma_registro === "ARBITRAGEM" 
        ? (aposta.stake_total || aposta.stake) 
        : aposta.stake;
      
      estrategiaMap[estrategia].totalStake += stakeOperacao || 0;
      estrategiaMap[estrategia].lucro += aposta.lucro_prejuizo || 0;

      if (aposta.resultado === "GREEN" || aposta.resultado === "MEIO_GREEN") {
        estrategiaMap[estrategia].greens++;
      }
      if (aposta.resultado === "RED" || aposta.resultado === "MEIO_RED") {
        estrategiaMap[estrategia].reds++;
      }
    });

    return Object.values(estrategiaMap)
      .map((m) => ({ ...m, roi: m.totalStake > 0 ? (m.lucro / m.totalStake) * 100 : 0 }))
      .sort((a, b) => b.totalOperacoes - a.totalOperacoes);
  }, [apostasUnificadas]);

  /**
   * VISÃO CASA CONSOLIDADA - Agrupa por nome da casa, independente do parceiro
   * - Arbitragem: cada perna é distribuída para sua respectiva casa
   * - Apostas simples: contadas normalmente
   */
  const casaConsolidadaMetrics = useMemo(() => {
    const casaMap: Record<string, PerformanceMetrics> = {};

    const addToCasa = (
      bookmakerNome: string,
      logoUrl: string | null,
      stake: number,
      lucroPrejuizo: number,
      resultado: string | null
    ) => {
      const key = bookmakerNome;

      if (!casaMap[key]) {
        casaMap[key] = {
          key,
          nome: bookmakerNome,
          parceiro_nome: null, // Não exibe parceiro nesta visão
          logo_url: logoUrl,
          totalOperacoes: 0,
          totalStake: 0,
          lucro: 0,
          greens: 0,
          reds: 0,
          roi: 0,
        };
      }

      casaMap[key].totalOperacoes++;
      casaMap[key].totalStake += stake || 0;
      casaMap[key].lucro += lucroPrejuizo || 0;

      if (resultado === "GREEN" || resultado === "MEIO_GREEN") {
        casaMap[key].greens++;
      }
      if (resultado === "RED" || resultado === "MEIO_RED") {
        casaMap[key].reds++;
      }
    };

    apostasUnificadas.forEach((aposta) => {
      if (aposta.forma_registro === "ARBITRAGEM" && aposta.pernas && aposta.pernas.length > 0) {
        // Arbitragem: desagregar pernas
        aposta.pernas.forEach((perna) => {
          addToCasa(
            perna.bookmaker_nome || "Desconhecida",
            perna.logo_url || null,
            perna.stake || 0,
            perna.lucro_prejuizo || 0,
            perna.resultado || null
          );
        });
      } else {
        // Aposta simples/múltipla
        addToCasa(
          aposta.bookmaker_nome,
          aposta.logo_url,
          aposta.stake || 0,
          aposta.lucro_prejuizo || 0,
          aposta.resultado
        );
      }
    });

    return Object.values(casaMap)
      .map((m) => ({ ...m, roi: m.totalStake > 0 ? (m.lucro / m.totalStake) * 100 : 0 }))
      .sort((a, b) => b.totalOperacoes - a.totalOperacoes);
  }, [apostasUnificadas]);

  /**
   * VISÃO CASA + PARCEIRO - Cada conta é uma linha separada
   * - Chave única: bookmaker_id (que já representa casa + conta específica)
   * - Arbitragem: cada perna é distribuída para sua respectiva conta
   */
  const casaParceiroMetrics = useMemo(() => {
    const contaMap: Record<string, PerformanceMetrics> = {};

    const addToConta = (
      bookmakerId: string,
      bookmakerNome: string,
      parceiroNome: string | null,
      logoUrl: string | null,
      stake: number,
      lucroPrejuizo: number,
      resultado: string | null
    ) => {
      const key = bookmakerId;

      if (!contaMap[key]) {
        contaMap[key] = {
          key,
          nome: bookmakerNome,
          parceiro_nome: parceiroNome,
          logo_url: logoUrl,
          totalOperacoes: 0,
          totalStake: 0,
          lucro: 0,
          greens: 0,
          reds: 0,
          roi: 0,
        };
      }

      contaMap[key].totalOperacoes++;
      contaMap[key].totalStake += stake || 0;
      contaMap[key].lucro += lucroPrejuizo || 0;

      if (resultado === "GREEN" || resultado === "MEIO_GREEN") {
        contaMap[key].greens++;
      }
      if (resultado === "RED" || resultado === "MEIO_RED") {
        contaMap[key].reds++;
      }
    };

    apostasUnificadas.forEach((aposta) => {
      if (aposta.forma_registro === "ARBITRAGEM" && aposta.pernas && aposta.pernas.length > 0) {
        // Arbitragem: desagregar pernas
        aposta.pernas.forEach((perna) => {
          addToConta(
            perna.bookmaker_id || "unknown",
            perna.bookmaker_nome || "Desconhecida",
            perna.parceiro_nome || null,
            perna.logo_url || null,
            perna.stake || 0,
            perna.lucro_prejuizo || 0,
            perna.resultado || null
          );
        });
      } else {
        // Aposta simples/múltipla
        addToConta(
          aposta.bookmaker_id,
          aposta.bookmaker_nome,
          aposta.parceiro_nome,
          aposta.logo_url,
          aposta.stake || 0,
          aposta.lucro_prejuizo || 0,
          aposta.resultado
        );
      }
    });

    return Object.values(contaMap)
      .map((m) => ({ ...m, roi: m.totalStake > 0 ? (m.lucro / m.totalStake) * 100 : 0 }))
      .sort((a, b) => b.totalOperacoes - a.totalOperacoes);
  }, [apostasUnificadas]);

  // Selecionar métricas baseado na visão atual
  const displayMetrics = useMemo(() => {
    switch (view) {
      case "operacao":
        return operacaoMetrics;
      case "casa_consolidada":
        return casaConsolidadaMetrics;
      case "casa_parceiro":
        return casaParceiroMetrics;
      default:
        return operacaoMetrics;
    }
  }, [view, operacaoMetrics, casaConsolidadaMetrics, casaParceiroMetrics]);

  // Labels dinâmicos para header
  const headerLabels = useMemo(() => {
    switch (view) {
      case "operacao":
        return { col1: "Estratégia", count: "Operações" };
      case "casa_consolidada":
        return { col1: "Casa", count: "Participações" };
      case "casa_parceiro":
        return { col1: "Conta", count: "Participações" };
      default:
        return { col1: "Casa", count: "Apostas" };
    }
  }, [view]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <CardTitle>Performance por Casa</CardTitle>
          </div>
          
          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => v && setView(v as PerformanceView)}
              className="bg-muted/30 p-0.5 rounded-lg"
            >
              {(Object.keys(VIEW_LABELS) as PerformanceView[]).map((v) => (
                <TooltipProvider key={v} delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem
                        value={v}
                        className="text-xs px-3 py-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-md transition-all"
                      >
                        {v === "operacao" && <Layers className="h-3.5 w-3.5 mr-1.5" />}
                        {v === "casa_consolidada" && <Building2 className="h-3.5 w-3.5 mr-1.5" />}
                        {v === "casa_parceiro" && <Users className="h-3.5 w-3.5 mr-1.5" />}
                        {VIEW_LABELS[v].label}
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
          <div className="grid grid-cols-5 gap-2 px-6 pb-2 text-xs text-muted-foreground font-medium border-b border-border/50">
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
                // Tentar buscar logo do catálogo global
                const logoFromCatalog = view !== "operacao" ? getLogoUrl(item.nome) : undefined;
                const displayLogo = item.logo_url || logoFromCatalog;

                return (
                  <div
                    key={item.key}
                    className="grid grid-cols-5 gap-2 px-6 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="col-span-1 flex items-center gap-2">
                      {view !== "operacao" && displayLogo ? (
                        <img
                          src={displayLogo}
                          alt={item.nome}
                          className="w-6 h-6 rounded object-contain bg-muted/50 p-0.5 flex-shrink-0"
                        />
                      ) : view !== "operacao" ? (
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
                    <div className="text-right">
                      <p className="text-sm font-mono">{item.totalOperacoes}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.greens}G / {item.reds}R
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono">{formatCurrency(item.totalStake)}</p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-mono font-medium ${
                          item.lucro >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {formatCurrency(item.lucro)}
                      </p>
                    </div>
                    <div className="text-right">
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
