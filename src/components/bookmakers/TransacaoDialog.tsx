import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
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
import { Loader2, AlertTriangle, Info, ArrowRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrigemPagamentoSelect, OrigemPagamentoData } from "@/components/programa-indicacao/OrigemPagamentoSelect";
import { 
  CURRENCY_SYMBOLS, 
  needsConversion, 
  getCurrencySymbol,
  isCryptoCurrency,
  isStablecoin 
} from "@/types/currency";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TransacaoDialogProps {
  open: boolean;
  onClose: () => void;
  bookmaker: {
    id: string;
    nome: string;
    saldo_atual: number;
    saldo_usd?: number;
    moeda: string;
  };
  defaultTipo?: string;
}

export default function TransacaoDialog({ open, onClose, bookmaker, defaultTipo = "deposito" }: TransacaoDialogProps) {
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [tipo, setTipo] = useState(defaultTipo);
  const [valor, setValor] = useState("");
  const [valorCreditado, setValorCreditado] = useState("");
  const [descricao, setDescricao] = useState("");
  const [origemData, setOrigemData] = useState<OrigemPagamentoData>({
    origemTipo: "CAIXA_OPERACIONAL",
    tipoMoeda: "FIAT",
    moeda: "BRL",
    saldoDisponivel: 0,
    saldoInsuficiente: false,
  });

  const valorNum = parseFloat(valor) || 0;
  const valorCreditadoNum = parseFloat(valorCreditado) || 0;
  const isDebitoOrigem = tipo === "deposito";
  const isSaldoInsuficiente = isDebitoOrigem && valorNum > 0 && (origemData.saldoInsuficiente || origemData.saldoDisponivel < valorNum);

  // Detectar moeda de origem baseado na seleção
  const moedaOrigem = origemData.tipoMoeda === "CRYPTO" 
    ? (origemData.coin || "USDT") 
    : (origemData.moeda || "BRL");
  
  // Moeda operacional do bookmaker
  const moedaDestino = bookmaker.moeda || "BRL";
  
  // Verifica se precisa de conversão
  const precisaConversao = needsConversion(moedaOrigem, moedaDestino);
  const isCryptoOrigem = isCryptoCurrency(moedaOrigem);
  const isStablecoinOrigem = isStablecoin(moedaOrigem);

  // Saldo correto baseado na moeda do bookmaker
  const saldoBookmaker = moedaDestino === "USD" 
    ? (bookmaker.saldo_usd ?? bookmaker.saldo_atual) 
    : bookmaker.saldo_atual;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTipo(defaultTipo);
      setValor("");
      setValorCreditado("");
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

  // Calcular cotação implícita
  const cotacaoImplicita = valorNum > 0 && valorCreditadoNum > 0 
    ? valorNum / valorCreditadoNum 
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (valorNum <= 0) {
      toast.error("Valor deve ser maior que zero");
      return;
    }

    // Validar valor creditado quando há conversão (para depósito)
    if (tipo === "deposito" && precisaConversao && valorCreditadoNum <= 0) {
      toast.error(`Informe o valor creditado em ${moedaDestino}`);
      return;
    }

    // Validar saldo para depósitos
    if (isDebitoOrigem && isSaldoInsuficiente) {
      toast.error("Saldo insuficiente na origem selecionada");
      return;
    }

    // Validar saldo do bookmaker para retiradas
    if (tipo === "retirada" && valorNum > saldoBookmaker) {
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

      // Validar workspace ativo
      if (!workspaceId) {
        toast.error("Workspace não definido. Recarregue a página.");
        return;
      }

      // Definir status_valor baseado no tipo de conversão
      let statusValor = "CONFIRMADO";
      if (isCryptoOrigem && !precisaConversao) {
        // Crypto para casa USD sem informar valor creditado = estimativa
        statusValor = "ESTIMADO";
      }

      // Criar registro no cash_ledger
      const ledgerPayload: any = {
        user_id: userId,
        workspace_id: workspaceId,
        valor: valorNum,
        moeda: origemData.tipoMoeda === "CRYPTO" ? "USD" : origemData.moeda || "BRL",
        tipo_moeda: origemData.tipoMoeda,
        data_transacao: new Date().toISOString(),
        descricao: descricao || `${getTipoLabel(tipo)} - ${bookmaker.nome}`,
        status: "CONFIRMADO",
        // Novos campos de conversão
        moeda_origem: moedaOrigem,
        valor_origem: valorNum,
        moeda_destino: moedaDestino,
        valor_destino: precisaConversao ? valorCreditadoNum : valorNum,
        cotacao_implicita: cotacaoImplicita,
        status_valor: statusValor,
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
            ledgerPayload.valor_usd = valorNum;
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
          ledgerPayload.valor_usd = valorNum;
        }
      } else if (tipo === "retirada") {
        // RETIRADA/SAQUE: debita do bookmaker, credita na origem
        ledgerPayload.tipo_transacao = "SAQUE";
        ledgerPayload.origem_tipo = "BOOKMAKER";
        ledgerPayload.origem_bookmaker_id = bookmaker.id;
        // Inverter origem/destino para saque
        ledgerPayload.moeda_origem = moedaDestino;
        ledgerPayload.valor_origem = valorNum;

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
        // AJUSTE: apenas atualiza o saldo do bookmaker
        ledgerPayload.tipo_transacao = "AJUSTE_BOOKMAKER";
        ledgerPayload.origem_tipo = "BOOKMAKER";
        ledgerPayload.origem_bookmaker_id = bookmaker.id;
        ledgerPayload.moeda_origem = moedaDestino;
        ledgerPayload.moeda_destino = moedaDestino;
        ledgerPayload.valor_destino = valorNum;
      }

      const { error: ledgerError } = await supabase
        .from("cash_ledger")
        .insert(ledgerPayload);

      if (ledgerError) throw ledgerError;

      toast.success(`${getTipoLabel(tipo)} registrad${tipo === "retirada" ? "a" : "o"} com sucesso`);
      
      setValor("");
      setValorCreditado("");
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
    const symbol = getCurrencySymbol(currency);
    return `${symbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Transação - {bookmaker.nome}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span>Saldo atual:</span>
            <span className="font-semibold">{formatCurrency(saldoBookmaker, moedaDestino)}</span>
            {moedaDestino !== "BRL" && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Esta casa opera em {moedaDestino}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
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
            <Label>
              {tipo === "deposito" 
                ? `Valor enviado (${getCurrencySymbol(moedaOrigem)})` 
                : `Valor (${getCurrencySymbol(moedaDestino)})`
              } *
            </Label>
            <Input
              type="number"
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0.00"
              required
              disabled={loading}
            />
            {isCryptoOrigem && tipo === "deposito" && (
              <p className="text-xs text-muted-foreground">
                {isStablecoinOrigem 
                  ? "Valor estimado em USD (cotação ≈ 1:1)" 
                  : "Valor estimado em USD baseado na cotação Binance"
                }
              </p>
            )}
          </div>

          {/* Campo de valor creditado quando há conversão */}
          {tipo === "deposito" && precisaConversao && (
            <div className="space-y-2">
              <Alert className="border-amber-500/50 bg-amber-500/5">
                <Info className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-sm">
                  <span className="font-medium">Conversão necessária:</span> Esta casa opera em {moedaDestino}.
                  Informe o valor efetivamente creditado pela casa.
                </AlertDescription>
              </Alert>
              
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <div className="flex-1">
                  <span className="text-sm text-muted-foreground">Enviando</span>
                  <div className="font-medium">
                    {getCurrencySymbol(moedaOrigem)} {valorNum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <span className="text-sm text-muted-foreground">Creditado</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={valorCreditado}
                    onChange={(e) => setValorCreditado(e.target.value)}
                    placeholder={`0.00 ${moedaDestino}`}
                    required
                    disabled={loading}
                    className="mt-1"
                  />
                </div>
              </div>

              {cotacaoImplicita && (
                <p className="text-xs text-muted-foreground text-center">
                  Cotação implícita: 1 {moedaDestino} = {cotacaoImplicita.toFixed(4)} {moedaOrigem}
                </p>
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