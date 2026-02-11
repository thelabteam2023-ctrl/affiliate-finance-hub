import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  BarChart3, 
  TrendingUp, 
  AlertTriangle,
  Zap
} from "lucide-react";
import { ModernBarChart } from "@/components/ui/modern-bar-chart";
import { parseLocalDateTime, extractLocalDateKey } from "@/utils/dateUtils";
import { ChartEmptyState } from "@/components/ui/chart-empty-state";

interface Aposta {
  id: string;
  data_aposta: string;
  odd: number;
  odd_final?: number | null;
  stake: number;
  stake_total?: number | null;
  resultado: string | null;
  lucro_prejuizo: number | null;
  status: string;
  esporte?: string | null;
}

interface UnifiedStatisticsCardProps {
  apostas: Aposta[];
  accentColor?: string;
  /** Função de formatação de moeda (usa moeda do projeto quando fornecida) */
  formatCurrency?: (value: number) => string;
  /** Símbolo da moeda do projeto (ex: "$", "R$") */
  currencySymbol?: string;
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

// Componente de célula de estatística (peso médio)
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

// Componente de célula de risco (com ícone de alerta)
const RiskCell = ({ 
  label, 
  value, 
  valueClass = "",
  tooltip,
  isNegative = false
}: { 
  label: string; 
  value: string | number; 
  valueClass?: string;
  tooltip?: string;
  isNegative?: boolean;
}) => {
  const content = (
    <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2.5 border border-border/20">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`font-semibold tabular-nums text-sm ${valueClass}`}>{value}</span>
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

// Cabeçalho de seção com diferentes pesos
const SectionHeader = ({ 
  title, 
  icon: Icon,
  priority = "normal",
  color
}: { 
  title: string; 
  icon?: React.ElementType;
  priority?: "high" | "normal" | "low";
  color?: "purple" | "blue" | "emerald";
}) => {
  // Se cor customizada foi passada, usa ela
  const customBorderColor = color === "blue" 
    ? "bg-blue-500" 
    : color === "emerald" 
      ? "bg-emerald-500" 
      : null;
  
  const customIconColor = color === "blue" 
    ? "text-blue-400" 
    : color === "emerald" 
      ? "text-emerald-400" 
      : null;

  const borderColor = customBorderColor ?? (priority === "high" 
    ? "bg-amber-500" 
    : priority === "low" 
      ? "bg-muted-foreground/50" 
      : "bg-purple-500");
  
  const iconColor = customIconColor ?? (priority === "high" 
    ? "text-amber-500" 
    : priority === "low" 
      ? "text-muted-foreground" 
      : "text-purple-400");

  return (
    <div className={`mb-2.5 ${priority === "high" ? "mt-6 pt-4 border-t border-border/50" : "mt-5 first:mt-0"}`}>
      <div className="flex items-center gap-2">
        <div className={`w-0.5 h-4 ${borderColor} rounded-full`} />
        {Icon && <Icon className={`h-3.5 w-3.5 ${iconColor}`} />}
        <span className="text-xs font-semibold text-foreground/90 uppercase tracking-wider">
          {title}
        </span>
      </div>
    </div>
  );
};

// Formatador padrão (fallback se não for passado prop)
const defaultFormatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const formatPercent = (value: number) => {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

// Função para gerar faixas de valor dinamicamente com o símbolo correto
const getValueRanges = (symbol: string) => [
  { min: 0, max: 50, label: `${symbol} 0-49,99` },
  { min: 50, max: 100, label: `${symbol} 50-99,99` },
  { min: 100, max: 150, label: `${symbol} 100-149,99` },
  { min: 150, max: 200, label: `${symbol} 150-199,99` },
  { min: 200, max: 250, label: `${symbol} 200-249,99` },
  { min: 250, max: 300, label: `${symbol} 250-299,99` },
  { min: 300, max: 350, label: `${symbol} 300-349,99` },
  { min: 350, max: 400, label: `${symbol} 350-399,99` },
  { min: 400, max: 450, label: `${symbol} 400-449,99` },
  { min: 450, max: 500, label: `${symbol} 450-499,99` },
  { min: 500, max: Infinity, label: `${symbol} 500+` },
];

// Faixas de cotação (incrementos de 0.40, até 6+)
const ODD_RANGES = [
  { min: 1.00, max: 1.40, label: "1.00-1.39" },
  { min: 1.40, max: 1.80, label: "1.40-1.79" },
  { min: 1.80, max: 2.20, label: "1.80-2.19" },
  { min: 2.20, max: 2.60, label: "2.20-2.59" },
  { min: 2.60, max: 3.00, label: "2.60-2.99" },
  { min: 3.00, max: 3.40, label: "3.00-3.39" },
  { min: 3.40, max: 3.80, label: "3.40-3.79" },
  { min: 3.80, max: 4.20, label: "3.80-4.19" },
  { min: 4.20, max: 4.60, label: "4.20-4.59" },
  { min: 4.60, max: 5.00, label: "4.60-4.99" },
  { min: 5.00, max: 5.40, label: "5.00-5.39" },
  { min: 5.40, max: 5.80, label: "5.40-5.79" },
  { min: 5.80, max: 6.00, label: "5.80-5.99" },
  { min: 6.00, max: Infinity, label: "6+" },
];

export function UnifiedStatisticsCard({ apostas, accentColor = "hsl(270, 76%, 60%)", formatCurrency: formatCurrencyProp, currencySymbol = "R$" }: UnifiedStatisticsCardProps) {
  const formatCurrency = formatCurrencyProp || defaultFormatCurrency;
  const [activeTab, setActiveTab] = useState("resumo");
  
  // Gerar faixas de valor com o símbolo correto da moeda
  const VALUE_RANGES = useMemo(() => getValueRanges(currencySymbol), [currencySymbol]);

  // ==================== CÁLCULOS DE ESTATÍSTICAS ====================
  const stats = useMemo(() => {
    const getStake = (a: Aposta) => typeof a.stake_total === "number" ? a.stake_total : a.stake;
    const getOdd = (a: Aposta) => a.odd_final ?? a.odd ?? 0;

    // Apostas liquidadas vs abertas
    const liquidadas = apostas.filter(a => a.resultado && a.resultado !== "PENDENTE");
    const abertas = apostas.filter(a => !a.resultado || a.resultado === "PENDENTE");

    // === RESUMO ===
    const vencedoras = apostas.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN").length;
    const perdedoras = apostas.filter(a => a.resultado === "RED" || a.resultado === "MEIO_RED").length;
    const reembolsadas = apostas.filter(a => a.resultado === "VOID").length;
    const emCurso = abertas.length;

    const valorTotal = liquidadas.reduce((acc, a) => acc + getStake(a), 0);
    const valorEmCurso = abertas.reduce((acc, a) => acc + getStake(a), 0);
    const lucroTotal = liquidadas.reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0);
    const roi = valorTotal > 0 ? (lucroTotal / valorTotal) * 100 : 0;
    const taxaAcerto = liquidadas.length > 0 ? (vencedoras / liquidadas.length) * 100 : 0;

    // Séries
    let maxVitorias = 0, maxDerrotas = 0, currentVitorias = 0, currentDerrotas = 0;
    const sorted = [...liquidadas].sort((a, b) => 
      parseLocalDateTime(a.data_aposta).getTime() - parseLocalDateTime(b.data_aposta).getTime()
    );
    sorted.forEach(a => {
      if (a.resultado === "GREEN" || a.resultado === "MEIO_GREEN") {
        currentVitorias++;
        currentDerrotas = 0;
        maxVitorias = Math.max(maxVitorias, currentVitorias);
      } else if (a.resultado === "RED" || a.resultado === "MEIO_RED") {
        currentDerrotas++;
        currentVitorias = 0;
        maxDerrotas = Math.max(maxDerrotas, currentDerrotas);
      }
    });

    // === POR VALOR ===
    const porValor = VALUE_RANGES.map(range => {
      const filtered = apostas.filter(a => {
        const stake = getStake(a);
        return stake >= range.min && stake < range.max;
      });
      const filteredLiquidadas = filtered.filter(a => a.resultado && a.resultado !== "PENDENTE");
      const ganhas = filtered.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN").length;
      const volume = filtered.reduce((acc, a) => acc + getStake(a), 0);
      const lucro = filteredLiquidadas.reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0);
      const roiFaixa = volume > 0 ? (lucro / volume) * 100 : 0;
      const sucesso = filteredLiquidadas.length > 0 ? (ganhas / filteredLiquidadas.length) * 100 : 0;

      return {
        faixa: range.label,
        apostas: filtered.length,
        volume,
        lucro,
        roi: roiFaixa,
        sucesso,
      };
    }).filter(r => r.apostas > 0);

    // === POR COTAÇÃO ===
    // Filtrar apenas apostas com odd válida (excluir SUREBET, DUPLO_GREEN e outras múltiplas sem odd única)
    const apostasComOdd = apostas.filter(a => getOdd(a) > 0);
    
    const porCotacao = ODD_RANGES.map(range => {
      const filtered = apostasComOdd.filter(a => {
        const odd = getOdd(a);
        return odd >= range.min && odd < range.max;
      });
      const filteredLiquidadas = filtered.filter(a => a.resultado && a.resultado !== "PENDENTE");
      const ganhas = filteredLiquidadas.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN").length;
      const perdidas = filteredLiquidadas.filter(a => a.resultado === "RED" || a.resultado === "MEIO_RED").length;
      const reemb = filteredLiquidadas.filter(a => a.resultado === "VOID").length;
      const volume = filteredLiquidadas.reduce((acc, a) => acc + getStake(a), 0);
      const lucro = filteredLiquidadas.reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0);

      return {
        faixa: range.label,
        apostas: filteredLiquidadas.length,
        ganhas,
        perdidas,
        reembolsadas: reemb,
        volume,
        lucro,
      };
    }).filter(r => r.apostas > 0);

    // === POR ESPORTE ===
    const esporteMap = new Map<string, {
      apostas: number;
      ganhas: number;
      perdidas: number;
      reembolsadas: number;
      volume: number;
      lucro: number;
    }>();

    apostas.forEach(a => {
      const esporte = a.esporte || "Não informado";
      if (!esporteMap.has(esporte)) {
        esporteMap.set(esporte, { apostas: 0, ganhas: 0, perdidas: 0, reembolsadas: 0, volume: 0, lucro: 0 });
      }
      const entry = esporteMap.get(esporte)!;
      entry.apostas++;
      entry.volume += getStake(a);
      if (a.resultado === "GREEN" || a.resultado === "MEIO_GREEN") entry.ganhas++;
      else if (a.resultado === "RED" || a.resultado === "MEIO_RED") entry.perdidas++;
      else if (a.resultado === "VOID") entry.reembolsadas++;
      if (a.resultado && a.resultado !== "PENDENTE") {
        entry.lucro += a.lucro_prejuizo || 0;
      }
    });

    const porEsporte = Array.from(esporteMap.entries())
      .map(([esporte, data]) => ({
        esporte,
        ...data,
        roi: data.volume > 0 ? (data.lucro / data.volume) * 100 : 0,
        sucesso: (data.ganhas + data.perdidas + data.reembolsadas) > 0 
          ? (data.ganhas / (data.ganhas + data.perdidas + data.reembolsadas)) * 100 
          : 0,
      }))
      .sort((a, b) => b.lucro - a.lucro);

    // === AVANÇADO ===
    const lucros = liquidadas.map(a => a.lucro_prejuizo || 0);
    const maiorLucro = lucros.length > 0 ? Math.max(...lucros, 0) : 0;
    // Só considera prejuízos reais (valores negativos)
    const prejuizos = lucros.filter(v => v < 0);
    const maiorPerda = prejuizos.length > 0 ? Math.min(...prejuizos) : 0;

    // Maior prejuízo diário e maior lucro diário
    const lucroPorDia = new Map<string, number>();
    liquidadas.forEach(a => {
      // Usar extractLocalDateKey para garantir agrupamento por dia civil correto
      const dia = extractLocalDateKey(a.data_aposta);
      lucroPorDia.set(dia, (lucroPorDia.get(dia) || 0) + (a.lucro_prejuizo || 0));
    });
    const diasValues = Array.from(lucroPorDia.values());
    const maiorPrejuizoDiario = diasValues.length > 0 
      ? Math.min(...diasValues, 0) 
      : 0;
    const maiorLucroDiario = diasValues.length > 0 
      ? Math.max(...diasValues, 0) 
      : 0;

    // Odds médias e por faixas
    const odds = apostas.filter(a => getOdd(a) > 0).map(a => getOdd(a));
    const oddMedia = odds.length > 0 ? odds.reduce((a, b) => a + b, 0) / odds.length : 0;

    // Taxa de acerto em odds > 2.0
    const oddsAltas = apostas.filter(a => getOdd(a) > 2.0);
    const oddsAltasGanhas = oddsAltas.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN").length;
    const oddsAltasLiquidadas = oddsAltas.filter(a => a.resultado && a.resultado !== "PENDENTE").length;
    const taxaAcertoOddsAltas = oddsAltasLiquidadas > 0 ? (oddsAltasGanhas / oddsAltasLiquidadas) * 100 : 0;

    // Lucro por 1.000 apostados (moeda do projeto)
    const lucroPorMil = valorTotal > 0 ? (lucroTotal / valorTotal) * 1000 : 0;

    // Stake média
    const stakeMedia = apostas.length > 0 
      ? apostas.reduce((acc, a) => acc + getStake(a), 0) / apostas.length 
      : 0;
    const stakeMaxima = apostas.length > 0 
      ? Math.max(...apostas.map(a => getStake(a))) 
      : 0;

    // Maior cotação ganha
    const apostasGanhas = apostas.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN");
    const maiorCotacaoGanha = apostasGanhas.length > 0 
      ? Math.max(...apostasGanhas.map(a => getOdd(a))) 
      : 0;

    return {
      // Resumo
      vencedoras,
      perdedoras,
      reembolsadas,
      emCurso,
      valorTotal,
      valorEmCurso,
      lucroTotal,
      roi,
      taxaAcerto,
      maxVitorias,
      maxDerrotas,
      // Por Valor
      porValor,
      // Por Cotação
      porCotacao,
      // Por Esporte
      porEsporte,
      // Avançado
      maiorLucro,
      maiorPerda,
      maiorPrejuizoDiario,
      maiorLucroDiario,
      oddMedia,
      taxaAcertoOddsAltas,
      lucroPorMil,
      stakeMedia,
      stakeMaxima,
      maiorCotacaoGanha,
    };
  }, [apostas]);

  if (apostas.length === 0) {
    return null;
  }

  // ==================== RENDERIZAÇÃO DAS ABAS ====================

  // Aba Resumo (redesenhada com hierarquia visual)
  const renderResumo = () => (
    <div className="space-y-1">
      {/* 1️⃣ KPIs ÂNCORA - destaque máximo */}
      <div className="grid grid-cols-3 gap-3">
        <AnchorKPI 
          label="Lucro / Prejuízo" 
          value={formatCurrency(stats.lucroTotal)} 
          valueClass={stats.lucroTotal >= 0 ? "text-emerald-400" : "text-red-400"} 
        />
        <AnchorKPI 
          label="ROI" 
          value={formatPercent(stats.roi)} 
          valueClass={stats.roi >= 0 ? "text-emerald-400" : "text-red-400"}
          tooltip="Lucro total ÷ Volume total apostado"
        />
        <AnchorKPI 
          label="Taxa de Acerto" 
          value={`${stats.taxaAcerto.toFixed(1)}%`} 
          valueClass={stats.taxaAcerto >= 50 ? "text-emerald-400" : "text-amber-400"} 
        />
      </div>

      {/* 2️⃣ RESULTADOS OPERACIONAIS - layout compacto, peso médio */}
      <div>
        <SectionHeader title="Resultados Operacionais" icon={BarChart3} />
        <div className="grid grid-cols-4 gap-2">
          <StatCell label="Vencedoras" value={stats.vencedoras} valueClass="text-emerald-400" />
          <StatCell label="Perdedoras" value={stats.perdedoras} valueClass="text-red-400" />
          <StatCell label="Reembolsadas" value={stats.reembolsadas} />
          <StatCell label="Em curso" value={stats.emCurso} valueClass="text-blue-400" />
        </div>
      </div>

      {/* 3️⃣ FINANCEIRO - peso médio-alto */}
      <div>
        <SectionHeader title="Financeiro" icon={TrendingUp} color="emerald" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <StatCell label="Valor apostado" value={formatCurrency(stats.valorTotal)} />
          <StatCell label="Em curso" value={formatCurrency(stats.valorEmCurso)} valueClass="text-blue-400" />
          <StatCell 
            label="Stake média" 
            value={formatCurrency(stats.stakeMedia)}
            tooltip="Valor médio apostado"
          />
          <StatCell 
            label="Stake máxima" 
            value={formatCurrency(stats.stakeMaxima)}
            tooltip="Maior valor apostado"
          />
        </div>
      </div>

      {/* 4️⃣ ANÁLISE DE RISCO - pares verticais opostos */}
      <div>
        <SectionHeader title="Análise de Risco" icon={AlertTriangle} priority="high" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Par 1 — Unitário */}
          <div className="flex flex-col gap-1.5">
            <RiskCell 
              label="Maior lucro unitário" 
              value={formatCurrency(stats.maiorLucro)} 
              valueClass="text-emerald-400"
              tooltip="Maior lucro em uma única aposta"
            />
            <RiskCell 
              label="Maior prejuízo unitário" 
              value={formatCurrency(stats.maiorPerda)} 
              valueClass="text-red-400"
              tooltip="Maior perda em uma única aposta"
              isNegative
            />
          </div>

          {/* Par 2 — Diário */}
          <div className="flex flex-col gap-1.5">
            <RiskCell 
              label="Maior lucro diário" 
              value={formatCurrency(stats.maiorLucroDiario)} 
              valueClass="text-emerald-400"
              tooltip="Maior soma positiva em um único dia"
            />
            <RiskCell 
              label="Maior prejuízo diário" 
              value={formatCurrency(stats.maiorPrejuizoDiario)} 
              valueClass="text-red-400"
              tooltip="Maior soma negativa em um único dia"
              isNegative
            />
          </div>

          {/* Par 3 — Sequência */}
          <div className="flex flex-col gap-1.5">
            <RiskCell 
              label="Máx. vitórias seguidas" 
              value={stats.maxVitorias} 
              valueClass="text-emerald-400" 
            />
            <RiskCell 
              label="Máx. derrotas seguidas" 
              value={stats.maxDerrotas} 
              valueClass="text-red-400"
              isNegative
            />
          </div>
        </div>
      </div>

      {/* 5️⃣ EFICIÊNCIA E COTAÇÕES - bloco complementar, menor destaque */}
      <div>
        <SectionHeader title="Eficiência e Cotações" icon={Zap} priority="low" />
        <div className="grid grid-cols-3 gap-2">
          <StatCell 
            label={`Lucro por ${currencySymbol} 1.000`} 
            value={formatCurrency(stats.lucroPorMil)}
            valueClass={stats.lucroPorMil >= 0 ? "text-emerald-400" : "text-red-400"}
            tooltip={`Quanto você ganha para cada ${currencySymbol} 1.000 apostados`}
          />
          <StatCell 
            label="Maior odd ganha" 
            value={stats.maiorCotacaoGanha > 0 ? stats.maiorCotacaoGanha.toFixed(2) : "-"}
            valueClass="text-emerald-400"
          />
          <StatCell 
            label="Odd média" 
            value={stats.oddMedia > 0 ? stats.oddMedia.toFixed(2) : "-"}
          />
        </div>
      </div>
    </div>
  );

