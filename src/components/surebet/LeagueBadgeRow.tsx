import { useMemo } from "react";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DailyEvent } from "@/hooks/useDailyEventsByDate";

interface LeagueBadgeRowProps {
  /** Eventos já filtrados pelos toggles rápidos (esporte/encerrados). */
  events: DailyEvent[];
  /** Ligas atualmente selecionadas (do estado de filtros avançados). */
  selected: string[];
  /** Callback para alterar a seleção. */
  onChange: (next: string[]) => void;
}

interface LeagueChip {
  name: string;
  count: number;
  logo: string | null;
}

/**
 * Faixa horizontal de "abas" (badges) com os campeonatos do dia.
 * Sincronizada com `ExploradorFilterState.leagues` — atua como atalho visual
 * para o mesmo filtro disponível no painel "Filtros" avançado.
 */
export function LeagueBadgeRow({ events, selected, onChange }: LeagueBadgeRowProps) {
  const chips = useMemo<LeagueChip[]>(() => {
    const map = new Map<string, LeagueChip>();
    for (const ev of events) {
      const name = (ev.league_name ?? "—").trim() || "—";
      const existing = map.get(name);
      if (existing) {
        existing.count += 1;
        if (!existing.logo && ev.league_logo) existing.logo = ev.league_logo;
      } else {
        map.set(name, { name, count: 1, logo: ev.league_logo ?? null });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"),
    );
  }, [events]);

  if (chips.length === 0) return null;

  const allActive = selected.length === 0;

  function toggle(name: string) {
    if (selected.includes(name)) {
      onChange(selected.filter((n) => n !== name));
    } else {
      onChange([...selected, name]);
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Filtrar por campeonato"
      className="flex items-center gap-1.5 px-3 py-2 border-b border-border/40 overflow-x-auto scrollbar-thin"
    >
      <button
        type="button"
        role="tab"
        aria-pressed={allActive}
        onClick={() => onChange([])}
        className={cn(
          "shrink-0 h-6 px-2 rounded-full text-[10px] font-medium transition-colors border",
          allActive
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-transparent text-muted-foreground border-border/60 hover:border-primary/50 hover:text-foreground",
        )}
      >
        Todos ({events.length})
      </button>
      {chips.map((chip) => {
        const active = selected.includes(chip.name);
        return (
          <button
            key={chip.name}
            type="button"
            role="tab"
            aria-pressed={active}
            onClick={() => toggle(chip.name)}
            title={chip.name}
            className={cn(
              "shrink-0 h-6 px-2 rounded-full text-[10px] font-medium transition-colors border flex items-center gap-1.5 max-w-[180px]",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border/60 hover:border-primary/50 hover:text-foreground",
            )}
          >
            {chip.logo ? (
              <img
                src={chip.logo}
                alt=""
                className="h-3.5 w-3.5 rounded-full object-contain bg-background/40"
                loading="lazy"
              />
            ) : (
              <Trophy className="h-3 w-3 opacity-70" />
            )}
            <span className="truncate">{chip.name}</span>
            <span className={cn("tabular-nums", active ? "opacity-90" : "opacity-60")}>
              ({chip.count})
            </span>
          </button>
        );
      })}
    </div>
  );
}