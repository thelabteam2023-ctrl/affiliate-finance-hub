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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, Star, Calendar, Banknote, User } from "lucide-react";
import { format } from "date-fns";
import { OrigemPagamentoSelect, OrigemPagamentoData } from "./OrigemPagamentoSelect";

interface PagamentoCaptacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ParceiroOption {
  id: string;
  nome: string;
}

export function PagamentoCaptacaoDialog({
  open,
  onOpenChange,
  onSuccess,
}: PagamentoCaptacaoDialogProps) {
  const { toast } = useToast();
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [parceiros, setParceiros] = useState<ParceiroOption[]>([]);
  const [loadingParceiros, setLoadingParceiros] = useState(false);

  const [tipoTransacao, setTipoTransacao] = useState<string>("RENOVACAO_PARCERIA");
  const [parceiroId, setParceiroId] = useState<string>("");
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
    if (open && workspaceId) {
      fetchParceiros();
      resetForm();
    }
  }, [open, workspaceId]);

  const fetchParceiros = async () => {
    if (!workspaceId) return;
    setLoadingParceiros(true);
    try {
      const { data, error } = await supabase
        .from("parceiros")
        .select("id, nome")
        .eq("workspace_id", workspaceId)
        .order("nome");
      if (error) throw error;
      setParceiros(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar parceiros:", error);
    } finally {
      setLoadingParceiros(false);
    }
  };

  const valorNumerico = parseFloat(valor) || 0;
  const isSaldoInsuficiente = Boolean(origemData.saldoInsuficiente) || (valorNumerico > 0 && origemData.saldoDisponivel < valorNumerico);

  const parceiroSelecionado = parceiros.find(p => p.id === parceiroId);

  const handleSubmit = async () => {
    if (!parceiroId || !dataPagamento) return;

    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      toast({
        title: "Valor inválido",
        description: "Informe um valor válido para o pagamento.",
        variant: "destructive",
      });
      return;
    }

    if (isSaldoInsuficiente) {
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
      if (!workspaceId) throw new Error("Workspace não definido");

      const isCrypto = origemData.tipoMoeda === "CRYPTO";
      const cotacaoUSD = origemData.cotacao || 5.40;
      const coinPriceUSD = origemData.coinPriceUSD || 1;
      const valorUSD = isCrypto ? valorNumerico / cotacaoUSD : null;
      const qtdCoin = isCrypto && valorUSD ? valorUSD / coinPriceUSD : null;

      const tipoLabel = tipoTransacao === "RENOVACAO_PARCERIA" ? "Renovação de parceria" : "Bonificação estratégica";
      const parceiroNome = parceiroSelecionado?.nome || "N/A";

      // PASSO 1: Registrar no cash_ledger com destino_parceiro_id
      const { error: ledgerError } = await supabase
        .from("cash_ledger")
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          tipo_transacao: tipoTransacao,
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
          destino_tipo: "PARCEIRO",
          destino_parceiro_id: parceiroId,
          data_transacao: dataPagamento,
          descricao: descricao || `${tipoLabel} - ${parceiroNome}`,
          status: "CONFIRMADO",
        });

      if (ledgerError) throw ledgerError;

      // PASSO 2: Registrar em movimentacoes_indicacao (histórico do módulo captação)
      const { error: movError } = await supabase
        .from("movimentacoes_indicacao")
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          parceiro_id: parceiroId,
          tipo: tipoTransacao,
          valor: valorNumerico,
          moeda: origemData.moeda,
          data_movimentacao: dataPagamento,
          descricao: descricao || `${tipoLabel} - ${parceiroNome}`,
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
        description: `${tipoLabel} de R$ ${valorNumerico.toFixed(2)} para ${parceiroNome} registrada com sucesso.`,
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
    setTipoTransacao("RENOVACAO_PARCERIA");
    setParceiroId("");
    setDataPagamento(format(new Date(), "yyyy-MM-dd"));
    setValor("");
    setDescricao("");
    setOrigemData({
      origemTipo: "CAIXA_OPERACIONAL",
      tipoMoeda: "FIAT",
      moeda: "BRL",
      saldoDisponivel: 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tipoTransacao === "RENOVACAO_PARCERIA" ? (
              <RefreshCw className="h-5 w-5 text-primary" />
            ) : (
              <Star className="h-5 w-5 text-primary" />
            )}
            {tipoTransacao === "RENOVACAO_PARCERIA" ? "Renovação de Parceria" : "Bonificação Estratégica"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Tipo de lançamento */}
          <div className="space-y-2">
            <Label>Tipo de Lançamento</Label>
            <Select value={tipoTransacao} onValueChange={setTipoTransacao}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RENOVACAO_PARCERIA">
                  <span className="flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Renovação de Parceria
                  </span>
                </SelectItem>
                <SelectItem value="BONIFICACAO_ESTRATEGICA">
                  <span className="flex items-center gap-2">
                    <Star className="h-3.5 w-3.5" />
                    Bonificação Estratégica
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Parceiro */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Parceiro (CPF)
            </Label>
            {loadingParceiros ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando parceiros...
              </div>
            ) : (
              <Select value={parceiroId} onValueChange={setParceiroId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o parceiro" />
                </SelectTrigger>
                <SelectContent>
                  {parceiros.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
            <Label htmlFor="valor-captacao" className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Valor ({origemData.moeda})
            </Label>
            <Input
              id="valor-captacao"
              type="number"
              step="0.01"
              min="0"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
            />
          </div>

          {/* Data */}
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
            <Label htmlFor="descricao-captacao">Observações (opcional)</Label>
            <Textarea
              id="descricao-captacao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Renovação mensal, bonificação por desempenho..."
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
            disabled={loading || !parceiroId || isSaldoInsuficiente || valorNumerico <= 0}
            title={isSaldoInsuficiente ? "Saldo insuficiente" : undefined}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
