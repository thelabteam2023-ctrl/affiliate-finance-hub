import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  TrendingDown,
  TrendingUp,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { registrarAjusteViaLedger } from "@/lib/ledgerService";
import { getCurrencySymbol, SupportedCurrency } from "@/types/currency";

interface AjusteSaldoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vinculo: {
    id: string;
    nome: string;
    parceiro_nome: string | null;
    saldo_atual: number;
    moeda: string;
  } | null;
  projetoId: string;
  projetoNome?: string;
  workspaceId: string | null;
  onAjustado: () => void;
}

export function AjusteSaldoDialog({
  open,
  onOpenChange,
  vinculo,
  projetoId,
  projetoNome,
  workspaceId,
  onAjustado,
}: AjusteSaldoDialogProps) {
  const [saldoReal, setSaldoReal] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);

  const saldoSistema = vinculo?.saldo_atual || 0;
  const saldoRealNum = parseFloat(saldoReal.replace(",", ".")) || 0;
  const diferenca = saldoRealNum - saldoSistema;
  const temDiferenca = saldoReal !== "" && Math.abs(diferenca) > 0.01;

  const moedaNativa = (vinculo?.moeda || "BRL") as SupportedCurrency;
  const simboloMoeda = getCurrencySymbol(moedaNativa);

  const formatCurrency = (value: number, moeda: string = "BRL") => {
    const symbol = getCurrencySymbol(moeda);
    const formatted = moeda === "BRL"
      ? value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${symbol} ${formatted}`;
  };

  const handleAjustar = async () => {
    if (!vinculo || !workspaceId) return;

    if (saldoReal === "") {
      toast.error("Informe o saldo real da bookmaker");
      return;
    }

    if (!temDiferenca) {
      toast.info("Os saldos já conferem, nenhum ajuste necessário");
      return;
    }

    if (!observacoes.trim()) {
      toast.error("Informe o motivo da diferença nas observações");
      return;
    }

    try {
      setSaving(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const result = await registrarAjusteViaLedger({
        bookmakerId: vinculo.id,
        delta: diferenca,
        moeda: vinculo.moeda,
        workspaceId: workspaceId,
        userId: user.id,
        descricao: `Ajuste de saldo manual. Projeto: ${projetoNome || projetoId}`,
        motivo: observacoes.trim(),
        projetoIdSnapshot: projetoId,
      });

      if (!result.success) {
        throw new Error(result.error || "Erro ao registrar ajuste no ledger");
      }

      toast.success(
        `Saldo ajustado: ${diferenca > 0 ? "+" : ""}${formatCurrency(diferenca, vinculo.moeda)}`,
        { duration: 4000 }
      );

      setSaldoReal("");
      setObservacoes("");
      onOpenChange(false);
      onAjustado();
    } catch (error: any) {
      console.error("Erro no ajuste:", error);
      toast.error("Erro ao ajustar saldo: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!vinculo) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) {
        setSaldoReal("");
        setObservacoes("");
      }
      onOpenChange(o);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            Ajuste de Saldo
          </DialogTitle>
          <DialogDescription>
            Reconcilie o saldo do sistema com o saldo real da casa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bookmaker Info */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div>
              <p className="font-semibold">{vinculo.nome}</p>
              {vinculo.parceiro_nome && (
                <p className="text-sm text-muted-foreground">{vinculo.parceiro_nome}</p>
              )}
            </div>
            <Badge variant="outline" className="text-sm font-mono">
              {vinculo.moeda}
            </Badge>
          </div>

          {/* Saldos */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Sistema</Label>
              <p className="text-xl font-bold mt-1">
                {formatCurrency(saldoSistema, vinculo.moeda)}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Saldo Real</Label>
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium text-muted-foreground">{simboloMoeda}</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={saldoReal}
                  onChange={(e) => setSaldoReal(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
          </div>

          {/* Diferença */}
          {temDiferenca && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
              diferenca > 0
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                : "bg-destructive/10 text-destructive border border-destructive/30"
            }`}>
              {diferenca > 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              Diferença: {formatCurrency(diferenca, vinculo.moeda)}
            </div>
          )}

          {/* Observações */}
          <div className="space-y-2">
            <Label className={temDiferenca ? "text-destructive" : ""}>
              Observações {temDiferenca && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              placeholder={temDiferenca ? "Motivo da diferença (obrigatório)" : "Observações opcionais..."}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
              className={temDiferenca && !observacoes.trim() ? "border-destructive" : ""}
            />
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 mt-0.5 text-emerald-500 flex-shrink-0" />
            <p>O ajuste será registrado no ledger financeiro com rastreabilidade completa.</p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAjustar}
              disabled={saving || !temDiferenca || (temDiferenca && !observacoes.trim())}
              className="flex-1"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Ajustar Saldo
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
