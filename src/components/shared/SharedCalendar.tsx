import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, ChevronLeft, ChevronRight, Flame, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  daily: Array<{ dia: string; lucro: number; qtd: number }>;
  currencySymbol: string;
}

function getIntensityLevel(value: number, maxAbsValue: number): number {
  if (maxAbsValue === 0) return 0;
  const ratio = Math.abs(value) / maxAbsValue;
  if (ratio < 0.15) return 1;
  if (ratio < 0.4) return 2;
  if (ratio < 0.7) return 3;
  return 4;
}

function getHeatmapColor(lucro: number, temDados: boolean, maxAbs: number): string {
  if (!temDados) return "bg-muted/15";
  if (lucro === 0) return "bg-muted/30";
  const level = getIntensityLevel(lucro, maxAbs);
  if (lucro > 0) {
    switch (level) {
      case 1: return "bg-emerald-500/20";
      case 2: return "bg-emerald-500/35";
      case 3: return "bg-emerald-500/55";
      case 4: return "bg-emerald-500/75";
      default: return "bg-emerald-500/20";
    }
  } else {
    switch (level) {
      case 1: return "bg-red-500/20";
      case 2: return "bg-red-500/35";
      case 3: return "bg-red-500/55";
      case 4: return "bg-red-500/75";
      default: return "bg-red-500/20";
    }
  }
}

function getHeatmapBorder(lucro: number, temDados: boolean): string {
  if (!temDados) return "border-transparent";
  if (lucro === 0) return "border-border/30";
  if (lucro > 0) return "border-emerald-500/20";
  return "border-red-500/20";
}

