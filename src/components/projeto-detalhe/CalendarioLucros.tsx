import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
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
import { parseLocalDateTime, extractLocalDateKey } from "@/utils/dateUtils";

interface ApostaData {
  data_aposta: string;
  resultado: string | null;
  lucro_prejuizo: number | null;
}

/** Entrada extra de lucro (cashback, giros grátis, etc.) por competência */
export interface ExtraLucroCalendarioEntry {
  data: string; // YYYY-MM-DD (data de competência)
  valor: number;
}

interface CalendarioLucrosProps {
  apostas: ApostaData[];
  /** Entradas extras de lucro (cashback, giros grátis) para consolidar no calendário */
  extrasLucro?: ExtraLucroCalendarioEntry[];
  titulo?: string;
  accentColor?: string;
  compact?: boolean;
  formatCurrency?: (value: number) => string;
  /** Callback disparado quando o lucro total do mês exibido muda (navegação ou dados) */
  onMonthTotalChange?: (total: number) => void;
}

// Fallback para formatação de moeda
const defaultFormatCurrencyCompact = (value: number): string => {
  if (Math.abs(value) >= 1000) {
    return `${value >= 0 ? "" : "-"}R$ ${(Math.abs(value) / 1000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const defaultFormatCurrencyFull = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

export function CalendarioLucros({ 
  apostas, 
  extrasLucro = [],
  titulo = "Calendário de Lucros",
  accentColor = "purple",
  compact = false,
  formatCurrency: formatCurrencyProp,
  onMonthTotalChange,
}: CalendarioLucrosProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Agrupar lucro por dia (apostas + extras por competência)
  const lucroPorDia = useMemo(() => {
    const mapa = new Map<string, { lucro: number; count: number }>();
    
    // 1. Apostas liquidadas
    apostas.forEach((aposta) => {
      const isLiquidada = aposta.resultado 
        ? aposta.resultado !== "PENDENTE" 
        : aposta.lucro_prejuizo !== null && aposta.lucro_prejuizo !== undefined;
      
      if (!isLiquidada) return;
      
      const dataKey = extractLocalDateKey(aposta.data_aposta);
      const atual = mapa.get(dataKey) || { lucro: 0, count: 0 };
      
      mapa.set(dataKey, {
        lucro: atual.lucro + (aposta.lucro_prejuizo || 0),
        count: atual.count + 1
      });
    });

    // 2. Extras (cashback, giros grátis) por data de competência
    extrasLucro.forEach((extra) => {
      const dataKey = extra.data.includes('T') ? extra.data.split('T')[0] : extra.data;
      const atual = mapa.get(dataKey) || { lucro: 0, count: 0 };
      mapa.set(dataKey, {
        lucro: atual.lucro + extra.valor,
        count: atual.count > 0 ? atual.count : 1, // garante que o dia apareça no calendário
      });
    });
    
    return mapa;
  }, [apostas, extrasLucro]);

  // Calcular dias do mês para exibição
  const diasDoMes = useMemo(() => {
    const inicio = startOfMonth(currentMonth);
    const fim = endOfMonth(currentMonth);
    
    // Pegar o início da semana do primeiro dia do mês
    const inicioSemana = startOfWeek(inicio, { weekStartsOn: 0 }); // Domingo
    // Pegar o fim da semana do último dia do mês
    const fimSemana = endOfWeek(fim, { weekStartsOn: 0 });
    
    return eachDayOfInterval({ start: inicioSemana, end: fimSemana });
  }, [currentMonth]);

  // Estatísticas do mês (apostas + extras por competência)
  const estatisticasMes = useMemo(() => {
    let lucroTotal = 0;
    let totalApostas = 0;
    
    // 1. Apostas liquidadas no mês
    apostas.forEach((aposta) => {
      const dataAposta = parseLocalDateTime(aposta.data_aposta);
      if (isSameMonth(dataAposta, currentMonth)) {
        const isLiquidada = aposta.resultado 
          ? aposta.resultado !== "PENDENTE" 
          : aposta.lucro_prejuizo !== null && aposta.lucro_prejuizo !== undefined;
        
        if (isLiquidada) {
          lucroTotal += aposta.lucro_prejuizo || 0;
          totalApostas++;
        }
      }
    });

    // 2. Extras (cashback, giros grátis) com competência no mês
    const mesAno = format(currentMonth, "yyyy-MM");
    extrasLucro.forEach((extra) => {
      const extraDate = extra.data.includes('T') ? extra.data.split('T')[0] : extra.data;
      if (extraDate.startsWith(mesAno)) {
        lucroTotal += extra.valor;
      }
    });
    
    return { lucroTotal, totalApostas };
  }, [apostas, extrasLucro, currentMonth]);

  // Notifica o pai quando o lucro do mês muda
  useEffect(() => {
    onMonthTotalChange?.(estatisticasMes.lucroTotal);
  }, [estatisticasMes.lucroTotal, onMonthTotalChange]);

  const formatCurrencyValue = formatCurrencyProp || defaultFormatCurrencyCompact;
  const formatFullCurrency = formatCurrencyProp || defaultFormatCurrencyFull;

  const hoje = new Date();
  const diasSemana = ["D", "S", "T", "Q", "Q", "S", "S"];

  const irParaHoje = () => {
    setCurrentMonth(new Date());
  };

  const accentClasses = {
    purple: "border-purple-500/20",
    emerald: "border-emerald-500/20",
    blue: "border-blue-500/20",
    amber: "border-amber-500/20"
  };

  if (compact) {
    return (
      <div className="p-4 min-w-[320px]">
        {/* Navegação do mês */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={irParaHoje}
          >
            Hoje
          </Button>
        </div>

        {/* Calendário */}
        <div className="grid grid-cols-7 gap-1">
          {diasSemana.map((dia, idx) => (
            <div key={idx} className="text-center text-xs text-muted-foreground font-medium py-1">{dia}</div>
          ))}
          {diasDoMes.map((dia, idx) => {
            const dataKey = format(dia, "yyyy-MM-dd");
            const dadosDia = lucroPorDia.get(dataKey);
            const lucro = dadosDia?.lucro || 0;
            const temApostas = dadosDia && dadosDia.count > 0;
            const isHoje = isSameDay(dia, hoje);
            const isMesAtual = isSameMonth(dia, currentMonth);
            let bgClass = "";
            let textClass = "text-muted-foreground";
            if (temApostas && isMesAtual) {
              if (lucro > 0) { bgClass = "bg-emerald-500/20"; textClass = "text-emerald-400"; }
              else if (lucro < 0) { bgClass = "bg-red-500/20"; textClass = "text-red-400"; }
              else { bgClass = "bg-muted/40"; }
            }
            return (
              <div key={idx} className={cn("relative aspect-square flex flex-col items-center justify-center rounded text-xs p-0.5", bgClass, isHoje && "ring-1 ring-primary", !isMesAtual && "opacity-30")}>
                <span className={cn("font-medium", !isMesAtual ? "text-muted-foreground/50" : "text-foreground")}>{format(dia, "d")}</span>
                {temApostas && isMesAtual && <span className={cn("text-[10px] font-medium tabular-nums", textClass)}>{formatCurrencyValue(lucro)}</span>}
              </div>
            );
          })}
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="bg-muted/40 rounded px-3 py-2">
            <div className="text-xs text-muted-foreground">Lucro do mês</div>
            <div className={cn("text-sm font-semibold tabular-nums", estatisticasMes.lucroTotal > 0 ? "text-emerald-400" : estatisticasMes.lucroTotal < 0 ? "text-red-400" : "text-muted-foreground")}>{formatFullCurrency(estatisticasMes.lucroTotal)}</div>
          </div>
          <div className="bg-muted/40 rounded px-3 py-2">
            <div className="text-xs text-muted-foreground">Apostas do mês</div>
            <div className="text-sm font-semibold tabular-nums text-foreground">{estatisticasMes.totalApostas}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className={cn("", accentClasses[accentColor as keyof typeof accentClasses] || accentClasses.purple)}>
      <CardHeader className="py-3 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        {/* Navegação do mês */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={irParaHoje}
          >
            Hoje
          </Button>
        </div>

        {/* Calendário */}
        <div className="grid grid-cols-7 gap-1">
          {/* Cabeçalho dos dias da semana */}
          {diasSemana.map((dia, idx) => (
            <div 
              key={idx} 
              className="text-center text-xs text-muted-foreground font-medium py-1"
            >
              {dia}
            </div>
          ))}

          {/* Dias do mês */}
          {diasDoMes.map((dia, idx) => {
            const dataKey = format(dia, "yyyy-MM-dd");
            const dadosDia = lucroPorDia.get(dataKey);
            const lucro = dadosDia?.lucro || 0;
            const temApostas = dadosDia && dadosDia.count > 0;
            const isHoje = isSameDay(dia, hoje);
            const isMesAtual = isSameMonth(dia, currentMonth);

            let bgClass = "";
            let textClass = "text-muted-foreground";

            if (temApostas && isMesAtual) {
              if (lucro > 0) {
                bgClass = "bg-emerald-500/20";
                textClass = "text-emerald-400";
              } else if (lucro < 0) {
                bgClass = "bg-red-500/20";
                textClass = "text-red-400";
              } else {
                bgClass = "bg-muted/40";
                textClass = "text-muted-foreground";
              }
            }

            return (
              <div
                key={idx}
                className={cn(
                  "relative aspect-square flex flex-col items-center justify-center rounded text-xs p-0.5",
                  bgClass,
                  isHoje && "ring-1 ring-primary",
                  !isMesAtual && "opacity-30"
                )}
              >
                <span className={cn(
                  "font-medium",
                  !isMesAtual ? "text-muted-foreground/50" : "text-foreground"
                )}>
                  {format(dia, "d")}
                </span>
                {temApostas && isMesAtual && (
                  <span className={cn("text-[10px] font-medium tabular-nums", textClass)}>
                    {formatCurrencyValue(lucro)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Resumo do mês */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="bg-muted/40 rounded px-3 py-2">
            <div className="text-xs text-muted-foreground">Lucro do mês</div>
            <div className={cn(
              "text-sm font-semibold tabular-nums",
              estatisticasMes.lucroTotal > 0 ? "text-emerald-400" : 
              estatisticasMes.lucroTotal < 0 ? "text-red-400" : "text-muted-foreground"
            )}>
              {formatFullCurrency(estatisticasMes.lucroTotal)}
            </div>
          </div>
          <div className="bg-muted/40 rounded px-3 py-2">
            <div className="text-xs text-muted-foreground">Apostas do mês</div>
            <div className="text-sm font-semibold tabular-nums text-foreground">
              {estatisticasMes.totalApostas}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
