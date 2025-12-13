import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Gift, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { OrigemPagamentoSelect, OrigemPagamentoData } from "./OrigemPagamentoSelect";

interface PagamentoBonusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicador: {
    id: string;
    nome: string;
    valorBonus: number;
    ciclosPendentes?: number;
    totalBonusPendente?: number;
  } | null;
  parceriaId?: string;
  onSuccess: () => void;
}

export function PagamentoBonusDialog({
  open,
  onOpenChange,
  indicador,
  parceriaId,
  onSuccess,
}: PagamentoBonusDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dataPagamento, setDataPagamento] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [qtdBonusPagar, setQtdBonusPagar] = useState<number>(1);
  const [descricao, setDescricao] = useState("");

  // Origem do pagamento
  const [origemData, setOrigemData] = useState<OrigemPagamentoData>({
    origemTipo: "CAIXA_OPERACIONAL",
    tipoMoeda: "FIAT",
    moeda: "BRL",
    saldoDisponivel: 0,
  });

  const ciclosPendentes = indicador?.ciclosPendentes || 1;
  const valorUnitario = indicador?.valorBonus || 0;
  const valorTotal = valorUnitario * qtdBonusPagar;

  useEffect(() => {
    if (indicador) {
      setQtdBonusPagar(indicador.ciclosPendentes || 1);
    }
  }, [indicador]);

  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!indicador) return;

    // Validar saldo se não for caixa operacional
    if (origemData.origemTipo !== "CAIXA_OPERACIONAL" && origemData.saldoDisponivel < valorTotal) {
      toast({
        title: "Saldo insuficiente",
        description: "O saldo disponível na origem selecionada é insuficiente.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Get parceria_id if not provided
      let finalParceriaId = parceriaId;
      if (!finalParceriaId) {
        const { data: parceria } = await supabase
          .from("parcerias")
          .select("id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        
        if (!parceria) {
          // Create a placeholder parceria for bonus tracking
          const { data: newParceria, error: parceriaError } = await supabase
            .from("parcerias")
            .insert({
              user_id: user.id,
              parceiro_id: (await supabase.from("parceiros").select("id").eq("user_id", user.id).limit(1).single()).data?.id,
              status: "ATIVA",
              duracao_dias: 60,
            })
            .select("id")
            .single();
          
          if (parceriaError) throw parceriaError;
          finalParceriaId = newParceria.id;
        } else {
          finalParceriaId = parceria.id;
        }
      }

      // Create one bonus payment record per bonus being paid
      const insertPromises = [];
      for (let i = 0; i < qtdBonusPagar; i++) {
        insertPromises.push(
          supabase.from("movimentacoes_indicacao").insert({
            user_id: user.id,
            indicador_id: indicador.id,
            parceria_id: finalParceriaId,
            tipo: "BONUS_INDICADOR",
            valor: valorUnitario,
            moeda: origemData.moeda,
            data_movimentacao: dataPagamento,
            descricao: descricao || `Pagamento de bônus para ${indicador.nome}${qtdBonusPagar > 1 ? ` (${i + 1}/${qtdBonusPagar})` : ''}`,
            status: "CONFIRMADO",
            // New origin fields
            origem_tipo: origemData.origemTipo,
            origem_caixa_operacional: origemData.origemTipo === "CAIXA_OPERACIONAL",
            origem_conta_bancaria_id: origemData.origemContaBancariaId || null,
            origem_wallet_id: origemData.origemWalletId || null,
            origem_parceiro_id: origemData.origemParceiroId || null,
            tipo_moeda: origemData.tipoMoeda,
            coin: origemData.coin || null,
            cotacao: origemData.cotacao || null,
          })
        );
      }

      const results = await Promise.all(insertPromises);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) throw errors[0].error;

      toast({
        title: "Bônus registrado",
        description: qtdBonusPagar > 1 
          ? `${qtdBonusPagar} bônus de ${formatCurrency(valorUnitario)} (Total: ${formatCurrency(valorTotal)}) registrados para ${indicador.nome}`
          : `Pagamento de ${formatCurrency(valorTotal)} registrado para ${indicador.nome}`,
      });

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast({
        title: "Erro ao registrar bônus",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setDataPagamento(format(new Date(), "yyyy-MM-dd"));
    setQtdBonusPagar(indicador?.ciclosPendentes || 1);
    setDescricao("");
    setOrigemData({
      origemTipo: "CAIXA_OPERACIONAL",
      tipoMoeda: "FIAT",
      moeda: "BRL",
      saldoDisponivel: 0,
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Registrar Pagamento de Bônus
          </DialogTitle>
        </DialogHeader>

        {indicador && (
          <div className="space-y-4">
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Indicador</p>
              <p className="font-medium">{indicador.nome}</p>
            </div>

            {/* Origem do Pagamento */}
            <OrigemPagamentoSelect
              value={origemData}
              onChange={setOrigemData}
              valorPagamento={valorTotal}
              disabled={loading}
            />

            <div className="grid gap-4">
              {ciclosPendentes > 1 && (
                <div className="space-y-2">
                  <Label>Quantidade de Bônus a Pagar</Label>
                  <Input
                    type="number"
                    value={qtdBonusPagar}
                    onChange={(e) => setQtdBonusPagar(Math.min(Math.max(1, parseInt(e.target.value) || 1), ciclosPendentes))}
                    min={1}
                    max={ciclosPendentes}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ciclos disponíveis: {ciclosPendentes} (máximo que pode ser pago)
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Valor Unitário do Bônus ({origemData.moeda})</Label>
                <Input
                  type="number"
                  value={valorUnitario}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Valor acordado por ciclo de meta
                </p>
              </div>

              {ciclosPendentes > 1 && (
                <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                  <p className="text-sm text-muted-foreground">Total a Pagar</p>
                  <p className="text-xl font-bold text-primary">
                    {qtdBonusPagar}x {formatCurrency(valorUnitario)} = {formatCurrency(valorTotal)}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Data do Pagamento</Label>
                <DatePicker
                  value={dataPagamento}
                  onChange={setDataPagamento}
                />
              </div>

              <div className="space-y-2">
                <Label>Observações (opcional)</Label>
                <Textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Adicione observações sobre o pagamento..."
                  rows={3}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !indicador}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
