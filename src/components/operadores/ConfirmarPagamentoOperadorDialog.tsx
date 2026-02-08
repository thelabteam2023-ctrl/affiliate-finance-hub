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
import { Loader2, DollarSign, User, FolderKanban, Calendar, FileText } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { OrigemPagamentoSelect, OrigemPagamentoData } from "@/components/programa-indicacao/OrigemPagamentoSelect";
import { useWorkspace } from "@/hooks/useWorkspace";

interface PagamentoPendente {
  id: string;
  operador_id: string;
  operador_nome?: string;
  projeto_id: string | null;
  projeto_nome?: string;
  tipo_pagamento: string;
  valor: number;
  moeda: string;
  data_pagamento: string;
  descricao: string | null;
}

interface ConfirmarPagamentoOperadorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pagamento: PagamentoPendente | null;
  onSuccess: () => void;
}

const tipoLabels: Record<string, string> = {
  SALARIO: "Salário",
  COMISSAO: "Comissão",
  BONUS: "Bônus",
  ADIANTAMENTO: "Adiantamento",
  REEMBOLSO: "Reembolso",
  OUTROS: "Outros",
};

export function ConfirmarPagamentoOperadorDialog({
  open,
  onOpenChange,
  pagamento,
  onSuccess,
}: ConfirmarPagamentoOperadorDialogProps) {
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [observacoes, setObservacoes] = useState("");

  const [origemData, setOrigemData] = useState<OrigemPagamentoData>({
    origemTipo: "CAIXA_OPERACIONAL",
    tipoMoeda: "FIAT",
    moeda: "BRL",
    saldoDisponivel: 0,
  });

  useEffect(() => {
    if (open && pagamento) {
      setObservacoes("");
      setOrigemData({
        origemTipo: "CAIXA_OPERACIONAL",
        tipoMoeda: "FIAT",
        moeda: "BRL",
        saldoDisponivel: 0,
      });
    }
  }, [open, pagamento]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const handleConfirmar = async () => {
    if (!pagamento) return;

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

      if (!workspaceId) {
        toast.error("Workspace não disponível");
        return;
      }

      const userId = session.session.user.id;
      const isCrypto = origemData.tipoMoeda === "CRYPTO";
      const cotacaoUSD = origemData.cotacao || 5.40;
      const coinPriceUSD = origemData.coinPriceUSD || 1;
      const valorUSD = isCrypto ? pagamento.valor / cotacaoUSD : null;
      const qtdCoin = isCrypto && valorUSD ? valorUSD / coinPriceUSD : null;

      // 1. Criar registro no cash_ledger
      const ledgerPayload: Record<string, any> = {
        user_id: userId,
        workspace_id: workspaceId,
        tipo_transacao: "PAGTO_OPERADOR",
        valor: pagamento.valor,
        moeda: "BRL",
        tipo_moeda: origemData.tipoMoeda,
        data_transacao: pagamento.data_pagamento,
        descricao: `${pagamento.operador_nome || "Operador"} - ${pagamento.tipo_pagamento}${pagamento.descricao ? `: ${pagamento.descricao}` : ""}`,
        status: "CONFIRMADO",
        destino_tipo: "OPERADOR",
        operador_id: pagamento.operador_id,
      };

      if (isCrypto) {
        ledgerPayload.valor_usd = valorUSD;
        ledgerPayload.qtd_coin = qtdCoin;
        ledgerPayload.coin = origemData.coin;
        ledgerPayload.cotacao = cotacaoUSD;
      }

      if (origemData.origemTipo === "CAIXA_OPERACIONAL") {
        ledgerPayload.origem_tipo = "CAIXA_OPERACIONAL";
      } else if (origemData.origemTipo === "PARCEIRO_CONTA") {
        ledgerPayload.origem_tipo = "PARCEIRO_CONTA";
        ledgerPayload.origem_parceiro_id = origemData.origemParceiroId;
        ledgerPayload.origem_conta_bancaria_id = origemData.origemContaBancariaId;
      } else if (origemData.origemTipo === "PARCEIRO_WALLET") {
        ledgerPayload.origem_tipo = "PARCEIRO_WALLET";
        ledgerPayload.origem_parceiro_id = origemData.origemParceiroId;
        ledgerPayload.origem_wallet_id = origemData.origemWalletId;
        ledgerPayload.coin = origemData.coin;
        ledgerPayload.cotacao = cotacaoUSD;
        ledgerPayload.valor_usd = valorUSD;
        ledgerPayload.qtd_coin = qtdCoin;
      }

      const { data: ledgerData, error: ledgerError } = await supabase
        .from("cash_ledger")
        .insert(ledgerPayload as any)
        .select("id")
        .single();

      if (ledgerError) throw ledgerError;

      // 2. Atualizar pagamento para CONFIRMADO
      const { error: updateError } = await supabase
        .from("pagamentos_operador")
        .update({
          status: "CONFIRMADO",
          cash_ledger_id: ledgerData.id,
          descricao: observacoes
            ? `${pagamento.descricao || ""}${pagamento.descricao ? " | " : ""}${observacoes}`
            : pagamento.descricao,
        })
        .eq("id", pagamento.id);

      if (updateError) throw updateError;

      toast.success(`Pagamento de ${formatCurrency(pagamento.valor)} confirmado com sucesso`);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao confirmar pagamento: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!pagamento) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            Pagar Operador
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo */}
          <div className="p-4 rounded-lg bg-muted/50 space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{pagamento.operador_nome || "Operador"}</span>
            </div>
            {pagamento.projeto_nome && (
              <div className="flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{pagamento.projeto_nome}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Data: {format(new Date(pagamento.data_pagamento + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
              </span>
            </div>
            {pagamento.descricao && (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{pagamento.descricao}</span>
              </div>
            )}
          </div>

          {/* Valores */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs text-muted-foreground">Tipo</p>
              <p className="font-medium">{tipoLabels[pagamento.tipo_pagamento] || pagamento.tipo_pagamento}</p>
              <Badge variant="outline" className="mt-1 text-xs">
                {pagamento.moeda}
              </Badge>
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-xs text-muted-foreground">Valor a Pagar</p>
              <p className="text-lg font-bold text-emerald-400">
                {formatCurrency(pagamento.valor)}
              </p>
            </div>
          </div>

          {/* Origem do Pagamento */}
          <div className="space-y-2">
            <Label>Origem do Pagamento *</Label>
            <OrigemPagamentoSelect
              value={origemData}
              onChange={setOrigemData}
              valorPagamento={pagamento.valor}
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
          <Button onClick={handleConfirmar} disabled={loading || origemData.saldoInsuficiente}>
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
