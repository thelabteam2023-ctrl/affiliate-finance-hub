   usePlanningBookmakersPorProjeto,
import React, { useState, useEffect, useMemo } from "react";
import { Trash2, Check, ChevronsUpDown, MapPin } from "lucide-react";
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
  useDeletePlanningExtra,
  usePlanningPerfis,
  usePlanningIps,
  perfilDisplayName
} from "@/hooks/usePlanningData";
import { FIAT_CURRENCIES } from "@/types/currency";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

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
   const { data: plannedBookmakerIds } = usePlanningBookmakersPorProjeto(formData.projeto_id);
   const filteredBookmakers = useMemo(() => {
     if (!formData.projeto_id || !plannedBookmakerIds || plannedBookmakerIds.length === 0) return bookmakers;
     return bookmakers.filter(b => 
       plannedBookmakerIds.includes(b.id) || 
       (extra && extra.bookmaker_catalogo_id === b.id)
     );
   }, [bookmakers, plannedBookmakerIds, formData.projeto_id, extra]);
 
  const { data: projetos = [] } = useProjetos();
  const { data: allPerfis = [] } = usePlanningPerfis();
  const { data: allIps = [] } = usePlanningIps();

  const [formData, setFormData] = useState({
    bookmaker_nome: "",
    bookmaker_catalogo_id: "",
    parceiro_id: "",
    projeto_id: projetoId || "",
    deposit_amount: "",
    currency: "BRL",
    scheduled_date: "",
    status: "pending",
    notes: "",
    perfil_id: "",
    ip_id: ""
  });

  const [profileSearchOpen, setProfileSearchOpen] = useState(false);

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
        notes: extra.notes || "",
        perfil_id: extra.perfil_id || "",
        ip_id: extra.ip_id || ""
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
        notes: "",
        perfil_id: "",
        ip_id: ""
      });
    }
  }, [extra, open, projetoId]);

  // Sugerir IP baseado no perfil e bookmaker selecionados
  useEffect(() => {
    if (formData.perfil_id && formData.bookmaker_catalogo_id && !formData.ip_id) {
      const suggestedIp = allIps.find(i => 
        i.perfil_planejamento_id === formData.perfil_id && 
        i.bookmaker_catalogo_id === formData.bookmaker_catalogo_id
      );
      if (suggestedIp) {
        setFormData(prev => ({ ...prev, ip_id: suggestedIp.id }));
      }
    }
  }, [formData.perfil_id, formData.bookmaker_catalogo_id, allIps]);

  // Auto-preencher parceiro ao selecionar perfil
  const handleProfileSelect = (perfilId: string) => {
    const profile = allPerfis.find(p => p.id === perfilId);
    setFormData(prev => ({ 
      ...prev, 
      perfil_id: perfilId,
      parceiro_id: profile?.parceiro_id || prev.parceiro_id
    }));
    setProfileSearchOpen(false);
  };

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
      perfil_id: formData.perfil_id || null,
      ip_id: formData.ip_id || null,
    });

    onOpenChange(false);
  };

  const selectedProfile = allPerfis.find(p => p.id === formData.perfil_id);
  const filteredIps = useMemo(() => {
    if (!formData.perfil_id) return allIps;
    return allIps.filter(i => i.perfil_planejamento_id === formData.perfil_id);
  }, [allIps, formData.perfil_id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {extra ? "Editar Casa Extra" : "Adicionar Casa Extra"}
              {!extra && <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-bold bg-primary/5 text-primary">Operacional</Badge>}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>CPF / Perfil do Plano</Label>
              <Popover open={profileSearchOpen} onOpenChange={setProfileSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={profileSearchOpen}
                    className="w-full justify-between font-normal"
                  >
                    {formData.perfil_id
                      ? perfilDisplayName(selectedProfile!)
                      : "Selecione um CPF/Perfil..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar por nome ou CPF..." />
                    <CommandList>
                      <CommandEmpty>Nenhum perfil encontrado.</CommandEmpty>
                      <CommandGroup>
                        {allPerfis.map((p) => (
                          <CommandItem
                            key={p.id}
                            value={perfilDisplayName(p)}
                            onSelect={() => handleProfileSelect(p.id)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.perfil_id === p.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{perfilDisplayName(p)}</span>
                              {p.parceiro?.email && <span className="text-[10px] text-muted-foreground">{p.parceiro.email}</span>}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

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
                     {filteredBookmakers.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>IP / Proxy</Label>
                <Select
                  value={formData.ip_id}
                  onValueChange={(v) => setFormData({ ...formData, ip_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredIps.length === 0 && <div className="p-2 text-xs text-muted-foreground">Nenhum IP vinculado</div>}
                    {filteredIps.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.label} ({i.ip_address})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Parceiro (Auto)</Label>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <div className="space-y-2">
                <Label>Data (Opcional)</Label>
                <Input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Projeto</Label>
                <Select
                  value={formData.projeto_id}
                  onValueChange={(v) => setFormData({ ...formData, projeto_id: v })}
                  disabled={!!projetoId}
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
