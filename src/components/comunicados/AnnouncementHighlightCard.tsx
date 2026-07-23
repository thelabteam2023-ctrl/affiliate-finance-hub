import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Megaphone, ArrowRight } from "lucide-react";
import { useAnnouncements } from "@/hooks/useAnnouncements";
import { cn } from "@/lib/utils";

interface Props {
  targetPath?: string;
  onOpen?: () => void;
  className?: string;
}

/**
 * Card compacto no topo da aba Financeiro da Central quando houver
 * comunicados Alta/Crítica não lidos. Agregado quando >1 item.
 */
export function AnnouncementHighlightCard({ targetPath = "/comunicados", onOpen, className }: Props) {
  const navigate = useNavigate();
  const { data: announcements = [] } = useAnnouncements();

  const relevantes = useMemo(
    () =>
      announcements.filter(
        (a) =>
          !a.is_read &&
          a.status === "publicado" &&
          (a.priority === "alta" || a.priority === "critica"),
      ),
    [announcements],
  );

  if (relevantes.length === 0) return null;

  const hasCritica = relevantes.some((a) => a.priority === "critica");
  const single = relevantes.length === 1 ? relevantes[0] : null;

  const handleClick = () => {
    if (onOpen) onOpen();
    else navigate(targetPath);
  };

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-l-4 bg-card/50 backdrop-blur-sm",
        hasCritica ? "border-l-destructive" : "border-l-amber-500",
        className,
      )}
    >
      <div className="flex items-center gap-3 p-3 md:p-4">
        <div
          className={cn(
            "h-9 w-9 rounded-full flex items-center justify-center shrink-0",
            hasCritica ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600",
          )}
        >
          <Megaphone className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">
              {single
                ? single.title
                : `${relevantes.length} comunicados importantes aguardando leitura`}
            </span>
            {hasCritica && (
              <Badge variant="outline" className="bg-destructive text-destructive-foreground text-[10px] uppercase">
                Crítico
              </Badge>
            )}
          </div>
          {single && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {single.body || "Toque em Abrir para ler."}
            </p>
          )}
        </div>
        <Button size="sm" onClick={handleClick} className="shrink-0">
          Abrir <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    </Card>
  );
}