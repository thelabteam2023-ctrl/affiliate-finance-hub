import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, DollarSign, User, FolderKanban, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { OrigemPagamentoSelect, OrigemPagamentoData } from "@/components/programa-indicacao/OrigemPagamentoSelect";

interface ParticipacaoPendente {
  id: string;
  projeto_id: string;
  ciclo_id: string;
  investidor_id: string;
  percentual_aplicado: number;
  base_calculo: string;
  lucro_base: number;
  valor_participacao: number;
  status: string;
  data_apuracao: string;
  observacoes: string | null;
  investidor_nome?: string;
  projeto_nome?: string;
  ciclo_numero?: number;
}

interface PagamentoParticipacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participacao: ParticipacaoPendente | null;
  onSuccess: () => void;
}

export function PagamentoParticipacaoDialog({
  open,
  onOpenChange,
  participacao,
  onSuccess,
}: PagamentoParticipacaoDialogProps) {
  const [loading, setLoading] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  
  // Origem do pagamento
  const [origemData, setOrigemData] = useState<OrigemPagamentoData>({
    origemTipo: "CAIXA_OPERACIONAL",
    tipoMoeda: "FIAT",
    moeda: "BRL",
    saldoDisponivel: 0,
  });

  useEffect(() => {
    if (open && participacao) {
      setObservacoes(participacao.observacoes || "");
      setOrigemData({
        origemTipo: "CAIXA_OPERACIONAL",
        tipoMoeda: "FIAT",
        moeda: "BRL",
        saldoDisponivel: 0,
      });
    }
  }, [open, participacao]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handlePagar = async () => {
    if (!participacao) return;

    // Validar saldo
    if (origemData.saldoInsuficiente) {
      toast.error("Saldo insuficiente na origem selecionada");
      return;
    }

    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      // 1. Registrar no cash_ledger
      const { data: ledgerEntry, error: ledgerError } = await supabase
        .from("cash_ledger")
        .insert({
          user_id: session.session.user.id,
          tipo_transacao: "DISTRIBUICAO_LUCRO",
          valor: participacao.valor_participacao,
          moeda: "BRL",
          tipo_moeda: origemData.tipoMoeda,
          data_transacao: new Date().toISOString(),
          status: "CONFIRMADO",
          descricao: `Participação ${participacao.investidor_nome} - ${participacao.projeto_nome} Ciclo ${participacao.ciclo_numero}`,
          investidor_id: participacao.investidor_id,
          origem_tipo: origemData.origemTipo,
          origem_caixa_operacional: origemData.origemTipo === "CAIXA_OPERACIONAL",
          origem_parceiro_id: origemData.origemParceiroId || null,
          origem_conta_bancaria_id: origemData.origemContaBancariaId || null,
          origem_wallet_id: origemData.origemWalletId || null,
          coin: origemData.tipoMoeda === "CRYPTO" ? origemData.coin : null,
          qtd_coin: origemData.tipoMoeda === "CRYPTO" && origemData.coin ? 
            (participacao.valor_participacao / (origemData.cotacao || 1) / (origemData.coinPriceUSD || 1)) : null,
          cotacao: origemData.tipoMoeda === "CRYPTO" ? origemData.cotacao : null,
        })
        .select("id")
        .single();

      if (ledgerError) throw ledgerError;

      // 2. Atualizar participacao_ciclos para PAGO
      const { error: updateError } = await supabase
        .from("participacao_ciclos")
        .update({
          status: "PAGO",
          data_pagamento: new Date().toISOString(),
          pagamento_ledger_id: ledgerEntry.id,
          observacoes: observacoes || null,
        })
        .eq("id", participacao.id);

      if (updateError) throw updateError;

      toast.success(`Pagamento de ${formatCurrency(participacao.valor_participacao)} realizado com sucesso`);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao processar pagamento: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!participacao) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            Pagar Participação
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo */}
          <div className="p-4 rounded-lg bg-muted/50 space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{participacao.investidor_nome}</span>
            </div>
            <div className="flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{participacao.projeto_nome} - Ciclo {participacao.ciclo_numero}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Apurado em {format(new Date(participacao.data_apuracao), "dd/MM/yyyy", { locale: ptBR })}
              </span>
            </div>
          </div>

          {/* Valores */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs text-muted-foreground">Base de Cálculo</p>
              <p className="font-medium">{formatCurrency(participacao.lucro_base)}</p>
              <Badge variant="outline" className="mt-1 text-xs">
                {participacao.base_calculo === "LUCRO_BRUTO" ? "Lucro Bruto" : "Lucro Líquido"}
              </Badge>
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-xs text-muted-foreground">Valor a Pagar</p>
              <p className="text-lg font-bold text-emerald-400">
                {formatCurrency(participacao.valor_participacao)}
              </p>
              <Badge variant="outline" className="mt-1 text-xs">
                {participacao.percentual_aplicado}%
              </Badge>
            </div>
          </div>

          {/* Origem do Pagamento */}
          <div className="space-y-2">
            <Label>Origem do Pagamento *</Label>
            <OrigemPagamentoSelect
              value={origemData}
              onChange={setOrigemData}
              valorPagamento={participacao.valor_participacao}
            />
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Observações sobre o pagamento..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handlePagar} disabled={loading || origemData.saldoInsuficiente}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <DollarSign className="h-4 w-4 mr-2" />
                Confirmar Pagamento
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
