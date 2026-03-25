import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Plus,
  DollarSign,
  Wallet,
  Landmark,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "—";
  const d = dateStr.split("T")[0];
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

interface Props {
  titular: any;
  supplierToken: string;
  supplierWorkspaceId: string;
}

export function PagamentosTab({ titular, supplierToken, supplierWorkspaceId }: Props) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [fonte, setFonte] = useState<"CENTRAL" | "BANCO">("CENTRAL");
  const [bancoId, setBancoId] = useState("");

  // Fetch payment history for this titular
  const { data: payments, isLoading } = useQuery({
    queryKey: ["titular-pagamentos", titular.id],
    queryFn: () => callEdge("get-titular-pagamentos", { token: supplierToken, titular_id: titular.id }),
  });

  // Fetch banks for this titular (for payment source)
  const { data: bancosData } = useQuery({
    queryKey: ["titular-bancos", titular.id],
    queryFn: () => callEdge("manage-banco", { token: supplierToken, titular_id: titular.id, operation: "list" }),
    enabled: showForm,
  });

  // Fetch available balance
  const { data: ledgerData } = useQuery({
    queryKey: ["supplier-ledger-summary-v2", supplierWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_ledger")
        .select("tipo, direcao, valor, bookmaker_account_id, metadata")
        .eq("supplier_workspace_id", supplierWorkspaceId);
      if (error) throw error;
      return data || [];
    },
    enabled: showForm,
  });

  const saldoDisponivel = (ledgerData || [])
    .filter((e: any) => {
      if (e.bookmaker_account_id) return false;
      if (e.tipo === "PAGAMENTO_TITULAR" && (e.metadata as any)?.fonte === "BANCO") return false;
      return true;
    })
    .reduce((acc: number, e: any) => {
      const v = Number(e.valor);
      return e.direcao === "CREDIT" ? acc + v : acc - v;
    }, 0);

  const bancos = bancosData?.bancos || [];
  const selectedBanco = bancos.find((b: any) => b.id === bancoId);
  const maxValor = fonte === "CENTRAL"
    ? saldoDisponivel
    : selectedBanco ? Number(selectedBanco.saldo) : 0;
  const numValor = parseFloat(valor) || 0;

  const payMutation = useMutation({
    mutationFn: async () => {
      if (numValor <= 0) throw new Error("Valor inválido");
      if (numValor > maxValor) throw new Error(`Saldo insuficiente. Máximo: ${formatCurrency(maxValor)}`);

      return callEdge("pay-titular", {
        token: supplierToken,
        titular_id: titular.id,
        valor: numValor,
        fonte,
        banco_id: fonte === "BANCO" ? bancoId : null,
        descricao: descricao.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success(`Pagamento de ${formatCurrency(numValor)} registrado para ${titular.nome}`);
      queryClient.invalidateQueries({ queryKey: ["titular-pagamentos", titular.id] });
      queryClient.invalidateQueries({ queryKey: ["titular-history", titular.id] });
      queryClient.invalidateQueries({ queryKey: ["supplier-ledger-summary-v2"] });
      queryClient.invalidateQueries({ queryKey: ["titular-bancos", titular.id] });
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  function resetForm() {
    setShowForm(false);
    setValor("");
    setDescricao("");
    setFonte("CENTRAL");
    setBancoId("");
  }

  const pagamentos = payments?.pagamentos || [];

  if (showForm) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Registrar Pagamento
        </p>

        {/* Fonte do Pagamento */}
        <div>
          <Label>Origem dos fundos <span className="text-destructive">*</span></Label>
          <Select value={fonte} onValueChange={(v: "CENTRAL" | "BANCO") => { setFonte(v); setBancoId(""); }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CENTRAL">
                <div className="flex items-center gap-2">
                  <Wallet className="h-3.5 w-3.5" />
                  Saldo Disponível ({formatCurrency(saldoDisponivel)})
                </div>
              </SelectItem>
              <SelectItem value="BANCO">
                <div className="flex items-center gap-2">
                  <Landmark className="h-3.5 w-3.5" />
                  Banco do Titular
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Seleção de Banco */}
        {fonte === "BANCO" && (
          <div>
            <Label>Banco <span className="text-destructive">*</span></Label>
            <Select value={bancoId} onValueChange={setBancoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o banco" />
              </SelectTrigger>
              <SelectContent>
                {bancos.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.banco_nome} — {formatCurrency(Number(b.saldo) || 0)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Valor */}
        <div>
          <Label>Valor <span className="text-destructive">*</span></Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
          />
          {numValor > 0 && maxValor > 0 && (
            <p className={`text-[11px] mt-1 ${numValor > maxValor ? "text-destructive" : "text-muted-foreground"}`}>
              Disponível: {formatCurrency(maxValor)}
              {numValor > maxValor && " — Saldo insuficiente!"}
            </p>
          )}
        </div>

        {/* Descrição */}
        <div>
          <Label>Descrição (opcional)</Label>
          <Input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Pagamento mensal, comissão..."
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={resetForm} disabled={payMutation.isPending}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => payMutation.mutate()}
            disabled={
              numValor <= 0 ||
              numValor > maxValor ||
              (fonte === "BANCO" && !bancoId) ||
              payMutation.isPending
            }
          >
            {payMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Confirmar Pagamento
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Registrar Pagamento
      </Button>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : pagamentos.length === 0 ? (
        <div className="text-center py-8">
          <DollarSign className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum pagamento registrado</p>
        </div>
      ) : (
        <div className="space-y-1">
          {pagamentos.map((pg: any) => (
            <div
              key={pg.id}
              className="flex items-center gap-3 py-2.5 px-2 rounded-md hover:bg-muted/30 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  Pagamento ao Titular
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {pg.fonte === "CENTRAL" ? "Via Saldo Disponível" : `Via ${pg.banco_nome || "Banco"}`}
                  {pg.descricao ? ` • ${pg.descricao}` : ""}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-emerald-600">
                  {formatCurrency(Math.abs(pg.valor))}
                </p>
                <p className="text-[10px] text-muted-foreground">{formatDateBR(pg.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
