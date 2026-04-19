import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Pencil } from "lucide-react";
import {
  PlanningIp, PlanningWallet,
  usePlanningIps, usePlanningWallets,
  useUpsertPlanningIp, useDeletePlanningIp,
  useUpsertPlanningWallet, useDeletePlanningWallet,
} from "@/hooks/usePlanningData";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

export function RecursosManager({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerenciar recursos</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="ips">
          <TabsList>
            <TabsTrigger value="ips">IPs / Proxies</TabsTrigger>
            <TabsTrigger value="wallets">Carteiras</TabsTrigger>
          </TabsList>
          <TabsContent value="ips"><IpsList /></TabsContent>
          <TabsContent value="wallets"><WalletsList /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

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
