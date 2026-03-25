import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowDownLeft, ArrowUpRight, Building2, Calendar, CreditCard, Loader2,
  Pencil, Plus, Trash2, Clock, Landmark,
} from "lucide-react";
import { toast } from "sonner";
import { SwipeableCard } from "./SwipeableCard";
import { EditLedgerDialog } from "./EditLedgerDialog";
import { PagamentosTab } from "./PagamentosTab";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titular: any;
  supplierToken: string;
  supplierWorkspaceId: string;
  onEditTitular: () => void;
}

const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function callEdge(action: string, body: Record<string, any>) {
  const resp = await fetch(
    `https://${projectId}.supabase.co/functions/v1/supplier-auth?action=${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey },
      body: JSON.stringify(body),
    }
  );
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Erro na requisição");
  return data;
}

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "—";
  const d = dateStr.split("T")[0];
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function formatCurrency(value: number, moeda = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(value);
}

// ─── Transaction History Tab ───
function HistoryTab({ titular, supplierToken }: { titular: any; supplierToken: string }) {
  const [editEntry, setEditEntry] = useState<any>(null);
  
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["titular-history", titular.id],
    queryFn: () => callEdge("get-titular-history", { token: supplierToken, titular_id: titular.id }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const transactions = data?.transactions || [];

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Nenhuma movimentação encontrada</p>
      </div>
    );
  }

  const EDITABLE_TYPES = ["DEPOSITO", "SAQUE", "TRANSFERENCIA_BANCO"];

  function tipoLabel(tipo: string, direcao: string) {
    if (tipo === "DEPOSITO") return "Depósito em casa";
    if (tipo === "SAQUE") return "Saque de casa";
    if (tipo === "TRANSFERENCIA_BANCO" && direcao === "CREDIT") return "Recebido no banco";
    if (tipo === "TRANSFERENCIA_BANCO" && direcao === "DEBIT") return "Enviado ao banco";
    if (tipo === "ALOCACAO") return "Alocação de capital";
    if (tipo === "DEVOLUCAO") return "Devolução";
    if (tipo === "PAGAMENTO_TITULAR") return "Pagamento ao titular";
    return tipo?.replace(/_/g, " ");
  }

  return (
    <>
      <div className="space-y-1">
        {transactions.map((tx: any) => {
          const isCredit = tx.direcao === "CREDIT";
          const canEdit = EDITABLE_TYPES.includes(tx.tipo);
          const wasEdited = !!(tx.metadata as any)?.valor_original;

          return (
            <div
              key={tx.id}
              className="flex items-center gap-3 py-2.5 px-2 rounded-md hover:bg-muted/30 transition-colors group"
            >
              {tx.casa_logo ? (
                <img src={tx.casa_logo} alt="" className="w-7 h-7 rounded-full object-contain shrink-0" />
              ) : (
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  isCredit ? "bg-emerald-500/15" : "bg-orange-500/15"
                }`}>
                  {isCredit
                    ? <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
                    : <ArrowUpRight className="h-3.5 w-3.5 text-orange-600" />
                  }
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-foreground truncate">
                    {tipoLabel(tx.tipo, tx.direcao)}
                  </p>
                  {wasEdited && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
                      editado
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {tx.casa_nome ? tx.casa_nome.toUpperCase() : tx.descricao || "—"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="text-right">
                  <p className={`text-sm font-semibold ${isCredit ? "text-emerald-600" : "text-orange-600"}`}>
                    {isCredit ? "+" : "−"}{formatCurrency(Math.abs(tx.valor))}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{formatDateBR(tx.created_at)}</p>
                </div>
                {canEdit && (
                  <button
                    onClick={() => setEditEntry(tx)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-muted/50"
                    title="Editar"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <EditLedgerDialog
        open={!!editEntry}
        onOpenChange={(open) => { if (!open) setEditEntry(null); }}
        entry={editEntry}
        onSuccess={() => { setEditEntry(null); refetch(); }}
      />
    </>
  );
}

// ─── Banks Tab ───
function BancosTab({ titular, supplierToken }: { titular: any; supplierToken: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingBanco, setEditingBanco] = useState<any | null>(null);

  const [bancoNome, setBancoNome] = useState("");
  const [pixKey, setPixKey] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["titular-bancos", titular.id],
    queryFn: () => callEdge("manage-banco", { token: supplierToken, titular_id: titular.id, operation: "list" }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = {
        token: supplierToken,
        titular_id: titular.id,
        operation: editingBanco ? "update" : "create",
        banco_nome: bancoNome,
        pix_key: pixKey || null,
      };
      if (editingBanco) payload.banco_id = editingBanco.id;
      return callEdge("manage-banco", payload);
    },
    onSuccess: () => {
      toast.success(editingBanco ? "Banco atualizado" : "Banco cadastrado");
      queryClient.invalidateQueries({ queryKey: ["titular-bancos", titular.id] });
      resetBancoForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (bancoId: string) =>
      callEdge("manage-banco", { token: supplierToken, titular_id: titular.id, operation: "delete", banco_id: bancoId }),
    onSuccess: () => {
      toast.success("Banco removido");
      queryClient.invalidateQueries({ queryKey: ["titular-bancos", titular.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openEditBanco(banco: any) {
    setEditingBanco(banco);
    setBancoNome(banco.banco_nome || "");
    setPixKey(banco.pix_key || "");
    setShowForm(true);
  }

  function resetBancoForm() {
    setEditingBanco(null);
    setBancoNome(""); setPixKey("");
    setShowForm(false);
  }

  const bancos = data?.bancos || [];

  if (showForm) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {editingBanco ? "Editar Banco" : "Novo Banco"}
        </p>

        <div>
          <Label>Banco <span className="text-destructive">*</span></Label>
          <Input value={bancoNome} onChange={e => setBancoNome(e.target.value)} placeholder="Ex: Nubank, Bradesco" />
        </div>

        <div>
          <Label>Chave PIX</Label>
          <Input value={pixKey} onChange={e => setPixKey(e.target.value)} placeholder="CPF, email, telefone, chave aleatória..." />
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={resetBancoForm} disabled={saveMutation.isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!bancoNome.trim() || saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            {editingBanco ? "Salvar" : "Cadastrar"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button size="sm" variant="outline" onClick={() => { resetBancoForm(); setShowForm(true); }} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Adicionar Banco
      </Button>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : bancos.length === 0 ? (
        <div className="text-center py-8">
          <Landmark className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum banco cadastrado</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden divide-y divide-border">
          {bancos.map((banco: any) => (
            <SwipeableCard
              key={banco.id}
              leftActions={[
                {
                  icon: <Pencil className="h-4 w-4" />,
                  label: "Editar",
                  onClick: () => openEditBanco(banco),
                  className: "bg-primary text-primary-foreground",
                },
              ]}
              rightActions={[
                {
                  icon: <Trash2 className="h-4 w-4" />,
                  label: "Excluir",
                  onClick: () => {
                    if (confirm("Excluir este banco?")) deleteMutation.mutate(banco.id);
                  },
                  className: "bg-destructive text-destructive-foreground",
                },
              ]}
            >
              <div
                className="py-3 px-3 sm:px-4 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => openEditBanco(banco)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{banco.banco_nome}</p>
                    {banco.pix_key && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        PIX: {banco.pix_key}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-xs font-semibold font-mono ${(Number(banco.saldo) || 0) > 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(banco.saldo) || 0)}
                  </span>
                  {banco.pix_key && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <CreditCard className="h-2.5 w-2.5" /> PIX
                    </Badge>
                  )}
                </div>
              </div>
            </SwipeableCard>
          ))}
        </div>
      )}
    </div>
  );
}
// ─── Main Modal ───
export function TitularDetailModal({ open, onOpenChange, titular, supplierToken, supplierWorkspaceId, onEditTitular }: Props) {
  if (!titular) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {titular.nome}
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {titular.documento && <span>{titular.documento_tipo}: {titular.documento}</span>}
            {titular.email && <span>• {titular.email}</span>}
            {titular.telefone && <span>• {titular.telefone}</span>}
          </div>
        </DialogHeader>

        <Tabs defaultValue="historico" className="mt-2 flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 shrink-0">
            <TabsTrigger value="historico" className="text-xs sm:text-sm gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Histórico
            </TabsTrigger>
            <TabsTrigger value="bancos" className="text-xs sm:text-sm gap-1.5">
              <Landmark className="h-3.5 w-3.5" /> Bancos
            </TabsTrigger>
            <TabsTrigger value="pagamentos" className="text-xs sm:text-sm gap-1.5">
              <CreditCard className="h-3.5 w-3.5" /> Pagamentos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="historico" className="mt-3 flex-1 min-h-0 overflow-y-auto">
            <HistoryTab titular={titular} supplierToken={supplierToken} />
          </TabsContent>

          <TabsContent value="bancos" className="mt-3 flex-1 min-h-0 overflow-y-auto">
            <BancosTab titular={titular} supplierToken={supplierToken} />
          </TabsContent>

          <TabsContent value="pagamentos" className="mt-3 flex-1 min-h-0 overflow-y-auto">
            <PagamentosTab titular={titular} supplierToken={supplierToken} supplierWorkspaceId={supplierWorkspaceId} />
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={onEditTitular} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Editar Titular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
