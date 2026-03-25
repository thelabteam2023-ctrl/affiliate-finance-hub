import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Building2, Landmark } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: "DEPOSITO" | "SAQUE";
  supplierWorkspaceId: string;
  accounts: any[];
  saldoDisponivel: number;
  valorSugerido?: number;
  token: string;
  onSuccess: () => void;
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(val);
}

export function SupplierTransacaoDialog({
  open,
  onOpenChange,
  tipo,
  supplierWorkspaceId,
  accounts,
  saldoDisponivel,
  valorSugerido,
  token,
  onSuccess,
}: Props) {
  const [valor, setValor] = useState(valorSugerido?.toString() || "");
  const [contaId, setContaId] = useState("");
  const [bancoId, setBancoId] = useState("");
  const [descricao, setDescricao] = useState("");

  const isDeposito = tipo === "DEPOSITO";

  // Fetch all workspace banks
  const { data: bancos, refetch: refetchBancos } = useQuery({
    queryKey: ["supplier-workspace-bancos", supplierWorkspaceId],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("supplier-auth", {
        body: { action: "list-workspace-bancos", token },
      });
      return (data?.bancos || []) as Array<{
        id: string;
        banco_nome: string;
        pix_key: string | null;
        saldo: number;
        titular_id: string;
        supplier_titulares: { nome: string } | null;
      }>;
    },
    enabled: open && !!token,
  });

  // Reset on open
  useEffect(() => {
    if (open) {
      setValor(valorSugerido?.toString() || "");
      setContaId("");
      setBancoId("");
      setDescricao("");
      refetchBancos();
    }
  }, [open]);

  const selectedBanco = bancos?.find(b => b.id === bancoId);

  const mutation = useMutation({
    mutationFn: async () => {
      const numValor = parseFloat(valor);
      if (!numValor || numValor <= 0) throw new Error("Valor inválido");
      if (!contaId) throw new Error("Selecione uma conta");
      if (!bancoId) throw new Error("Selecione um banco");

      if (isDeposito) {
        // Depositing to casa: money comes FROM banco
        if (selectedBanco && numValor > Number(selectedBanco.saldo)) {
          throw new Error(`Saldo insuficiente no banco "${selectedBanco.banco_nome}". Disponível: ${formatCurrency(Number(selectedBanco.saldo))}`);
        }
      } else {
        // Withdrawing from casa: money goes TO banco
        const conta = accounts.find(a => a.id === contaId);
        if (conta && numValor > Number(conta.saldo_atual)) {
          throw new Error(`Saldo da conta insuficiente: ${formatCurrency(Number(conta.saldo_atual))}`);
        }
      }

      // 1. Record ledger entry (saldo disponível ↔ casa)
      const { data, error } = await supabase.rpc("supplier_ledger_insert", {
        p_supplier_workspace_id: supplierWorkspaceId,
        p_bookmaker_account_id: contaId,
        p_tipo: tipo,
        p_direcao: isDeposito ? "CREDIT" : "DEBIT",
        p_valor: numValor,
        p_descricao: descricao || `${isDeposito ? "Depósito" : "Saque"} via ${selectedBanco?.banco_nome || "banco"}`,
        p_created_by: "SUPPLIER",
        p_idempotency_key: `${tipo}_${contaId}_${bancoId}_${Date.now()}`,
      });

      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || "Erro ao processar");

      // 2. Update bank saldo
      const { data: bancoResult } = await supabase.functions.invoke("supplier-auth", {
        body: {
          action: "update-banco-saldo",
          token,
          banco_id: bancoId,
          valor: numValor,
          operacao: isDeposito ? "DEBIT" : "CREDIT", // Deposit: money leaves bank; Withdraw: money enters bank
        },
      });

      if (bancoResult?.error) {
        console.error("Erro ao atualizar saldo do banco:", bancoResult.error);
        // Non-fatal: ledger already recorded, but log the issue
        toast.warning("Transação registrada, mas houve erro ao atualizar saldo do banco");
      }

      return result;
    },
    onSuccess: () => {
      toast.success(isDeposito ? "Depósito registrado" : "Saque registrado");
      setValor("");
      setContaId("");
      setBancoId("");
      setDescricao("");
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDeposito ? (
              <>
                <Landmark className="h-5 w-5 text-primary" />
                Depositar em Conta
              </>
            ) : (
              <>
                <Building2 className="h-5 w-5 text-primary" />
                Sacar de Conta
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bank selector */}
          <div>
            <Label>Banco do Titular *</Label>
            <Select value={bancoId} onValueChange={setBancoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o banco" />
              </SelectTrigger>
              <SelectContent>
                {(bancos || []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    <div className="flex items-center gap-2">
                      <span>{b.banco_nome}</span>
                      <span className="text-muted-foreground text-xs">
                        ({b.supplier_titulares?.nome || "—"})
                      </span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">
                        {formatCurrency(Number(b.saldo))}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBanco && (
              <p className="text-xs text-muted-foreground mt-1">
                Saldo no banco: <span className="font-semibold text-foreground">{formatCurrency(Number(selectedBanco.saldo))}</span>
                {selectedBanco.pix_key && (
                  <span className="ml-2">• PIX: {selectedBanco.pix_key}</span>
                )}
              </p>
            )}
          </div>

          {/* Account selector */}
          <div>
            <Label>Conta (Casa) *</Label>
            <Select value={contaId} onValueChange={setContaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.bookmakers_catalogo?.nome || "Casa"} - {a.login_username}
                    {!isDeposito && ` (${formatCurrency(Number(a.saldo_atual))})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div>
            <Label>Valor (R$) *</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={valor}
              onChange={e => setValor(e.target.value)}
              placeholder="0,00"
            />
            {valorSugerido && isDeposito && valor !== valorSugerido.toString() && (
              <button
                type="button"
                onClick={() => setValor(valorSugerido.toString())}
                className="text-xs text-primary mt-1 hover:underline"
              >
                Usar valor sugerido: {formatCurrency(valorSugerido)}
              </button>
            )}
          </div>

          {/* Description */}
          <div>
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Observações (opcional)"
              rows={2}
            />
          </div>

          {/* Flow summary */}
          {bancoId && contaId && valor && (
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground text-sm">Resumo da operação:</p>
              {isDeposito ? (
                <>
                  <p>📉 <span className="font-medium">{selectedBanco?.banco_nome}</span> será debitado em {formatCurrency(parseFloat(valor) || 0)}</p>
                  <p>📈 <span className="font-medium">{accounts.find(a => a.id === contaId)?.bookmakers_catalogo?.nome || "Casa"}</span> será creditada</p>
                </>
              ) : (
                <>
                  <p>📉 <span className="font-medium">{accounts.find(a => a.id === contaId)?.bookmakers_catalogo?.nome || "Casa"}</span> será debitada em {formatCurrency(parseFloat(valor) || 0)}</p>
                  <p>📈 <span className="font-medium">{selectedBanco?.banco_nome}</span> será creditado</p>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !valor || !contaId || !bancoId}
          >
            {mutation.isPending ? "Processando..." : isDeposito ? "Depositar" : "Sacar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
