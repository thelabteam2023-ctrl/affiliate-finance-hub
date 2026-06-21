import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Search, ExternalLink, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useDailyEventsByDate, type DailyEvent } from "@/hooks/useDailyEventsByDate";

interface ExploradorEventoPickerProps {
  /** Data inicial sugerida (ISO "YYYY-MM-DDTHH:mm" do form). */
  defaultDate?: string;
  /** Callback quando o usuário seleciona um jogo. */
  onSelect: (event: DailyEvent) => void;
  /** Visual do gatilho. `button` (default) = botão com texto; `icon` = só ícone compacto. */
  variant?: "button" | "icon";
}

function parseDefaultDate(s: string | undefined): Date {
  if (!s) return new Date();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function TeamLogo({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="h-6 w-6 rounded-full object-cover bg-muted"
        loading="lazy"
      />
    );
  }
  return (
    <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function ExploradorEventoPicker({ defaultDate, onSelect, variant = "button" }: ExploradorEventoPickerProps) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date>(() => parseDefaultDate(defaultDate));
  const [search, setSearch] = useState("");
  const [showFinished, setShowFinished] = useState(false);

  const { data: events = [], isLoading, isError } = useDailyEventsByDate(date, open);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((ev) => {
      if (!showFinished && (ev.status === "finished" || ev.status === "FT" || ev.status === "ENCERRADO")) {
        return false;
      }
      if (!term) return true;
      return (
        ev.home_team?.toLowerCase().includes(term) ||
        ev.away_team?.toLowerCase().includes(term) ||
        ev.league_name?.toLowerCase().includes(term) ||
        ev.country?.toLowerCase().includes(term)
      );
    });
  }, [events, search, showFinished]);

  function handlePick(ev: DailyEvent) {
    onSelect(ev);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "icon" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title="Importar jogo do Explorador"
          >
            <CalendarDays className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            title="Importar jogo do Explorador (Ctrl+J)"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Explorador
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[460px] p-0 pointer-events-auto"
        sideOffset={6}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-3 border-b border-border/40">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0">
                <CalendarDays className="h-3.5 w-3.5" />
                {format(date, "dd 'de' MMM", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>

          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar time, liga, país..."
              className="h-8 text-xs pl-7"
            />
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/20">
          <span className="text-[11px] text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "jogo" : "jogos"}
          </span>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
            <Switch
              checked={showFinished}
              onCheckedChange={setShowFinished}
              className="scale-75 origin-right"
            />
            Mostrar encerrados
          </label>
        </div>

        {/* Lista */}
        <ScrollArea className="h-[360px]">
          {isLoading && (
            <div className="p-4 space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-md bg-muted/40 animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <div className="p-6 text-center text-xs text-destructive">
              Erro ao carregar jogos. Tente novamente.
            </div>
          )}

          {!isLoading && !isError && filtered.length === 0 && (
            <div className="p-6 text-center space-y-3">
              <p className="text-xs text-muted-foreground">
                Nenhum jogo encontrado para {format(date, "dd/MM/yyyy", { locale: ptBR })}.
              </p>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => window.open("/admin/api-explorer", "_blank")}
              >
                Abrir Explorador
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          )}

          {!isLoading && !isError && filtered.length > 0 && (
            <div className="p-2 space-y-1">
              {filtered.map((ev) => {
                const isFinished = ev.status === "finished" || ev.status === "FT" || ev.status === "ENCERRADO";
                const hora = format(new Date(ev.commence_time), "HH:mm");
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => handlePick(ev)}
                    className="w-full text-left rounded-md border border-border/40 hover:border-primary/50 hover:bg-primary/5 transition-colors p-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <TeamLogo name={ev.home_team} url={ev.home_team_logo} />
                          <TeamLogo name={ev.away_team} url={ev.away_team_logo} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold truncate">
                            {ev.home_team} <span className="text-muted-foreground">x</span> {ev.away_team}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground truncate">
                            <Trophy className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{ev.league_name || "—"}</span>
                            {ev.country && <span className="opacity-70">· {ev.country}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-xs font-bold tabular-nums">{hora}</span>
                        {isFinished && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-500/40 text-amber-500">
                            encerrado
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}