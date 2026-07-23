import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pin, PinOff, Trash2, Pencil, Megaphone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Announcement, AnnouncementPriority, AnnouncementCategory } from "@/hooks/useAnnouncements";
import { useTogglePin, useDeleteAnnouncement, useMarkAnnouncementRead } from "@/hooks/useAnnouncements";
import { AnnouncementDrawer } from "./AnnouncementDrawer";
import { useMarkAsReadOnView } from "@/hooks/useMarkAsReadOnView";

const PRIORITY_STYLES: Record<AnnouncementPriority, { bar: string; label: string; badge: string }> = {
  critica: { bar: "bg-destructive", label: "Crítico", badge: "bg-destructive text-destructive-foreground" },
  alta: { bar: "bg-amber-500", label: "Alta", badge: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  normal: { bar: "bg-muted-foreground/30", label: "Normal", badge: "bg-muted text-muted-foreground" },
  baixa: { bar: "bg-sky-500/40", label: "Baixa", badge: "bg-sky-500/15 text-sky-600 border-sky-500/30" },
};

const CATEGORY_LABEL: Record<AnnouncementCategory, string> = {
  operacao: "Operação", regras: "Regras", produto: "Produto",
  manutencao: "Manutenção", programacao: "Programação",
  orientacao: "Orientação", geral: "Geral",
};

interface Props {
  announcement: Announcement;
  canManage: boolean;
  onEdit: (a: Announcement) => void;
}

export function AnnouncementCard({ announcement, canManage, onEdit }: Props) {
  const [open, setOpen] = useState(false);
  const togglePin = useTogglePin();
  const del = useDeleteAnnouncement();
  const markRead = useMarkAnnouncementRead();
  const p = PRIORITY_STYLES[announcement.priority];
  const viewRef = useMarkAsReadOnView<HTMLDivElement>(
    announcement.id,
    !!announcement.is_read,
  );

  const handleOpen = () => {
    setOpen(true);
    if (!announcement.is_read) markRead.mutate(announcement.id);
  };

  return (
    <>
      <Card
        ref={viewRef as any}
        className={cn(
          "relative overflow-hidden transition-all hover:shadow-md cursor-pointer",
          !announcement.is_read && "ring-1 ring-primary/20 bg-primary/[0.02]"
        )}
        onClick={handleOpen}
      >
        <div className={cn("absolute left-0 top-0 h-full w-1", p.bar)} />
        <div className="p-4 pl-6 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {announcement.is_pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
              <Badge variant="outline" className={cn("text-[10px] font-semibold uppercase tracking-wide", p.badge)}>
                {p.label}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">{CATEGORY_LABEL[announcement.category]}</Badge>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(announcement.publish_at), { addSuffix: true, locale: ptBR })}
              </span>
              {!announcement.is_read && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" /> novo
                </span>
              )}
            </div>
            {canManage && (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Button size="icon" variant="ghost" className="h-7 w-7"
                  onClick={() => togglePin.mutate({ id: announcement.id, pinned: !announcement.is_pinned })}
                  title={announcement.is_pinned ? "Desafixar" : "Fixar"}>
                  {announcement.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(announcement)} title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => { if (confirm("Excluir este comunicado?")) del.mutate(announcement.id); }}
                  title="Excluir">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-base leading-tight line-clamp-2">{announcement.title}</h3>
            {announcement.body && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">{announcement.body}</p>
            )}
          </div>
        </div>
      </Card>
      <AnnouncementDrawer open={open} onOpenChange={setOpen} announcement={announcement} />
    </>
  );
}

export function EmptyAnnouncements({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <Megaphone className="h-10 w-10 text-muted-foreground/50" />
      <p className="mt-4 font-medium">Nenhum comunicado ainda</p>
      <p className="text-sm text-muted-foreground max-w-sm">
        Quando alguém publicar um comunicado oficial, ele aparecerá aqui para todos os membros do workspace.
      </p>
      {canCreate && <Button className="mt-4" onClick={onCreate}>Publicar primeiro comunicado</Button>}
    </div>
  );
}