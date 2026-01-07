import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { updateBookmakerBalance } from "@/lib/bookmakerBalanceHelper";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Building2,
  Landmark,
  ArrowRight,
  User,
  Clock,
} from "lucide-react";

interface SaquePendente {
  id: string;
  valor: number;
  moeda: string;
  data_transacao: string;
  descricao: string | null;
  origem_bookmaker_id: string | null;
  destino_parceiro_id: string | null;
  destino_conta_bancaria_id: string | null;
  bookmaker_nome?: string;
  parceiro_nome?: string;
  banco_nome?: string;
}

interface ConfirmarSaqueDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  saque: SaquePendente | null;
}

export function ConfirmarSaqueDialog({
  open,
  onClose,
  onSuccess,
  saque,
}: ConfirmarSaqueDialogProps) {
  const [loading, setLoading] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const [showRecusaConfirm, setShowRecusaConfirm] = useState(false);

  const formatCurrency = (value: number, currency: string = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency,
    }).format(value);
  };

  const handleConfirmar = async () => {
    if (!saque) return;

    try {
      setLoading(true);

      // PROTEÇÃO: Verificar se o saque ainda está PENDENTE antes de confirmar
      // Isso evita decrementos duplos em caso de cliques duplos ou race conditions
      const { data: currentSaque, error: fetchError } = await supabase
        .from("cash_ledger")
        .select("status")
        .eq("id", saque.id)
        .single();

      if (fetchError) throw fetchError;

      if (currentSaque?.status !== "PENDENTE") {
        toast.error("Este saque já foi processado anteriormente.");
        onClose();
        return;
      }

      // Atualizar status para CONFIRMADO
      const updateData: any = {
        status: "CONFIRMADO",
      };

      if (observacoes.trim()) {
        updateData.descricao = saque.descricao 
          ? `${saque.descricao}\n\n[Confirmação]: ${observacoes}`
          : `[Confirmação]: ${observacoes}`;
      }

      const { error } = await supabase
        .from("cash_ledger")
        .update(updateData)
        .eq("id", saque.id)
        .eq("status", "PENDENTE"); // Condição extra para evitar race condition

      if (error) throw error;

      // ATUALIZAR SALDO DO BOOKMAKER DE ORIGEM (decrementar o valor sacado) com auditoria
      if (saque.origem_bookmaker_id) {
        // Usar helper centralizado com auditoria
        await updateBookmakerBalance(saque.origem_bookmaker_id, -saque.valor, undefined, {
          origem: 'SAQUE',
          referenciaId: saque.id,
          referenciaTipo: 'cash_ledger',
          observacoes: observacoes.trim() || undefined,
        });
        
        // Verificar se precisa atualizar status baseado no saldo restante
        const { data: bookmaker } = await supabase
          .from("bookmakers")
          .select("saldo_atual, saldo_usd, moeda")
          .eq("id", saque.origem_bookmaker_id)
          .single();

        if (bookmaker) {
          const moedaBk = bookmaker.moeda || "BRL";
          const saldoAtual = moedaBk === "USD" || moedaBk === "USDT" 
            ? (bookmaker.saldo_usd || 0) 
            : (bookmaker.saldo_atual || 0);
          
          // Atualizar status baseado no saldo restante
          const novoStatus = saldoAtual > 0.5 ? "AGUARDANDO_SAQUE" : "ativo";
          
          await supabase
            .from("bookmakers")
            .update({ 
              status: novoStatus,
              updated_at: new Date().toISOString()
            })
            .eq("id", saque.origem_bookmaker_id);
        }
      }

      toast.success("Saque confirmado com sucesso! O saldo foi atualizado.");
      setObservacoes("");
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error("Erro ao confirmar saque: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecusar = async () => {
    if (!saque) return;

    try {
      setLoading(true);

      // 1. Atualizar cash_ledger para RECUSADO
      const updateData: any = {
        status: "RECUSADO",
      };

      if (observacoes.trim()) {
        updateData.descricao = saque.descricao 
          ? `${saque.descricao}\n\n[Recusa]: ${observacoes}`
          : `[Recusa]: ${observacoes}`;
      }

      const { error: ledgerError } = await supabase
        .from("cash_ledger")
        .update(updateData)
        .eq("id", saque.id);

      if (ledgerError) throw ledgerError;

      // 2. Se tinha bookmaker origem, revincular ao projeto original
      if (saque.origem_bookmaker_id) {
        // Buscar o projeto original e status anterior do histórico
        const { data: historico } = await supabase
          .from("projeto_bookmaker_historico")
          .select("projeto_id, status_final")
          .eq("bookmaker_id", saque.origem_bookmaker_id)
          .order("data_vinculacao", { ascending: false })
          .limit(1)
          .single();

        if (historico?.projeto_id) {
          // Usar o status anterior do histórico (preservar LIMITADA se estava limitada)
          const statusAnterior = historico.status_final === "LIMITADA" ? "LIMITADA" : "ativo";
          
          // Revincular bookmaker ao projeto com status anterior
          const { error: bookmakerError } = await supabase
            .from("bookmakers")
            .update({ 
              projeto_id: historico.projeto_id,
              status: statusAnterior 
            })
            .eq("id", saque.origem_bookmaker_id);

          if (bookmakerError) throw bookmakerError;

          // Atualizar histórico removendo data_desvinculacao
          await supabase
            .from("projeto_bookmaker_historico")
            .update({ 
              data_desvinculacao: null,
              status_final: statusAnterior
            })
            .eq("bookmaker_id", saque.origem_bookmaker_id)
            .eq("projeto_id", historico.projeto_id);
        }
      }

      toast.success("Saque marcado como recusado. A conta foi revinculada ao projeto.");
      setObservacoes("");
      setShowRecusaConfirm(false);
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error("Erro ao recusar saque: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!saque) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              Confirmação de Saque
            </DialogTitle>
            <DialogDescription>
              Verifique se o valor foi recebido no banco/wallet antes de confirmar
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Resumo do Saque */}
            <Card className="bg-muted/30 border-border/50">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    <span>Origem</span>
                  </div>
                  <span className="font-medium">{saque.bookmaker_nome || "Bookmaker"}</span>
                </div>

                <div className="flex justify-center">
                  <ArrowRight className="h-4 w-4 text-primary" />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Landmark className="h-4 w-4" />
                    <span>Destino</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium">{saque.banco_nome || "Conta Bancária"}</span>
                    {saque.parceiro_nome && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                        <User className="h-3 w-3" />
                        {saque.parceiro_nome}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Valor</span>
                    <span className="text-xl font-bold text-emerald-400">
                      {formatCurrency(saque.valor, saque.moeda)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">Solicitado em</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(saque.data_transacao).toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Observações */}
            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações (opcional)</Label>
              <Textarea
                id="observacoes"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Adicione observações sobre a confirmação ou recusa..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col gap-3 sm:flex-row sm:justify-between pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="destructive"
                onClick={() => setShowRecusaConfirm(true)}
                disabled={loading}
                className="flex-1 sm:flex-none"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Recusado
              </Button>
              <Button
                onClick={handleConfirmar}
                disabled={loading}
                className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Confirmar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog de Confirmação de Recusa */}
      <AlertDialog open={showRecusaConfirm} onOpenChange={setShowRecusaConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Recusa do Saque</AlertDialogTitle>
            <AlertDialogDescription>
              Ao marcar como recusado, a conta bookmaker será revinculada ao projeto original
              para que você possa tentar novamente ou registrar uma perda operacional.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRecusar}
              disabled={loading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirmar Recusa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
