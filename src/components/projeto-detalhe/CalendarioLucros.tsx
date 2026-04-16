import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Calendar, Flame, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { extractLocalDateKey } from "@/utils/dateUtils";

interface ApostaData {
  data_aposta: string;
  resultado: string | null;
  lucro_prejuizo: number | null;
  operacoes?: number;
}

export interface ExtraLucroCalendarioEntry {
  data: string;
  valor: number;
}

interface CalendarioLucrosProps {
  apostas: ApostaData[];
  extrasLucro?: ExtraLucroCalendarioEntry[];
  titulo?: string;
  accentColor?: string;
  compact?: boolean;
  formatCurrency?: (value: number) => string;
  onMonthTotalChange?: (total: number) => void;
  initialMonth?: Date;
  /** Quando fornecido, as estatísticas agregam TODO o período (ex: ciclo multi-mês) */
  periodRange?: { start: Date; end: Date; label?: string };
}

const defaultFormatCurrencyFull = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

/** Formata valor compacto para caber na célula do calendário */
function formatCompactValue(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const formatter = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (abs >= 1000) {
    return `${sign}${formatter.format(abs / 1000)}k`;
  }

  return `${sign}${formatter.format(abs)}`;
}

/** Calcula a intensidade do heatmap (0-4) com base no valor */
function getIntensityLevel(value: number, maxAbsValue: number): number {
  if (maxAbsValue === 0) return 0;
  const ratio = Math.abs(value) / maxAbsValue;
  if (ratio < 0.15) return 1;
  if (ratio < 0.4) return 2;
  if (ratio < 0.7) return 3;
  return 4;
}

function getHeatmapTone(lucro: number, temDados: boolean, maxAbsLucro: number) {
  if (!temDados) {
    return {
      cell: "bg-muted/15 dark:bg-muted/15 border border-border/20",
      day: "text-muted-foreground/55",
      value: "text-muted-foreground/55",
    };
  }

  if (lucro === 0) {
    return {
      cell: "bg-secondary/70 dark:bg-secondary/70 border border-border/35",
      day: "text-foreground/80",
      value: "text-muted-foreground",
    };
  }

  const level = getIntensityLevel(lucro, maxAbsLucro);

  if (lucro > 0) {
    switch (level) {
      case 1:
        return {
          cell: "bg-emerald-100 dark:bg-success/14 border border-emerald-200 dark:border-success/20",
          day: "text-emerald-700 dark:text-success",
          value: "text-emerald-700 dark:text-success",
        };
      case 2:
        return {
          cell: "bg-emerald-200 dark:bg-success/24 border border-emerald-300 dark:border-success/25",
          day: "text-emerald-800 dark:text-success",
          value: "text-emerald-800 dark:text-success",
        };
      case 3:
        return {
          cell: "bg-emerald-300 dark:bg-success/38 border border-emerald-400 dark:border-success/30",
          day: "text-emerald-900 dark:text-emerald-200",
          value: "text-emerald-900 dark:text-emerald-200/90",
        };
      default:
        return {
          cell: "bg-emerald-500 dark:bg-success/58 border border-emerald-600 dark:border-success/35 shadow-soft",
          day: "text-emerald-950 dark:text-emerald-100",
          value: "text-emerald-950 dark:text-emerald-100/90",
        };
    }
  }

  switch (level) {
    case 1:
      return {
        cell: "bg-red-100 dark:bg-destructive/12 border border-red-200 dark:border-destructive/18",
        day: "text-red-700 dark:text-destructive",
        value: "text-red-700 dark:text-destructive",
      };
    case 2:
      return {
        cell: "bg-red-200 dark:bg-destructive/22 border border-red-300 dark:border-destructive/22",
        day: "text-red-800 dark:text-destructive",
        value: "text-red-800 dark:text-destructive",
      };
    case 3:
      return {
        cell: "bg-red-300 dark:bg-destructive/34 border border-red-400 dark:border-destructive/28",
        day: "text-red-900 dark:text-red-200",
        value: "text-red-900 dark:text-red-200/90",
      };
    default:
      return {
        cell: "bg-red-500 dark:bg-destructive/48 border border-red-600 dark:border-destructive/32 shadow-soft",
        day: "text-red-950 dark:text-red-100",
        value: "text-red-950 dark:text-red-100/90",
      };
  }
}