  // Aba Por Valor
  const renderPorValor = () => (
    <div className="space-y-4">
      {stats.porValor.length === 0 ? (
        <div className="py-8">
          <ChartEmptyState genericMessage="Nenhuma aposta registrada" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">Faixa</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Apostas</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Volume</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Lucro</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">ROI</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Sucesso</th>
              </tr>
            </thead>
            <tbody>
              {stats.porValor.map((row, i) => (
                <tr key={row.faixa} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                  <td className="py-2 px-2 font-medium">{row.faixa}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{row.apostas}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{formatCurrency(row.volume)}</td>
                  <td className={`py-2 px-2 text-right tabular-nums font-medium ${row.lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatCurrency(row.lucro)}
                  </td>
                  <td className={`py-2 px-2 text-right tabular-nums ${row.roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatPercent(row.roi)}
                  </td>
                  <td className={`py-2 px-2 text-right tabular-nums ${row.sucesso >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
                    {row.sucesso.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // Aba Por Cotação
  const renderPorCotacao = () => {
    const chartData = stats.porCotacao.map(d => ({
      faixa: d.faixa,
      lucro: d.lucro,
      ganhas: d.ganhas,
      perdidas: d.perdidas,
      reembolsadas: d.reembolsadas,
    }));

    if (chartData.length === 0) {
      return (
        <div className="py-8">
          <ChartEmptyState genericMessage="Nenhuma aposta registrada" />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Gráfico de Distribuição por Resultado */}
        <div className="overflow-hidden">
          <div className="text-xs font-medium text-muted-foreground mb-3">Distribuição por Faixa de Cotação</div>
          <ModernBarChart
            data={chartData}
            categoryKey="faixa"
            bars={[
              {
                dataKey: "ganhas",
                label: "Ganhas",
                gradientStart: "#22C55E",
                gradientEnd: "#16A34A",
              },
              {
                dataKey: "perdidas",
                label: "Perdidas",
                gradientStart: "#EF4444",
                gradientEnd: "#DC2626",
              },
              {
                dataKey: "reembolsadas",
                label: "Reembolsadas",
                gradientStart: "#64748B",
                gradientEnd: "#475569",
              },
            ]}
            height={200}
            barSize={14}
            showLabels={true}
            showLegend={true}
            labelDataKey="lucro"
            formatLabel={(_, { dataKey, payload }) => {
              if (dataKey !== "ganhas") return "";
              const lucro = Number(payload?.lucro ?? 0);
              if (!lucro) return "";
              const prefix = lucro > 0 ? "+" : "";
              return `${prefix}${formatCurrency(lucro).replace("R$", "R$")}`;
            }}
            customTooltipContent={(payload, label) => {
              const data = payload[0]?.payload;
              if (!data) return null;
              const total = data.ganhas + data.perdidas + data.reembolsadas;
              const winRate = total > 0 ? ((data.ganhas / total) * 100).toFixed(1) : "0";
              return (
                <>
                  <p className="font-medium text-sm mb-3 text-foreground">Odds {label}</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-b from-[#22C55E] to-[#16A34A]" />
                        <span className="text-xs text-muted-foreground">Ganhas</span>
                      </div>
                      <span className="text-sm font-semibold font-mono">{data.ganhas}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-b from-[#EF4444] to-[#DC2626]" />
                        <span className="text-xs text-muted-foreground">Perdidas</span>
                      </div>
                      <span className="text-sm font-semibold font-mono">{data.perdidas}</span>
                    </div>
                    {data.reembolsadas > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-b from-[#64748B] to-[#475569]" />
                          <span className="text-xs text-muted-foreground">Reemb.</span>
                        </div>
                        <span className="text-sm font-semibold font-mono">{data.reembolsadas}</span>
                      </div>
                    )}
                    <div className="border-t border-border/50 pt-2 mt-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{data.lucro >= 0 ? "Lucro" : "Prejuízo"}</span>
                        <span className={`text-sm font-mono font-semibold ${data.lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {formatCurrency(Math.abs(data.lucro))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Win Rate</span>
                        <span className="text-sm font-mono">{winRate}%</span>
                      </div>
                    </div>
                  </div>
                </>
              );
            }}
          />
        </div>
      </div>
    );
  };

  // Aba Por Esporte
  const renderPorEsporte = () => (
    <div className="space-y-4">
      {stats.porEsporte.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Nenhum esporte registrado
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">Esporte</th>
                <th className="text-right py-2 px-1 text-muted-foreground font-medium">Apostas</th>
                <th className="text-right py-2 px-1 text-muted-foreground font-medium">G</th>
                <th className="text-right py-2 px-1 text-muted-foreground font-medium">P</th>
                <th className="text-right py-2 px-1 text-muted-foreground font-medium">R</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Volume</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Lucro</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">ROI</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {stats.porEsporte.map((row, i) => (
                <tr key={row.esporte} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                  <td className="py-2 px-2 font-medium truncate max-w-[100px]" title={row.esporte}>
                    {row.esporte}
                  </td>
                  <td className="py-2 px-1 text-right tabular-nums">{row.apostas}</td>
                  <td className="py-2 px-1 text-right tabular-nums text-emerald-400">{row.ganhas}</td>
                  <td className="py-2 px-1 text-right tabular-nums text-red-400">{row.perdidas}</td>
                  <td className="py-2 px-1 text-right tabular-nums text-muted-foreground">{row.reembolsadas}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{formatCurrency(row.volume)}</td>
                  <td className={`py-2 px-2 text-right tabular-nums font-medium ${row.lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatCurrency(row.lucro)}
                  </td>
                  <td className={`py-2 px-2 text-right tabular-nums ${row.roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatPercent(row.roi)}
                  </td>
                  <td className={`py-2 px-2 text-right tabular-nums ${row.sucesso >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
                    {row.sucesso.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <Card className="border-purple-500/20">
      <CardHeader className="py-3 pb-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-purple-400" />
          Estatísticas
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2 pb-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-4 h-9 mb-4 bg-transparent gap-1 p-0" accentColor="bg-purple-500">
            <TabsTrigger 
              value="resumo" 
              className="text-xs rounded-lg transition-all duration-200 bg-transparent data-[state=inactive]:text-muted-foreground data-[state=active]:text-foreground data-[state=active]:font-medium hover:text-foreground/80"
            >
              Resumo
            </TabsTrigger>
            <TabsTrigger 
              value="por-valor" 
              className="text-xs rounded-lg transition-all duration-200 bg-transparent data-[state=inactive]:text-muted-foreground data-[state=active]:text-foreground data-[state=active]:font-medium hover:text-foreground/80"
            >
              Por Valor
            </TabsTrigger>
            <TabsTrigger 
              value="por-cotacao" 
              className="text-xs rounded-lg transition-all duration-200 bg-transparent data-[state=inactive]:text-muted-foreground data-[state=active]:text-foreground data-[state=active]:font-medium hover:text-foreground/80"
            >
              Por Cotação
            </TabsTrigger>
            <TabsTrigger 
              value="por-esporte" 
              className="text-xs rounded-lg transition-all duration-200 bg-transparent data-[state=inactive]:text-muted-foreground data-[state=active]:text-foreground data-[state=active]:font-medium hover:text-foreground/80"
            >
              Por Esporte
            </TabsTrigger>
          </TabsList>

          <TabsContent value="resumo" className="mt-0">
            {renderResumo()}
          </TabsContent>

          <TabsContent value="por-valor" className="mt-0">
            {renderPorValor()}
          </TabsContent>

          <TabsContent value="por-cotacao" className="mt-0">
            {renderPorCotacao()}
          </TabsContent>

          <TabsContent value="por-esporte" className="mt-0">
            {renderPorEsporte()}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
