import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SurebetPerna {
  id?: string;
  selecao: string;
  odd: number;
  stake: number;
  resultado?: string | null;
  bookmaker_nome: string;
  bookmaker_id?: string;
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
}

const StatCell = ({ 
  label, 
  value, 
  valueClass = "",
  tooltip,
  tooltipContent
}: { 
  label: string; 
  value: string | number; 
  valueClass?: string;
  tooltip?: string;
  tooltipContent?: React.ReactNode;
}) => {
  const content = (
    <div className="flex items-center justify-between bg-muted/40 rounded px-3 py-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`font-medium tabular-nums text-xs ${valueClass}`}>{value}</span>
    </div>
  );

  if (tooltip || tooltipContent) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent 
          side="top" 
          className="text-xs max-w-xs bg-popover/95 backdrop-blur-sm border-border/50 shadow-xl"
        >
          {tooltipContent || tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }
  return content;
};

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

const SectionHeader = ({ title }: { title: string }) => (
  <div className="mt-3 first:mt-0">
    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
      {title}
    </span>
  </div>
);

export function SurebetStatisticsCard({ surebets }: SurebetStatisticsCardProps) {
  const stats = useMemo(() => {
    // Operações resolvidas (não pendentes)
    const resolvidas = surebets.filter(s => 
      s.resultado && 
      s.resultado !== "PENDENTE" && 
      s.status !== "PENDENTE"
    );

    // === 1. MÉTRICAS DE ROI ===
    const lucroTotalResolvidas = resolvidas.reduce((acc, s) => acc + (s.lucro_real || 0), 0);
    const stakeTotalResolvidas = resolvidas.reduce((acc, s) => acc + s.stake_total, 0);
    const roiMedioPorOperacao = stakeTotalResolvidas > 0 
      ? (lucroTotalResolvidas / stakeTotalResolvidas) * 100 
      : 0;

    // ROI médio mensal - agrupar por mês
    const lucroMensal = new Map<string, { lucro: number; stake: number }>();
    resolvidas.forEach(s => {
      const mes = s.data_operacao.slice(0, 7); // YYYY-MM
      if (!lucroMensal.has(mes)) {
        lucroMensal.set(mes, { lucro: 0, stake: 0 });
      }
      const entry = lucroMensal.get(mes)!;
      entry.lucro += s.lucro_real || 0;
      entry.stake += s.stake_total;
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
    const stakeTotal = surebets.reduce((acc, s) => acc + s.stake_total, 0);
    const stakeMedia = totalOperacoes > 0 ? stakeTotal / totalOperacoes : 0;

    // Stake total média diária
    const stakePorDia = new Map<string, number>();
    surebets.forEach(s => {
      const dia = s.data_operacao.slice(0, 10);
      stakePorDia.set(dia, (stakePorDia.get(dia) || 0) + s.stake_total);
    });
    const diasComOperacoes = stakePorDia.size;
    const stakeTotalDiaria = diasComOperacoes > 0 
      ? Array.from(stakePorDia.values()).reduce((a, b) => a + b, 0) / diasComOperacoes 
      : 0;

    // === 4. DEPENDÊNCIA POR CASA ===
    const casaStats = new Map<string, {
      operacoes: number;
      lucro: number;
      stake: number;
      voids: number;
      roiEsperado: number;
      roiRealizado: number;
      operacoesComRoi: number;
    }>();

    const extractCasa = (nomeCompleto: string) => {
      const separatorIdx = nomeCompleto.indexOf(" - ");
      return separatorIdx > 0 ? nomeCompleto.substring(0, separatorIdx).trim() : nomeCompleto;
    };

    surebets.forEach(s => {
      const numPernas = s.pernas?.length || 1;
      s.pernas?.forEach(perna => {
        const casa = extractCasa(perna.bookmaker_nome || "Desconhecida");
        if (!casaStats.has(casa)) {
          casaStats.set(casa, { operacoes: 0, lucro: 0, stake: 0, voids: 0, roiEsperado: 0, roiRealizado: 0, operacoesComRoi: 0 });
        }
        const entry = casaStats.get(casa)!;
        entry.operacoes += 1;
        entry.stake += perna.stake;
        entry.lucro += (s.lucro_real || 0) / numPernas;
        if (s.resultado === "VOID" || perna.resultado === "VOID") {
          entry.voids += 1;
        }
        if (s.roi_esperado !== null && s.roi_real !== null) {
          entry.roiEsperado += s.roi_esperado / numPernas;
          entry.roiRealizado += s.roi_real / numPernas;
          entry.operacoesComRoi += 1;
        }
      });
    });

    // Casas mais usadas
    const casasOrdenadas = Array.from(casaStats.entries())
      .sort((a, b) => b[1].operacoes - a[1].operacoes);
    const top3Casas = casasOrdenadas.slice(0, 3).map(([casa, data]) => ({
      casa,
      operacoes: data.operacoes,
      lucro: data.lucro,
      roi: data.stake > 0 ? (data.lucro / data.stake) * 100 : 0,
    }));

    // Casas ordenadas por lucro
    const casasOrdenadasPorLucro = Array.from(casaStats.entries())
      .sort((a, b) => b[1].lucro - a[1].lucro);
    
    // Top 5 casas maior lucro
    const top5MaiorLucro = casasOrdenadasPorLucro.slice(0, 5).map(([casa, data]) => ({
      casa,
      lucro: data.lucro,
    }));
    
    // Top 5 casas menor lucro
    const top5MenorLucro = casasOrdenadasPorLucro.slice(-5).reverse().map(([casa, data]) => ({
      casa,
      lucro: data.lucro,
    }));

    // Casa com maior lucro
    const casaMaiorLucro = casasOrdenadasPorLucro.length > 0 
      ? { casa: casasOrdenadasPorLucro[0][0], lucro: casasOrdenadasPorLucro[0][1].lucro }
      : null;
    
    // Casa com menor lucro
    const casaMenorLucro = casasOrdenadasPorLucro.length > 0 
      ? { casa: casasOrdenadasPorLucro[casasOrdenadasPorLucro.length - 1][0], lucro: casasOrdenadasPorLucro[casasOrdenadasPorLucro.length - 1][1].lucro }
      : null;

    // Casa com maior ROI (mínimo 10 operações)
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
    
    // Casa com menor ROI e top 3 menor ROI (mínimo 10 operações)
    const casaMenorRoi = casasComRoi.length > 0 ? casasComRoi[casasComRoi.length - 1] : null;
    const top3MenorRoi = casasComRoi.slice(-3).reverse();

    // Casa com maior incidência de Void
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

    // Casa com maior slippage
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

    // Maior prejuízo acumulado em um dia
    const lucroPorDia = new Map<string, number>();
    resolvidas.forEach(s => {
      const dia = s.data_operacao.slice(0, 10);
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
    
    // Estatísticas por VÍNCULO (bookmaker_id) - não por nome de casa
    const vinculoStats = new Map<string, {
      id: string;
      nome: string;
      operacoes: number;
      lucro: number;
      stake: number;
    }>();

    surebets.forEach(s => {
      const numPernas = s.pernas?.length || 1;
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
        entry.operacoes += 1;
        entry.stake += perna.stake;
        entry.lucro += (s.lucro_real || 0) / numPernas;
      });
    });

    const totalVinculosAtivos = vinculoStats.size;
    const lucroPorVinculoAtivo = totalVinculosAtivos > 0 
      ? lucroTotalGeral / totalVinculosAtivos 
      : 0;

    // Ordenar vínculos por lucro
    const vinculosOrdenados = Array.from(vinculoStats.values())
      .sort((a, b) => b.lucro - a.lucro);
    
    const vinculoMaiorLucro = vinculosOrdenados.length > 0 ? vinculosOrdenados[0] : null;
    const vinculoMenorLucro = vinculosOrdenados.length > 0 ? vinculosOrdenados[vinculosOrdenados.length - 1] : null;
    
    const totalOperacoesVinculos = Array.from(vinculoStats.values()).reduce((acc, v) => acc + v.operacoes, 0);
    const mediaOperacoesPorVinculo = totalVinculosAtivos > 0 
      ? totalOperacoesVinculos / totalVinculosAtivos 
      : 0;

    // Top 5 vínculos por lucro para tooltip
    const top5VinculosMaiorLucro = vinculosOrdenados.slice(0, 5);
    const top5VinculosMenorLucro = vinculosOrdenados.slice(-5).reverse();

    // === 7. QUALIDADE DA ARBITRAGEM ===
    const surebetsComRoi = surebets.filter(s => s.roi_real !== null && s.roi_real !== undefined);
    const surebetsRoiMaior25 = surebetsComRoi.filter(s => (s.roi_real || 0) > 2.5).length;
    const percentRoiMaior25 = surebetsComRoi.length > 0 
      ? (surebetsRoiMaior25 / surebetsComRoi.length) * 100 
      : 0;

    // Média de odds envolvidas
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
      // ROI
      roiMedioPorOperacao,
      roiMedioMensal,
      // Resultados
      eventosLucrativos,
      eventosDeficitarios,
      // Capital
      stakeMedia,
      stakeTotalDiaria,
      // Casas
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
      // Risco
      maiorPrejuizoUnitario,
      maiorPrejuizoDiario,
      // Eficiência
      lucroPorMilAlocados,
      casasDistintas,
      // Vínculos
      totalVinculosAtivos,
      lucroPorVinculoAtivo,
      vinculoMaiorLucro,
      vinculoMenorLucro,
      mediaOperacoesPorVinculo,
      top5VinculosMaiorLucro,
      top5VinculosMenorLucro,
      lucroTotalGeral,
      // Qualidade
      percentRoiMaior25,
      mediaOdds,
    };
  }, [surebets]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

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
        {/* Layout em 3 colunas principais */}
        <div className="grid grid-cols-3 gap-4">
          {/* COLUNA 1: ROI + Resultados + Capital */}
          <div className="space-y-2">
            <SectionHeader title="ROI" />
            <StatCell 
              label="ROI médio/operação" 
              value={formatPercent(stats.roiMedioPorOperacao)} 
              valueClass={stats.roiMedioPorOperacao >= 0 ? "text-emerald-400" : "text-red-400"}
              tooltip="Lucro total ÷ Stake total das operações resolvidas"
            />
            <StatCell 
              label="ROI médio mensal" 
              value={formatPercent(stats.roiMedioMensal)} 
              valueClass={stats.roiMedioMensal >= 0 ? "text-emerald-400" : "text-red-400"}
              tooltip="Média dos ROIs mensais"
            />

            <SectionHeader title="Resultados" />
            <StatCell 
              label="Eventos lucrativos" 
              value={stats.eventosLucrativos} 
              valueClass="text-emerald-400"
              tooltip="Operações com lucro > 0"
            />
            <StatCell 
              label="Eventos deficitários" 
              value={stats.eventosDeficitarios} 
              valueClass="text-red-400"
              tooltip="Operações com lucro < 0"
            />

            <SectionHeader title="Capital" />
            <StatCell 
              label="Stake média/operação" 
              value={formatCurrency(stats.stakeMedia)}
              tooltip="Stake total ÷ Nº de operações"
            />
            <StatCell 
              label="Stake média diária" 
              value={formatCurrency(stats.stakeTotalDiaria)}
              tooltip="Stake total ÷ Dias com operações"
            />
          </div>

          {/* COLUNA 2: Casas */}
          <div className="space-y-2">
            <SectionHeader title="Casas" />
            <StatCell 
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
            <StatCell 
              label="Casas utilizadas" 
              value={stats.casasDistintas}
              tooltip="Total de casas distintas"
            />
            <StatCell 
              label="Maior lucro (casa)" 
              value={stats.casaMaiorLucro ? stats.casaMaiorLucro.casa : "-"}
              valueClass="text-emerald-400"
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
            <StatCell 
              label="Maior ROI (casa)" 
              value={stats.casaMaiorRoi ? stats.casaMaiorRoi.casa : "-"}
              valueClass="text-emerald-400"
              tooltip={stats.casaMaiorRoi ? `ROI: ${formatPercent(stats.casaMaiorRoi.roi)}` : undefined}
            />
            <StatCell 
              label="Menor lucro (casa)" 
              value={stats.casaMenorLucro ? stats.casaMenorLucro.casa : "-"}
              valueClass="text-red-400"
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
            <StatCell 
              label="Menor ROI (casa)" 
              value={stats.casaMenorRoi ? stats.casaMenorRoi.casa : "-"}
              valueClass="text-red-400"
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

          {/* COLUNA 3: Risco + Eficiência + Qualidade */}
          <div className="space-y-2">
            <SectionHeader title="Risco" />
            <StatCell 
              label="Maior prejuízo unitário" 
              value={formatCurrency(stats.maiorPrejuizoUnitario)} 
              valueClass="text-red-400"
              tooltip="Maior perda em uma única operação"
            />
            <StatCell 
              label="Maior prejuízo diário" 
              value={formatCurrency(stats.maiorPrejuizoDiario)} 
              valueClass="text-red-400"
              tooltip="Maior soma negativa em um único dia"
            />

            <SectionHeader title="Eficiência" />
            <StatCell 
              label="Lucro por R$1.000" 
              value={formatCurrency(stats.lucroPorMilAlocados)}
              valueClass={stats.lucroPorMilAlocados >= 0 ? "text-emerald-400" : "text-red-400"}
              tooltip="(Lucro ÷ Stake) × 1.000"
            />
            <StatCell 
              label="Lucro por vínculo ativo" 
              value={formatCurrency(stats.lucroPorVinculoAtivo)}
              valueClass={stats.lucroPorVinculoAtivo >= 0 ? "text-emerald-400" : "text-red-400"}
              tooltipContent={(
                <div className="space-y-2 py-1 min-w-[220px]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/30 pb-1.5">
                    Detalhes por Vínculo
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vínculos utilizados:</span>
                      <span className="font-semibold">{stats.totalVinculosAtivos}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Lucro total:</span>
                      <span className={`font-semibold ${stats.lucroTotalGeral >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {formatCurrency(stats.lucroTotalGeral)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ops/vínculo (média):</span>
                      <span className="font-semibold">{stats.mediaOperacoesPorVinculo.toFixed(1)}</span>
                    </div>
                  </div>
                  {stats.vinculoMaiorLucro && (
                    <div className="pt-1.5 border-t border-border/30">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Melhor vínculo:</span>
                        <span className="font-semibold text-emerald-400 truncate max-w-[120px]" title={stats.vinculoMaiorLucro.nome}>
                          {stats.vinculoMaiorLucro.nome}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs mt-0.5">
                        <span className="text-muted-foreground">Lucro:</span>
                        <span className="font-semibold text-emerald-400">{formatCurrency(stats.vinculoMaiorLucro.lucro)}</span>
                      </div>
                    </div>
                  )}
                  {stats.vinculoMenorLucro && stats.vinculoMenorLucro.id !== stats.vinculoMaiorLucro?.id && (
                    <div className="pt-1.5 border-t border-border/30">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Pior vínculo:</span>
                        <span className="font-semibold text-red-400 truncate max-w-[120px]" title={stats.vinculoMenorLucro.nome}>
                          {stats.vinculoMenorLucro.nome}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs mt-0.5">
                        <span className="text-muted-foreground">Lucro:</span>
                        <span className={`font-semibold ${stats.vinculoMenorLucro.lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {formatCurrency(stats.vinculoMenorLucro.lucro)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            />

            <SectionHeader title="Qualidade" />
            <StatCell 
              label="Surebets ROI > 2,5%" 
              value={`${stats.percentRoiMaior25.toFixed(1)}%`}
              valueClass={stats.percentRoiMaior25 >= 50 ? "text-emerald-400" : ""}
              tooltip="% de operações com ROI individual > 2,5%"
            />
            <StatCell 
              label="Média de odds" 
              value={stats.mediaOdds.toFixed(2)}
              tooltip="Média de todas as odds das pernas"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
