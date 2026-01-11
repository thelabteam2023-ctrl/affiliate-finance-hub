import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Loader2,
  TrendingDown,
  TrendingUp,
  Scale,
  ShieldCheck,
} from "lucide-react";

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
  workspaceId: string | null;
  onConciliado: () => void;
}

export function ConciliacaoVinculoDialog({
  open,
  onOpenChange,
  vinculo,
  projetoId,
  workspaceId,
  onConciliado,
}: ConciliacaoVinculoDialogProps) {
  const [saldoReal, setSaldoReal] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);

  const saldoSistema = vinculo?.saldo_atual || 0;
  const saldoRealNum = parseFloat(saldoReal.replace(",", ".")) || 0;
  const diferenca = saldoRealNum - saldoSistema;
  const temDiferenca = saldoReal !== "" && Math.abs(diferenca) > 0.01;

  const formatCurrency = (value: number, moeda: string = "BRL") => {
    if (moeda === "USD" || moeda === "USDT") {
      return `$ ${value.toFixed(2)}`;
    }
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleConciliar = async () => {
    if (!vinculo || !workspaceId) return;

    if (saldoReal === "") {
      toast.error("Informe o saldo real da bookmaker");
      return;
    }

    try {
      setSaving(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // 1. Se houver diferença, registrar ajuste de auditoria
      if (temDiferenca) {
        const { error: auditError } = await supabase
          .from("bookmaker_balance_audit")
          .insert({
            bookmaker_id: vinculo.id,
            workspace_id: workspaceId,
            user_id: user.id,
            saldo_anterior: saldoSistema,
            saldo_novo: saldoRealNum,
            origem: "CONCILIACAO_VINCULO",
            referencia_id: projetoId,
            referencia_tipo: "projeto",
            observacoes: observacoes || `Conciliação na liberação do vínculo. Projeto ID: ${projetoId}`,
          });

        if (auditError) throw auditError;

        // 2. Atualizar o saldo da bookmaker para o valor real
        const isUSD = vinculo.moeda === "USD" || vinculo.moeda === "USDT";
        const updatePayload = isUSD 
          ? { saldo_usd: saldoRealNum }
          : { saldo_atual: saldoRealNum };

        const { error: updateError } = await supabase
          .from("bookmakers")
          .update(updatePayload)
          .eq("id", vinculo.id);

        if (updateError) throw updateError;

        toast.success(
          `Saldo conciliado: ajuste de ${formatCurrency(diferenca, vinculo.moeda)} aplicado`,
          { duration: 4000 }
        );
      }

      // 3. Registrar data de desvinculação no histórico
      await supabase
        .from("projeto_bookmaker_historico")
        .update({
          data_desvinculacao: new Date().toISOString(),
          status_final: vinculo.bookmaker_status,
        })
        .eq("projeto_id", projetoId)
        .eq("bookmaker_id", vinculo.id);

      // 4. Liberar o vínculo (com novo saldo já ajustado)
      const saldoFinalReal = temDiferenca ? saldoRealNum : saldoSistema;
      
      // Verificar se a casa está limitada
      const isLimitada = vinculo.bookmaker_status.toUpperCase() === "LIMITADA";
      
      if (isLimitada) {
        // Casa limitada: OBRIGATÓRIO ir para saque (independente do saldo)
        const { error } = await supabase
          .from("bookmakers")
          .update({
            projeto_id: null,
            status: "AGUARDANDO_SAQUE",
          })
          .eq("id", vinculo.id);

        if (error) throw error;

        toast.success(
          `Casa limitada liberada. Saque obrigatório de ${formatCurrency(saldoFinalReal, vinculo.moeda)}.`,
          { duration: 5000 }
        );
      } else if (saldoFinalReal > 0) {
        // Casa ativa com saldo: aguardar decisão do responsável
        const { error } = await supabase
          .from("bookmakers")
          .update({
            projeto_id: null,
            status: "AGUARDANDO_DECISAO",
          })
          .eq("id", vinculo.id);

        if (error) throw error;

        toast.success(
          `Vínculo liberado. Aguardando decisão da tesouraria sobre destino da casa.`,
          { duration: 5000 }
        );
      } else {
        // Casa ativa sem saldo: disponibilizar diretamente
        const { error } = await supabase
          .from("bookmakers")
          .update({ 
            projeto_id: null,
            status: "ativo" 
          })
          .eq("id", vinculo.id);

        if (error) throw error;

        toast.success("Vínculo conciliado e liberado com sucesso");
      }

      // Limpar estado e fechar
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            Conciliação Financeira
          </DialogTitle>
          <DialogDescription>
            Antes de liberar o vínculo, confirme o saldo real na bookmaker para garantir consistência financeira.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Info do vínculo */}
          <div className="p-3 rounded-lg bg-muted/50 border">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{vinculo.nome}</p>
                <p className="text-sm text-muted-foreground">{vinculo.parceiro_nome || "Sem parceiro"}</p>
              </div>
              <Badge variant="outline" className="text-xs">
                {vinculo.moeda}
              </Badge>
            </div>
          </div>

          {/* Comparativo de saldos */}
          <div className="grid gap-4">
            <div className="p-3 rounded-lg border bg-card">
              <Label className="text-xs text-muted-foreground">Saldo no Sistema</Label>
              <p className="text-xl font-bold mt-1">
                {formatCurrency(saldoSistema, vinculo.moeda)}
              </p>
            </div>

            <div className="flex items-center justify-center">
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saldo-real" className="flex items-center gap-2">
                Saldo Real na Bookmaker
                <span className="text-xs text-muted-foreground">(verificado agora)</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {vinculo.moeda === "USD" || vinculo.moeda === "USDT" ? "$" : "R$"}
                </span>
                <Input
                  id="saldo-real"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={saldoReal}
                  onChange={(e) => setSaldoReal(e.target.value)}
                  className="pl-10 text-lg font-medium"
                  autoFocus
                />
              </div>
            </div>
          </div>

          {/* Indicador de diferença */}
          {saldoReal !== "" && (
            <div
              className={`p-4 rounded-lg border ${
                !temDiferenca
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : diferenca > 0
                  ? "bg-blue-500/10 border-blue-500/30"
                  : "bg-amber-500/10 border-amber-500/30"
              }`}
            >
              {!temDiferenca ? (
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Saldos conferem</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {diferenca > 0 ? (
                      <>
                        <TrendingUp className="h-5 w-5 text-blue-400" />
                        <span className="font-medium text-blue-400">
                          Saldo real maior: +{formatCurrency(diferenca, vinculo.moeda)}
                        </span>
                      </>
                    ) : (
                      <>
                        <TrendingDown className="h-5 w-5 text-amber-400" />
                        <span className="font-medium text-amber-400">
                          Saldo real menor: {formatCurrency(diferenca, vinculo.moeda)}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    O sistema aplicará este ajuste ao saldo da bookmaker antes de liberar o vínculo.
                  </p>
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Observações (opcional, obrigatório se houver diferença) */}
          <div className="space-y-2">
            <Label htmlFor="observacoes" className="flex items-center gap-1">
              Observações
              {temDiferenca && <span className="text-xs text-amber-400">(recomendado)</span>}
            </Label>
            <Textarea
              id="observacoes"
              placeholder={temDiferenca 
                ? "Descreva o motivo da diferença (ex: taxa não contabilizada, bônus expirado...)"
                : "Observações opcionais sobre a liberação..."
              }
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Aviso de segurança */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-primary">Garantia de Consistência</p>
              <p className="text-muted-foreground">
                Esta conciliação garante que o saldo no sistema reflita o valor real antes de qualquer saque ou transferência.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConciliar} disabled={saving || saldoReal === ""}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Conciliar e Liberar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
