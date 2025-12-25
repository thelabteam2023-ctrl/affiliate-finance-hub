import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  TrendingUp, 
  AlertTriangle,
  Zap,
  Target,
  Calendar,
  Clock,
  DollarSign,
  Percent
} from "lucide-react";
import { format, differenceInDays } from "date-fns";

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
}

// Componente de KPI âncora (destaque máximo)
const AnchorKPI = ({ 
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
    <div className="flex flex-col items-center justify-center bg-gradient-to-br from-muted/60 to-muted/30 rounded-xl px-4 py-4 border border-border/30 min-h-[90px]">
      <span className={`font-bold tabular-nums text-2xl lg:text-3xl ${valueClass}`}>{value}</span>
      <span className="text-muted-foreground text-xs mt-1.5 text-center">{label}</span>
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

// Componente de célula de estatística
const StatCell = ({ 
  label, 
  value, 
  valueClass = "",
  tooltip,
  size = "normal"
}: { 
  label: string; 
  value: string | number; 
  valueClass?: string;
  tooltip?: string;
  size?: "small" | "normal";
}) => {
  const content = (
    <div className={`flex items-center justify-between bg-muted/40 rounded-lg ${size === "small" ? "px-2.5 py-1.5" : "px-3 py-2.5"}`}>
      <span className={`text-muted-foreground ${size === "small" ? "text-[10px]" : "text-xs"}`}>{label}</span>
      <span className={`font-semibold tabular-nums ${size === "small" ? "text-xs" : "text-sm"} ${valueClass}`}>{value}</span>
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

// Cabeçalho de seção
const SectionHeader = ({ 
  title, 
  icon: Icon,
  color = "lime"
}: { 
  title: string; 
  icon?: React.ElementType;
  color?: "lime" | "emerald" | "amber" | "blue";
}) => {
  const colorClasses = {
    lime: "bg-lime-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    blue: "bg-blue-500"
  };
  
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={`w-1 h-4 ${colorClasses[color]} rounded-full`} />
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
    </div>
  );
};

export function DuploGreenStatisticsCard({ apostas }: DuploGreenStatisticsCardProps) {
  const stats = useMemo(() => {
    const getStake = (a: Aposta) => {
      const value = typeof a.stake_total === "number" ? a.stake_total : typeof a.stake === "number" ? a.stake : 0;
      return Number.isFinite(value) ? value : 0;
    };

    // Apostas liquidadas (com resultado)
    const liquidadas = apostas.filter(a => a.resultado && a.resultado !== "PENDENTE");
    const pendentes = apostas.filter(a => !a.resultado || a.resultado === "PENDENTE");
    
    // Lucros e resultados
    const lucros = liquidadas.map(a => a.lucro_prejuizo || 0);
    const lucroTotal = lucros.reduce((acc, l) => acc + l, 0);
    const maiorLucro = lucros.length > 0 ? Math.max(...lucros, 0) : 0;
    
    // Volume e stake
    const volumeTotal = apostas.reduce((acc, a) => acc + getStake(a), 0);
    const volumeEmCurso = pendentes.reduce((acc, a) => acc + getStake(a), 0);
    const stakeMedia = apostas.length > 0 ? volumeTotal / apostas.length : 0;
    
    // ROI
    const roi = volumeTotal > 0 ? (lucroTotal / volumeTotal) * 100 : 0;
    
    // Duplos (GREEN ou MEIO_GREEN)
    const duplos = liquidadas.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN");
    const totalDuplos = duplos.length;
    const taxaAcerto = liquidadas.length > 0 ? (totalDuplos / liquidadas.length) * 100 : 0;
    
    // 1 Duplo a cada X entradas
    const duploACadaXEntradas = liquidadas.length > 0 && totalDuplos > 0 
      ? (liquidadas.length / totalDuplos).toFixed(1) 
      : "-";
    
    // Dias operados e frequência temporal
    const datasUnicas = new Set(apostas.map(a => format(new Date(a.data_aposta), "yyyy-MM-dd")));
    const diasOperados = datasUnicas.size;
    const duploACadaXDias = diasOperados > 0 && totalDuplos > 0 
      ? (diasOperados / totalDuplos).toFixed(1) 
      : "-";
    
    // Calcular maior sequência sem duplo (entradas seguidas sem GREEN/MEIO_GREEN)
    // Ordenar por data
    const sortedLiquidadas = [...liquidadas].sort(
      (a, b) => new Date(a.data_aposta).getTime() - new Date(b.data_aposta).getTime()
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
    
    // Calcular maior período sem duplo (em dias)
    // Agrupar duplos por data e encontrar maior gap
    const duplosPorData = duplos.map(d => new Date(d.data_aposta).getTime()).sort((a, b) => a - b);
    let maxPeriodoSemDuplo = 0;
    
    if (duplosPorData.length >= 2) {
      for (let i = 1; i < duplosPorData.length; i++) {
        const diff = differenceInDays(new Date(duplosPorData[i]), new Date(duplosPorData[i - 1]));
        maxPeriodoSemDuplo = Math.max(maxPeriodoSemDuplo, diff);
      }
    } else if (apostas.length > 0 && totalDuplos <= 1) {
      // Se há apostas mas só 1 ou nenhum duplo, calcular do início ao fim
      const datasApostas = apostas.map(a => new Date(a.data_aposta).getTime()).sort((a, b) => a - b);
      if (datasApostas.length >= 2) {
        maxPeriodoSemDuplo = differenceInDays(new Date(datasApostas[datasApostas.length - 1]), new Date(datasApostas[0]));
      }
    }
    
    // Juice médio (spread_calculado)
    const spreads = apostas
      .filter(a => typeof a.spread_calculado === "number" && Number.isFinite(a.spread_calculado))
      .map(a => a.spread_calculado as number);
    const juiceMedio = spreads.length > 0 
      ? (spreads.reduce((acc, s) => acc + s, 0) / spreads.length) 
      : null;
    
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
      juiceMedio,
      pendentes: pendentes.length
    };
  }, [apostas]);

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Zap className="w-4 h-4 text-lime-500" />
          Estatísticas Duplo Green
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* KPIs Âncora - 3 colunas */}
        <div className="grid grid-cols-3 gap-3">
          <AnchorKPI 
            label="Lucro Total" 
            value={formatCurrency(stats.lucroTotal)}
            valueClass={stats.lucroTotal >= 0 ? "text-emerald-400" : "text-red-400"}
            tooltip="Soma de todos os lucros/prejuízos das apostas liquidadas"
          />
          <AnchorKPI 
            label="ROI" 
            value={formatPercent(stats.roi)}
            valueClass={stats.roi >= 0 ? "text-emerald-400" : "text-red-400"}
            tooltip="Retorno sobre o volume total apostado"
          />
          <AnchorKPI 
            label="Taxa de Acerto" 
            value={`${stats.taxaAcerto.toFixed(1)}%`}
            valueClass="text-lime-400"
            tooltip={`${stats.totalDuplos} duplos em ${stats.totalLiquidadas} apostas liquidadas`}
          />
        </div>

        {/* Performance Duplo */}
        <div>
          <SectionHeader title="Performance Duplo" icon={Target} color="lime" />
          <div className="grid grid-cols-2 gap-2">
            <StatCell 
              label="1 Duplo a cada" 
              value={`${stats.duploACadaXEntradas} entradas`}
              tooltip="Frequência média de duplos por entrada"
            />
            <StatCell 
              label="1 Duplo a cada" 
              value={`${stats.duploACadaXDias} dias`}
              tooltip="Frequência média de duplos por dia operado"
            />
            <StatCell 
              label="Máx. sem duplo" 
              value={`${stats.maxSemDuplo} entradas`}
              valueClass={stats.maxSemDuplo > 10 ? "text-amber-400" : ""}
              tooltip="Maior sequência de entradas consecutivas sem duplo"
            />
            <StatCell 
              label="Máx. período" 
              value={`${stats.maxPeriodoSemDuplo} dias`}
              valueClass={stats.maxPeriodoSemDuplo > 7 ? "text-amber-400" : ""}
              tooltip="Maior intervalo em dias entre duplos"
            />
          </div>
        </div>

        {/* Financeiro */}
        <div>
          <SectionHeader title="Financeiro" icon={DollarSign} color="emerald" />
          <div className="grid grid-cols-2 gap-2">
            <StatCell 
              label="Volume Total" 
              value={formatCurrency(stats.volumeTotal)}
              tooltip="Valor total apostado no período"
            />
            <StatCell 
              label="Em Curso" 
              value={formatCurrency(stats.volumeEmCurso)}
              valueClass="text-blue-400"
              tooltip={`${stats.pendentes} apostas pendentes`}
            />
            <StatCell 
              label="Maior Lucro" 
              value={formatCurrency(stats.maiorLucro)}
              valueClass="text-emerald-400"
              tooltip="Maior lucro em uma única entrada"
            />
            <StatCell 
              label="Stake Média" 
              value={formatCurrency(stats.stakeMedia)}
              tooltip="Valor médio por entrada"
            />
          </div>
        </div>

        {/* Eficiência (só mostra se houver dados de juice) */}
        {stats.juiceMedio !== null && (
          <div>
            <SectionHeader title="Eficiência Operacional" icon={Percent} color="amber" />
            <div className="grid grid-cols-1 gap-2">
              <StatCell 
                label="Juice Médio" 
                value={`${stats.juiceMedio.toFixed(2)}%`}
                valueClass={stats.juiceMedio < 3 ? "text-emerald-400" : stats.juiceMedio < 5 ? "text-amber-400" : "text-red-400"}
                tooltip="Margem média das operações (quanto menor, melhor)"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
