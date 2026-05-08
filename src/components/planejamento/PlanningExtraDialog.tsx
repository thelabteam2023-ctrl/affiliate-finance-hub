 import React, { useState, useEffect, useMemo } from "react";
 import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useUpsertPlanningExtra,
  useParceirosLite,
  useBookmakersCatalogo,
  useProjetos,
   PlanningExtra,
   useDeletePlanningExtra
} from "@/hooks/usePlanningData";
import { FIAT_CURRENCIES } from "@/types/currency";

interface PlanningExtraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extra?: PlanningExtra | null;
  projetoId?: string;
}

export function PlanningExtraDialog({
  open,
  onOpenChange,
  extra,
  projetoId
}: PlanningExtraDialogProps) {
   const upsertExtra = useUpsertPlanningExtra();
   const deleteExtra = useDeletePlanningExtra();
  const { data: parceiros = [] } = useParceirosLite();
  const { data: bookmakers = [] } = useBookmakersCatalogo();
  const { data: projetos = [] } = useProjetos();

  const [formData, setFormData] = useState({
    bookmaker_nome: "",
    bookmaker_catalogo_id: "",
    parceiro_id: "",
    projeto_id: projetoId || "",
    deposit_amount: "",
    currency: "BRL",
    scheduled_date: "",
    status: "pending",
    notes: ""
  });

  useEffect(() => {
    if (extra) {
      setFormData({
        bookmaker_nome: extra.bookmaker_nome,
        bookmaker_catalogo_id: extra.bookmaker_catalogo_id || "",
        parceiro_id: extra.parceiro_id || "",
        projeto_id: extra.projeto_id || projetoId || "",
        deposit_amount: extra.deposit_amount.toString(),
        currency: extra.currency,
        scheduled_date: extra.scheduled_date || "",
        status: extra.status,
        notes: extra.notes || ""
      });
    } else {
      setFormData({
        bookmaker_nome: "",
        bookmaker_catalogo_id: "",
        parceiro_id: "",
        projeto_id: projetoId || "",
        deposit_amount: "",
        currency: "BRL",
        scheduled_date: "",
        status: "pending",
        notes: ""
      });
    }
  }, [extra, open, projetoId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let bookmakerNome = formData.bookmaker_nome;
    if (!bookmakerNome && formData.bookmaker_catalogo_id) {
      const b = bookmakers.find(x => x.id === formData.bookmaker_catalogo_id);
      if (b) bookmakerNome = b.nome;
    }

    if (!bookmakerNome) {
      const manualName = prompt("Por favor, digite o nome da casa:");
      if (!manualName) return;
      bookmakerNome = manualName;
    }

    await upsertExtra.mutateAsync({
      id: extra?.id,
      bookmaker_nome: bookmakerNome,
      bookmaker_catalogo_id: formData.bookmaker_catalogo_id || null,
      parceiro_id: formData.parceiro_id || null,
      projeto_id: formData.projeto_id || null,
      deposit_amount: Number(formData.deposit_amount),
      currency: formData.currency,
      scheduled_date: formData.scheduled_date || null,
      status: formData.status,
      notes: formData.notes || null,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{extra ? "Editar Casa Extra" : "Adicionar Casa Extra"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Casa / Bookmaker</Label>
                <Select
                  value={formData.bookmaker_catalogo_id}
                  onValueChange={(v) => setFormData({ ...formData, bookmaker_catalogo_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bookmakers.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Parceiro</Label>
                <Select
                  value={formData.parceiro_id}
                  onValueChange={(v) => setFormData({ ...formData, parceiro_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {parceiros.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={formData.deposit_amount}
                  onChange={(e) => setFormData({ ...formData, deposit_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Moeda</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(v) => setFormData({ ...formData, currency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIAT_CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.value} - {c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data (Opcional)</Label>
                <Input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="done">Concluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Projeto</Label>
              <Select
                value={formData.projeto_id}
                onValueChange={(v) => setFormData({ ...formData, projeto_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um projeto" />
                </SelectTrigger>
                <SelectContent>
                  {projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>

           <DialogFooter className="gap-2">
             {extra && (
               <Button 
                 type="button" 
                 variant="ghost" 
                 className="text-destructive mr-auto"
                 onClick={async () => {
                   if (confirm("Deseja realmente excluir esta casa extra?")) {
                     await deleteExtra.mutateAsync(extra.id);
                     onOpenChange(false);
                   }
                 }}
               >
                 <Trash2 className="h-4 w-4 mr-2" />
                 Excluir
               </Button>
             )}
             <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
             <Button type="submit" disabled={upsertExtra.isPending}>
               {upsertExtra.isPending ? "Salvando..." : "Salvar"}
             </Button>
           </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