export function CalendarioLucros({ 
  apostas, 
  extrasLucro = [],
  titulo = "Calendário de Lucros",
  accentColor = "purple",
  compact = false,
  formatCurrency: formatCurrencyProp,
  onMonthTotalChange,
  initialMonth,
  periodRange,
}: CalendarioLucrosProps) {
  const [currentMonth, setCurrentMonth] = useState(initialMonth ?? new Date());

  useEffect(() => {
    if (initialMonth) {
      setCurrentMonth(initialMonth);
    }
  }, [initialMonth]);

  // Agrupar lucro por dia
  const lucroPorDia = useMemo(() => {
    const mapa = new Map<string, { lucro: number; count: number }>();
    
    apostas.forEach((aposta) => {
      const isLiquidada = aposta.resultado 
        ? aposta.resultado !== "PENDENTE" 
        : aposta.lucro_prejuizo !== null && aposta.lucro_prejuizo !== undefined;
      if (!isLiquidada) return;
      
      const dataKey = extractLocalDateKey(aposta.data_aposta);
      const atual = mapa.get(dataKey) || { lucro: 0, count: 0 };
      const ops = aposta.operacoes ?? 1;
      mapa.set(dataKey, {
        lucro: atual.lucro + (aposta.lucro_prejuizo || 0),
        count: atual.count + ops
      });
    });

    extrasLucro.forEach((extra) => {
      const dataKey = extra.data;
      if (!dataKey) return;
      const atual = mapa.get(dataKey) || { lucro: 0, count: 0 };
      mapa.set(dataKey, {
        lucro: atual.lucro + extra.valor,
        count: atual.count > 0 ? atual.count : 1,
      });
    });
    
    return mapa;
  }, [apostas, extrasLucro]);

  // Dias do mês para exibição
  const diasDoMes = useMemo(() => {
    const inicio = startOfMonth(currentMonth);
    const fim = endOfMonth(currentMonth);
    const inicioSemana = startOfWeek(inicio, { weekStartsOn: 0 });
    const fimSemana = endOfWeek(fim, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: inicioSemana, end: fimSemana });
  }, [currentMonth]);

  // Max valor absoluto do mês (para calcular intensidade relativa)
  const maxAbsLucro = useMemo(() => {
    let max = 0;
    const mesAno = format(currentMonth, "yyyy-MM");
    lucroPorDia.forEach((dados, key) => {
      if (key.startsWith(mesAno)) {
        max = Math.max(max, Math.abs(dados.lucro));
      }
    });
    return max;
  }, [lucroPorDia, currentMonth]);

  // Determinar se estamos em modo período completo (ciclo multi-mês)
  const isFullPeriodMode = !!periodRange;
  const periodPrefix = isFullPeriodMode ? null : format(currentMonth, "yyyy-MM");

  // Estatísticas — agrega mês atual OU período completo
  const estatisticasMes = useMemo(() => {
    let lucroTotal = 0;
    let totalApostas = 0;
    let diasPositivos = 0;
    let diasNegativos = 0;
    let diasNeutros = 0;
    let streakAtual = 0;
    let melhorStreak = 0;
    
    const matchesPeriod = (dataKey: string) => {
      if (!isFullPeriodMode) return dataKey.startsWith(periodPrefix!);
      // Em modo período completo, aceitar todas as datas que existam nos dados
      return true;
    };

    const diasOrdenados: { key: string; lucro: number }[] = [];
    
    apostas.forEach((aposta) => {
      const dataKey = extractLocalDateKey(aposta.data_aposta);
      if (matchesPeriod(dataKey)) {
        const isLiquidada = aposta.resultado 
          ? aposta.resultado !== "PENDENTE" 
          : aposta.lucro_prejuizo !== null && aposta.lucro_prejuizo !== undefined;
        if (isLiquidada) {
          lucroTotal += aposta.lucro_prejuizo || 0;
          totalApostas += aposta.operacoes ?? 1;
        }
      }
    });

    extrasLucro.forEach((extra) => {
      if (extra.data && matchesPeriod(extra.data)) {
        lucroTotal += extra.valor;
      }
    });

    // Contar dias por tipo
    lucroPorDia.forEach((dados, key) => {
      if (matchesPeriod(key) && dados.count > 0) {
        diasOrdenados.push({ key, lucro: dados.lucro });
        if (dados.lucro > 0) diasPositivos++;
        else if (dados.lucro < 0) diasNegativos++;
        else diasNeutros++;
      }
    });

    // Calcular melhor streak
    diasOrdenados.sort((a, b) => a.key.localeCompare(b.key));
    diasOrdenados.forEach(d => {
      if (d.lucro > 0) {
        streakAtual++;
        melhorStreak = Math.max(melhorStreak, streakAtual);
      } else {
        streakAtual = 0;
      }
    });
    
    return { lucroTotal, totalApostas, diasPositivos, diasNegativos, diasNeutros, melhorStreak };
  }, [apostas, extrasLucro, currentMonth, lucroPorDia, isFullPeriodMode, periodPrefix]);

  useEffect(() => {
    onMonthTotalChange?.(estatisticasMes.lucroTotal);
  }, [estatisticasMes.lucroTotal, onMonthTotalChange]);

  const formatFullCurrency = formatCurrencyProp || defaultFormatCurrencyFull;
  const hoje = new Date();
  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const diasSemanaShort = ["D", "S", "T", "Q", "Q", "S", "S"];

  const irParaHoje = () => setCurrentMonth(new Date());

  const renderDayTooltip = (dia: Date, dadosDia: { lucro: number; count: number } | undefined) => {
    const dataFormatada = format(dia, "dd 'de' MMMM, yyyy", { locale: ptBR });
    if (!dadosDia || (dadosDia.count === 0 && Math.abs(dadosDia.lucro) < 0.01)) {
      return (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-popover-foreground">{dataFormatada}</p>
          <p className="text-xs text-muted-foreground">Sem operações</p>
        </div>
      );
    }
    return (
      <div className="space-y-2 min-w-[176px]">
        <p className="text-xs font-medium text-popover-foreground">{dataFormatada}</p>
        <div className="h-px bg-border" />
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">Lucro/Prejuízo</span>
          <span className={cn(
            "text-xs font-semibold tabular-nums",
            dadosDia.lucro > 0 ? "text-success" : dadosDia.lucro < 0 ? "text-destructive" : "text-muted-foreground"
          )}>
            {formatFullCurrency(dadosDia.lucro)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">Operações</span>
          <span className="text-xs font-semibold tabular-nums text-popover-foreground">{dadosDia.count}</span>
        </div>
      </div>
    );
  };

  // ─── Render Heatmap Grid ───
  const renderHeatmapGrid = (isCompact: boolean) => (
    <TooltipProvider delayDuration={100}>
      <div className="grid grid-cols-7 gap-[4px]">
        {(isCompact ? diasSemanaShort : diasSemana).map((dia, idx) => (
          <div key={idx} className="pb-1 text-center text-[10px] font-semibold text-muted-foreground/75 select-none">
            {dia}
          </div>
        ))}

        {diasDoMes.map((dia, idx) => {
          const dataKey = format(dia, "yyyy-MM-dd");
          const dadosDia = lucroPorDia.get(dataKey);
          const temDados = dadosDia != null && (dadosDia.count > 0 || Math.abs(dadosDia.lucro) >= 0.01);
          const isMesAtual = isSameMonth(dia, currentMonth);
          const isHoje = isSameDay(dia, hoje);
          const lucro = dadosDia?.lucro || 0;

          if (!isMesAtual) {
            return <div key={idx} className="aspect-square rounded-md bg-transparent" />;
          }

          const tone = getHeatmapTone(lucro, temDados, maxAbsLucro);

          return (
            <Tooltip key={idx}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "aspect-square rounded-md flex flex-col items-center justify-center cursor-default transition-all duration-200 px-1",
                    tone.cell,
                    isHoje && "ring-2 ring-primary/60 ring-offset-2 ring-offset-popover",
                    "hover:scale-[1.04] hover:shadow-soft"
                  )}
                >
                  <span className={cn(
                    isCompact ? "text-[11px]" : "text-[12px]",
                    "font-semibold leading-none select-none tabular-nums",
                    tone.day
                  )}>
                    {format(dia, "d")}
                  </span>
                  {temDados && lucro !== 0 && (
                    <span className={cn(
                      isCompact ? "text-[9px]" : "text-[10px]",
                      "mt-1 font-bold leading-none select-none tabular-nums tracking-tight",
                      tone.value
                    )}>
                      {formatCompactValue(lucro)}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="border-border bg-popover shadow-xl">
                {renderDayTooltip(dia, dadosDia)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );

  const renderLegend = () => (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/75">
      <span>Menos</span>
      <div className="h-2.5 w-2.5 rounded-[3px] border border-border/20 bg-muted/15" />
      <div className="h-2.5 w-2.5 rounded-[3px] border border-emerald-200 dark:border-success/20 bg-emerald-100 dark:bg-success/14" />
      <div className="h-2.5 w-2.5 rounded-[3px] border border-emerald-300 dark:border-success/25 bg-emerald-200 dark:bg-success/24" />
      <div className="h-2.5 w-2.5 rounded-[3px] border border-emerald-400 dark:border-success/30 bg-emerald-300 dark:bg-success/38" />
      <div className="h-2.5 w-2.5 rounded-[3px] border border-emerald-600 dark:border-success/35 bg-emerald-500 dark:bg-success/58" />
      <span>Mais</span>
    </div>
  );

  const statsLabel = isFullPeriodMode 
    ? (periodRange?.label || "Período") 
    : format(currentMonth, "MMMM", { locale: ptBR });

  const renderStats = () => (
    <div className="mt-4">
      {isFullPeriodMode && (
        <div className="mb-2 text-center">
          <span className="text-[10px] font-medium text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full">
            Totais do {statsLabel}
          </span>
        </div>
      )}
      <div className="grid grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-border/40 bg-card-elevated px-3 py-2.5 text-center shadow-soft">
          <div className={cn(
            "text-base font-bold tabular-nums",
            estatisticasMes.lucroTotal > 0 ? "text-success" : 
            estatisticasMes.lucroTotal < 0 ? "text-destructive" : "text-muted-foreground"
          )}>
            {formatFullCurrency(estatisticasMes.lucroTotal)}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground/70">Lucro</div>
        </div>
        <div className="rounded-xl border border-border/40 bg-card-elevated px-3 py-2.5 text-center shadow-soft">
          <div className="text-base font-bold tabular-nums text-foreground">
            {estatisticasMes.totalApostas}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground/70">Operações</div>
        </div>
        <div className="rounded-xl border border-border/40 bg-card-elevated px-3 py-2.5 text-center shadow-soft">
          <div className="flex items-center justify-center gap-1">
            <span className="text-base font-bold tabular-nums text-success">{estatisticasMes.diasPositivos}</span>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-base font-bold tabular-nums text-destructive">{estatisticasMes.diasNegativos}</span>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground/70">Green / Red</div>
        </div>
        <div className="rounded-xl border border-border/40 bg-card-elevated px-3 py-2.5 text-center shadow-soft">
          <div className="flex items-center justify-center gap-1">
            <Flame className="h-3.5 w-3.5 text-warning" />
            <span className="text-base font-bold tabular-nums text-foreground">{estatisticasMes.melhorStreak}</span>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground/70">Streak</div>
        </div>
      </div>
    </div>
  );

  // ─── Navegação ───
  const renderNav = () => (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="text-sm font-semibold min-w-[120px] text-center capitalize text-foreground">
          {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        {renderLegend()}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-2"
          onClick={irParaHoje}
        >
          Hoje
        </Button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════
  // COMPACT MODE
  // ═══════════════════════════════════════
  if (compact) {
    return (
      <div className="min-w-[440px] rounded-2xl bg-popover p-4 text-popover-foreground">
        {renderNav()}
        <div className="mt-3">
          {renderHeatmapGrid(true)}
        </div>
        {renderStats()}
      </div>
    );
  }

  // ═══════════════════════════════════════
  // FULL MODE
  // ═══════════════════════════════════════
  return (
    <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
      <CardHeader className="py-3 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <Calendar className="h-4 w-4" />
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        {renderNav()}
        <div className="mt-3">
          {renderHeatmapGrid(false)}
        </div>
        {renderStats()}
      </CardContent>
    </Card>
  );
}
