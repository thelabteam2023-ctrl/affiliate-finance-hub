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
  Wallet,
  ArrowDownToLine,
} from "lucide-react";
import { registrarAjusteViaLedger } from "@/lib/ledgerService";
import { getCurrencySymbol, SupportedCurrency } from "@/types/currency";

interface ConciliacaoVinculoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vinculo: {
    id: string;
    nome: string;
    parceiro_nome: string | null;
    saldo_atual: number;
    moeda: string;
    bookmaker_status: string;
  } | null;
  projetoId: string;
  projetoNome?: string;
  workspaceId: string | null;
  onConciliado: () => void;
}

export function ConciliacaoVinculoDialog({
  open,
  onOpenChange,
  vinculo,
  projetoId,
  projetoNome,
  workspaceId,
  onConciliado,
}: ConciliacaoVinculoDialogProps) {
  const [saldoReal, setSaldoReal] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingAjuste, setSavingAjuste] = useState(false);

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

  const handleApenasAjustar = async () => {
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
      setSavingAjuste(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const result = await registrarAjusteViaLedger({
        bookmakerId: vinculo.id,
        delta: diferenca,
        moeda: vinculo.moeda,
        workspaceId: workspaceId,
        userId: user.id,
        descricao: `Ajuste de conciliação manual. Projeto: ${projetoNome || projetoId}`,
        motivo: observacoes.trim(),
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
      onConciliado();
    } catch (error: any) {
      console.error("Erro no ajuste:", error);
      toast.error("Erro ao ajustar saldo: " + error.message);
    } finally {
      setSavingAjuste(false);
    }
  };

  const handleConciliarComSaque = async () => {
    await executarConciliacao(true);
  };

  const handleConciliarSemSaque = async () => {
    await executarConciliacao(false);
  };

  const executarConciliacao = async (marcarParaSaque: boolean) => {
    if (!vinculo || !workspaceId) return;

    if (saldoReal === "") {
      toast.error("Informe o saldo real da bookmaker");
      return;
    }

    if (temDiferenca && !observacoes.trim()) {
      toast.error("Informe o motivo da diferença nas observações");
      return;
    }

    try {
      setSaving(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (temDiferenca) {
        const result = await registrarAjusteViaLedger({
          bookmakerId: vinculo.id,
          delta: diferenca,
          moeda: vinculo.moeda,
          workspaceId: workspaceId,
          userId: user.id,
          descricao: `Conciliação na liberação do vínculo. Projeto: ${projetoNome || projetoId}`,
          motivo: observacoes.trim(),
        });

        if (!result.success) {
          throw new Error(result.error || "Erro ao registrar ajuste no ledger");
        }

        toast.success(
          `Saldo conciliado: ajuste de ${formatCurrency(diferenca, vinculo.moeda)} aplicado`,
          { duration: 4000 }
        );
      }

      await supabase
        .from("projeto_bookmaker_historico")
        .update({
          data_desvinculacao: new Date().toISOString(),
          status_final: vinculo.bookmaker_status,
        })
        .eq("projeto_id", projetoId)
        .eq("bookmaker_id", vinculo.id);

      const saldoFinalReal = temDiferenca ? saldoRealNum : saldoSistema;
      const isLimitada = vinculo.bookmaker_status.toUpperCase() === "LIMITADA";
      const deveMarcarParaSaque = isLimitada || marcarParaSaque;
      
      if (deveMarcarParaSaque && saldoFinalReal > 0) {
        const { error } = await supabase.rpc('marcar_para_saque', {
          p_bookmaker_id: vinculo.id
        });
        if (error) throw error;
        
        await supabase
          .from("bookmakers")
          .update({ projeto_id: null })
          .eq("id", vinculo.id);
      } else {
        const { error } = await supabase
          .from("bookmakers")
          .update({
            projeto_id: null,
            status: "ativo",
          })
          .eq("id", vinculo.id);
        if (error) throw error;
      }

      if (isLimitada) {
        toast.success(
          `Casa limitada liberada. Saque obrigatório de ${formatCurrency(saldoFinalReal, vinculo.moeda)}.`,
          { duration: 5000 }
        );
      } else if (deveMarcarParaSaque && saldoFinalReal > 0) {
        toast.success(
          `Vínculo liberado. Saque de ${formatCurrency(saldoFinalReal, vinculo.moeda)} pendente.`,
          { duration: 5000 }
        );
      } else if (saldoFinalReal > 0) {
        toast.success(
          `Vínculo liberado. Casa disponível com ${formatCurrency(saldoFinalReal, vinculo.moeda)}.`,
          { duration: 5000 }
        );
      } else {
        toast.success("Vínculo conciliado e liberado com sucesso");
      }

      setSaldoReal("");
      setObservacoes("");
      onOpenChange(false);
      onConciliado();
    } catch (error: any) {
      console.error("Erro na conciliação:", error);
      toast.error("Erro ao conciliar vínculo: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!vinculo) return null;

  const isLimitada = vinculo.bookmaker_status.toUpperCase() === "LIMITADA";
  const canAdjust = saldoReal !== "" && temDiferenca && observacoes.trim();
  const canRelease = saldoReal !== "" && (!temDiferenca || observacoes.trim());
  const isProcessing = saving || savingAjuste;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-4 pb-3 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-primary" />
            Conciliação Financeira
          </DialogTitle>
          <DialogDescription className="text-xs">
            Confirme o saldo real antes de liberar o vínculo
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {/* Bookmaker Info - Compact */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 border border-border/50">
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{vinculo.nome}</p>
              <p className="text-xs text-muted-foreground truncate">
                {vinculo.parceiro_nome || "Sem parceiro"}
              </p>
            </div>
            <Badge variant="outline" className="text-xs shrink-0 ml-2">
              {vinculo.moeda}
            </Badge>
          </div>

          {/* Balance Comparison - Compact Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2.5 rounded-lg border bg-card">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Sistema
              </Label>
              <p className="text-lg font-bold mt-0.5">
                {formatCurrency(saldoSistema, vinculo.moeda)}
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Saldo Real
              </Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {simboloMoeda}
                </span>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={saldoReal}
                  onChange={(e) => setSaldoReal(e.target.value)}
                  className="pl-8 h-9 text-base font-medium"
                  autoFocus
                />
              </div>
            </div>
          </div>

          {/* Difference Indicator - Compact */}
          {saldoReal !== "" && (
            <div
              className={`p-2.5 rounded-lg border text-sm ${
                !temDiferenca
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : diferenca > 0
                  ? "bg-blue-500/10 border-blue-500/30"
                  : "bg-amber-500/10 border-amber-500/30"
              }`}
            >
              {!temDiferenca ? (
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">Saldos conferem</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {diferenca > 0 ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-blue-400" />
                      <span className="text-blue-400">
                        Diferença: <strong>+{formatCurrency(diferenca, vinculo.moeda)}</strong>
                      </span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="h-4 w-4 text-amber-400" />
                      <span className="text-amber-400">
                        Diferença: <strong>{formatCurrency(diferenca, vinculo.moeda)}</strong>
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Observations - Compact */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              Observações
              {temDiferenca && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              placeholder={temDiferenca 
                ? "Motivo da diferença (obrigatório)"
                : "Observações opcionais..."
              }
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              className={`text-sm resize-none ${temDiferenca && !observacoes.trim() ? "border-destructive/50" : ""}`}
            />
          </div>

          {/* Security Note - Compact */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
            <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              A conciliação garante consistência financeira antes de liberar a bookmaker.
            </p>
          </div>
        </div>

        {/* Footer Actions - Redesigned */}
        <div className="p-4 pt-0 space-y-2">
          {/* Primary Actions Row */}
          <div className="grid grid-cols-2 gap-2">
            {/* Manter Saldo - só aparece se não é limitada e tem saldo */}
            {!isLimitada && saldoRealNum > 0 ? (
              <Button 
                variant="outline"
                onClick={handleConciliarSemSaque} 
                disabled={isProcessing || !canRelease}
                className="h-10"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Wallet className="h-4 w-4 mr-1.5" />
                    Manter Saldo
                  </>
                )}
              </Button>
            ) : (
              <div /> 
            )}
            
            {/* Liberar e Sacar */}
            <Button 
              onClick={handleConciliarComSaque} 
              disabled={isProcessing || !canRelease}
              className="h-10"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ArrowDownToLine className="h-4 w-4 mr-1.5" />
                  {saldoRealNum > 0 ? "Liberar + Saque" : "Liberar"}
                </>
              )}
            </Button>
          </div>

          {/* Secondary Actions Row */}
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              onClick={() => onOpenChange(false)} 
              disabled={isProcessing}
              className="flex-1 h-9"
            >
              Cancelar
            </Button>
            
            {temDiferenca && (
              <Button 
                variant="secondary" 
                onClick={handleApenasAjustar} 
                disabled={isProcessing || !canAdjust}
                className="flex-1 h-9"
              >
                {savingAjuste ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Scale className="h-4 w-4 mr-1.5" />
                    Só Ajustar
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
