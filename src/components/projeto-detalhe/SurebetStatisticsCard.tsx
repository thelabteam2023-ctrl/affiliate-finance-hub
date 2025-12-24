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
  tooltip 
}: { 
  label: string; 
  value: string | number; 
  valueClass?: string;
  tooltip?: string;
}) => {
  const content = (
    <div className="flex items-center justify-between bg-muted/40 rounded px-3 py-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`font-medium tabular-nums text-xs ${valueClass}`}>{value}</span>
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }
  return content;
};

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

    // Casa com maior lucro
    const casaMaiorLucro = casasOrdenadas.length > 0 
      ? casasOrdenadas.reduce((a, b) => a[1].lucro > b[1].lucro ? a : b)
      : null;

    // Casa com maior ROI
    const casasComRoi = casasOrdenadas.filter(([_, data]) => data.stake > 0);
    const casaMaiorRoi = casasComRoi.length > 0 
      ? casasComRoi.reduce((a, b) => {
          const roiA = a[1].stake > 0 ? (a[1].lucro / a[1].stake) * 100 : 0;
          const roiB = b[1].stake > 0 ? (b[1].lucro / b[1].stake) * 100 : 0;
          return roiA > roiB ? a : b;
        })
      : null;
    const roiMaiorCasa = casaMaiorRoi 
      ? (casaMaiorRoi[1].lucro / casaMaiorRoi[1].stake) * 100 
      : 0;

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
    const lucroPorCasaAtiva = casasDistintas > 0 
      ? lucroTotalGeral / casasDistintas 
      : 0;

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
      casaMaiorLucro: casaMaiorLucro ? { casa: casaMaiorLucro[0], lucro: casaMaiorLucro[1].lucro } : null,
      casaMaiorRoi: casaMaiorRoi ? { casa: casaMaiorRoi[0], roi: roiMaiorCasa } : null,
      casaMaiorVoid: casaMaiorVoid ? { casa: casaMaiorVoid[0], taxa: taxaVoidMaior } : null,
      casaMaiorSlippage: casaMaiorSlippage ? { casa: casaMaiorSlippage[0], slippage: slippageMaiorCasa } : null,
      // Risco
      maiorPrejuizoUnitario,
      maiorPrejuizoDiario,
      // Eficiência
      lucroPorMilAlocados,
      lucroPorCasaAtiva,
      casasDistintas,
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
              label="Casas mais usadas" 
              value={stats.top3Casas.slice(0, 2).map(c => c.casa).join(", ") || "-"}
              tooltip={stats.top3Casas.map(c => `${c.casa}: ${c.operacoes} ops`).join(" | ")}
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
              tooltip={stats.casaMaiorLucro ? `${formatCurrency(stats.casaMaiorLucro.lucro)}` : undefined}
            />
            <StatCell 
              label="Maior ROI (casa)" 
              value={stats.casaMaiorRoi ? `${stats.casaMaiorRoi.casa}` : "-"}
              valueClass="text-emerald-400"
              tooltip={stats.casaMaiorRoi ? `ROI: ${formatPercent(stats.casaMaiorRoi.roi)}` : undefined}
            />
            <StatCell 
              label="Maior void (casa)" 
              value={stats.casaMaiorVoid ? stats.casaMaiorVoid.casa : "-"}
              tooltip={stats.casaMaiorVoid ? `Taxa: ${stats.casaMaiorVoid.taxa.toFixed(1)}%` : undefined}
            />
            <StatCell 
              label="Maior slippage (casa)" 
              value={stats.casaMaiorSlippage && stats.casaMaiorSlippage.slippage > 0 ? stats.casaMaiorSlippage.casa : "-"}
              valueClass={stats.casaMaiorSlippage && stats.casaMaiorSlippage.slippage > 0 ? "text-amber-400" : ""}
              tooltip={stats.casaMaiorSlippage ? `Slippage: ${stats.casaMaiorSlippage.slippage.toFixed(2)}%` : undefined}
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
              label="Lucro por casa ativa" 
              value={formatCurrency(stats.lucroPorCasaAtiva)}
              valueClass={stats.lucroPorCasaAtiva >= 0 ? "text-emerald-400" : "text-red-400"}
              tooltip="Lucro total ÷ Casas utilizadas"
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
