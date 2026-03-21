import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";

interface Props {
  daily: Array<{ dia: string; lucro: number; qtd: number }>;
  currencySymbol: string;
}

export function SharedCalendar({ daily, currencySymbol }: Props) {
  const monthData = useMemo(() => {
    if (!daily.length) return [];

    // Group by month
    const months = new Map<string, Array<{ dia: string; lucro: number; qtd: number }>>();
    for (const d of daily) {
      const monthKey = d.dia.substring(0, 7); // YYYY-MM
      if (!months.has(monthKey)) months.set(monthKey, []);
      months.get(monthKey)!.push(d);
    }

    return Array.from(months.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 3) // show last 3 months
      .map(([month, entries]) => {
        const totalLucro = entries.reduce((s, e) => s + e.lucro, 0);
        const totalOps = entries.reduce((s, e) => s + e.qtd, 0);
        return { month, entries, totalLucro, totalOps };
      });
  }, [daily]);

  if (!monthData.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Nenhuma aposta registrada
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Calendário de Lucro Diário
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {monthData.map(({ month, entries, totalLucro }) => {
          const [year, m] = month.split("-");
          const monthName = new Date(+year, +m - 1).toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
          });

          // Build day map
          const dayMap = new Map<number, { lucro: number; qtd: number }>();
          for (const e of entries) {
            const day = parseInt(e.dia.substring(8, 10));
            dayMap.set(day, e);
          }

          const daysInMonth = new Date(+year, +m, 0).getDate();
          const firstDayOfWeek = new Date(+year, +m - 1, 1).getDay();

          return (
            <div key={month}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium capitalize">{monthName}</span>
                <span
                  className={`text-sm font-bold ${
                    totalLucro >= 0 ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {currencySymbol}{" "}
                  {totalLucro.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                  <div
                    key={d}
                    className="text-[10px] text-center text-muted-foreground font-medium"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty cells for offset */}
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const entry = dayMap.get(day);
                  const hasData = !!entry;
                  const lucro = entry?.lucro ?? 0;

                  return (
                    <div
                      key={day}
                      className={`rounded-md p-1 text-center text-[10px] min-h-[36px] flex flex-col items-center justify-center ${
                        hasData
                          ? lucro >= 0
                            ? "bg-green-500/15 text-green-600 dark:text-green-400"
                            : "bg-red-500/15 text-red-600 dark:text-red-400"
                          : "text-muted-foreground/50"
                      }`}
                    >
                      <span className="font-medium">{day}</span>
                      {hasData && (
                        <span className="text-[9px] font-semibold truncate w-full">
                          {lucro >= 0 ? "+" : ""}
                          {lucro.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
