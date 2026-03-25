import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: "DEPOSITO" | "SAQUE";
  supplierWorkspaceId: string;
  accounts: any[];
  saldoDisponivel: number;
  valorSugerido?: number;
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
  onSuccess,
}: Props) {
  const [valor, setValor] = useState(valorSugerido?.toString() || "");
  const [contaId, setContaId] = useState("");
  const [descricao, setDescricao] = useState("");

  const isDeposito = tipo === "DEPOSITO";

  const mutation = useMutation({
    mutationFn: async () => {
      const numValor = parseFloat(valor);
      if (!numValor || numValor <= 0) throw new Error("Valor inválido");
      if (!contaId) throw new Error("Selecione uma conta");

      if (isDeposito && numValor > saldoDisponivel) {
        throw new Error(`Saldo insuficiente. Disponível: ${formatCurrency(saldoDisponivel)}`);
      }

      if (!isDeposito) {
        const conta = accounts.find(a => a.id === contaId);
        if (conta && numValor > Number(conta.saldo_atual)) {
          throw new Error(`Saldo da conta insuficiente: ${formatCurrency(Number(conta.saldo_atual))}`);
        }
      }

      const { data, error } = await supabase.rpc("supplier_ledger_insert", {
        p_supplier_workspace_id: supplierWorkspaceId,
        p_bookmaker_account_id: contaId,
        p_tipo: tipo,
        p_direcao: isDeposito ? "CREDIT" : "DEBIT",
        p_valor: numValor,
        p_descricao: descricao || `${isDeposito ? "Depósito" : "Saque"} em conta`,
        p_created_by: "SUPPLIER",
        p_idempotency_key: `${tipo}_${contaId}_${Date.now()}`,
      });

      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || "Erro ao processar");

      return result;
    },
    onSuccess: () => {
      toast.success(isDeposito ? "Depósito registrado" : "Saque registrado");
      setValor("");
      setContaId("");
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
          <DialogTitle>{isDeposito ? "Depositar em Conta" : "Sacar de Conta"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isDeposito && (
            <div className="text-sm text-muted-foreground">
              Saldo disponível: <span className="font-semibold text-foreground">{formatCurrency(saldoDisponivel)}</span>
            </div>
          )}

          <div>
            <Label>Conta *</Label>
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

          <div>
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Observações (opcional)"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !valor || !contaId}
          >
            {mutation.isPending ? "Processando..." : isDeposito ? "Depositar" : "Sacar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
