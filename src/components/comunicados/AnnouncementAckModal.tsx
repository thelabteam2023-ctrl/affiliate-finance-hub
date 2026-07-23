import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useCriticalUnreadAnnouncements,
  useMarkAnnouncementRead,
  type Announcement,
} from "@/hooks/useAnnouncements";

const SESSION_KEY = "stakesync:ann-ack-dismissed";

function readDismissedThisSession(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function pushDismissed(id: string) {
  try {
    const set = readDismissedThisSession();
    set.add(id);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...set]));
  } catch {
    /* noop */
  }
}

/**
 * Modal de acknowledge para comunicados de prioridade crítica.
 * - Enfileira críticos não lidos (1 por vez).
 * - "Marcar como lido" persiste read receipt no banco.
 * - "Lembrar depois" apenas oculta na sessão atual — reaparece no próximo login.
 * - Autor do comunicado não é interrompido.
 */
export function AnnouncementAckModal() {
  const { user } = useAuth();
  const criticals = useCriticalUnreadAnnouncements();
  const markRead = useMarkAnnouncementRead();
  const [dismissedTick, setDismissedTick] = useState(0);

  const dismissed = readDismissedThisSession();
  const queue: Announcement[] = criticals.filter(
    (a) => a.author_id !== user?.id && !dismissed.has(a.id),
  );
  const current = queue[0];
  const total = queue.length;

  useEffect(() => void dismissedTick, [dismissedTick]);

  if (!current) return null;

  const handleMarkRead = () => markRead.mutate(current.id);
  const handleRemindLater = () => {
    pushDismissed(current.id);
    setDismissedTick((n) => n + 1);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) handleRemindLater();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-destructive text-destructive-foreground text-[10px] uppercase tracking-wide">
              <AlertTriangle className="h-3 w-3 mr-1" /> Crítico
            </Badge>
            {total > 1 && (
              <span className="text-xs text-muted-foreground">1 de {total}</span>
            )}
          </div>
          <DialogTitle className="text-xl leading-tight">{current.title}</DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80 max-h-[40vh] overflow-y-auto">
            {current.body || "Este comunicado não possui detalhes adicionais."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleRemindLater}>
            Lembrar depois
          </Button>
          <Button onClick={handleMarkRead} disabled={markRead.isPending}>
            Marcar como lido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}