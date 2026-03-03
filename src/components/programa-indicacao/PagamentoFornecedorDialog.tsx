import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/hooks/useWorkspace";
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
import { Loader2, Truck, Calendar, Banknote, User } from "lucide-react";
import { format } from "date-fns";
import { OrigemPagamentoSelect, OrigemPagamentoData } from "./OrigemPagamentoSelect";

interface PagamentoFornecedorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parceria: {
    parceriaId: string;
    fornecedorNome: string;
    fornecedorId: string;
    parceiroNome: string;
    valorFornecedor: number;
  } | null;
  onSuccess: () => void;
}

export function PagamentoFornecedorDialog({
  open,
  onOpenChange,
  parceria,
  onSuccess,
}: PagamentoFornecedorDialogProps) {
  const { toast } = useToast();
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [dataPagamento, setDataPagamento] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [valor, setValor] = useState<string>("");
  const [descricao, setDescricao] = useState<string>("");

  const [origemData, setOrigemData] = useState<OrigemPagamentoData>({
    origemTipo: "CAIXA_OPERACIONAL",
    tipoMoeda: "FIAT",
    moeda: "BRL",
    saldoDisponivel: 0,
  });

  useEffect(() => {
    if (parceria) {
      setValor(parceria.valorFornecedor.toString());
    }
  }, [parceria]);

  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open]);

  const valorNumerico = parseFloat(valor) || 0;
  const isSaldoInsuficiente = Boolean(origemData.saldoInsuficiente) || (valorNumerico > 0 && origemData.saldoDisponivel < valorNumerico);

  const handleSubmit = async () => {
    if (!parceria || !dataPagamento) return;

    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      toast({
        title: "Valor inválido",
        description: "Informe um valor válido para o pagamento.",
        variant: "destructive",
      });
      return;
    }

    const saldoRealInsuficiente = Boolean(origemData.saldoInsuficiente) || (valorNumerico > 0 && origemData.saldoDisponivel < valorNumerico);
    if (saldoRealInsuficiente) {
      toast({
        title: "Transação bloqueada",
        description: `Saldo insuficiente. Disponível: R$ ${origemData.saldoDisponivel.toFixed(2)} | Necessário: R$ ${valorNumerico.toFixed(2)}`,
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (!workspaceId) {
        toast({
          title: "Erro",
          description: "Workspace não definido. Recarregue a página.",
          variant: "destructive",
        });
        return;
      }

      const isCrypto = origemData.tipoMoeda === "CRYPTO";
      const cotacaoUSD = origemData.cotacao || 5.40;
      const coinPriceUSD = origemData.coinPriceUSD || 1;
      const valorUSD = isCrypto ? valorNumerico / cotacaoUSD : null;
      const qtdCoin = isCrypto && valorUSD ? valorUSD / coinPriceUSD : null;

      // PASSO 1: Debitar da origem via cash_ledger
      const { error: ledgerError } = await supabase
        .from("cash_ledger")
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          tipo_transacao: "PAGTO_FORNECEDOR",
          tipo_moeda: origemData.tipoMoeda,
          moeda: isCrypto ? "BRL" : origemData.moeda,
          valor: valorNumerico,
          coin: origemData.coin || null,
          qtd_coin: qtdCoin,
          valor_usd: valorUSD,
          cotacao: isCrypto ? cotacaoUSD : null,
          origem_tipo: origemData.origemTipo,
          origem_parceiro_id: origemData.origemParceiroId || null,
          origem_conta_bancaria_id: origemData.origemContaBancariaId || null,
          origem_wallet_id: origemData.origemWalletId || null,
          destino_tipo: "FORNECEDOR",
          data_transacao: dataPagamento,
          descricao: `Pagamento ao fornecedor ${parceria.fornecedorNome} - Parceiro: ${parceria.parceiroNome}`,
          status: "CONFIRMADO",
        });

      if (ledgerError) throw ledgerError;

      // PASSO 2: Registrar em movimentacoes_indicacao
      const { error: movError } = await supabase
        .from("movimentacoes_indicacao")
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          parceria_id: parceria.parceriaId,
          tipo: "PAGTO_FORNECEDOR",
          valor: valorNumerico,
          moeda: origemData.moeda,
          data_movimentacao: dataPagamento,
          descricao: descricao || `Pagamento ao fornecedor ${parceria.fornecedorNome}`,
          status: "CONFIRMADO",
          origem_tipo: origemData.origemTipo,
          origem_caixa_operacional: origemData.origemTipo === "CAIXA_OPERACIONAL",
          origem_conta_bancaria_id: origemData.origemContaBancariaId || null,
          origem_wallet_id: origemData.origemWalletId || null,
          origem_parceiro_id: origemData.origemParceiroId || null,
          tipo_moeda: origemData.tipoMoeda,
          coin: origemData.coin || null,
          cotacao: origemData.cotacao || null,
        });

      if (movError) throw movError;

      toast({
        title: "Pagamento registrado",
        description: `Pagamento de ${formatCurrency(valorNumerico)} ao fornecedor registrado com sucesso.`,
      });

      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Erro ao registrar pagamento",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setDataPagamento(format(new Date(), "yyyy-MM-dd"));
    setValor(parceria?.valorFornecedor.toString() || "");
    setDescricao("");
    setOrigemData({
      origemTipo: "CAIXA_OPERACIONAL",
      tipoMoeda: "FIAT",
      moeda: "BRL",
      saldoDisponivel: 0,
    });
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-orange-400" />
            Pagamento ao Fornecedor
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Fornecedor Info */}
          <div className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-orange-400" />
              <div>
                <p className="text-sm text-muted-foreground">Fornecedor</p>
                <p className="font-semibold">{parceria?.fornecedorNome || "N/A"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Parceiro vinculado</p>
                <p className="text-sm font-medium">{parceria?.parceiroNome || "N/A"}</p>
              </div>
            </div>
          </div>

          {/* Origem do Pagamento */}
          <OrigemPagamentoSelect
            value={origemData}
            onChange={setOrigemData}
            valorPagamento={valorNumerico}
            disabled={loading}
          />

          {/* Valor */}
          <div className="space-y-2">
            <Label htmlFor="valor-fornecedor" className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Valor do Pagamento ({origemData.moeda})
            </Label>
            <Input
              id="valor-fornecedor"
              type="number"
              step="0.01"
              min="0"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
            />
            {parceria && parceria.valorFornecedor > 0 && (
              <p className="text-xs text-muted-foreground">
                Valor contratado: {formatCurrency(parceria.valorFornecedor)}
              </p>
            )}
          </div>

          {/* Data do Pagamento */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Data do Pagamento
            </Label>
            <DatePicker
              value={dataPagamento}
              onChange={setDataPagamento}
              maxDate={new Date()}
            />
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label htmlFor="descricao-fornecedor">Observações (opcional)</Label>
            <Textarea
              id="descricao-fornecedor"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Informações adicionais sobre o pagamento..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !parceria || isSaldoInsuficiente}
            title={isSaldoInsuficiente ? "Saldo insuficiente para realizar este pagamento" : undefined}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
