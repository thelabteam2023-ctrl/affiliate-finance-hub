import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: any;
  onSuccess: () => void;
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(val);
}

const TIPO_LABELS: Record<string, string> = {
  DEPOSITO: "Depósito",
  SAQUE: "Saque",
  TRANSFERENCIA_BANCO: "Transferência ao Banco",
  RECOLHIMENTO_BANCO: "Recolhimento do Banco",
  ALOCACAO: "Alocação",
  DEVOLUCAO: "Devolução",
  PAGAMENTO_TITULAR: "Pagamento ao Titular",
};

export function EditLedgerDialog({ open, onOpenChange, entry, onSuccess }: Props) {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const [novoValor, setNovoValor] = useState("");

  const valorAtual = Number(entry?.valor || 0);
  const numNovoValor = parseFloat(novoValor) || 0;
  const delta = numNovoValor - valorAtual;

  // Determine what changes
  const impactDescription = useMemo(() => {
    if (!entry || Math.abs(delta) < 0.01) return null;

    const tipo = entry.tipo;
    const casaNome = entry.supplier_bookmaker_accounts?.bookmakers_catalogo?.nome
      || entry.casa_nome
      || "Casa";
    const bancoNome = (entry.metadata as any)?.banco_nome || "Banco";

    if (tipo === "DEPOSITO") {
      return {
        line1: `${casaNome}: ${formatCurrency(valorAtual)} → ${formatCurrency(numNovoValor)} (${delta > 0 ? "+" : ""}${formatCurrency(delta)})`,
        line2: `${bancoNome}: ${delta > 0 ? "-" : "+"}${formatCurrency(Math.abs(delta))}`,
        icon1: delta > 0 ? "📈" : "📉",
        icon2: delta > 0 ? "📉" : "📈",
      };
    }

    if (tipo === "SAQUE") {
      return {
        line1: `${casaNome}: ${delta > 0 ? "+" : ""}${formatCurrency(-delta)} ${delta > 0 ? "(mais sacado)" : "(menos sacado)"}`,
        line2: `${bancoNome}: ${delta > 0 ? "+" : "-"}${formatCurrency(Math.abs(delta))}`,
        icon1: delta > 0 ? "📉" : "📈",
        icon2: delta > 0 ? "📈" : "📉",
      };
    }

    if (tipo === "TRANSFERENCIA_BANCO") {
      return {
        line1: `Saldo Disponível: ${delta > 0 ? "-" : "+"}${formatCurrency(Math.abs(delta))}`,
        line2: `${bancoNome}: ${delta > 0 ? "+" : "-"}${formatCurrency(Math.abs(delta))}`,
        icon1: delta > 0 ? "📉" : "📈",
        icon2: delta > 0 ? "📈" : "📉",
      };
    }

    if (tipo === "RECOLHIMENTO_BANCO") {
      return {
        line1: `${bancoNome}: ${delta > 0 ? "+" : "-"}${formatCurrency(Math.abs(delta))}`,
        line2: `Saldo Disponível: ${delta > 0 ? "-" : "+"}${formatCurrency(Math.abs(delta))}`,
        icon1: delta > 0 ? "📈" : "📉",
        icon2: delta > 0 ? "📉" : "📈",
      };
    }

    return {
      line1: `Valor: ${formatCurrency(valorAtual)} → ${formatCurrency(numNovoValor)}`,
      line2: `Delta: ${delta > 0 ? "+" : ""}${formatCurrency(delta)}`,
      icon1: "📝",
      icon2: "📊",
    };
  }, [entry, delta, numNovoValor, valorAtual]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (numNovoValor <= 0) throw new Error("O valor deve ser maior que zero");
      if (Math.abs(delta) < 0.01) throw new Error("Nenhuma alteração detectada");

      const { data, error } = await supabase.functions.invoke("supplier-auth", {
        body: {
          action: "edit-ledger-entry",
          token,
          entry_id: entry.id,
          novo_valor: numNovoValor,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Lançamento editado: ${formatCurrency(data.valor_anterior)} → ${formatCurrency(data.valor_novo)}`);
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Reset value when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setNovoValor(valorAtual.toString());
    }
    onOpenChange(isOpen);
  };

  if (!entry) return null;

  const tipoLabel = TIPO_LABELS[entry.tipo] || entry.tipo;
  const isEditable = ["DEPOSITO", "SAQUE", "TRANSFERENCIA_BANCO"].includes(entry.tipo);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Editar Lançamento</DialogTitle>
        </DialogHeader>

        {!isEditable ? (
          <p className="text-sm text-muted-foreground py-4">
            Lançamentos do tipo "{tipoLabel}" não podem ser editados.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Current info */}
            <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1.5">
              <p className="text-muted-foreground">Tipo: <span className="font-medium text-foreground">{tipoLabel}</span></p>
              {(() => {
                const casaNome = entry.supplier_bookmaker_accounts?.bookmakers_catalogo?.nome || entry.casa_nome;
                const titularNome = entry.supplier_bookmaker_accounts?.supplier_titulares?.nome;
                const bancoNome = (entry.metadata as any)?.banco_nome;
                const parts: string[] = [];
                if (titularNome) parts.push(`Titular: ${titularNome}`);
                if (entry.tipo === "DEPOSITO" && bancoNome && casaNome) parts.push(`Fluxo: ${bancoNome} → ${casaNome}`);
                else if (entry.tipo === "SAQUE" && casaNome && bancoNome) parts.push(`Fluxo: ${casaNome} → ${bancoNome}`);
                else if (entry.tipo === "TRANSFERENCIA_BANCO" && bancoNome) parts.push(`Fluxo: Saldo Disponível → ${bancoNome}`);
                return parts.map((p, i) => (
                  <p key={i} className="text-muted-foreground"><span className="font-medium text-foreground">{p}</span></p>
                ));
              })()}
            </div>

            {/* Value edit */}
            <div>
              <Label className="text-xs text-muted-foreground">Valor atual</Label>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 px-3 py-2 rounded-md bg-muted/30 border text-sm font-semibold text-muted-foreground">
                  {formatCurrency(valorAtual)}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={novoValor}
                  onChange={e => setNovoValor(e.target.value)}
                  placeholder="Novo valor"
                  className="flex-1 font-semibold"
                  autoFocus
                />
              </div>
            </div>

            {/* Impact preview */}
            {impactDescription && (
              <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1.5 border border-border">
                <p className="font-medium text-foreground text-sm">Impacto da alteração:</p>
                <p>{impactDescription.icon1} {impactDescription.line1}</p>
                <p>{impactDescription.icon2} {impactDescription.line2}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {isEditable && (
            <Button
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || Math.abs(delta) < 0.01 || numNovoValor <= 0}
            >
              {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Confirmar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
