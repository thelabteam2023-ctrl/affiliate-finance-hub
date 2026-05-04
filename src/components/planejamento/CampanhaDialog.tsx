import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
 import { AlertTriangle, Trash2, Wand2, ShieldAlert, ShieldCheck, CheckCircle2 } from "lucide-react";
 import { Checkbox } from "@/components/ui/checkbox";
import {
  PlanningCampanha,
  usePlanningCasas,
  useDeleteCampanha,
  useParceirosLite,
  usePlanningIps,
  usePlanningPerfis,
  usePlanningWallets,
  useUpsertCampanha,
  useProjetos,
} from "@/hooks/usePlanningData";
import { useGrupoRegrasValidator } from "@/hooks/useGrupoRegrasValidator";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scheduledDate: string;
  initialBookmaker?: { id: string; nome: string; moeda_padrao: string } | null;
  campanha?: PlanningCampanha | null;
  campanhasDoMes: PlanningCampanha[];
  suggestedParceiroId?: string | null;
}

const MOEDAS = ["BRL", "USD", "EUR", "GBP", "MXN", "USDT"];

export function CampanhaDialog({ open, onOpenChange, scheduledDate, initialBookmaker, campanha, campanhasDoMes, suggestedParceiroId }: Props) {
  const { data: ips = [] } = usePlanningIps();
  const { data: wallets = [] } = usePlanningWallets();
  const { data: parceirosFull = [] } = useParceirosLite();
  const { data: perfisPre = [] } = usePlanningPerfis();
  const { data: casasPlan = [] } = usePlanningCasas();
  const { data: projetos = [] } = useProjetos();
  const bookmakers = useMemo(
    () => casasPlan.filter(p => p.is_active && p.casa).map(p => p.casa!),
    [casasPlan]
  );
  const ipByBookmakerMap = useMemo(() => {
    const map = new Map<string, string>();
    ips
      .filter(i => i.is_active && i.bookmaker_catalogo_id)
      .forEach(i => {
        if (!map.has(i.bookmaker_catalogo_id!)) map.set(i.bookmaker_catalogo_id!, i.id);
      });
    return map;
  }, [ips]);
  const ipByPerfilBookmakerMap = useMemo(() => {
    const map = new Map<string, string>();
    ips
      .filter(i => i.is_active && i.perfil_planejamento_id && i.bookmaker_catalogo_id)
      .forEach(i => map.set(`${i.perfil_planejamento_id}:${i.bookmaker_catalogo_id}`, i.id));
    return map;
  }, [ips]);
  const perfilByParceiroIdMap = useMemo(() => {
    const map = new Map<string, string>();
    perfisPre.forEach(p => {
      if (p.parceiro_id) map.set(p.parceiro_id, p.id);
    });
    return map;
  }, [perfisPre]);
  const getSuggestedIpId = useCallback((bookmakerId?: string | null, parceiroId?: string | null) => {
    if (!bookmakerId) return "";
    const perfilId = parceiroId ? perfilByParceiroIdMap.get(parceiroId) : null;
    return (perfilId ? ipByPerfilBookmakerMap.get(`${perfilId}:${bookmakerId}`) : null)
      ?? ipByBookmakerMap.get(bookmakerId)
      ?? "";
  }, [ipByBookmakerMap, ipByPerfilBookmakerMap, perfilByParceiroIdMap]);
  const upsert = useUpsertCampanha();
  const del = useDeleteCampanha();

  // Lista efetiva de perfis para o dropdown:
  // - Se existir pré-seleção, usa apenas perfis ativos.
  // - Senão, cai para todos os parceiros ativos do workspace (fallback).
  const parceiros = useMemo(() => {
    if (perfisPre.length === 0) return parceirosFull;
    const map = new Map<string, { id: string; nome: string; email: string | null; endereco: string | null }>();
    perfisPre
      .filter(p => p.is_active && p.parceiro)
      .forEach(p => {
        map.set(p.parceiro!.id, {
          id: p.parceiro!.id,
          nome: p.label_custom || p.parceiro!.nome,
          email: p.parceiro!.email,
          endereco: p.parceiro!.endereco,
        });
      });
    // Se a campanha sendo editada usa um parceiro fora da lista, garante que ele apareça
    if (campanha?.parceiro_id && !map.has(campanha.parceiro_id)) {
      const fallback = parceirosFull.find(p => p.id === campanha.parceiro_id);
      if (fallback) map.set(fallback.id, fallback);
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [perfisPre, parceirosFull, campanha?.parceiro_id]);

  const [form, setForm] = useState({
    bookmaker_catalogo_id: "" as string | "",
    bookmaker_nome: "",
    deposit_amount: "",
    currency: "BRL",
    parceiro_id: "" as string | "",
    projeto_id: "" as string | "",
    ip_id: "" as string | "",
    wallet_id: "" as string | "",
    is_account_created: false,
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    if (campanha) {
      setForm({
        bookmaker_catalogo_id: campanha.bookmaker_catalogo_id ?? "",
        bookmaker_nome: campanha.bookmaker_nome,
        deposit_amount: String(campanha.deposit_amount ?? ""),
        currency: campanha.currency,
        parceiro_id: campanha.parceiro_id ?? suggestedParceiroId ?? "",
        projeto_id: campanha.projeto_id ?? "",
        ip_id: campanha.ip_id ?? getSuggestedIpId(campanha.bookmaker_catalogo_id, campanha.parceiro_id ?? suggestedParceiroId) ?? "",
        wallet_id: campanha.wallet_id ?? "",
        is_account_created: campanha.is_account_created ?? false,
        notes: campanha.notes ?? "",
      });
    } else if (initialBookmaker) {
      setForm({
        bookmaker_catalogo_id: initialBookmaker.id,
        bookmaker_nome: initialBookmaker.nome,
        deposit_amount: "",
        currency: initialBookmaker.moeda_padrao || "BRL",
        parceiro_id: "",
        projeto_id: "",
        ip_id: getSuggestedIpId(initialBookmaker.id, suggestedParceiroId),
        wallet_id: "",
        is_account_created: false,
        notes: "",
      });
    } else {
      setForm({
        bookmaker_catalogo_id: "",
        bookmaker_nome: "",
        deposit_amount: "",
        currency: "BRL",
        parceiro_id: "",
        projeto_id: "",
        ip_id: "",
        wallet_id: "",
        is_account_created: false,
        notes: "",
      });
    }
  }, [open, campanha, initialBookmaker, suggestedParceiroId, getSuggestedIpId]);

  // Detectar conflitos no mesmo dia (excluindo registros que pertencem ao mesmo projeto)
  const conflitos = useMemo(() => {
    const sameDay = campanhasDoMes.filter(c => 
      c.scheduled_date === scheduledDate && 
      c.id !== campanha?.id &&
      // Se ambos estão no mesmo projeto, não consideramos conflito de "outra campanha"
      (c.projeto_id !== form.projeto_id || !form.projeto_id)
    );
    const ipConflict = form.ip_id && sameDay.some(c => c.ip_id === form.ip_id);
    const parceiroConflict = form.parceiro_id && sameDay.some(c => c.parceiro_id === form.parceiro_id);
    return { ipConflict, parceiroConflict };
  }, [campanhasDoMes, scheduledDate, form.ip_id, form.parceiro_id, form.projeto_id, campanha?.id]);

  // Validação contra regras de grupo
  const { validate } = useGrupoRegrasValidator(campanhasDoMes);
  const grupoValidation = useMemo(() => {
    return validate({
      bookmaker_catalogo_id: form.bookmaker_catalogo_id || null,
      parceiro_id: form.parceiro_id || null,
      ip_id: form.ip_id || null,
      wallet_id: form.wallet_id || null,
      scheduled_date: scheduledDate,
      excludeCampanhaId: campanha?.id,
    });
  }, [validate, form.bookmaker_catalogo_id, form.parceiro_id, form.ip_id, form.wallet_id, scheduledDate, campanha?.id]);

  // Auto-sugestão: IP/perfil ainda não usados nesse dia
  const handleAutoAssign = () => {
    const sameDay = campanhasDoMes.filter(c => c.scheduled_date === scheduledDate && c.id !== campanha?.id);
    const usedIps = new Set(sameDay.map(c => c.ip_id).filter(Boolean));
    const usedParceiros = new Set(sameDay.map(c => c.parceiro_id).filter(Boolean));
    const perfilId = form.parceiro_id ? perfilByParceiroIdMap.get(form.parceiro_id) : null;
    const linkedIp = form.bookmaker_catalogo_id
      ? ips.find(i => i.is_active && i.bookmaker_catalogo_id === form.bookmaker_catalogo_id && (!perfilId || i.perfil_planejamento_id === perfilId) && !usedIps.has(i.id))
      : null;
    const freeIp = linkedIp || ips.find(i => i.is_active && !usedIps.has(i.id));
    const freeParceiro = parceiros.find(p => !usedParceiros.has(p.id));
    setForm(f => ({
      ...f,
      ip_id: f.ip_id || freeIp?.id || "",
      parceiro_id: f.parceiro_id || freeParceiro?.id || "",
    }));
  };

  const handleSave = async () => {
    if (!form.bookmaker_nome.trim()) return;
    if (grupoValidation.violations.length > 0) {
      toast.error(`Bloqueado por regra de grupo: ${grupoValidation.violations[0].mensagem}`);
      return;
    }
    const parceiro = parceiros.find(p => p.id === form.parceiro_id);
    await upsert.mutateAsync({
      id: campanha?.id,
      scheduled_date: scheduledDate,
      bookmaker_catalogo_id: form.bookmaker_catalogo_id || null,
      bookmaker_nome: form.bookmaker_nome,
      deposit_amount: parseFloat(form.deposit_amount) || 0,
      currency: form.currency,
      parceiro_id: form.parceiro_id || null,
      projeto_id: form.projeto_id || null,
      parceiro_snapshot: parceiro ? { nome: parceiro.nome, email: parceiro.email, endereco: parceiro.endereco } : null,
      ip_id: form.ip_id || null,
      wallet_id: form.wallet_id || null,
      is_account_created: form.is_account_created,
      notes: form.notes,
    });
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!campanha) return;
    await del.mutateAsync(campanha.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{campanha ? "Editar campanha" : "Nova campanha"}</DialogTitle>
          <p className="text-xs text-muted-foreground">Data: {scheduledDate}</p>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">Casa</Label>
              <Select
                value={form.bookmaker_catalogo_id || undefined}
                onValueChange={(v) => {
                  const bm = bookmakers.find(b => b.id === v);
                  setForm(f => ({
                    ...f,
                    bookmaker_catalogo_id: v,
                    bookmaker_nome: bm?.nome ?? f.bookmaker_nome,
                    currency: bm?.moeda_padrao ?? f.currency,
                    ip_id: getSuggestedIpId(v, f.parceiro_id) || f.ip_id || "",
                  }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {bookmakers.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Moeda</Label>
              <Select value={form.currency} onValueChange={(v) => setForm(f => ({ ...f, currency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MOEDAS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Projeto Vinculado</Label>
            <Select value={form.projeto_id || undefined} onValueChange={(v) => setForm(f => ({ ...f, projeto_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione um projeto" /></SelectTrigger>
              <SelectContent>
                {projetos.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
            </div>
          </div>

          <div>
            <Label className="text-xs">Valor de depósito</Label>
            <Input
              type="number"
              step="0.01"
              value={form.deposit_amount}
              onChange={(e) => setForm(f => ({ ...f, deposit_amount: e.target.value }))}
              placeholder="0,00"
            />
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">Perfil (parceiro)</Label>
              <Select value={form.parceiro_id || undefined} onValueChange={(v) => setForm(f => ({ ...f, parceiro_id: v, ip_id: getSuggestedIpId(f.bookmaker_catalogo_id, v) || f.ip_id }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {parceiros.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs">IP / Proxy</Label>
              <Select value={form.ip_id || undefined} onValueChange={(v) => setForm(f => ({ ...f, ip_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {ips.filter(i => i.is_active).map(i => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.label} {i.location_country ? `· ${i.location_country}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" size="icon" onClick={handleAutoAssign} title="Auto-sugerir IP e perfil livres">
              <Wand2 className="h-4 w-4" />
            </Button>
          </div>

          <div>
            <Label className="text-xs">Carteira</Label>
            <Select value={form.wallet_id || undefined} onValueChange={(v) => setForm(f => ({ ...f, wallet_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
              <SelectContent>
                {wallets.filter(w => w.is_active).map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.label} · {w.asset}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2 py-1">
            <Checkbox 
              id="is_account_created" 
              checked={form.is_account_created} 
              onCheckedChange={(v) => setForm(f => ({ ...f, is_account_created: !!v }))}
            />
            <Label htmlFor="is_account_created" className="text-xs font-medium cursor-pointer flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              Conta já criada nesta casa
            </Label>
          </div>

          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          {(conflitos.ipConflict || conflitos.parceiroConflict) && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {conflitos.ipConflict && <div>⚠ Este IP já está sendo usado em outro projeto no mesmo dia.</div>}
                {conflitos.parceiroConflict && <div>⚠ Este perfil já está sendo usado em outro projeto no mesmo dia.</div>}
              </AlertDescription>
            </Alert>
          )}

          {grupoValidation.violations.length > 0 && (
            <Alert variant="destructive" className="py-2">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription className="text-xs space-y-0.5">
                {grupoValidation.violations.map((v, i) => (
                  <div key={i}>🚫 {v.mensagem}</div>
                ))}
              </AlertDescription>
            </Alert>
          )}

          {grupoValidation.warnings.length > 0 && (
            <Alert className="py-2 border-warning/50 bg-warning/5">
              <ShieldCheck className="h-4 w-4 text-warning" />
              <AlertDescription className="text-xs space-y-0.5 text-warning-foreground">
                {grupoValidation.warnings.map((v, i) => (
                  <div key={i}>⚠ {v.mensagem}</div>
                ))}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          {campanha && (
            <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive mr-auto">
              <Trash2 className="h-4 w-4 mr-1" /> Excluir
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={upsert.isPending || !form.bookmaker_nome || grupoValidation.violations.length > 0}
          >
            {upsert.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
