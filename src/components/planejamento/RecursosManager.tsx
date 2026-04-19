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
  useBookmakersCatalogo, useUpsertWorkspaceBookmaker,
  BookmakerCatalogo,
  useParceirosLite, usePlanningPerfis, useAddPlanningPerfis,
  useUpdatePlanningPerfil, useDeletePlanningPerfil,
  usePlanningCasas, useAddPlanningCasas, useUpdatePlanningCasa, useDeletePlanningCasa,
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

// ───────────────────────── CASAS (pré-seleção) ─────────────────────────

function CasasList() {
  const { data: casasSelecionadas = [] } = usePlanningCasas();
  const { data: catalogo = [] } = useBookmakersCatalogo();
  const upsert = useUpsertWorkspaceBookmaker();
  const addCasas = useAddPlanningCasas();
  const updCasa = useUpdatePlanningCasa();
  const delCasa = useDeletePlanningCasa();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<RegFilterValue>("all");
  const [editing, setEditing] = useState<Partial<BookmakerCatalogo> | null>(null);

  // Picker (modal de adicionar casas)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerFilter, setPickerFilter] = useState<RegFilterValue>("all");
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());

  const selectedIdsSet = useMemo(
    () => new Set(casasSelecionadas.map(p => p.bookmaker_catalogo_id)),
    [casasSelecionadas]
  );

  // Lista visível na tela principal — apenas as escolhidas pelo workspace
  const filtered = useMemo(() => {
    return casasSelecionadas.filter(p => {
      const c = p.casa;
      if (!c) return false;
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (search && !c.nome.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [casasSelecionadas, search, filterStatus]);

  // Catálogo disponível para adicionar (excluindo as já selecionadas)
  const availableCatalogo = useMemo(() => {
    return catalogo.filter(c => {
      if (selectedIdsSet.has(c.id)) return false;
      if (pickerFilter !== "all" && c.status !== pickerFilter) return false;
      if (pickerSearch && !c.nome.toLowerCase().includes(pickerSearch.toLowerCase())) return false;
      return true;
    });
  }, [catalogo, selectedIdsSet, pickerSearch, pickerFilter]);

  const togglePicker = (id: string) => {
    setPickerSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const togglePickerAll = () => {
    const allMarked = availableCatalogo.length > 0 && availableCatalogo.every(c => pickerSelected.has(c.id));
    setPickerSelected(prev => {
      const n = new Set(prev);
      if (allMarked) availableCatalogo.forEach(c => n.delete(c.id));
      else availableCatalogo.forEach(c => n.add(c.id));
      return n;
    });
  };

  const handleConfirmAdd = async () => {
    await addCasas.mutateAsync(Array.from(pickerSelected));
    setPickerSelected(new Set());
    setPickerOpen(false);
    setPickerSearch("");
  };

  const startNew = () => setEditing({
    nome: "",
    status: "REGULAMENTADA",
    moeda_padrao: "BRL",
    logo_url: "",
  });

  const totalReg = casasSelecionadas.filter(p => p.casa?.status === "REGULAMENTADA").length;
  const totalNaoReg = casasSelecionadas.filter(p => p.casa?.status === "NAO_REGULAMENTADA").length;

  const pickerTotalReg = catalogo.filter(c => c.status === "REGULAMENTADA" && !selectedIdsSet.has(c.id)).length;
  const pickerTotalNaoReg = catalogo.filter(c => c.status === "NAO_REGULAMENTADA" && !selectedIdsSet.has(c.id)).length;
  const pickerTotalAll = catalogo.filter(c => !selectedIdsSet.has(c.id)).length;

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
          totalAll={casasSelecionadas.length}
          totalReg={totalReg}
          totalNaoReg={totalNaoReg}
        />
        <Button size="sm" onClick={() => setPickerOpen(o => !o)}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar casas
        </Button>
        <Button size="sm" variant="outline" onClick={startNew}>
          <Plus className="h-4 w-4 mr-1" /> Nova casa
        </Button>
      </div>

      {pickerOpen && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs font-medium">Selecione casas para a lista de planejamento</p>
            <Badge variant="secondary" className="text-[10px]">{pickerSelected.size} marcada(s)</Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                placeholder="Buscar casa..."
                className="pl-7 h-8 text-sm"
              />
            </div>
            <RegulamentacaoFilter
              value={pickerFilter}
              onChange={setPickerFilter}
              totalAll={pickerTotalAll}
              totalReg={pickerTotalReg}
              totalNaoReg={pickerTotalNaoReg}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <button className="hover:text-foreground" onClick={togglePickerAll}>
              {availableCatalogo.length > 0 && availableCatalogo.every(c => pickerSelected.has(c.id))
                ? "Desmarcar visíveis"
                : "Marcar visíveis"} ({availableCatalogo.length})
            </button>
          </div>
          <div className="max-h-[280px] overflow-y-auto space-y-1 border rounded-md p-1">
            {availableCatalogo.length === 0 && (
              <p className="text-xs text-muted-foreground italic text-center py-3">
                {catalogo.length === 0
                  ? "Nenhuma casa disponível no catálogo."
                  : "Todas as casas que combinam com o filtro já foram adicionadas."}
              </p>
            )}
            {availableCatalogo.map(c => {
              const checked = pickerSelected.has(c.id);
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-muted/40 ${checked ? "bg-primary/10" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePicker(c.id)}
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
                  <span className={`text-[9px] font-semibold uppercase shrink-0 ${c.status === "REGULAMENTADA" ? "text-success" : "text-warning"}`}>
                    {c.status === "REGULAMENTADA" ? "REG" : "N/REG"}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setPickerOpen(false); setPickerSelected(new Set()); }}>
              Cancelar
            </Button>
            <Button size="sm" disabled={pickerSelected.size === 0 || addCasas.isPending} onClick={handleConfirmAdd}>
              <Check className="h-4 w-4 mr-1" /> Adicionar {pickerSelected.size > 0 ? `(${pickerSelected.size})` : ""}
            </Button>
          </div>
        </Card>
      )}

      {editing && (
        <Card className="p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Nome da casa</Label>
              <Input
                value={editing.nome ?? ""}
                onChange={e => setEditing({ ...editing, nome: e.target.value })}
                placeholder="Ex.: Bet365"
              />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select
                value={(editing.status as string) ?? "REGULAMENTADA"}
                onValueChange={(v) => setEditing({ ...editing, status: v as any })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="REGULAMENTADA">Regulamentada</SelectItem>
                  <SelectItem value="NAO_REGULAMENTADA">Não regulamentada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Moeda padrão</Label>
              <Select
                value={editing.moeda_padrao ?? "BRL"}
                onValueChange={(v) => setEditing({ ...editing, moeda_padrao: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">BRL</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Logo URL (opcional)</Label>
              <Input
                value={editing.logo_url ?? ""}
                onChange={e => setEditing({ ...editing, logo_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              size="sm"
              onClick={async () => {
                if (!editing.nome?.trim()) return;
                await upsert.mutateAsync({
                  id: editing.id,
                  nome: editing.nome.trim(),
                  status: (editing.status as any) ?? "REGULAMENTADA",
                  moeda_padrao: editing.moeda_padrao ?? "BRL",
                  logo_url: editing.logo_url || null,
                });
                setEditing(null);
              }}
            >
              Salvar
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-1 max-h-[380px] overflow-y-auto">
        {filtered.map(p => {
          const c = p.casa!;
          return (
            <Card key={p.id} className="p-2 flex items-center gap-2">
              {c.logo_url ? (
                <img src={c.logo_url} alt="" className="h-5 w-5 rounded object-contain shrink-0" />
              ) : (
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.nome}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className={c.status === "REGULAMENTADA" ? "text-success" : "text-warning"}>
                    {c.status === "REGULAMENTADA" ? "Regulamentada" : "Não regulamentada"}
                  </span>
                  <span>· {c.moeda_padrao}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Switch
                  checked={p.is_active}
                  onCheckedChange={(v) => updCasa.mutate({ id: p.id, is_active: v })}
                />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => delCasa.mutate(p.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            {casasSelecionadas.length === 0
              ? "Nenhuma casa na lista. Clique em \"Adicionar casas\" para escolher do catálogo."
              : "Nenhuma casa encontrada para o filtro atual."}
          </p>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── IPs ─────────────────────────

function IpsList() {
  const { data: ips = [] } = usePlanningIps();
  const upsert = useUpsertPlanningIp();
  const del = useDeletePlanningIp();
  const [editing, setEditing] = useState<Partial<PlanningIp> | null>(null);

  const startNew = () => setEditing({ label: "", ip_address: "", proxy_type: "", location_country: "", location_city: "", provider: "", is_active: true });

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{ips.length} IP(s) cadastrado(s)</p>
        <Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1" /> Novo IP</Button>
      </div>

      {editing && (
        <Card className="p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Label</Label><Input value={editing.label ?? ""} onChange={e => setEditing({ ...editing, label: e.target.value })} /></div>
            <div><Label className="text-xs">Endereço IP</Label><Input value={editing.ip_address ?? ""} onChange={e => setEditing({ ...editing, ip_address: e.target.value })} /></div>
            <div><Label className="text-xs">Tipo</Label><Input placeholder="Residencial / DC / 4G" value={editing.proxy_type ?? ""} onChange={e => setEditing({ ...editing, proxy_type: e.target.value })} /></div>
            <div><Label className="text-xs">Provedor</Label><Input value={editing.provider ?? ""} onChange={e => setEditing({ ...editing, provider: e.target.value })} /></div>
            <div><Label className="text-xs">País</Label><Input value={editing.location_country ?? ""} onChange={e => setEditing({ ...editing, location_country: e.target.value })} /></div>
            <div><Label className="text-xs">Cidade</Label><Input value={editing.location_city ?? ""} onChange={e => setEditing({ ...editing, location_city: e.target.value })} /></div>
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
              {ip.location_country && <span className="text-xs text-muted-foreground">({ip.location_country})</span>}
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