function formatCompactValue(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}${k.toFixed(1).replace(".", ",")}k`;
  }
  if (abs >= 100) return `${sign}${Math.round(abs)}`;
  if (abs >= 10) return `${sign}${abs.toFixed(0)}`;
  return `${sign}${abs.toFixed(1)}`;
}

export function SharedCalendar({ daily, currencySymbol }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const monthData = useMemo(() => {
    if (!daily.length) return [];
    const months = new Map<string, Array<{ dia: string; lucro: number; qtd: number }>>();
    for (const d of daily) {
      const monthKey = d.dia.substring(0, 7);
      if (!months.has(monthKey)) months.set(monthKey, []);
      months.get(monthKey)!.push(d);
    }
    return Array.from(months.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, entries]) => {
        const totalLucro = entries.reduce((s, e) => s + e.lucro, 0);
        const totalOps = entries.reduce((s, e) => s + e.qtd, 0);
        const diasPositivos = entries.filter(e => e.lucro > 0).length;
        const diasNegativos = entries.filter(e => e.lucro < 0).length;
        const sorted = [...entries].sort((a, b) => a.dia.localeCompare(b.dia));
        let streak = 0, best = 0;
        sorted.forEach(e => { if (e.lucro > 0) { streak++; best = Math.max(best, streak); } else { streak = 0; } });
        const maxAbs = Math.max(...entries.map(e => Math.abs(e.lucro)), 0);
        return { month, entries, totalLucro, totalOps, diasPositivos, diasNegativos, melhorStreak: best, maxAbs };
      });
  }, [daily]);

  if (!monthData.length) {
    return (
      <Card className="border-border/40 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur-sm">
        <CardContent className="py-12 text-center text-muted-foreground">
          <CalendarDays className="h-8 w-8 mx-auto mb-3 text-muted-foreground/30" />
          Nenhuma aposta registrada
        </CardContent>
      </Card>
    );
  }

  const current = monthData[currentIndex];
  const { month, entries, totalLucro, totalOps, diasPositivos, diasNegativos, melhorStreak, maxAbs } = current;
  const [year, m] = month.split("-");
  const monthName = new Date(+year, +m - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const dayMap = new Map<number, { lucro: number; qtd: number }>();
  for (const e of entries) {
    const day = parseInt(e.dia.substring(8, 10));
    dayMap.set(day, e);
  }

  const daysInMonth = new Date(+year, +m, 0).getDate();
  const firstDayOfWeek = new Date(+year, +m - 1, 1).getDay();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === +year && today.getMonth() === +m - 1;

  const canPrev = currentIndex < monthData.length - 1;
  const canNext = currentIndex > 0;

  const formatFull = (v: number) => `${currencySymbol} ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <Card className="border-border/30 bg-gradient-to-b from-card/90 to-card/50 backdrop-blur-md shadow-soft overflow-hidden">
      <CardHeader className="py-4 pb-3 border-b border-border/20">
        <CardTitle className="text-sm font-semibold flex items-center gap-2.5 text-foreground">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow">
            <CalendarDays className="h-4 w-4 text-white" />
          </div>
          <span className="tracking-tight">Calendário de Performance</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-5 pb-5">
        {/* Navigation */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              disabled={!canPrev}
              onClick={() => setCurrentIndex(i => i + 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-bold min-w-[160px] text-center capitalize text-foreground tracking-tight">
              {monthName}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              disabled={!canNext}
              onClick={() => setCurrentIndex(i => i - 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Mini legend */}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
            <span>Menos</span>
            <div className="w-3 h-3 rounded-sm bg-emerald-500/15 border border-emerald-500/20" />
            <div className="w-3 h-3 rounded-sm bg-emerald-500/30 border border-emerald-500/25" />
            <div className="w-3 h-3 rounded-sm bg-emerald-500/55 border border-emerald-500/30" />
            <div className="w-3 h-3 rounded-sm bg-emerald-500/75 border border-emerald-500/35" />
            <span>Mais</span>
          </div>
        </div>

        {/* Heatmap Grid */}
        <TooltipProvider delayDuration={80}>
          <div className="grid grid-cols-7 gap-[3px]">
            {/* Week day headers */}
            {weekDays.map((d, idx) => (
              <div key={idx} className="text-center text-[10px] text-muted-foreground/50 font-medium py-1 select-none uppercase tracking-wider">
                {d}
              </div>
            ))}

            {/* Empty cells for alignment */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`e-${i}`} className="aspect-square rounded-lg bg-transparent" />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const entry = dayMap.get(day);
              const hasData = !!entry && entry.qtd > 0;
              const lucro = entry?.lucro ?? 0;
              const isToday = isCurrentMonth && today.getDate() === day;
              const bgClass = getHeatmapColor(lucro, hasData, maxAbs);
              const borderClass = getHeatmapBorder(lucro, hasData);

              return (
                <Tooltip key={day}>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "aspect-square rounded-lg flex flex-col items-center justify-center cursor-default transition-all duration-300 gap-0.5 border",
                      bgClass,
                      borderClass,
                      isToday && "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-glow",
                      "hover:scale-110 hover:z-10 hover:shadow-medium"
                    )}>
                      <span className={cn(
                        "text-[10px] font-semibold leading-none select-none",
                        hasData
                          ? lucro > 0 ? "text-emerald-300" : lucro < 0 ? "text-red-300" : "text-muted-foreground/70"
                          : "text-muted-foreground/25"
                      )}>
                        {day}
                      </span>
                      {hasData && lucro !== 0 && (
                        <span className={cn(
                          "text-[10px] font-bold leading-none select-none tabular-nums",
                          lucro > 0 ? "text-emerald-100/90" : "text-red-100/90"
                        )}>
                          {formatCompactValue(lucro)}
                        </span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-popover border-border shadow-xl p-3 rounded-xl">
                    <div className="space-y-2.5 min-w-[180px]">
                      <p className="text-xs font-semibold text-foreground">
                        {new Date(+year, +m - 1, day).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                      </p>
                      <div className="h-px bg-border" />
                      {hasData ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              {lucro > 0 ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : lucro < 0 ? <TrendingDown className="h-3 w-3 text-red-400" /> : <Minus className="h-3 w-3 text-muted-foreground" />}
                              Lucro/Prejuízo
                            </span>
                            <span className={cn("text-xs font-bold tabular-nums", lucro > 0 ? "text-emerald-400" : lucro < 0 ? "text-red-400" : "text-muted-foreground")}>
                              {formatFull(lucro)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs text-muted-foreground">Operações</span>
                            <span className="text-xs font-bold tabular-nums text-foreground">{entry!.qtd}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Sem operações</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-3 mt-5">
          <div className="bg-gradient-to-br from-muted/40 to-muted/20 rounded-xl px-3 py-3 text-center border border-border/20 hover:border-border/40 transition-colors">
            <div className={cn("text-sm font-bold tabular-nums", totalLucro > 0 ? "text-emerald-400" : totalLucro < 0 ? "text-red-400" : "text-muted-foreground")}>
              {formatFull(totalLucro)}
            </div>
            <div className="text-[10px] text-muted-foreground/60 mt-1 uppercase tracking-wider font-medium">Lucro</div>
          </div>
          <div className="bg-gradient-to-br from-muted/40 to-muted/20 rounded-xl px-3 py-3 text-center border border-border/20 hover:border-border/40 transition-colors">
            <div className="text-sm font-bold tabular-nums text-foreground">{totalOps}</div>
            <div className="text-[10px] text-muted-foreground/60 mt-1 uppercase tracking-wider font-medium">Operações</div>
          </div>
          <div className="bg-gradient-to-br from-muted/40 to-muted/20 rounded-xl px-3 py-3 text-center border border-border/20 hover:border-border/40 transition-colors">
            <div className="flex items-center justify-center gap-1">
              <span className="text-sm font-bold tabular-nums text-emerald-400">{diasPositivos}</span>
              <span className="text-muted-foreground/30 text-xs">/</span>
              <span className="text-sm font-bold tabular-nums text-red-400">{diasNegativos}</span>
            </div>
            <div className="text-[10px] text-muted-foreground/60 mt-1 uppercase tracking-wider font-medium">Green / Red</div>
          </div>
          <div className="bg-gradient-to-br from-muted/40 to-muted/20 rounded-xl px-3 py-3 text-center border border-border/20 hover:border-border/40 transition-colors">
            <div className="flex items-center justify-center gap-1">
              <Flame className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-sm font-bold tabular-nums text-foreground">{melhorStreak}</span>
            </div>
            <div className="text-[10px] text-muted-foreground/60 mt-1 uppercase tracking-wider font-medium">Streak</div>
          </div>
        </div>

        {/* Page dots */}
        {monthData.length > 1 && (
          <div className="flex justify-center gap-2 mt-5">
            {monthData.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  idx === currentIndex ? "w-5 bg-gradient-to-r from-primary to-primary-glow shadow-glow" : "w-1.5 bg-muted-foreground/25 hover:bg-muted-foreground/40"
                )}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

