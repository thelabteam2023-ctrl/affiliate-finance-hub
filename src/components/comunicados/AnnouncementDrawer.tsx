import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Announcement, AnnouncementCategory, AnnouncementPriority } from "@/hooks/useAnnouncements";
import { cn } from "@/lib/utils";

const PRIORITY_LABEL: Record<AnnouncementPriority, { label: string; cls: string }> = {
  critica: { label: "Crítico", cls: "bg-destructive text-destructive-foreground" },
  alta: { label: "Alta", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  normal: { label: "Normal", cls: "bg-muted text-muted-foreground" },
  baixa: { label: "Baixa", cls: "bg-sky-500/15 text-sky-600 border-sky-500/30" },
};

const CATEGORY_LABEL: Record<AnnouncementCategory, string> = {
  operacao: "Operação", regras: "Regras", produto: "Produto",
  manutencao: "Manutenção", programacao: "Programação",
  orientacao: "Orientação", geral: "Geral",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  announcement: Announcement;
}

export function AnnouncementDrawer({ open, onOpenChange, announcement }: Props) {
  const p = PRIORITY_LABEL[announcement.priority];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader className="space-y-3 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("text-[10px] font-semibold uppercase tracking-wide", p.cls)}>
              {p.label}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">{CATEGORY_LABEL[announcement.category]}</Badge>
            {announcement.is_pinned && <Badge variant="outline" className="text-[10px]">Fixado</Badge>}
          </div>
          <SheetTitle className="text-2xl leading-tight">{announcement.title}</SheetTitle>
          <div className="text-xs text-muted-foreground">
            Publicado em {format(new Date(announcement.publish_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
            {announcement.expires_at && (
              <> · Expira em {format(new Date(announcement.expires_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</>
            )}
          </div>
        </SheetHeader>
        <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed">
          {announcement.body || <span className="text-muted-foreground italic">Sem conteúdo adicional.</span>}
        </div>
      </SheetContent>
    </Sheet>
  );
}