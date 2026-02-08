import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import {
  type LimitationEvent,
  LIMITATION_TYPE_LABELS,
  BUCKET_LABELS,
  type LimitationType,
  type LimitationBucket,
} from "@/hooks/useLimitationEvents";

interface LimitationEventsTimelineProps {
  events: LimitationEvent[];
  onDelete?: (id: string) => void;
}

const bucketColors: Record<LimitationBucket, string> = {
  early: "bg-red-500/10 text-red-500 border-red-500/20",
  mid: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  late: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

export function LimitationEventsTimeline({ events, onDelete }: LimitationEventsTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Nenhum evento de limitação registrado neste projeto.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card hover:bg-accent/30 transition-colors"
        >
          {/* Logo */}
          <Avatar className="h-8 w-8 flex-shrink-0">
            {event.logo_url ? <AvatarImage src={event.logo_url} /> : null}
            <AvatarFallback className="text-[10px]">
              <Building2 className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{event.bookmaker_nome}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {LIMITATION_TYPE_LABELS[event.limitation_type as LimitationType]}
              </Badge>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 border-transparent ${bucketColors[event.limitation_bucket as LimitationBucket]}`}
              >
                {BUCKET_LABELS[event.limitation_bucket as LimitationBucket]}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground">
                {event.total_bets_before_limitation} apostas totais • {event.project_bets_before_limitation} no projeto
              </span>
              {event.observacoes && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                  — {event.observacoes}
                </span>
              )}
            </div>
          </div>

          {/* Date + delete */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground">
              {format(new Date(event.event_timestamp), "dd/MM/yy HH:mm")}
            </span>
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-red-500"
                onClick={() => onDelete(event.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
