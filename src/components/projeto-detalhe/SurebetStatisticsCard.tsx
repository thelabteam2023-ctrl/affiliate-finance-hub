import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { extractLocalDateKey } from "@/utils/dateUtils";
import { KPIStatCell } from "@/components/kpis/KPIStatCell";
import { KPISectionHeader } from "@/components/kpis/KPISectionHeader";
import { aggregateBookmakerUsage } from "@/utils/bookmakerUsageAnalytics";

interface SurebetPerna {
  id?: string;
  selecao: string;
  odd: number;
  stake: number;
  resultado?: string | null;
  bookmaker_nome: string;
  bookmaker_id?: string;
  entries?: Array<{
    bookmaker_id?: string;
    bookmaker_nome: string;
    stake: number;
    odd: number;
    moeda?: string;
    resultado?: string | null;
  }>;
}

interface Surebet {
  id: string;
  data_operacao: string;
  evento: string;
  esporte: string;
  modelo: string;
  mercado?: string | null;
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

interface SurebetStatisticsCardProps {
  surebets: Surebet[];
  /** Função de formatação obrigatória - deve vir do useProjetoCurrency */
  formatCurrency: (value: number) => string;
  /** Símbolo da moeda do projeto (ex: "$", "R$") */
  currencySymbol: string;
}

interface RankingItem {
  label: string;
  value: string;
  valueClass?: string;
}

const RankingTooltip = ({ 
  title, 
  items 
}: { 
  title: string; 
  items: RankingItem[];
}) => (
  <div className="space-y-2 py-1">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/30 pb-1.5">
      {title}
    </div>
    <div className="space-y-1">
      {items.map((item, index) => (
        <div key={index} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-muted text-[9px] font-bold">
              {index + 1}
            </span>
            <span className="text-xs font-medium">{item.label}</span>
          </div>
          <span className={`text-xs font-semibold tabular-nums ${item.valueClass || ''}`}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  </div>
);

export function SurebetStatisticsCard({ surebets, formatCurrency, currencySymbol }: SurebetStatisticsCardProps) {

  const stats = useMemo(() => {
    // Operações resolvidas (não pendentes)
    const resolvidas = surebets.filter(s => 
      s.resultado && 
      s.resultado !== "PENDENTE" && 
      s.status !== "PENDENTE"
    );

    // === 1. MÉTRICAS DE ROI ===
    const getStakeValue = (s: Surebet) => s.stake_total || 0;
    
    const lucroTotalResolvidas = resolvidas.reduce((acc, s) => acc + (s.lucro_real || 0), 0);
    const stakeTotalResolvidas = resolvidas.reduce((acc, s) => acc + getStakeValue(s), 0);
    const roiMedioPorOperacao = stakeTotalResolvidas > 0 
      ? (lucroTotalResolvidas / stakeTotalResolvidas) * 100 
      : 0;

    // ROI médio mensal
    const lucroMensal = new Map<string, { lucro: number; stake: number }>();
    resolvidas.forEach(s => {
      const mes = s.data_operacao.slice(0, 7);
      if (!lucroMensal.has(mes)) {
        lucroMensal.set(mes, { lucro: 0, stake: 0 });
      }
      const entry = lucroMensal.get(mes)!;
      entry.lucro += s.lucro_real || 0;
      entry.stake += getStakeValue(s);
    });
    const roisMensais = Array.from(lucroMensal.values())
      .filter(v => v.stake > 0)
      .map(v => (v.lucro / v.stake) * 100);
    const roiMedioMensal = roisMensais.length > 0 
      ? roisMensais.reduce((a, b) => a + b, 0) / roisMensais.length 
      : 0;

    // === 2. RESULTADOS ===
    const eventosLucrativos = resolvidas.filter(s => (s.lucro_real || 0) > 0).length;
    const eventosDeficitarios = resolvidas.filter(s => (s.lucro_real || 0) < 0).length;

    // === 3. CAPITAL EM USO ===
    const totalOperacoes = surebets.length;
    const stakeTotal = surebets.reduce((acc, s) => acc + getStakeValue(s), 0);
    const stakeMedia = totalOperacoes > 0 ? stakeTotal / totalOperacoes : 0;

    const stakePorDia = new Map<string, number>();
    surebets.forEach(s => {
      const dia = extractLocalDateKey(s.data_operacao);
      stakePorDia.set(dia, (stakePorDia.get(dia) || 0) + getStakeValue(s));
    });
    const diasComOperacoes = stakePorDia.size;
    const stakeTotalDiaria = diasComOperacoes > 0 
      ? Array.from(stakePorDia.values()).reduce((a, b) => a + b, 0) / diasComOperacoes 
      : 0;

    // === 4. DEPENDÊNCIA POR CASA ===
    // Canônico: considera parent, pernas e entries[] dentro da mesma seleção.
    const aggregatedCasas = aggregateBookmakerUsage(
      surebets.map(s => ({
        ...s,
        stake: s.stake_total,
        lucro_prejuizo: s.lucro_real,
        moeda_operacao: "BRL",
      })),
      { moedaConsolidacao: "BRL" },
    );

    const casaStats = new Map(aggregatedCasas.map(casa => [casa.casa, {
      operacoes: casa.apostas,
      lucro: casa.lucro,
      stake: casa.volume,
      voids: 0,
      roiEsperado: 0,
      roiRealizado: 0,
      operacoesComRoi: 0,
    }]));

    const casasOrdenadas = Array.from(casaStats.entries())
      .sort((a, b) => b[1].operacoes - a[1].operacoes);
    const top3Casas = casasOrdenadas.slice(0, 3).map(([casa, data]) => ({
      casa,
      operacoes: data.operacoes,
      lucro: data.lucro,
      roi: data.stake > 0 ? (data.lucro / data.stake) * 100 : 0,
    }));

    const casasOrdenadasPorLucro = Array.from(casaStats.entries())
      .sort((a, b) => b[1].lucro - a[1].lucro);
    
    const top5MaiorLucro = casasOrdenadasPorLucro.slice(0, 5).map(([casa, data]) => ({
      casa,
      lucro: data.lucro,
    }));
    
    const top5MenorLucro = casasOrdenadasPorLucro.slice(-5).reverse().map(([casa, data]) => ({
      casa,
      lucro: data.lucro,
    }));

    const casaMaiorLucro = casasOrdenadasPorLucro.length > 0 
      ? { casa: casasOrdenadasPorLucro[0][0], lucro: casasOrdenadasPorLucro[0][1].lucro }
      : null;
    
    const casaMenorLucro = casasOrdenadasPorLucro.length > 0 
      ? { casa: casasOrdenadasPorLucro[casasOrdenadasPorLucro.length - 1][0], lucro: casasOrdenadasPorLucro[casasOrdenadasPorLucro.length - 1][1].lucro }
      : null;

    const MIN_OPERACOES_ROI = 10;
    const casasComRoi = casasOrdenadas
      .filter(([_, data]) => data.stake > 0 && data.operacoes >= MIN_OPERACOES_ROI)
      .map(([casa, data]) => ({
        casa,
        roi: (data.lucro / data.stake) * 100,
        operacoes: data.operacoes,
      }))
      .sort((a, b) => b.roi - a.roi);
    
    const casaMaiorRoi = casasComRoi.length > 0 ? casasComRoi[0] : null;
    const casaMenorRoi = casasComRoi.length > 0 ? casasComRoi[casasComRoi.length - 1] : null;
    const top3MenorRoi = casasComRoi.slice(-3).reverse();

    const casasComVoid = casasOrdenadas.filter(([_, data]) => data.voids > 0);
    const casaMaiorVoid = casasComVoid.length > 0 
      ? casasComVoid.reduce((a, b) => {
          const taxaA = a[1].operacoes > 0 ? a[1].voids / a[1].operacoes : 0;
          const taxaB = b[1].operacoes > 0 ? b[1].voids / b[1].operacoes : 0;
          return taxaA > taxaB ? a : b;
        })
      : null;
    const taxaVoidMaior = casaMaiorVoid 
      ? (casaMaiorVoid[1].voids / casaMaiorVoid[1].operacoes) * 100 
      : 0;

    const casasComSlippage = casasOrdenadas.filter(([_, data]) => data.operacoesComRoi > 0);
    const casaMaiorSlippage = casasComSlippage.length > 0 
      ? casasComSlippage.reduce((a, b) => {
          const slippageA = (a[1].roiEsperado - a[1].roiRealizado) / a[1].operacoesComRoi;
          const slippageB = (b[1].roiEsperado - b[1].roiRealizado) / b[1].operacoesComRoi;
          return slippageA > slippageB ? a : b;
        })
      : null;
    const slippageMaiorCasa = casaMaiorSlippage && casaMaiorSlippage[1].operacoesComRoi > 0
      ? (casaMaiorSlippage[1].roiEsperado - casaMaiorSlippage[1].roiRealizado) / casaMaiorSlippage[1].operacoesComRoi
      : 0;

    // === 5. RISCO OPERACIONAL ===
    const lucrosResolvidas = resolvidas.map(s => s.lucro_real || 0);
    const maiorPrejuizoUnitario = lucrosResolvidas.length > 0 
      ? Math.min(...lucrosResolvidas, 0) 
      : 0;

    const lucroPorDia = new Map<string, number>();
    resolvidas.forEach(s => {
      const dia = extractLocalDateKey(s.data_operacao);
      lucroPorDia.set(dia, (lucroPorDia.get(dia) || 0) + (s.lucro_real || 0));
    });
    const maiorPrejuizoDiario = lucroPorDia.size > 0 
      ? Math.min(...Array.from(lucroPorDia.values()), 0) 
      : 0;

    // === 6. EFICIÊNCIA DE ALOCAÇÃO ===
    const lucroTotalGeral = surebets.reduce((acc, s) => acc + (s.lucro_real || 0), 0);
    const lucroPorMilAlocados = stakeTotal > 0 
      ? (lucroTotalGeral / stakeTotal) * 1000 
      : 0;

    const casasDistintas = casaStats.size;
    
    // Estatísticas por VÍNCULO
    const vinculoStats = new Map<string, {
      id: string;
      nome: string;
      operacoes: number;
      lucro: number;
      stake: number;
    }>();

    surebets.forEach(s => {
      const numPernas = s.pernas?.length || 1;
      const vinculosNestaSurebet = new Set<string>();
      
      s.pernas?.forEach(perna => {
        const bookmarkerId = perna.bookmaker_id;
        if (!bookmarkerId) return;
        
        if (!vinculoStats.has(bookmarkerId)) {
          vinculoStats.set(bookmarkerId, { 
            id: bookmarkerId,
            nome: perna.bookmaker_nome || "Desconhecido",
            operacoes: 0, 
            lucro: 0, 
            stake: 0 
          });
        }
        
        const entry = vinculoStats.get(bookmarkerId)!;
        entry.stake += perna.stake;
        entry.lucro += (s.lucro_real || 0) / numPernas;
        vinculosNestaSurebet.add(bookmarkerId);
      });
      
      vinculosNestaSurebet.forEach(bookmarkerId => {
        const entry = vinculoStats.get(bookmarkerId);
        if (entry) {
          entry.operacoes += 1;
        }
      });
    });

    const totalVinculosAtivos = vinculoStats.size;
    const lucroPorVinculoAtivo = totalVinculosAtivos > 0 
      ? lucroTotalGeral / totalVinculosAtivos 
      : 0;

    const vinculosOrdenados = Array.from(vinculoStats.values())
      .sort((a, b) => b.lucro - a.lucro);
    
    const vinculoMaiorLucro = vinculosOrdenados.length > 0 ? vinculosOrdenados[0] : null;
    const vinculoMenorLucro = vinculosOrdenados.length > 0 ? vinculosOrdenados[vinculosOrdenados.length - 1] : null;
    
    const totalOperacoesVinculos = Array.from(vinculoStats.values()).reduce((acc, v) => acc + v.operacoes, 0);
    const mediaOperacoesPorVinculo = totalVinculosAtivos > 0 
      ? totalOperacoesVinculos / totalVinculosAtivos 
      : 0;

    const top5VinculosMaiorLucro = vinculosOrdenados.slice(0, 5);
    const top5VinculosMenorLucro = vinculosOrdenados.slice(-5).reverse();

    // === 7. QUALIDADE DA ARBITRAGEM ===
    const surebetsComRoi = surebets.filter(s => s.roi_real !== null && s.roi_real !== undefined);
    const surebetsRoiMaior25 = surebetsComRoi.filter(s => (s.roi_real || 0) > 2.5).length;
    const percentRoiMaior25 = surebetsComRoi.length > 0 
      ? (surebetsRoiMaior25 / surebetsComRoi.length) * 100 
      : 0;

    let totalOdds = 0;
    let countOdds = 0;
    surebets.forEach(s => {
      s.pernas?.forEach(perna => {
        if (perna.odd > 0) {
          totalOdds += perna.odd;
          countOdds++;
        }
      });
    });
    const mediaOdds = countOdds > 0 ? totalOdds / countOdds : 0;

    return {
      roiMedioPorOperacao,
      roiMedioMensal,
      eventosLucrativos,
      eventosDeficitarios,
      stakeMedia,
      stakeTotalDiaria,
      top3Casas,
      top5MaiorLucro,
      top5MenorLucro,
      top3MenorRoi,
      casaMaiorLucro,
      casaMenorLucro,
      casaMaiorRoi,
      casaMenorRoi,
      casaMaiorVoid: casaMaiorVoid ? { casa: casaMaiorVoid[0], taxa: taxaVoidMaior } : null,
      casaMaiorSlippage: casaMaiorSlippage ? { casa: casaMaiorSlippage[0], slippage: slippageMaiorCasa } : null,
      maiorPrejuizoUnitario,
      maiorPrejuizoDiario,
      lucroPorMilAlocados,
      casasDistintas,
      totalVinculosAtivos,
      lucroPorVinculoAtivo,
      vinculoMaiorLucro,
      vinculoMenorLucro,
      mediaOperacoesPorVinculo,
      top5VinculosMaiorLucro,
      top5VinculosMenorLucro,
      lucroTotalGeral,
      percentRoiMaior25,
      mediaOdds,
    };
  }, [surebets]);

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  };

  if (surebets.length === 0) {
    return null;
  }

  return (
    <Card className="border-emerald-500/20">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-400" />
          Estatísticas Avançadas
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        {/* Mobile: seções empilhadas | Desktop: 3 colunas */}
        <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-3 md:gap-4">
          
          {/* SEÇÃO 1: ROI + Resultados + Capital */}
          <div className="space-y-1.5 md:space-y-2">
            <KPISectionHeader title="ROI" color="emerald" />
            <KPIStatCell 
              label="ROI médio/operação" 
              value={formatPercent(stats.roiMedioPorOperacao)} 
              valueClass={stats.roiMedioPorOperacao >= 0 ? "text-emerald-400" : "text-red-400"}
              tooltip="Lucro total ÷ Stake total das operações resolvidas"
            />
            <KPIStatCell 
              label="ROI médio mensal" 
              value={formatPercent(stats.roiMedioMensal)} 
              valueClass={stats.roiMedioMensal >= 0 ? "text-emerald-400" : "text-red-400"}
              tooltip="Média dos ROIs mensais"
            />

            <KPISectionHeader title="Resultados" color="emerald" />
            <div className="grid grid-cols-2 gap-1.5">
              <KPIStatCell 
                label="Lucrativos" 
                value={stats.eventosLucrativos} 
                valueClass="text-emerald-400"
                tooltip="Operações com lucro > 0"
                size="sm"
              />
              <KPIStatCell 
                label="Deficitários" 
                value={stats.eventosDeficitarios} 
                valueClass="text-red-400"
                tooltip="Operações com lucro < 0"
                size="sm"
              />
            </div>

            <KPISectionHeader title="Capital" color="emerald" />
            <KPIStatCell 
              label="Stake média/operação" 
              value={formatCurrency(stats.stakeMedia)}
              tooltip="Stake total ÷ Nº de operações"
            />
            <KPIStatCell 
              label="Stake média diária" 
              value={formatCurrency(stats.stakeTotalDiaria)}
              tooltip="Stake total ÷ Dias com operações"
            />
          </div>

          {/* SEÇÃO 2: Casas */}
          <div className="space-y-1.5 md:space-y-2">
            <KPISectionHeader title="Casas" color="emerald" />
            <KPIStatCell 
              label="Casa mais usada" 
              value={stats.top3Casas[0]?.casa || "-"}
              tooltipContent={stats.top3Casas.length > 0 ? (
                <RankingTooltip 
                  title="Top Casas por Uso"
                  items={stats.top3Casas.map(c => ({
                    label: c.casa,
                    value: `${c.operacoes} ops`,
                  }))}
                />
              ) : undefined}
            />
            <KPIStatCell 
              label="Casas utilizadas" 
              value={stats.casasDistintas}
              tooltip="Total de casas distintas"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <KPIStatCell 
                label="Maior lucro" 
                value={stats.casaMaiorLucro ? stats.casaMaiorLucro.casa : "-"}
                valueClass="text-emerald-400"
                size="sm"
                tooltipContent={stats.top5MaiorLucro.length > 0 ? (
                  <RankingTooltip 
                    title="Top 5 Maior Lucro"
                    items={stats.top5MaiorLucro.map(c => ({
                      label: c.casa,
                      value: formatCurrency(c.lucro),
                      valueClass: c.lucro >= 0 ? "text-emerald-400" : "text-red-400",
                    }))}
                  />
                ) : undefined}
              />
              <KPIStatCell 
                label="Maior ROI" 
                value={stats.casaMaiorRoi ? stats.casaMaiorRoi.casa : "-"}
                valueClass="text-emerald-400"
                size="sm"
                tooltip={stats.casaMaiorRoi ? `ROI: ${formatPercent(stats.casaMaiorRoi.roi)}` : undefined}
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <KPIStatCell 
                label="Menor lucro" 
                value={stats.casaMenorLucro ? stats.casaMenorLucro.casa : "-"}
                valueClass="text-red-400"
                size="sm"
                tooltipContent={stats.top5MenorLucro.length > 0 ? (
                  <RankingTooltip 
                    title="Top 5 Menor Lucro"
                    items={stats.top5MenorLucro.map(c => ({
                      label: c.casa,
                      value: formatCurrency(c.lucro),
                      valueClass: c.lucro >= 0 ? "text-emerald-400" : "text-red-400",
                    }))}
                  />
                ) : undefined}
              />
              <KPIStatCell 
                label="Menor ROI" 
                value={stats.casaMenorRoi ? stats.casaMenorRoi.casa : "-"}
                valueClass="text-red-400"
                size="sm"
                tooltipContent={stats.top3MenorRoi.length > 0 ? (
                  <RankingTooltip 
                    title="Top 3 Menor ROI"
                    items={stats.top3MenorRoi.map(c => ({
                      label: c.casa,
                      value: formatPercent(c.roi),
                      valueClass: c.roi >= 0 ? "text-emerald-400" : "text-red-400",
                    }))}
                  />
                ) : undefined}
              />
            </div>
          </div>

          {/* SEÇÃO 3: Risco + Eficiência + Qualidade */}
          <div className="space-y-1.5 md:space-y-2">
            <KPISectionHeader title="Risco" color="red" />
            <div className="grid grid-cols-2 gap-1.5 md:grid-cols-1">
              <KPIStatCell 
                label="Maior prejuízo unitário" 
                value={formatCurrency(stats.maiorPrejuizoUnitario)} 
                valueClass="text-red-400"
                tooltip="Maior perda em uma única operação"
              />
              <KPIStatCell 
                label="Maior prejuízo diário" 
                value={formatCurrency(stats.maiorPrejuizoDiario)} 
                valueClass="text-red-400"
                tooltip="Maior soma negativa em um único dia"
              />
            </div>

            <KPISectionHeader title="Eficiência" color="blue" />
            <KPIStatCell 
              label={`Lucro por ${currencySymbol}1.000`}
              value={formatCurrency(stats.lucroPorMilAlocados)}
              valueClass={stats.lucroPorMilAlocados >= 0 ? "text-emerald-400" : "text-red-400"}
              tooltip={`(Lucro ÷ Stake) × 1.000`}
            />
            <KPIStatCell 
              label="Lucro por vínculo ativo" 
              value={formatCurrency(stats.lucroPorVinculoAtivo)}
              valueClass={stats.lucroPorVinculoAtivo >= 0 ? "text-emerald-400" : "text-red-400"}
              tooltipContent={(
                <div className="space-y-2.5 py-1.5 min-w-[280px]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/30 pb-1.5">
                    Detalhes por Vínculo
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Vínculos utilizados:</span>
                      <span className="font-semibold">{stats.totalVinculosAtivos}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total de surebets:</span>
                      <span className="font-semibold">{surebets.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Lucro total:</span>
                      <span className={`font-semibold ${stats.lucroTotalGeral >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {formatCurrency(stats.lucroTotalGeral)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-muted-foreground">Operações/vínculo:</span>
                        <span className="text-[10px] text-muted-foreground/70">Média de surebets por vínculo</span>
                      </div>
                      <span className="font-semibold">{stats.mediaOperacoesPorVinculo.toFixed(1)}</span>
                    </div>
                  </div>
                  {stats.vinculoMaiorLucro && (
                    <div className="pt-2 border-t border-border/30">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Melhor vínculo:</span>
                        <span className="font-semibold text-emerald-400 truncate max-w-[160px]" title={stats.vinculoMaiorLucro.nome}>
                          {stats.vinculoMaiorLucro.nome}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs mt-1">
                        <span className="text-muted-foreground">Lucro:</span>
                        <span className="font-semibold text-emerald-400">{formatCurrency(stats.vinculoMaiorLucro.lucro)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs mt-0.5">
                        <span className="text-muted-foreground">Surebets:</span>
                        <span className="font-semibold">{stats.vinculoMaiorLucro.operacoes}</span>
                      </div>
                    </div>
                  )}
                  {stats.vinculoMenorLucro && stats.vinculoMenorLucro.id !== stats.vinculoMaiorLucro?.id && (
                    <div className="pt-2 border-t border-border/30">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Pior vínculo:</span>
                        <span className="font-semibold text-red-400 truncate max-w-[160px]" title={stats.vinculoMenorLucro.nome}>
                          {stats.vinculoMenorLucro.nome}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs mt-1">
                        <span className="text-muted-foreground">Lucro:</span>
                        <span className={`font-semibold ${stats.vinculoMenorLucro.lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {formatCurrency(stats.vinculoMenorLucro.lucro)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs mt-0.5">
                        <span className="text-muted-foreground">Surebets:</span>
                        <span className="font-semibold">{stats.vinculoMenorLucro.operacoes}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            />

            <KPISectionHeader title="Qualidade" color="purple" />
            <div className="grid grid-cols-2 gap-1.5 md:grid-cols-1">
              <KPIStatCell 
                label="ROI > 2,5%" 
                value={`${stats.percentRoiMaior25.toFixed(1)}%`}
                valueClass={stats.percentRoiMaior25 >= 50 ? "text-emerald-400" : ""}
                tooltip="% de operações com ROI individual > 2,5%"
              />
              <KPIStatCell 
                label="Média de odds" 
                value={stats.mediaOdds.toFixed(2)}
                tooltip="Média de todas as odds das pernas"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
