import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Megaphone } from "lucide-react";
import { useAnnouncements, type Announcement, type AnnouncementCategory } from "@/hooks/useAnnouncements";
import { useRole } from "@/hooks/useRole";
import { AnnouncementCard, EmptyAnnouncements } from "@/components/comunicados/AnnouncementCard";
import { AnnouncementEditorDialog } from "@/components/comunicados/AnnouncementEditorDialog";

const CATEGORY_FILTERS: { value: "todos" | AnnouncementCategory; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "operacao", label: "Operação" },
  { value: "regras", label: "Regras" },
  { value: "produto", label: "Produto" },
  { value: "manutencao", label: "Manutenção" },
  { value: "programacao", label: "Programação" },
  { value: "orientacao", label: "Orientação" },
  { value: "geral", label: "Geral" },
];

interface ComunicadosPanelProps {
  /** Se true, renderiza o cabeçalho com título/ícone. Default true. */
  showHeader?: boolean;
  /** Container padding. Default aplica p-6/max-w. */
  bare?: boolean;
}

export function ComunicadosPanel({ showHeader = true, bare = false }: ComunicadosPanelProps) {
  const { data: announcements = [], isLoading } = useAnnouncements();
  const { canManageWorkspace } = useRole();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [category, setCategory] = useState<string>("todos");
  const [showUnread, setShowUnread] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return announcements.filter((a) => {
      if (category !== "todos" && a.category !== category) return false;
      if (showUnread && a.is_read) return false;
      if (q && !`${a.title} ${a.body}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [announcements, category, showUnread, q]);

  const pinned = filtered.filter((a) => a.is_pinned);
  const recent = filtered.filter((a) => !a.is_pinned);
  const unreadCount = announcements.filter((a) => !a.is_read).length;

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (a: Announcement) => { setEditing(a); setEditorOpen(true); };

  const wrapperClass = bare ? "space-y-6" : "container mx-auto max-w-4xl space-y-6 p-6";

  return (
    <div className={wrapperClass}>
      {showHeader && (
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">Comunicados</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Canal oficial do workspace para avisos, novidades e orientações.
            </p>
          </div>
          {canManageWorkspace && (
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Novo comunicado
            </Button>
          )}
        </header>
      )}

      {!showHeader && canManageWorkspace && (
        <div className="flex justify-end">
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Novo comunicado
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Tabs value={category} onValueChange={setCategory}>
          <TabsList className="flex-wrap h-auto">
            {CATEGORY_FILTERS.map((c) => (
              <TabsTrigger key={c.value} value={c.value}>{c.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={showUnread ? "default" : "outline"} onClick={() => setShowUnread((v) => !v)}>
            Não lidos {unreadCount > 0 && <span className="ml-1 rounded-full bg-primary-foreground/20 px-1.5 text-xs">{unreadCount}</span>}
          </Button>
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar comunicados…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <EmptyAnnouncements canCreate={canManageWorkspace} onCreate={openNew} />
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fixados</h2>
              <div className="space-y-3">
                {pinned.map((a) => (
                  <AnnouncementCard key={a.id} announcement={a} canManage={canManageWorkspace} onEdit={openEdit} />
                ))}
              </div>
            </section>
          )}
          {recent.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recentes</h2>
              <div className="space-y-3">
                {recent.map((a) => (
                  <AnnouncementCard key={a.id} announcement={a} canManage={canManageWorkspace} onEdit={openEdit} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <AnnouncementEditorDialog open={editorOpen} onOpenChange={setEditorOpen} editing={editing} />
    </div>
  );
}

export default ComunicadosPanel;