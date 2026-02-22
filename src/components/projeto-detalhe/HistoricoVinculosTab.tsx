import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiSummaryBar } from "@/components/ui/kpi-summary-bar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  History,
  Building2,
  User,
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingUp,
  TrendingDown,
  Calendar,
  CheckCircle2,
  ShieldAlert,
  XCircle,
  Info,
  CircleDollarSign,
  DollarSign,
} from "lucide-react";
import { useCotacoes, CotacaoSourceInfo } from "@/hooks/useCotacoes";
import { formatCurrency as formatCurrencyUtil, getCurrencySymbol } from "@/utils/formatCurrency";

interface HistoricoVinculosTabProps {
  projetoId: string;
}

interface HistoricoVinculo {
  id: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  data_vinculacao: string;
  data_desvinculacao: string | null;
  status_final: string | null;
  moeda: string; // Moeda do bookmaker (BRL ou USD) - ÚNICO VALOR
  // Valores NA MOEDA ORIGINAL do bookmaker - SEM CONVERSÃO
  total_depositado: number;
  total_depositado_pendente: number; // NOVO: depósitos ainda não confirmados
  total_sacado: number;
  total_sacado_pendente: number; // NOVO: saques ainda não confirmados
  lucro_operacional: number;
}

// Agregação por moeda para KPIs multi-moeda
interface CurrencyAggregate {
  moeda: string;
  valor: number;
}

