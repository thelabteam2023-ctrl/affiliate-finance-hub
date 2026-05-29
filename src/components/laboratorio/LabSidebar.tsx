import { cn } from "@/lib/utils";
import { SportStats } from "@/hooks/useValueBetLabData";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Globe, Trophy } from "lucide-react";

interface LabSidebarProps {
  sports: Record<string, SportStats>;
  selectedSport: string | null;
  onSelect: (sport: string | null) => void;
  globalRoi: number;
}

export function LabSidebar({ sports, selectedSport, onSelect, globalRoi }: LabSidebarProps) {
  const sortedSports = Object.values(sports).sort((a, b) => b.roi - a.roi);

  return (
    <div className="w-64 border-r border-border/40 flex flex-col h-full bg-card/20">
      <div className="p-4 border-b border-border/40">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" /> Esportes
        </h2>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          <button
            onClick={() => onSelect(null)}
            className={cn(
              "w-full flex justify-between items-center p-3 rounded-lg text-sm font-medium transition-all group",
              selectedSport === null 
                ? "bg-primary/10 text-primary border border-primary/20" 
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
            )}
          >
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              <span>Todos os Esportes</span>
            </div>
            <span className={cn(
              "text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded",
              globalRoi >= 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
            )}>
              {globalRoi.toFixed(1)}%
            </span>
          </button>

          {sortedSports.map((sport) => (
            <button
              key={sport.name}
              onClick={() => onSelect(sport.name)}
              className={cn(
                "w-full flex justify-between items-center p-3 rounded-lg text-sm font-medium transition-all group",
                selectedSport === sport.name 
                  ? "bg-primary/10 text-primary border border-primary/20" 
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                <span className="truncate max-w-[120px]">{sport.name}</span>
              </div>
              <span className={cn(
                "text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded",
                sport.roi >= 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
              )}>
                {sport.roi.toFixed(1)}%
              </span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}