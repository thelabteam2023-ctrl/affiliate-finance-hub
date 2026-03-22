import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, ChevronLeft, ChevronRight, Flame } from "lucide-react";
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
  if (!temDados) return "bg-muted/20";
  if (lucro === 0) return "bg-muted/40";
  const level = getIntensityLevel(lucro, maxAbs);
  if (lucro > 0) {
    switch (level) {
      case 1: return "bg-emerald-500/15";
      case 2: return "bg-emerald-500/30";
      case 3: return "bg-emerald-500/50";
      case 4: return "bg-emerald-500/70";
      default: return "bg-emerald-500/15";
    }
  } else {
    switch (level) {
      case 1: return "bg-red-500/15";
      case 2: return "bg-red-500/30";
      case 3: return "bg-red-500/50";
      case 4: return "bg-red-500/70";
      default: return "bg-red-500/15";
    }
  }
}

function formatCompactValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${value < 0 ? "-" : ""}${(abs / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (abs >= 100) return `${value < 0 ? "-" : ""}${Math.round(abs)}`;
  if (abs >= 10) return `${value < 0 ? "-" : ""}${abs.toFixed(0)}`;
  return `${value < 0 ? "-" : ""}${abs.toFixed(1)}`;
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
        // streak
        const sorted = [...entries].sort((a, b) => a.dia.localeCompare(b.dia));
        let streak = 0, best = 0;
        sorted.forEach(e => { if (e.lucro > 0) { streak++; best = Math.max(best, streak); } else { streak = 0; } });
        const maxAbs = Math.max(...entries.map(e => Math.abs(e.lucro)), 0);
        return { month, entries, totalLucro, totalOps, diasPositivos, diasNegativos, melhorStreak: best, maxAbs };
      });
  }, [daily]);

  if (!monthData.length) {
    return (
      <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
        <CardContent className="py-8 text-center text-muted-foreground">
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

  return (
    <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
      <CardHeader className="py-3 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          Calendário de Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" disabled={!canPrev} onClick={() => setCurrentIndex(i => i + 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-sm font-semibold min-w-[120px] text-center capitalize text-foreground">{monthName}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" disabled={!canNext} onClick={() => setCurrentIndex(i => i - 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
            <span>Menos</span>
            <div className="w-2.5 h-2.5 rounded-[2px] bg-muted/20" />
            <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-500/15" />
            <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-500/30" />
            <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-500/50" />
            <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-500/70" />
            <span>Mais</span>
          </div>
        </div>

        {/* Heatmap Grid */}
        <TooltipProvider delayDuration={100}>
          <div className="grid grid-cols-7 gap-[1px] mt-3">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, idx) => (
              <div key={idx} className="text-center text-[9px] text-muted-foreground/60 font-medium pb-0.5 select-none">{d}</div>
            ))}

            {/* Empty cells */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`e-${i}`} className="aspect-[1.6] rounded-[2px] bg-transparent" />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const entry = dayMap.get(day);
              const hasData = !!entry && entry.qtd > 0;
              const lucro = entry?.lucro ?? 0;
              const isToday = isCurrentMonth && today.getDate() === day;
              const bgClass = getHeatmapColor(lucro, hasData, maxAbs);

              return (
                <Tooltip key={day}>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "aspect-[1.4] rounded-[3px] flex flex-col items-center justify-center cursor-default transition-all duration-200 gap-0",
                      bgClass,
                      isToday && "ring-1.5 ring-primary ring-offset-1 ring-offset-background",
                      "hover:ring-1 hover:ring-foreground/20 hover:scale-105"
                    )}>
                      <span className={cn(
                        "text-[12px] font-semibold leading-none select-none",
                        hasData
                          ? lucro > 0 ? "text-emerald-300" : lucro < 0 ? "text-red-300" : "text-muted-foreground"
                          : "text-muted-foreground/40"
                      )}>
                        {day}
                      </span>
                      {hasData && lucro !== 0 && (
                        <span className={cn(
                          "text-[9px] font-semibold leading-none select-none mt-0.5 tabular-nums",
                          lucro > 0 ? "text-emerald-200/80" : "text-red-200/80"
                        )}>
                          {formatCompactValue(lucro)}
                        </span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-popover border-border shadow-xl">
                    <div className="space-y-2 min-w-[160px]">
                      <p className="text-xs font-medium text-foreground">
                        {new Date(+year, +m - 1, day).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                      </p>
                      <div className="h-px bg-border" />
                      {hasData ? (
                        <>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs text-muted-foreground">Lucro/Prejuízo</span>
                            <span className={cn("text-xs font-semibold tabular-nums", lucro > 0 ? "text-emerald-400" : lucro < 0 ? "text-red-400" : "text-muted-foreground")}>
                              {formatFull(lucro)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs text-muted-foreground">Operações</span>
                            <span className="text-xs font-semibold tabular-nums text-foreground">{entry!.qtd}</span>
                          </div>
                        </>
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

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          <div className="bg-muted/20 rounded-lg px-3 py-2.5 text-center">
            <div className={cn("text-sm font-bold tabular-nums", totalLucro > 0 ? "text-emerald-400" : totalLucro < 0 ? "text-red-400" : "text-muted-foreground")}>
              {formatFull(totalLucro)}
            </div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">Lucro</div>
          </div>
          <div className="bg-muted/20 rounded-lg px-3 py-2.5 text-center">
            <div className="text-sm font-bold tabular-nums text-foreground">{totalOps}</div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">Operações</div>
          </div>
          <div className="bg-muted/20 rounded-lg px-3 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1">
              <span className="text-sm font-bold tabular-nums text-emerald-400">{diasPositivos}</span>
              <span className="text-muted-foreground/40">/</span>
              <span className="text-sm font-bold tabular-nums text-red-400">{diasNegativos}</span>
            </div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">Green / Red</div>
          </div>
          <div className="bg-muted/20 rounded-lg px-3 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1">
              <Flame className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-sm font-bold tabular-nums text-foreground">{melhorStreak}</span>
            </div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">Streak</div>
          </div>
        </div>

        {/* Page dots */}
        {monthData.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-4">
            {monthData.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  idx === currentIndex ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"
                )}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