export function HistoricoVinculosTab({ projetoId }: HistoricoVinculosTabProps) {
  const [historico, setHistorico] = useState<HistoricoVinculo[]>([]);
  const [loading, setLoading] = useState(true);
  const { convertToBRL, loading: cotacaoLoading, cotacaoUSD, sources } = useCotacoes();

  useEffect(() => {
    fetchHistorico();
  }, [projetoId]);

  const fetchHistorico = async () => {
    try {
      setLoading(true);

      // Buscar histórico de vínculos COM moeda do bookmaker
      const { data: historicoData, error: historicoError } = await supabase
        .from("projeto_bookmaker_historico")
        .select("*, bookmaker:bookmaker_id(moeda)")
        .eq("projeto_id", projetoId)
        .order("data_vinculacao", { ascending: false });

      if (historicoError) throw historicoError;

      if (!historicoData || historicoData.length === 0) {
        setHistorico([]);
        return;
      }

      const bookmakerIds = historicoData.map((h) => h.bookmaker_id);

      // CORREÇÃO: Filtrar depósitos/saques pelo projeto usando projeto_id_snapshot
      // Depósitos - valor original, filtrado pelo projeto
      const { data: depositos } = await supabase
        .from("cash_ledger")
        .select("destino_bookmaker_id, valor, status, projeto_id_snapshot")
        .eq("tipo_transacao", "DEPOSITO")
        .in("status", ["CONFIRMADO", "PENDENTE", "LIQUIDADO"])
        .in("destino_bookmaker_id", bookmakerIds)
        .or(`projeto_id_snapshot.eq.${projetoId},projeto_id_snapshot.is.null`);

      // Saques - valor original, filtrado pelo projeto
      const { data: saques } = await supabase
        .from("cash_ledger")
        .select("origem_bookmaker_id, valor, status, projeto_id_snapshot")
        .eq("tipo_transacao", "SAQUE")
        .in("status", ["CONFIRMADO", "PENDENTE", "LIQUIDADO"])
        .in("origem_bookmaker_id", bookmakerIds)
        .or(`projeto_id_snapshot.eq.${projetoId},projeto_id_snapshot.is.null`);

      // Lucro de apostas - valor original (lucro_prejuizo)
      const { data: apostasData } = await supabase
        .from("apostas_unificada")
        .select("bookmaker_id, lucro_prejuizo")
        .eq("projeto_id", projetoId)
        .eq("status", "LIQUIDADA")
        .not("bookmaker_id", "is", null)
        .in("bookmaker_id", bookmakerIds);

      // Cashback por bookmaker - valor original
      const { data: cashbackData } = await supabase
        .from("cashback_manual")
        .select("bookmaker_id, valor")
        .eq("projeto_id", projetoId)
        .in("bookmaker_id", bookmakerIds);

      // Giros Grátis por bookmaker - valor do retorno (ganho líquido)
      const { data: girosData } = await supabase
        .from("giros_gratis")
        .select("bookmaker_id, valor_retorno")
        .eq("projeto_id", projetoId)
        .eq("status", "CONFIRMADO")
        .in("bookmaker_id", bookmakerIds);

      // Agregar por bookmaker - valores originais SEM conversão
      // Separar CONFIRMADO de PENDENTE para clareza
      const depositosConfirmadosMap: Record<string, number> = {};
      const depositosPendentesMap: Record<string, number> = {};
      const saquesConfirmadosMap: Record<string, number> = {};
      const saquesPendentesMap: Record<string, number> = {};
      const lucroApostasMap: Record<string, number> = {};
      const cashbackMap: Record<string, number> = {};
      const girosGratisMap: Record<string, number> = {};

      depositos?.forEach((d: any) => {
        if (d.status === "CONFIRMADO" || d.status === "LIQUIDADO") {
          depositosConfirmadosMap[d.destino_bookmaker_id] = (depositosConfirmadosMap[d.destino_bookmaker_id] || 0) + Number(d.valor);
        } else if (d.status === "PENDENTE") {
          depositosPendentesMap[d.destino_bookmaker_id] = (depositosPendentesMap[d.destino_bookmaker_id] || 0) + Number(d.valor);
        }
      });

      saques?.forEach((s: any) => {
        if (s.status === "CONFIRMADO" || s.status === "LIQUIDADO") {
          saquesConfirmadosMap[s.origem_bookmaker_id] = (saquesConfirmadosMap[s.origem_bookmaker_id] || 0) + Number(s.valor);
        } else if (s.status === "PENDENTE") {
          saquesPendentesMap[s.origem_bookmaker_id] = (saquesPendentesMap[s.origem_bookmaker_id] || 0) + Number(s.valor);
        }
      });

      apostasData?.forEach((a) => {
        if (a.bookmaker_id) {
          lucroApostasMap[a.bookmaker_id] = (lucroApostasMap[a.bookmaker_id] || 0) + Number(a.lucro_prejuizo || 0);
        }
      });

      cashbackData?.forEach((c) => {
        if (c.bookmaker_id) {
          cashbackMap[c.bookmaker_id] = (cashbackMap[c.bookmaker_id] || 0) + Number(c.valor || 0);
        }
      });

      girosData?.forEach((g) => {
        if (g.bookmaker_id) {
          girosGratisMap[g.bookmaker_id] = (girosGratisMap[g.bookmaker_id] || 0) + Number(g.valor_retorno || 0);
        }
      });

      // Montar histórico com moeda original - SEM CONVERSÃO
      // Lucro Operacional = Apostas + Cashback + Giros Grátis (todas as fontes de ganho)
      const mappedHistorico: HistoricoVinculo[] = historicoData.map((h: any) => {
        const lucroApostas = lucroApostasMap[h.bookmaker_id] || 0;
        const lucroCashback = cashbackMap[h.bookmaker_id] || 0;
        const lucroGiros = girosGratisMap[h.bookmaker_id] || 0;
        const lucroOperacionalTotal = lucroApostas + lucroCashback + lucroGiros;

        return {
          id: h.id,
          bookmaker_id: h.bookmaker_id,
          bookmaker_nome: h.bookmaker_nome,
          parceiro_id: h.parceiro_id,
          parceiro_nome: h.parceiro_nome,
          data_vinculacao: h.data_vinculacao,
          data_desvinculacao: h.data_desvinculacao,
          status_final: h.status_final,
          moeda: h.bookmaker?.moeda || 'BRL',
          total_depositado: depositosConfirmadosMap[h.bookmaker_id] || 0,
          total_depositado_pendente: depositosPendentesMap[h.bookmaker_id] || 0,
          total_sacado: saquesConfirmadosMap[h.bookmaker_id] || 0,
          total_sacado_pendente: saquesPendentesMap[h.bookmaker_id] || 0,
          lucro_operacional: lucroOperacionalTotal,
        };
      });

      setHistorico(mappedHistorico);
    } catch (error: any) {
      console.error("Erro ao carregar histórico:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number, moeda: string = 'BRL') => {
    return formatCurrencyUtil(value, moeda);
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd/MM/yyyy", { locale: ptBR });
  };

  // Renderiza valor simples na moeda original do bookmaker
  // Com suporte a valor pendente adicional
  const renderValueInCurrency = (
    value: number, 
    moeda: string, 
    label: string, 
    colorClass: string,
    pendingValue?: number
  ) => {
    const isForeign = moeda !== 'BRL';
    const hasPending = pendingValue !== undefined && pendingValue > 0;
    const totalValue = value + (pendingValue || 0);
    
    return (
      <div className="text-right flex-shrink-0 min-w-[100px]">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-medium ${hasPending ? "text-muted-foreground" : colorClass}`}>
          {formatCurrency(totalValue, moeda)}
        </p>
        {hasPending && (
          <p className="text-[10px] text-yellow-400">
            ({formatCurrency(pendingValue, moeda)} pendente)
          </p>
        )}
        {isForeign && !hasPending && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 mt-0.5 border-emerald-500/30 text-emerald-400">
            {moeda}
          </Badge>
        )}
      </div>
    );
  };

  const getStatusBadge = (status: string | null, isActive: boolean) => {
    if (isActive) {
      return (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Em Uso
        </Badge>
      );
    }

    switch (status?.toUpperCase()) {
      case "ATIVO":
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Devolvido Ativo
          </Badge>
        );
      case "LIMITADA":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            <ShieldAlert className="h-3 w-3 mr-1" />
            Devolvido Limitada
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
            <XCircle className="h-3 w-3 mr-1" />
            Devolvido
          </Badge>
        );
    }
  };

  // KPIs básicos
  const totalHistorico = historico.length;
  const vinculosDevolvidos = historico.filter((h) => h.data_desvinculacao !== null).length;
  const vinculosAtivos = historico.filter((h) => h.data_desvinculacao === null).length;

  // Obter todas as moedas únicas do histórico
  const moedasNoHistorico = [...new Set(historico.map((h) => h.moeda || "BRL"))].sort(
    (a, b) => (a === "BRL" ? -1 : b === "BRL" ? 1 : a.localeCompare(b))
  );

  // Agregar valores por moeda para exibição multi-moeda
  // MANTÉM todas as moedas do histórico mesmo com valor zero
  const aggregateByMoeda = (
    items: HistoricoVinculo[],
    getter: (item: HistoricoVinculo) => number
  ): CurrencyAggregate[] => {
    // Inicializar todas as moedas com zero
    const map: Record<string, number> = {};
    moedasNoHistorico.forEach((moeda) => {
      map[moeda] = 0;
    });
    // Somar valores
    items.forEach((item) => {
      const moeda = item.moeda || "BRL";
      map[moeda] = (map[moeda] || 0) + getter(item);
    });
    return Object.entries(map)
      .map(([moeda, valor]) => ({ moeda, valor }))
      .sort((a, b) => (a.moeda === "BRL" ? -1 : b.moeda === "BRL" ? 1 : 0));
  };

  // Agregações por moeda
  const depositosPorMoeda = aggregateByMoeda(historico, (h) => h.total_depositado);
  const saquesPorMoeda = aggregateByMoeda(historico, (h) => h.total_sacado);
  const lucroPorMoeda = aggregateByMoeda(historico, (h) => h.lucro_operacional);

  // Calcular totais consolidados em BRL
  const calcularTotalConsolidado = (agregados: CurrencyAggregate[]): number => {
    return agregados.reduce((acc, item) => {
      return acc + convertToBRL(item.valor, item.moeda);
    }, 0);
  };

  const depositoTotalBRL = calcularTotalConsolidado(depositosPorMoeda);
  const saqueTotalBRL = calcularTotalConsolidado(saquesPorMoeda);
  const lucroTotalBRL = calcularTotalConsolidado(lucroPorMoeda);

  // Verificar se há múltiplas moedas
  const hasMultipleCurrencies = (agregados: CurrencyAggregate[]): boolean => {
    return agregados.length > 1 || (agregados.length === 1 && agregados[0].moeda !== "BRL");
  };

  // Formatar badge de moeda
  const getMoedaIcon = (moeda: string) => {
    return moeda === "BRL" ? CircleDollarSign : DollarSign;
  };

  // Formatar valor para exibição simples
  const formatSimple = (valor: number, moeda: string) => {
    return formatCurrencyUtil(valor, moeda);
  };

  // Componente para renderizar badges por moeda com tooltip
  const renderCurrencyBadges = (
    agregados: CurrencyAggregate[],
    colorClass: string,
    showConsolidated: boolean = true
  ) => {
    const consolidado = calcularTotalConsolidado(agregados);
    const isMulti = hasMultipleCurrencies(agregados);

    // Se não há dados, mostrar zero em BRL
    if (agregados.length === 0) {
      return (
        <div className="flex flex-col items-center gap-1">
          <Badge variant="outline" className={`text-sm px-3 py-1 ${colorClass}`}>
            <CircleDollarSign className="h-3 w-3 mr-1" />
            R$ 0,00
          </Badge>
        </div>
      );
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col items-center gap-1 cursor-help">
              {/* Badges por moeda */}
              <div className="flex flex-wrap justify-center gap-1">
                {agregados.map((item) => {
                  const Icon = getMoedaIcon(item.moeda);
                  return (
                    <Badge
                      key={item.moeda}
                      variant="outline"
                      className={`text-sm px-3 py-1 ${colorClass}`}
                    >
                      <Icon className="h-3 w-3 mr-1" />
                      {formatSimple(item.valor, item.moeda)}
                    </Badge>
                  );
                })}
              </div>
              {/* Valor consolidado aproximado */}
              {showConsolidated && isMulti && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  ≈ R$ {consolidado.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="text-sm space-y-1">
              <p className="font-medium">Valores por moeda:</p>
              {agregados.map((item) => (
                <p key={item.moeda} className="flex justify-between gap-4">
                  <span>{item.moeda}:</span>
                  <span>{formatSimple(item.valor, item.moeda)}</span>
                </p>
              ))}
              {isMulti && (
                <>
                  <hr className="my-1 border-border" />
                  <p className="text-muted-foreground">
                    Consolidado via {sources.usd?.label || "cotação oficial"} (USD: R$ {cotacaoUSD.toFixed(4)}): ≈ R$ {consolidado.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  if (loading || cotacaoLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs - Faixa compacta */}
      <KpiSummaryBar
        items={[
          {
            label: "Total Histórico",
            value: totalHistorico,
            tooltip: (
              <div className="space-y-1.5">
                <p className="font-semibold text-foreground">Histórico de Vínculos</p>
                <div className="space-y-0.5">
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" /> Em uso</span>
                    <span className="font-semibold text-foreground">{vinculosAtivos}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground" /> Devolvidos</span>
                    <span className="font-semibold text-foreground">{vinculosDevolvidos}</span>
                  </div>
                </div>
                <div className="border-t border-border/50 pt-1 flex justify-between gap-4">
                  <span className="font-semibold">Total</span>
                  <span className="font-semibold text-foreground">{totalHistorico}</span>
                </div>
              </div>
            ),
            subtitle: (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-emerald-500">{vinculosAtivos} em uso</span>
                <span>·</span>
                <span>{vinculosDevolvidos} devolvidos</span>
              </div>
            ),
          },
          {
            label: "Total Depositado",
            value: renderCurrencyBadges(depositosPorMoeda, "border-blue-500/50 text-blue-400"),
            cursorHelp: true,
          },
          {
            label: "Total Sacado",
            value: renderCurrencyBadges(saquesPorMoeda, "border-emerald-500/50 text-emerald-400"),
            cursorHelp: true,
          },
          {
            label: lucroTotalBRL >= 0 ? "Lucro Acumulado" : "Prejuízo Acumulado",
            value: renderCurrencyBadges(
              lucroPorMoeda,
              lucroTotalBRL >= 0
                ? "border-emerald-500/50 text-emerald-400"
                : "border-red-500/50 text-red-400"
            ),
            cursorHelp: true,
          },
        ]}
      />

      {/* Lista de Histórico */}
      {historico.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <History className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhum histórico</h3>
              <p className="text-muted-foreground">
                O histórico de vínculos aparecerá aqui
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Timeline de Vínculos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Container scrollável com altura fixa - PADRÃO OBRIGATÓRIO */}
            <div className="relative">
              <ScrollArea className="h-[520px]">
                <div className="divide-y divide-border">
                  {historico.map((item) => {
                    const isActive = item.data_desvinculacao === null;
                    // Resultado de caixa considera total (confirmado + pendente) para visão completa
                    const totalDepositado = item.total_depositado + item.total_depositado_pendente;
                    const totalSacado = item.total_sacado + item.total_sacado_pendente;
                    const resultadoCaixa = totalSacado - totalDepositado;
                    const moeda = item.moeda;

                    return (
                      <div
                        key={item.id}
                        className={`p-4 ${isActive ? "bg-emerald-500/5" : ""}`}
                      >
                        <div className="flex items-center gap-4">
                          {/* Ícone */}
                          <div
                            className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isActive ? "bg-emerald-500/20" : "bg-muted"
                            }`}
                          >
                            <Building2
                              className={`h-5 w-5 ${
                                isActive ? "text-emerald-400" : "text-muted-foreground"
                              }`}
                            />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.bookmaker_nome}</span>
                              {getStatusBadge(item.status_final, isActive)}
                              {moeda !== 'BRL' && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-500/30 text-emerald-400">
                                  {moeda}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {item.parceiro_nome || "Sem parceiro"}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(item.data_vinculacao)}
                                {item.data_desvinculacao && (
                                  <> → {formatDate(item.data_desvinculacao)}</>
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Depósitos - valor na moeda ORIGINAL (com pendentes) */}
                          {renderValueInCurrency(
                            item.total_depositado,
                            moeda,
                            "Depositado",
                            "text-blue-400",
                            item.total_depositado_pendente
                          )}

                          {/* Saques - valor na moeda ORIGINAL (com pendentes) */}
                          {renderValueInCurrency(
                            item.total_sacado,
                            moeda,
                            "Sacado",
                            "text-emerald-400",
                            item.total_sacado_pendente
                          )}

                          {/* Resultado Caixa - valor na moeda ORIGINAL */}
                          {renderValueInCurrency(
                            resultadoCaixa,
                            moeda,
                            "Resultado Caixa",
                            resultadoCaixa >= 0 ? "text-emerald-400" : "text-red-400"
                          )}

                          {/* Lucro Operacional - valor na moeda ORIGINAL */}
                          {renderValueInCurrency(
                            item.lucro_operacional,
                            moeda,
                            "Lucro Operacional",
                            item.lucro_operacional >= 0 ? "text-emerald-400" : "text-red-400"
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              {/* Fade indicators para scroll */}
              <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-b from-background to-transparent pointer-events-none z-10" />
              <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-t from-background to-transparent pointer-events-none z-10" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}