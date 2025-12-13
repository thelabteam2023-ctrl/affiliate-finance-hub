import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrigemPagamentoSelect, OrigemPagamentoData } from "@/components/programa-indicacao/OrigemPagamentoSelect";

interface TransacaoDialogProps {
  open: boolean;
  onClose: () => void;
  bookmaker: {
    id: string;
    nome: string;
    saldo_atual: number;
    moeda: string;
  };
  defaultTipo?: string;
}

export default function TransacaoDialog({ open, onClose, bookmaker, defaultTipo = "deposito" }: TransacaoDialogProps) {
  const [loading, setLoading] = useState(false);
  const [tipo, setTipo] = useState(defaultTipo);
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [origemData, setOrigemData] = useState<OrigemPagamentoData>({
    origemTipo: "CAIXA_OPERACIONAL",
    tipoMoeda: "FIAT",
    moeda: "BRL",
    saldoDisponivel: 0,
    saldoInsuficiente: false,
  });

  const valorNum = parseFloat(valor) || 0;
  const isDebitoOrigem = tipo === "deposito"; // Depósito debita da origem e credita no bookmaker
  const isSaldoInsuficiente = isDebitoOrigem && valorNum > 0 && (origemData.saldoInsuficiente || origemData.saldoDisponivel < valorNum);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTipo(defaultTipo);
      setValor("");
      setDescricao("");
      setOrigemData({
        origemTipo: "CAIXA_OPERACIONAL",
        tipoMoeda: "FIAT",
        moeda: "BRL",
        saldoDisponivel: 0,
        saldoInsuficiente: false,
      });
    }
  }, [open, defaultTipo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (valorNum <= 0) {
      toast.error("Valor deve ser maior que zero");
      return;
    }

    // Validar saldo para depósitos
    if (isDebitoOrigem && isSaldoInsuficiente) {
      toast.error("Saldo insuficiente na origem selecionada");
      return;
    }

    // Validar saldo do bookmaker para retiradas
    if (tipo === "retirada" && valorNum > bookmaker.saldo_atual) {
      toast.error("Saldo insuficiente no bookmaker para esta operação");
      return;
    }

    setLoading(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      const userId = session.session.user.id;

      // Criar registro no cash_ledger (tabela principal)
      const ledgerPayload: any = {
        user_id: userId,
        valor: valorNum,
        moeda: origemData.tipoMoeda === "CRYPTO" ? "USD" : "BRL",
        tipo_moeda: origemData.tipoMoeda,
        data_transacao: new Date().toISOString(),
        descricao: descricao || `${getTipoLabel(tipo)} - ${bookmaker.nome}`,
        status: "CONFIRMADO",
      };

      if (tipo === "deposito") {
        // DEPÓSITO: debita da origem, credita no bookmaker
        ledgerPayload.tipo_transacao = "DEPOSITO";
        ledgerPayload.destino_tipo = "BOOKMAKER";
        ledgerPayload.destino_bookmaker_id = bookmaker.id;

        // Configurar origem
        if (origemData.origemTipo === "CAIXA_OPERACIONAL") {
          ledgerPayload.origem_tipo = "CAIXA_OPERACIONAL";
          if (origemData.tipoMoeda === "CRYPTO") {
            ledgerPayload.coin = origemData.coin;
            ledgerPayload.cotacao = origemData.cotacao;
          }
        } else if (origemData.origemTipo === "PARCEIRO_CONTA") {
          ledgerPayload.origem_tipo = "PARCEIRO_CONTA";
          ledgerPayload.origem_parceiro_id = origemData.origemParceiroId;
          ledgerPayload.origem_conta_bancaria_id = origemData.origemContaBancariaId;
        } else if (origemData.origemTipo === "PARCEIRO_WALLET") {
          ledgerPayload.origem_tipo = "PARCEIRO_WALLET";
          ledgerPayload.origem_parceiro_id = origemData.origemParceiroId;
          ledgerPayload.origem_wallet_id = origemData.origemWalletId;
          ledgerPayload.coin = origemData.coin;
          ledgerPayload.cotacao = origemData.cotacao;
        }
      } else if (tipo === "retirada") {
        // RETIRADA/SAQUE: debita do bookmaker, credita na origem
        ledgerPayload.tipo_transacao = "SAQUE";
        ledgerPayload.origem_tipo = "BOOKMAKER";
        ledgerPayload.origem_bookmaker_id = bookmaker.id;

        // Configurar destino
        if (origemData.origemTipo === "CAIXA_OPERACIONAL") {
          ledgerPayload.destino_tipo = "CAIXA_OPERACIONAL";
        } else if (origemData.origemTipo === "PARCEIRO_CONTA") {
          ledgerPayload.destino_tipo = "PARCEIRO_CONTA";
          ledgerPayload.destino_parceiro_id = origemData.origemParceiroId;
          ledgerPayload.destino_conta_bancaria_id = origemData.origemContaBancariaId;
        } else if (origemData.origemTipo === "PARCEIRO_WALLET") {
          ledgerPayload.destino_tipo = "PARCEIRO_WALLET";
          ledgerPayload.destino_parceiro_id = origemData.origemParceiroId;
          ledgerPayload.destino_wallet_id = origemData.origemWalletId;
          ledgerPayload.coin = origemData.coin;
          ledgerPayload.cotacao = origemData.cotacao;
        }
      } else if (tipo === "ajuste") {
        // AJUSTE: apenas atualiza o saldo do bookmaker (pode ser positivo ou negativo)
        ledgerPayload.tipo_transacao = "AJUSTE_BOOKMAKER";
        ledgerPayload.origem_tipo = "BOOKMAKER";
        ledgerPayload.origem_bookmaker_id = bookmaker.id;
      }

      const { error: ledgerError } = await supabase
        .from("cash_ledger")
        .insert(ledgerPayload);

      if (ledgerError) throw ledgerError;

      toast.success(`${getTipoLabel(tipo)} registrad${tipo === "retirada" ? "a" : "o"} com sucesso`);
      
      // Reset form and close
      setValor("");
      setDescricao("");
      onClose();
    } catch (error: any) {
      toast.error("Erro ao registrar transação: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getTipoLabel = (tipo: string): string => {
    const labels: Record<string, string> = {
      deposito: "Depósito",
      retirada: "Saque",
      ajuste: "Ajuste",
    };
    return labels[tipo] || tipo;
  };

  const formatCurrency = (value: number, currency: string) => {
    const currencySymbols: Record<string, string> = {
      BRL: "R$",
      USD: "$",
      EUR: "€",
      USDT: "₮",
      BTC: "₿",
      ETH: "Ξ",
    };
    return `${currencySymbols[currency] || ""} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Transação - {bookmaker.nome}</DialogTitle>
          <DialogDescription>
            Saldo atual: {formatCurrency(Number(bookmaker.saldo_atual), bookmaker.moeda)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de Transação *</Label>
            <Select value={tipo} onValueChange={setTipo} disabled={loading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deposito">Depósito</SelectItem>
                <SelectItem value="retirada">Saque</SelectItem>
                <SelectItem value="ajuste">Ajuste Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Valor ({bookmaker.moeda}) *</Label>
            <Input
              type="number"
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0.00"
              required
              disabled={loading}
            />
          </div>

          {/* Origem/Destino para Depósito e Saque */}
          {(tipo === "deposito" || tipo === "retirada") && (
            <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
              <Label className="text-sm font-medium">
                {tipo === "deposito" ? "Origem do Depósito" : "Destino do Saque"}
              </Label>
              <OrigemPagamentoSelect
                value={origemData}
                onChange={setOrigemData}
                valorPagamento={valorNum}
              />
              
              {isDebitoOrigem && isSaldoInsuficiente && (
                <div className="flex items-center gap-2 text-destructive text-sm mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Saldo insuficiente na origem selecionada</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes sobre esta transação..."
              rows={2}
              disabled={loading}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={loading}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading || (isDebitoOrigem && isSaldoInsuficiente)} 
              className="flex-1"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
