import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Zap,
  Target,
  DollarSign,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { parseLocalDateTime } from "@/utils/dateUtils";
import { KPIAnchorCard } from "@/components/kpis/KPIAnchorCard";
import { KPIStatCell } from "@/components/kpis/KPIStatCell";
import { KPISectionHeader } from "@/components/kpis/KPISectionHeader";

interface Aposta {
  id: string;
  data_aposta: string;
  odd: number;
  stake: number;
  stake_total?: number | null;
  resultado: string | null;
  lucro_prejuizo: number | null;
  status: string;
  spread_calculado?: number | null;
}

interface DuploGreenStatisticsCardProps {
  apostas: Aposta[];
  /** Função de formatação obrigatória - deve vir do useProjetoCurrency */
  formatCurrency: (value: number) => string;
}

export function DuploGreenStatisticsCard({ apostas, formatCurrency }: DuploGreenStatisticsCardProps) {

  const stats = useMemo(() => {
    const getStake = (a: Aposta) => {
      const value = typeof a.stake_total === "number" ? a.stake_total : typeof a.stake === "number" ? a.stake : 0;
      return Number.isFinite(value) ? value : 0;
    };

    const liquidadas = apostas.filter(a => a.resultado && a.resultado !== "PENDENTE");
    const pendentes = apostas.filter(a => !a.resultado || a.resultado === "PENDENTE");
    
    const lucros = liquidadas.map(a => a.lucro_prejuizo || 0);
    const lucroTotal = lucros.reduce((acc, l) => acc + l, 0);
    const maiorLucro = lucros.length > 0 ? Math.max(...lucros, 0) : 0;
    
    const volumeTotal = apostas.reduce((acc, a) => acc + getStake(a), 0);
    const volumeEmCurso = pendentes.reduce((acc, a) => acc + getStake(a), 0);
    const stakeMedia = apostas.length > 0 ? volumeTotal / apostas.length : 0;
    
    const roi = volumeTotal > 0 ? (lucroTotal / volumeTotal) * 100 : 0;
    
    const duplos = liquidadas.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN");
    const totalDuplos = duplos.length;
    const taxaAcerto = liquidadas.length > 0 ? (totalDuplos / liquidadas.length) * 100 : 0;
    
    const duploACadaXEntradas = liquidadas.length > 0 && totalDuplos > 0 
      ? (liquidadas.length / totalDuplos).toFixed(1) 
      : "-";
    
    const datasUnicas = new Set(apostas.map(a => format(parseLocalDateTime(a.data_aposta), "yyyy-MM-dd")));
    const diasOperados = datasUnicas.size;
    const duploACadaXDias = diasOperados > 0 && totalDuplos > 0 
      ? (diasOperados / totalDuplos).toFixed(1) 
      : "-";
    
    const sortedLiquidadas = [...liquidadas].sort(
      (a, b) => parseLocalDateTime(a.data_aposta).getTime() - parseLocalDateTime(b.data_aposta).getTime()
    );
    
    let maxSemDuplo = 0;
    let currentSemDuplo = 0;
    sortedLiquidadas.forEach(a => {
      if (a.resultado === "GREEN" || a.resultado === "MEIO_GREEN") {
        maxSemDuplo = Math.max(maxSemDuplo, currentSemDuplo);
        currentSemDuplo = 0;
      } else {
        currentSemDuplo++;
      }
    });
    maxSemDuplo = Math.max(maxSemDuplo, currentSemDuplo);
    
    const duplosPorData = duplos.map(d => parseLocalDateTime(d.data_aposta).getTime()).sort((a, b) => a - b);
    let maxPeriodoSemDuplo = 0;
    
    if (duplosPorData.length >= 2) {
      for (let i = 1; i < duplosPorData.length; i++) {
        const diff = differenceInDays(new Date(duplosPorData[i]), new Date(duplosPorData[i - 1]));
        maxPeriodoSemDuplo = Math.max(maxPeriodoSemDuplo, diff);
      }
    } else if (apostas.length > 0 && totalDuplos <= 1) {
      const datasApostas = apostas.map(a => parseLocalDateTime(a.data_aposta).getTime()).sort((a, b) => a - b);
      if (datasApostas.length >= 2) {
        maxPeriodoSemDuplo = differenceInDays(new Date(datasApostas[datasApostas.length - 1]), new Date(datasApostas[0]));
      }
    }
    
    return {
      lucroTotal,
      roi,
      taxaAcerto,
      totalDuplos,
      totalLiquidadas: liquidadas.length,
      duploACadaXEntradas,
      duploACadaXDias,
      maxSemDuplo,
      maxPeriodoSemDuplo,
      volumeTotal,
      volumeEmCurso,
      maiorLucro,
      stakeMedia,
      pendentes: pendentes.length
    };
  }, [apostas]);

  const formatPercent = (value: number) => {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-3 md:pb-4">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Zap className="w-4 h-4 text-lime-500" />
          Estatísticas Duplo Green
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 md:space-y-6">
        {/* KPIs Âncora — Mobile: empilhado, Desktop: 3 colunas */}
        {/* Nível 1: Lucro (full-width em mobile) */}
        <div className="space-y-2 md:space-y-0 md:grid md:grid-cols-3 md:gap-3">
          <div className="md:col-span-1">
            <KPIAnchorCard 
              label="Lucro Total" 
              value={formatCurrency(stats.lucroTotal)}
              valueClass={stats.lucroTotal >= 0 ? "text-emerald-400" : "text-red-400"}
              tooltip="Soma de todos os lucros/prejuízos das apostas liquidadas"
              size="lg"
              className="md:min-h-[90px]"
            />
          </div>
          {/* Nível 2: ROI + Taxa de Acerto (grid 2 colunas em mobile) */}
          <div className="grid grid-cols-2 gap-2 md:contents">
            <KPIAnchorCard 
              label="ROI" 
              value={formatPercent(stats.roi)}
              valueClass={stats.roi >= 0 ? "text-emerald-400" : "text-red-400"}
              tooltip="Retorno sobre o volume total apostado"
            />
            <KPIAnchorCard 
              label="Taxa de Acerto" 
              value={`${stats.taxaAcerto.toFixed(1)}%`}
              valueClass="text-lime-400"
              tooltip={`${stats.totalDuplos} duplos em ${stats.totalLiquidadas} apostas liquidadas`}
            />
          </div>
        </div>

        {/* Performance Duplo */}
        <div>
          <KPISectionHeader title="Performance Duplo" icon={Target} color="lime" />
          <div className="grid grid-cols-2 gap-1.5 md:gap-2">
            <KPIStatCell 
              label="1 Duplo a cada" 
              value={`${stats.duploACadaXEntradas} entradas`}
              tooltip="Frequência média de duplos por entrada"
            />
            <KPIStatCell 
              label="1 Duplo a cada" 
              value={`${stats.duploACadaXDias} dias`}
              tooltip="Frequência média de duplos por dia operado"
            />
            <KPIStatCell 
              label="Máx. sem duplo" 
              value={`${stats.maxSemDuplo} entradas`}
              valueClass={stats.maxSemDuplo > 10 ? "text-amber-400" : ""}
              tooltip="Maior sequência de entradas consecutivas sem duplo"
            />
            <KPIStatCell 
              label="Máx. período" 
              value={`${stats.maxPeriodoSemDuplo} dias`}
              valueClass={stats.maxPeriodoSemDuplo > 7 ? "text-amber-400" : ""}
              tooltip="Maior intervalo em dias entre duplos"
            />
          </div>
        </div>

        {/* Financeiro */}
        <div>
          <KPISectionHeader title="Financeiro" icon={DollarSign} color="emerald" />
          <div className="grid grid-cols-2 gap-1.5 md:gap-2">
            <KPIStatCell 
              label="Volume Total" 
              value={formatCurrency(stats.volumeTotal)}
              tooltip="Valor total apostado no período"
            />
            <KPIStatCell 
              label="Em Curso" 
              value={formatCurrency(stats.volumeEmCurso)}
              valueClass="text-blue-400"
              tooltip={`${stats.pendentes} apostas pendentes`}
            />
            <KPIStatCell 
              label="Maior Lucro" 
              value={formatCurrency(stats.maiorLucro)}
              valueClass="text-emerald-400"
              tooltip="Maior lucro em uma única entrada"
            />
            <KPIStatCell 
              label="Stake Média" 
              value={formatCurrency(stats.stakeMedia)}
              tooltip="Valor médio por entrada"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
