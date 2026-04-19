import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Pencil, Search, Building2 } from "lucide-react";
import {
  PlanningIp, PlanningWallet,
  usePlanningIps, usePlanningWallets,
  useUpsertPlanningIp, useDeletePlanningIp,
  useUpsertPlanningWallet, useDeletePlanningWallet,
  useBookmakersCatalogo, useUpsertWorkspaceBookmaker, useDeleteWorkspaceBookmaker,
  BookmakerCatalogo,
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
            <TabsTrigger value="ips">IPs / Proxies</TabsTrigger>
            <TabsTrigger value="wallets">Carteiras</TabsTrigger>
          </TabsList>
          <TabsContent value="casas"><CasasList /></TabsContent>
          <TabsContent value="ips"><IpsList /></TabsContent>
          <TabsContent value="wallets"><WalletsList /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── CASAS ─────────────────────────

function CasasList() {
  const { data: casas = [] } = useBookmakersCatalogo();
  const upsert = useUpsertWorkspaceBookmaker();
  const del = useDeleteWorkspaceBookmaker();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "REGULAMENTADA" | "NAO_REGULAMENTADA">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Partial<BookmakerCatalogo> | null>(null);

  const filtered = useMemo(() => {
    return casas.filter(c => {
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (search && !c.nome.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [casas, search, filterStatus]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id));

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(c => next.delete(c.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(c => next.add(c.id));
        return next;
      });
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startNew = () => setEditing({
    nome: "",
    status: "REGULAMENTADA",
    moeda_padrao: "BRL",
    logo_url: "",
  });

  const handleBulkDelete = async () => {
    // Só deleta as do workspace (WORKSPACE_PRIVATE) — RLS protege as demais.
    const privateOnly = casas.filter(c => selectedIds.has(c.id) && c.visibility === "WORKSPACE_PRIVATE");
    for (const c of privateOnly) {
      await del.mutateAsync(c.id);
    }
    setSelectedIds(new Set());
  };

  const totalRegulamentadas = casas.filter(c => c.status === "REGULAMENTADA").length;
  const totalNaoRegulamentadas = casas.filter(c => c.status === "NAO_REGULAMENTADA").length;

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
        <ToggleGroup
          type="single"
          value={filterStatus}
          onValueChange={(v) => v && setFilterStatus(v as any)}
          size="sm"
        >
          <ToggleGroupItem value="all" className="h-8 text-xs">
            Todas <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{casas.length}</Badge>
          </ToggleGroupItem>
          <ToggleGroupItem value="REGULAMENTADA" className="h-8 text-xs">
            Regulamentadas <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{totalRegulamentadas}</Badge>
          </ToggleGroupItem>
          <ToggleGroupItem value="NAO_REGULAMENTADA" className="h-8 text-xs">
            Não reg. <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{totalNaoRegulamentadas}</Badge>
          </ToggleGroupItem>
        </ToggleGroup>
        <Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1" /> Nova casa</Button>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-1.5 text-xs">
          <span>{selectedIds.size} casa(s) selecionada(s)</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setSelectedIds(new Set())}>Limpar</Button>
            <Button variant="destructive" size="sm" className="h-7" onClick={handleBulkDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover privadas
            </Button>
          </div>
        </div>
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

      <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-1">
        <button className="hover:text-foreground" onClick={toggleAll}>
          {allFilteredSelected ? "Desmarcar todas" : "Selecionar todas"} ({filtered.length})
        </button>
        <span>Apenas casas privadas do workspace podem ser editadas/removidas.</span>
      </div>

      <div className="space-y-1 max-h-[380px] overflow-y-auto">
        {filtered.map(c => {
          const isPrivate = c.visibility === "WORKSPACE_PRIVATE";
          const isSelected = selectedIds.has(c.id);
          return (
            <Card
              key={c.id}
              className={`p-2 flex items-center gap-2 transition-colors ${isSelected ? "bg-primary/10 border-primary/40" : ""}`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleOne(c.id)}
                className="h-3.5 w-3.5"
              />
              {c.logo_url ? (
                <img src={c.logo_url} alt="" className="h-5 w-5 rounded object-contain shrink-0" />
              ) : (
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.nome}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Badge
                    variant={c.status === "REGULAMENTADA" ? "default" : "outline"}
                    className="h-4 px-1 text-[9px]"
                  >
                    {c.status === "REGULAMENTADA" ? "REG" : "N/REG"}
                  </Badge>
                  <span>{c.moeda_padrao}</span>
                  {!isPrivate && <span className="italic">· global</span>}
                </div>
              </div>
              {isPrivate && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del.mutate(c.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">Nenhuma casa encontrada.</p>
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
