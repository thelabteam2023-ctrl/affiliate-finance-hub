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
import { Plus, Trash2, Pencil, Search, Building2, User, Check, UserPlus, Link2, Unlink, Palette } from "lucide-react";
import {
  PlanningIp, PlanningWallet, PlanningPerfil,
  usePlanningIps, usePlanningWallets,
  useUpsertPlanningIp, useDeletePlanningIp,
  useUpsertPlanningWallet, useDeletePlanningWallet,
  useBookmakersCatalogo,
  useParceirosLite, usePlanningPerfis, useAddPlanningPerfis,
  useAddPlanningPerfisGenericos,
  useUpdatePlanningPerfil, useDeletePlanningPerfil,
  usePlanningCasas, useAddPlanningCasas, useDeletePlanningCasa,
  usePlanningCasasPermitidasPorPerfil,
  PERFIL_CORES, perfilDisplayName, orderPlanningPerfis,
} from "@/hooks/usePlanningData";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

import DistribuicaoTab from "./DistribuicaoTab";

export function RecursosManager({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Gerenciar recursos</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="casas" className="flex-1 flex flex-col min-h-0">
          <TabsList>
            <TabsTrigger value="casas">Casas</TabsTrigger>
            <TabsTrigger value="perfis">Perfis</TabsTrigger>
            <TabsTrigger value="ips">IPs / Proxies</TabsTrigger>
            <TabsTrigger value="wallets">Carteiras</TabsTrigger>
            <TabsTrigger value="distribuicao">Distribuição</TabsTrigger>
          </TabsList>
          <TabsContent value="casas" className="flex-1 overflow-y-auto"><CasasList /></TabsContent>
          <TabsContent value="perfis" className="flex-1 overflow-y-auto"><PerfisList /></TabsContent>
          <TabsContent value="ips" className="flex-1 overflow-y-auto"><IpsList /></TabsContent>
          <TabsContent value="wallets" className="flex-1 overflow-y-auto"><WalletsList /></TabsContent>
          <TabsContent value="distribuicao" className="flex-1 overflow-y-auto"><DistribuicaoTab /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── PERFIS (genéricos + vínculo a parceiro real) ─────────────────────────

function PerfisList() {
  const { data: perfis = [] } = usePlanningPerfis();
  const { data: parceiros = [] } = useParceirosLite();
  const addPerfis = useAddPlanningPerfis();
  const addGenericos = useAddPlanningPerfisGenericos();
  const updPerfil = useUpdatePlanningPerfil();
  const delPerfil = useDeletePlanningPerfil();

  const [search, setSearch] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkQtd, setBulkQtd] = useState<number>(5);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");

  const linkedParceiroIds = useMemo(
    () => new Set(perfis.filter(p => p.parceiro_id).map(p => p.parceiro_id as string)),
    [perfis]
  );

  const availableParceiros = useMemo(() => {
    return parceiros.filter(p => {
      if (linkedParceiroIds.has(p.id)) return false;
      if (pickerSearch && !p.nome.toLowerCase().includes(pickerSearch.toLowerCase())) return false;
      return true;
    });
  }, [parceiros, linkedParceiroIds, pickerSearch]);

  const filteredPerfis = useMemo(() => {
    if (!search) return perfis;
    const s = search.toLowerCase();
    return perfis.filter(p =>
      perfilDisplayName(p).toLowerCase().includes(s) ||
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

  const handleCreateGenericos = async () => {
    if (bulkQtd < 1) return;
    await addGenericos.mutateAsync({ quantidade: bulkQtd });
    setBulkOpen(false);
    setBulkQtd(5);
  };

  const totalGenericos = perfis.filter(p => !p.parceiro_id).length;
  const totalReais = perfis.filter(p => !!p.parceiro_id).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar perfil..."
            className="pl-7 h-8 text-sm"
          />
        </div>
        <Badge variant="secondary" className="h-6 text-[10px]">
          {perfis.length} total · {totalReais} real · {totalGenericos} genérico
        </Badge>
        <Button size="sm" variant="outline" onClick={() => { setBulkOpen(o => !o); setPickerOpen(false); }}>
          <UserPlus className="h-4 w-4 mr-1" /> Criar genéricos
        </Button>
        <Button size="sm" onClick={() => { setPickerOpen(o => !o); setBulkOpen(false); }}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar parceiros
        </Button>
      </div>

      {bulkOpen && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Quantos perfis genéricos criar?</p>
            <Badge variant="secondary" className="text-[10px]">Numera automaticamente como CPF #N</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={50}
              value={bulkQtd}
              onChange={e => setBulkQtd(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              className="h-8 text-sm w-24"
            />
            <div className="flex gap-1">
              {[3, 5, 8, 10].map(n => (
                <Button
                  key={n}
                  variant={bulkQtd === n ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setBulkQtd(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setBulkOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleCreateGenericos} disabled={addGenericos.isPending}>
              <Check className="h-4 w-4 mr-1" /> Criar {bulkQtd}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Cada perfil receberá uma cor única e poderá ser vinculado a um parceiro real depois.
          </p>
        </Card>
      )}

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
          <PerfilRow
            key={p.id}
            perfil={p}
            isEditingLabel={editingLabelId === p.id}
            labelDraft={labelDraft}
            onStartEditLabel={() => { setEditingLabelId(p.id); setLabelDraft(p.label_custom ?? ""); }}
            onChangeLabelDraft={setLabelDraft}
            onSaveLabel={async () => {
              await updPerfil.mutateAsync({ id: p.id, label_custom: labelDraft.trim() || null });
              setEditingLabelId(null);
            }}
            onCancelEditLabel={() => setEditingLabelId(null)}
            onChangeCor={(cor) => updPerfil.mutate({ id: p.id, cor })}
            onToggleActive={(v) => updPerfil.mutate({ id: p.id, is_active: v })}
            onLinkParceiro={(parceiroId) => updPerfil.mutate({ id: p.id, parceiro_id: parceiroId })}
            onUnlinkParceiro={() => updPerfil.mutate({ id: p.id, parceiro_id: null })}
            onDelete={() => delPerfil.mutate(p.id)}
            availableParceiros={parceiros.filter(pp => !linkedParceiroIds.has(pp.id))}
          />
        ))}
        {filteredPerfis.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            {perfis.length === 0
              ? 'Nenhum perfil. Use "Criar genéricos" para começar com placeholders ou "Adicionar parceiros" para puxar perfis reais.'
              : "Nenhum perfil encontrado para a busca."}
          </p>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Linha individual de perfil ─────────────────────────

interface PerfilRowProps {
  perfil: PlanningPerfil;
  isEditingLabel: boolean;
  labelDraft: string;
  onStartEditLabel: () => void;
  onChangeLabelDraft: (v: string) => void;
  onSaveLabel: () => void;
  onCancelEditLabel: () => void;
  onChangeCor: (cor: string) => void;
  onToggleActive: (v: boolean) => void;
  onLinkParceiro: (parceiroId: string) => void;
  onUnlinkParceiro: () => void;
  onDelete: () => void;
  availableParceiros: Array<{ id: string; nome: string; email: string | null }>;
}

function PerfilRow({
  perfil: p,
  isEditingLabel,
  labelDraft,
  onStartEditLabel,
  onChangeLabelDraft,
  onSaveLabel,
  onCancelEditLabel,
  onChangeCor,
  onToggleActive,
  onLinkParceiro,
  onUnlinkParceiro,
  onDelete,
  availableParceiros,
}: PerfilRowProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const isGenerico = !p.parceiro_id;
  const display = perfilDisplayName(p);

  const filteredParceiros = useMemo(() => {
    if (!linkSearch) return availableParceiros;
    const s = linkSearch.toLowerCase();
    return availableParceiros.filter(pp =>
      pp.nome.toLowerCase().includes(s) || (pp.email ?? "").toLowerCase().includes(s)
    );
  }, [availableParceiros, linkSearch]);

  return (
    <Card className="p-2 flex items-center gap-2">
      {/* Cor + picker */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-6 w-6 rounded-full ring-2 ring-background shrink-0 hover:ring-foreground/20 transition"
            style={{ backgroundColor: p.cor }}
            title="Alterar cor"
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="grid grid-cols-6 gap-1">
            {PERFIL_CORES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => onChangeCor(c)}
                className={`h-6 w-6 rounded-full ring-2 transition ${
                  p.cor === c ? "ring-foreground" : "ring-background hover:ring-foreground/30"
                }`}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex-1 min-w-0">
        {isEditingLabel ? (
          <div className="flex items-center gap-1">
            <Input
              value={labelDraft}
              onChange={e => onChangeLabelDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") onSaveLabel();
                if (e.key === "Escape") onCancelEditLabel();
              }}
              autoFocus
              placeholder={isGenerico ? "Nome do perfil" : "Apelido (opcional)"}
              className="h-7 text-sm"
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onSaveLabel}>
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium truncate">{display}</span>
            {isGenerico ? (
              <Badge variant="outline" className="text-[9px] h-4 shrink-0">Genérico</Badge>
            ) : (
              p.label_custom && p.parceiro?.nome && (
                <span className="text-[10px] text-muted-foreground truncate">({p.parceiro.nome})</span>
              )
            )}
            <Button size="icon" variant="ghost" className="h-5 w-5 opacity-60 hover:opacity-100" onClick={onStartEditLabel}>
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        )}
        <div className="text-[10px] text-muted-foreground truncate">
          {isGenerico
            ? "Sem parceiro vinculado — slot anônimo para planejamento"
            : (p.parceiro?.email || "sem e-mail") + (p.parceiro?.cidade ? ` · ${p.parceiro.cidade}` : "")}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {/* Vincular / desvincular parceiro */}
        {isGenerico ? (
          <Popover open={linkOpen} onOpenChange={setLinkOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]">
                <Link2 className="h-3.5 w-3.5 mr-1" /> Vincular
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="end">
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    value={linkSearch}
                    onChange={e => setLinkSearch(e.target.value)}
                    placeholder="Buscar parceiro..."
                    className="pl-7 h-7 text-xs"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {filteredParceiros.length === 0 && (
                    <p className="text-[10px] text-muted-foreground italic text-center py-2">
                      Nenhum parceiro disponível.
                    </p>
                  )}
                  {filteredParceiros.map(pp => (
                    <button
                      key={pp.id}
                      type="button"
                      onClick={() => { onLinkParceiro(pp.id); setLinkOpen(false); setLinkSearch(""); }}
                      className="w-full text-left p-1.5 rounded hover:bg-muted/50 text-xs truncate"
                    >
                      <div className="font-medium truncate">{pp.nome}</div>
                      {pp.email && <div className="text-[9px] text-muted-foreground truncate">{pp.email}</div>}
                    </button>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onUnlinkParceiro}
            title="Desvincular parceiro (vira genérico)"
          >
            <Unlink className="h-3.5 w-3.5" />
          </Button>
        )}
        <Switch
          checked={p.is_active}
          onCheckedChange={onToggleActive}
        />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
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

type BulkRow = { ip_address: string; location_city: string; bookmaker_catalogo_id: string };
const emptyRow = (): BulkRow => ({ ip_address: "", location_city: "", bookmaker_catalogo_id: "" });

function IpsList() {
  const { data: ips = [] } = usePlanningIps();
  const { data: casasSelecionadas = [] } = usePlanningCasas();
  const { data: casasPermitidasPerfil = [] } = usePlanningCasasPermitidasPorPerfil();
  const { data: perfis = [] } = usePlanningPerfis();
  const upsert = useUpsertPlanningIp();
  const del = useDeletePlanningIp();
  const [editing, setEditing] = useState<Partial<PlanningIp> | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPerfilId, setBulkPerfilId] = useState("");
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const startNew = () => setEditing({ label: "", ip_address: "", location_city: "", is_active: true });

  const updateRow = (idx: number, patch: Partial<BulkRow>) => {
    setBulkRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => setBulkRows(prev => [...prev, emptyRow()]);
  const removeRow = (idx: number) =>
    setBulkRows(prev => (prev.length === 1 ? [emptyRow()] : prev.filter((_, i) => i !== idx)));

  const activePerfis = useMemo(() => orderPlanningPerfis(perfis.filter(p => p.is_active)), [perfis]);

  const perfilByParceiroId = useMemo(() => {
    const map = new Map<string, string>();
    perfis.forEach(p => {
      if (p.parceiro_id) map.set(p.parceiro_id, p.id);
    });
    return map;
  }, [perfis]);

  const casasPorPerfilMap = useMemo(() => {
    const map = new Map<string, typeof casasPermitidasPerfil>();
    casasPermitidasPerfil.forEach(c => {
      const perfilId = c.perfil_planejamento_id || (c.parceiro_id ? perfilByParceiroId.get(c.parceiro_id) : null);
      if (!perfilId || !c.casa) return;
      const current = map.get(perfilId) ?? [];
      if (!current.some(item => item.bookmaker_catalogo_id === c.bookmaker_catalogo_id)) {
        current.push(c);
        map.set(perfilId, current);
      }
    });
    return map;
  }, [casasPermitidasPerfil, perfilByParceiroId]);

  const getCasasForPerfil = (perfilId?: string | null) => {
    if (!perfilId) return casasSelecionadas.filter(c => c.is_active && c.casa);
    return casasPorPerfilMap.get(perfilId) ?? [];
  };

  const getCasaDisplayName = (casa: ReturnType<typeof getCasasForPerfil>[number] | undefined) => {
    if (!casa) return "Proxy";
    return (("label_custom" in casa ? casa.label_custom : null) || casa.casa?.nome || "Proxy").trim();
  };

  const handleBulkPerfilChange = (perfilId: string) => {
    setBulkPerfilId(perfilId);
    const casas = getCasasForPerfil(perfilId);
    setBulkRows(casas.length > 0
      ? casas.map(c => ({ ...emptyRow(), bookmaker_catalogo_id: c.bookmaker_catalogo_id }))
      : [emptyRow()]
    );
  };

  const getAvailableCasasForBulkRow = (idx: number) => {
    const selectedInOtherRows = new Set(
      bulkRows
        .filter((_, rowIdx) => rowIdx !== idx)
        .map(row => row.bookmaker_catalogo_id)
        .filter(Boolean)
    );
    return getCasasForPerfil(bulkPerfilId).filter(c => !selectedInOtherRows.has(c.bookmaker_catalogo_id));
  };

  const validRows = useMemo(
    () => bulkRows.filter(r => bulkPerfilId && r.bookmaker_catalogo_id && r.ip_address.trim()),
    [bulkRows, bulkPerfilId]
  );

  const resetBulk = () => {
    setBulkPerfilId("");
    setBulkRows([emptyRow(), emptyRow(), emptyRow()]);
    setBulkOpen(false);
  };

  const handleBulkSubmit = async () => {
    if (validRows.length === 0) return;
    setBulkBusy(true);
    try {
      for (const row of validRows) {
        const casa = getCasasForPerfil(bulkPerfilId).find(c => c.bookmaker_catalogo_id === row.bookmaker_catalogo_id);
        await upsert.mutateAsync({
          label: getCasaDisplayName(casa),
          ip_address: row.ip_address.trim(),
          location_city: row.location_city.trim(),
          perfil_planejamento_id: bulkPerfilId || null,
          bookmaker_catalogo_id: row.bookmaker_catalogo_id || null,
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
            <div className="space-y-1">
              <p className="text-xs font-medium">Adicionar proxies por CPF</p>
              <p className="text-[10px] text-muted-foreground">Escolha o CPF uma vez e preencha os proxies das casas vinculadas a ele.</p>
            </div>
            <Badge variant="secondary" className="text-[10px]">{validRows.length} válido(s)</Badge>
          </div>

          <div className="grid grid-cols-[minmax(220px,1fr)_auto] gap-2 items-end">
            <div>
              <Label className="text-xs">CPF / Perfil</Label>
              <Select value={bulkPerfilId || undefined} onValueChange={handleBulkPerfilChange}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Selecione o CPF" />
                </SelectTrigger>
                <SelectContent>
                  {activePerfis.map((p, i) => (
                    <SelectItem key={p.id} value={p.id}>
                      CPF {i + 1} · {perfilDisplayName(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Badge variant="outline" className="h-8 px-3 text-xs">
              {bulkPerfilId ? `${getCasasForPerfil(bulkPerfilId).length} casa(s)` : "Selecione um CPF"}
            </Badge>
          </div>

          <div className="grid grid-cols-[1.25fr_1fr_1fr_auto] gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground px-1">
            <span>Casa vinculada</span>
            <span>Endereço</span>
            <span>Cidade</span>
            <span className="w-7" />
          </div>

          <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
            {bulkRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[1.25fr_1fr_1fr_auto] gap-1.5 items-center">
                <Select
                  value={row.bookmaker_catalogo_id || undefined}
                  onValueChange={v => updateRow(idx, { bookmaker_catalogo_id: v === "__none" ? "" : v })}
                  disabled={!bulkPerfilId}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder={bulkPerfilId ? "Selecionar" : "Escolha CPF"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem vínculo</SelectItem>
                    {getAvailableCasasForBulkRow(idx).map(c => (
                      <SelectItem key={c.bookmaker_catalogo_id} value={c.bookmaker_catalogo_id}>
                        <div className="flex items-center gap-2">
                          {c.casa?.logo_url ? <img src={c.casa.logo_url} alt="" className="h-4 w-4 rounded object-contain" /> : <Building2 className="h-3.5 w-3.5" />}
                          <span>{("label_custom" in c ? c.label_custom : null) || c.casa?.nome}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <div><Label className="text-xs">Cidade</Label><Input value={editing.location_city ?? ""} onChange={e => setEditing({ ...editing, location_city: e.target.value })} /></div>
            <div>
              <Label className="text-xs">CPF / Perfil</Label>
              <Select
                value={editing.perfil_planejamento_id || undefined}
                onValueChange={v => setEditing({ ...editing, perfil_planejamento_id: v === "__none" ? null : v, bookmaker_catalogo_id: null })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o CPF/perfil" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem CPF</SelectItem>
                  {perfis.filter(p => p.is_active).map((p, i) => (
                    <SelectItem key={p.id} value={p.id}>
                      CPF {i + 1} · {perfilDisplayName(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Casa vinculada</Label>
              <Select
                value={editing.bookmaker_catalogo_id || undefined}
                onValueChange={v => setEditing({ ...editing, bookmaker_catalogo_id: v === "__none" ? null : v })}
                disabled={!editing.perfil_planejamento_id}
              >
                <SelectTrigger><SelectValue placeholder={editing.perfil_planejamento_id ? "Selecione a casa do CPF" : "Escolha o CPF primeiro"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem vínculo</SelectItem>
                  {getCasasForPerfil(editing.perfil_planejamento_id).map(c => (
                    <SelectItem key={c.bookmaker_catalogo_id} value={c.bookmaker_catalogo_id}>
                      <div className="flex items-center gap-2">
                        {c.casa?.logo_url ? <img src={c.casa.logo_url} alt="" className="h-4 w-4 rounded object-contain" /> : <Building2 className="h-3.5 w-3.5" />}
                        <span>{("label_custom" in c ? c.label_custom : null) || c.casa?.nome}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button size="sm" onClick={async () => { await upsert.mutateAsync(editing); setEditing(null); }}>Salvar</Button>
          </div>
        </Card>
      )}

      <div className="space-y-1 max-h-[360px] overflow-y-auto">
        {ips.map(ip => {
          const linkedCasa = casasSelecionadas.find(c => c.bookmaker_catalogo_id === ip.bookmaker_catalogo_id);
          const linkedPerfilIndex = perfis.findIndex(p => p.id === ip.perfil_planejamento_id);
          const linkedPerfil = linkedPerfilIndex >= 0 ? perfis[linkedPerfilIndex] : null;
          return (
          <Card key={ip.id} className="p-2 flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">{ip.label}</span>{" "}
              <span className="text-muted-foreground">· {ip.ip_address}</span>{" "}
              {ip.location_city && <span className="text-xs text-muted-foreground">({ip.location_city})</span>}
              {linkedPerfil && <Badge variant="secondary" className="ml-2 h-5 text-[10px]">CPF {linkedPerfilIndex + 1} · {perfilDisplayName(linkedPerfil)}</Badge>}
              {linkedCasa?.casa && <Badge variant="outline" className="ml-2 h-5 text-[10px]">{linkedCasa.label_custom || linkedCasa.casa.nome}</Badge>}
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(ip)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del.mutate(ip.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </Card>
        );})}
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
