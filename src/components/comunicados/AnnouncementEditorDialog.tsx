import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSaveAnnouncement, type Announcement, type AnnouncementCategory, type AnnouncementPriority } from "@/hooks/useAnnouncements";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: Announcement | null;
}

const CATEGORIES: { value: AnnouncementCategory; label: string }[] = [
  { value: "operacao", label: "Operação" },
  { value: "regras", label: "Regras" },
  { value: "produto", label: "Produto" },
  { value: "manutencao", label: "Manutenção" },
  { value: "programacao", label: "Programação" },
  { value: "orientacao", label: "Orientação" },
  { value: "geral", label: "Geral" },
];

const PRIORITIES: { value: AnnouncementPriority; label: string }[] = [
  { value: "baixa", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "alta", label: "Alta" },
  { value: "critica", label: "Crítica" },
];

export function AnnouncementEditorDialog({ open, onOpenChange, editing }: Props) {
  const save = useSaveAnnouncement();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<AnnouncementCategory>("geral");
  const [priority, setPriority] = useState<AnnouncementPriority>("normal");
  const [isPinned, setIsPinned] = useState(false);
  const [allowReactions, setAllowReactions] = useState(true);
  const [allowComments, setAllowComments] = useState(false);
  const [requireReceipt, setRequireReceipt] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string>("");

  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? "");
      setBody(editing?.body ?? "");
      setCategory(editing?.category ?? "geral");
      setPriority(editing?.priority ?? "normal");
      setIsPinned(editing?.is_pinned ?? false);
      setAllowReactions(editing?.allow_reactions ?? true);
      setAllowComments(editing?.allow_comments ?? false);
      setRequireReceipt(editing?.require_read_receipt ?? false);
      setExpiresAt(editing?.expires_at ? editing.expires_at.slice(0, 16) : "");
    }
  }, [open, editing]);

  const handleSave = async () => {
    if (!title.trim()) return;
    await save.mutateAsync({
      id: editing?.id,
      input: {
        title: title.trim(),
        body: body.trim(),
        category,
        priority,
        is_pinned: isPinned,
        allow_reactions: allowReactions,
        allow_comments: allowComments,
        require_read_receipt: requireReceipt,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        status: "publicado",
      },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar comunicado" : "Novo comunicado"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Ex.: Manutenção programada domingo" />
          </div>
          <div>
            <Label>Corpo do comunicado</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Escreva o comunicado completo…" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as AnnouncementCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as AnnouncementPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Expira em (opcional)</Label>
            <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="pinned" className="cursor-pointer">Fixar no topo</Label>
              <Switch id="pinned" checked={isPinned} onCheckedChange={setIsPinned} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="reactions" className="cursor-pointer">Permitir reações</Label>
              <Switch id="reactions" checked={allowReactions} onCheckedChange={setAllowReactions} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="comments" className="cursor-pointer">Permitir comentários</Label>
              <Switch id="comments" checked={allowComments} onCheckedChange={setAllowComments} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="receipt" className="cursor-pointer">Exigir confirmação de leitura</Label>
              <Switch id="receipt" checked={requireReceipt} onCheckedChange={setRequireReceipt} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!title.trim() || save.isPending}>
            {save.isPending ? "Salvando…" : editing ? "Salvar alterações" : "Publicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}