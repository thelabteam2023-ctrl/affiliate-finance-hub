import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RegulamentacaoFilter, RegFilterValue } from "./RegulamentacaoFilter";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Pencil, Search, Building2, User, Check } from "lucide-react";
import {
  PlanningIp, PlanningWallet,
  usePlanningIps, usePlanningWallets,
  useUpsertPlanningIp, useDeletePlanningIp,
  useUpsertPlanningWallet, useDeletePlanningWallet,
  useBookmakersCatalogo,
  useParceirosLite, usePlanningPerfis, useAddPlanningPerfis,
  useUpdatePlanningPerfil, useDeletePlanningPerfil,
  usePlanningCasas, useAddPlanningCasas, useDeletePlanningCasa,
} from "@/hooks/usePlanningData";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

export function RecursosManager({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Gerenciar recursos</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="casas">
          <TabsList>
            <TabsTrigger value="casas">Casas</TabsTrigger>
            <TabsTrigger value="perfis">Perfis</TabsTrigger>
            <TabsTrigger value="ips">IPs / Proxies</TabsTrigger>
            <TabsTrigger value="wallets">Carteiras</TabsTrigger>
          </TabsList>
          <TabsContent value="casas"><CasasList /></TabsContent>
          <TabsContent value="perfis"><PerfisList /></TabsContent>
          <TabsContent value="ips"><IpsList /></TabsContent>
          <TabsContent value="wallets"><WalletsList /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── PERFIS (pré-seleção de parceiros) ─────────────────────────

function PerfisList() {
  const { data: perfis = [] } = usePlanningPerfis();
  const { data: parceiros = [] } = useParceirosLite();
  const addPerfis = useAddPlanningPerfis();
  const updPerfil = useUpdatePlanningPerfil();
  const delPerfil = useDeletePlanningPerfil();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const selectedIdsSet = useMemo(() => new Set(perfis.map(p => p.parceiro_id)), [perfis]);

  const availableParceiros = useMemo(() => {
    return parceiros.filter(p => {
      if (selectedIdsSet.has(p.id)) return false;
      if (pickerSearch && !p.nome.toLowerCase().includes(pickerSearch.toLowerCase())) return false;
      return true;
    });
  }, [parceiros, selectedIdsSet, pickerSearch]);

  const filteredPerfis = useMemo(() => {
    if (!search) return perfis;
    const s = search.toLowerCase();
    return perfis.filter(p =>
      (p.parceiro?.nome ?? "").toLowerCase().includes(s) ||
      (p.label_custom ?? "").toLowerCase().includes(s) ||
      (p.parceiro?.email ?? "").toLowerCase().includes(s),
    );
  }, [perfis, search]);

  const togglePicker = (id: string) => {
    setPickerSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const handleConfirmAdd = async () => {
    await addPerfis.mutateAsync(Array.from(pickerSelected));
    setPickerSelected(new Set());
    setPickerOpen(false);
    setPickerSearch("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar perfil..."
            className="pl-7 h-8 text-sm"
          />
        </div>
        <Badge variant="secondary" className="h-6">{perfis.length} ativo(s)</Badge>
        <Button size="sm" onClick={() => setPickerOpen(o => !o)}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar perfis
        </Button>
      </div>

      {pickerOpen && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Selecione parceiros para a lista de planejamento</p>
            <Badge variant="secondary" className="text-[10px]">{pickerSelected.size} marcado(s)</Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              placeholder="Buscar parceiro..."
              className="pl-7 h-8 text-sm"
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto space-y-1 border rounded-md p-1">
            {availableParceiros.length === 0 && (
              <p className="text-xs text-muted-foreground italic text-center py-3">
                {parceiros.length === 0 ? "Nenhum parceiro ativo no workspace." : "Todos já foram adicionados."}
              </p>
            )}
            {availableParceiros.map(p => {
              const checked = pickerSelected.has(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-muted/40 ${checked ? "bg-primary/10" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePicker(p.id)}
                    className="h-3.5 w-3.5"
                  />
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{p.nome}</div>
                    {p.email && <div className="text-[10px] text-muted-foreground truncate">{p.email}</div>}
                  </div>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setPickerOpen(false); setPickerSelected(new Set()); }}>
              Cancelar
            </Button>
            <Button size="sm" disabled={pickerSelected.size === 0 || addPerfis.isPending} onClick={handleConfirmAdd}>
              <Check className="h-4 w-4 mr-1" /> Adicionar {pickerSelected.size > 0 ? `(${pickerSelected.size})` : ""}
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-1 max-h-[380px] overflow-y-auto">
        {filteredPerfis.map(p => (
          <Card key={p.id} className="p-2 flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {p.label_custom || p.parceiro?.nome || "—"}
                {p.label_custom && p.parceiro?.nome && (
                  <span className="text-[10px] text-muted-foreground ml-1">({p.parceiro.nome})</span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {p.parceiro?.email || "sem e-mail"}
                {p.parceiro?.cidade && ` · ${p.parceiro.cidade}`}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1">
                <Switch
                  checked={p.is_active}
                  onCheckedChange={(v) => updPerfil.mutate({ id: p.id, is_active: v })}
                />
                <span className="text-[10px] text-muted-foreground">{p.is_active ? "ativo" : "off"}</span>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => delPerfil.mutate(p.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        ))}
        {filteredPerfis.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            {perfis.length === 0
              ? "Nenhum perfil pré-selecionado. Clique em \"Adicionar perfis\" para escolher parceiros."
              : "Nenhum perfil encontrado para a busca."}
          </p>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── CASAS (pré-seleção do catálogo) ─────────────────────────

function CasasList() {
  const { data: casasSelecionadas = [] } = usePlanningCasas();
  const { data: catalogo = [] } = useBookmakersCatalogo();
  const addCasas = useAddPlanningCasas();
  const delCasa = useDeletePlanningCasa();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<RegFilterValue>("all");

  // Mapa: bookmaker_catalogo_id -> planning_casas.id (para deletar pelo id da seleção)
  const selectedMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of casasSelecionadas) m.set(p.bookmaker_catalogo_id, p.id);
    return m;
  }, [casasSelecionadas]);

  // Lista única: TODAS as casas do catálogo, com checkbox indicando seleção
  const filtered = useMemo(() => {
    return catalogo.filter(c => {
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (search && !c.nome.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [catalogo, search, filterStatus]);

  const handleToggle = async (catalogoId: string) => {
    const planningId = selectedMap.get(catalogoId);
    if (planningId) {
      await delCasa.mutateAsync(planningId);
    } else {
      await addCasas.mutateAsync([catalogoId]);
    }
  };

  const totalSelected = casasSelecionadas.length;
  const totalReg = catalogo.filter(c => c.status === "REGULAMENTADA").length;
  const totalNaoReg = catalogo.filter(c => c.status === "NAO_REGULAMENTADA").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar casa..."
            className="pl-7 h-8 text-sm"
          />
        </div>
        <RegulamentacaoFilter
          value={filterStatus}
          onChange={setFilterStatus}
          totalAll={catalogo.length}
          totalReg={totalReg}
          totalNaoReg={totalNaoReg}
        />
        <Badge variant="secondary" className="h-6">
          {totalSelected} selecionada{totalSelected === 1 ? "" : "s"}
        </Badge>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Marque as casas que devem aparecer na lista de planejamento.
      </p>

      <div className="space-y-1 max-h-[420px] overflow-y-auto border rounded-md p-1">
        {filtered.map(c => {
          const checked = selectedMap.has(c.id);
          return (
            <label
              key={c.id}
              className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-muted/40 ${checked ? "bg-primary/10" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => handleToggle(c.id)}
                className="h-3.5 w-3.5"
              />
              {c.logo_url ? (
                <img src={c.logo_url} alt="" className="h-5 w-5 rounded object-contain shrink-0" />
              ) : (
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="text-sm truncate">{c.nome}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">· {c.moeda_padrao}</span>
              </div>
              {filterStatus === "all" && (
                <span className={`text-[9px] font-semibold uppercase shrink-0 ${c.status === "REGULAMENTADA" ? "text-success" : "text-warning"}`}>
                  {c.status === "REGULAMENTADA" ? "Regulamentada" : "Não regulamentada"}
                </span>
              )}
            </label>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            {catalogo.length === 0
              ? "Nenhuma casa disponível no catálogo."
              : "Nenhuma casa encontrada para o filtro atual."}
          </p>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── IPs ─────────────────────────

type BulkRow = { label: string; ip_address: string; location_city: string };
const emptyRow = (): BulkRow => ({ label: "", ip_address: "", location_city: "" });

function IpsList() {
  const { data: ips = [] } = usePlanningIps();
  const upsert = useUpsertPlanningIp();
  const del = useDeletePlanningIp();
  const [editing, setEditing] = useState<Partial<PlanningIp> | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const startNew = () => setEditing({ label: "", ip_address: "", location_city: "", is_active: true });

  const updateRow = (idx: number, patch: Partial<BulkRow>) => {
    setBulkRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => setBulkRows(prev => [...prev, emptyRow()]);
  const removeRow = (idx: number) =>
    setBulkRows(prev => (prev.length === 1 ? [emptyRow()] : prev.filter((_, i) => i !== idx)));

  const validRows = useMemo(
    () => bulkRows.filter(r => r.label.trim() && r.ip_address.trim()),
    [bulkRows]
  );

  const resetBulk = () => {
    setBulkRows([emptyRow(), emptyRow(), emptyRow()]);
    setBulkOpen(false);
  };

  const handleBulkSubmit = async () => {
    if (validRows.length === 0) return;
    setBulkBusy(true);
    try {
      for (const row of validRows) {
        await upsert.mutateAsync({
          label: row.label.trim(),
          ip_address: row.ip_address.trim(),
          location_city: row.location_city.trim(),
          is_active: true,
        });
      }
      resetBulk();
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{ips.length} IP(s) cadastrado(s)</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(o => !o)}>
            <Plus className="h-4 w-4 mr-1" /> Em massa
          </Button>
          <Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1" /> Novo IP</Button>
        </div>
      </div>

      {bulkOpen && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Adicionar vários IPs</p>
            <Badge variant="secondary" className="text-[10px]">{validRows.length} válido(s)</Badge>
          </div>

          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground px-1">
            <span>Label</span>
            <span>Endereço</span>
            <span>Cidade</span>
            <span className="w-7" />
          </div>

          <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
            {bulkRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 items-center">
                <Input
                  value={row.label}
                  onChange={e => updateRow(idx, { label: e.target.value })}
                  placeholder="Casa Principal"
                  className="h-8 text-sm"
                />
                <Input
                  value={row.ip_address}
                  onChange={e => updateRow(idx, { ip_address: e.target.value })}
                  placeholder="192.168.0.1"
                  className="h-8 text-sm font-mono"
                />
                <Input
                  value={row.location_city}
                  onChange={e => updateRow(idx, { location_city: e.target.value })}
                  placeholder="São Paulo"
                  className="h-8 text-sm"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => removeRow(idx)}
                  title="Remover linha"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <Button variant="ghost" size="sm" onClick={addRow} className="w-full h-7 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar linha
          </Button>

          <div className="flex justify-end gap-2 pt-1 border-t">
            <Button variant="ghost" size="sm" onClick={resetBulk}>Cancelar</Button>
            <Button size="sm" onClick={handleBulkSubmit} disabled={validRows.length === 0 || bulkBusy}>
              {bulkBusy ? "Salvando..." : `Importar ${validRows.length}`}
            </Button>
          </div>
        </Card>
      )}

      {editing && (
        <Card className="p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Label</Label><Input value={editing.label ?? ""} onChange={e => setEditing({ ...editing, label: e.target.value })} /></div>
            <div><Label className="text-xs">Endereço IP</Label><Input value={editing.ip_address ?? ""} onChange={e => setEditing({ ...editing, ip_address: e.target.value })} /></div>
            <div className="col-span-2"><Label className="text-xs">Cidade</Label><Input value={editing.location_city ?? ""} onChange={e => setEditing({ ...editing, location_city: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button size="sm" onClick={async () => { await upsert.mutateAsync(editing); setEditing(null); }}>Salvar</Button>
          </div>
        </Card>
      )}

      <div className="space-y-1 max-h-[360px] overflow-y-auto">
        {ips.map(ip => (
          <Card key={ip.id} className="p-2 flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">{ip.label}</span>{" "}
              <span className="text-muted-foreground">· {ip.ip_address}</span>{" "}
              {ip.location_city && <span className="text-xs text-muted-foreground">({ip.location_city})</span>}
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(ip)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del.mutate(ip.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── WALLETS ─────────────────────────

function WalletsList() {
  const { data: wallets = [] } = usePlanningWallets();
  const upsert = useUpsertPlanningWallet();
  const del = useDeletePlanningWallet();
  const [editing, setEditing] = useState<Partial<PlanningWallet> | null>(null);

  const startNew = () => setEditing({ label: "", asset: "USDT", network: "TRC20", address: "", is_active: true });

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{wallets.length} carteira(s) cadastrada(s)</p>
        <Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1" /> Nova carteira</Button>
      </div>

      {editing && (
        <Card className="p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Label</Label><Input value={editing.label ?? ""} onChange={e => setEditing({ ...editing, label: e.target.value })} /></div>
            <div><Label className="text-xs">Ativo</Label><Input value={editing.asset ?? ""} onChange={e => setEditing({ ...editing, asset: e.target.value })} /></div>
            <div><Label className="text-xs">Rede</Label><Input value={editing.network ?? ""} onChange={e => setEditing({ ...editing, network: e.target.value })} /></div>
            <div className="col-span-2"><Label className="text-xs">Endereço</Label><Input value={editing.address ?? ""} onChange={e => setEditing({ ...editing, address: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button size="sm" onClick={async () => { await upsert.mutateAsync(editing); setEditing(null); }}>Salvar</Button>
          </div>
        </Card>
      )}

      <div className="space-y-1 max-h-[360px] overflow-y-auto">
        {wallets.map(w => (
          <Card key={w.id} className="p-2 flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">{w.label}</span>{" "}
              <span className="text-muted-foreground">· {w.asset}{w.network ? ` (${w.network})` : ""}</span>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(w)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del.mutate(w.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
