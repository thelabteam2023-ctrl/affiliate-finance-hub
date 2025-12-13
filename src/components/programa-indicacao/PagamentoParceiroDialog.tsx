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
import { Loader2, User, Calendar, Banknote } from "lucide-react";
import { format } from "date-fns";
import { OrigemPagamentoSelect, OrigemPagamentoData } from "./OrigemPagamentoSelect";

interface PagamentoParceiroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parceria: {
    id: string;
    parceiroNome: string;
    valorParceiro: number;
  } | null;
  onSuccess: () => void;
}

export function PagamentoParceiroDialog({
  open,
  onOpenChange,
  parceria,
  onSuccess,
}: PagamentoParceiroDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dataPagamento, setDataPagamento] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [valor, setValor] = useState<string>("");
  const [descricao, setDescricao] = useState<string>("");
  
  // Origem do pagamento
  const [origemData, setOrigemData] = useState<OrigemPagamentoData>({
    origemTipo: "CAIXA_OPERACIONAL",
    tipoMoeda: "FIAT",
    moeda: "BRL",
    saldoDisponivel: 0,
  });

  useEffect(() => {
    if (parceria) {
      setValor(parceria.valorParceiro.toString());
    }
  }, [parceria]);

  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open]);

  const valorNumerico = parseFloat(valor) || 0;

  // 🔒 VALIDAÇÃO CENTRAL DE SALDO - Usa o valor calculado pelo OrigemPagamentoSelect
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

    // 🔒 VALIDAÇÃO CENTRAL: Bloquear se saldo insuficiente (dupla verificação)
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

      // PASSO 1: Debitar do Caixa Operacional via cash_ledger
      if (origemData.origemTipo === "CAIXA_OPERACIONAL") {
        const { error: ledgerError } = await supabase
          .from("cash_ledger")
          .insert({
            user_id: user.id,
            tipo_transacao: "PAGTO_PARCEIRO",
            tipo_moeda: origemData.tipoMoeda,
            moeda: origemData.moeda,
            valor: valorNumerico,
            coin: origemData.coin || null,
            qtd_coin: origemData.tipoMoeda === "CRYPTO" && origemData.cotacao 
              ? valorNumerico / origemData.cotacao 
              : null,
            cotacao: origemData.cotacao || null,
            origem_tipo: "CAIXA_OPERACIONAL",
            destino_tipo: "PAGTO_PARCEIRO",
            data_transacao: dataPagamento,
            descricao: `Pagamento de captação - ${parceria.parceiroNome}`,
            status: "CONFIRMADO",
          });
        
        if (ledgerError) throw ledgerError;
      }

      // PASSO 2: Registrar em movimentacoes_indicacao (histórico do módulo)
      const { error: movError } = await supabase
        .from("movimentacoes_indicacao")
        .insert({
          user_id: user.id,
          parceria_id: parceria.id,
          tipo: "PAGTO_PARCEIRO",
          valor: valorNumerico,
          moeda: origemData.moeda,
          data_movimentacao: dataPagamento,
          descricao: descricao || `Pagamento ao parceiro ${parceria.parceiroNome}`,
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
        description: `Pagamento de ${formatCurrency(valorNumerico)} ao parceiro registrado com sucesso.`,
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
    setValor(parceria?.valorParceiro.toString() || "");
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
            <User className="h-5 w-5 text-primary" />
            Pagamento ao Parceiro
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Partner Info */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Parceiro</p>
            <p className="font-semibold">{parceria?.parceiroNome || "N/A"}</p>
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
            <Label htmlFor="valor" className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Valor do Pagamento ({origemData.moeda})
            </Label>
            <Input
              id="valor"
              type="number"
              step="0.01"
              min="0"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
            />
            {parceria && parceria.valorParceiro > 0 && (
              <p className="text-xs text-muted-foreground">
                Valor acordado: {formatCurrency(parceria.valorParceiro)}
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
            />
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label htmlFor="descricao">Observações (opcional)</Label>
            <Textarea
              id="descricao"
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
