import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, AlertCircle, RefreshCw } from "lucide-react";
import { MovimentacoesData, Transacao } from "@/hooks/useParceiroFinanceiroCache";

interface ParceiroMovimentacoesTabProps {
  parceiroId: string;
  showSensitiveData: boolean;
  data: MovimentacoesData | null;
  loading: boolean;
  error: string | null;
  isRevalidating: boolean;
  onRetry?: () => void;
}

export function ParceiroMovimentacoesTab({ 
  parceiroId, 
  showSensitiveData,
  data,
  loading,
  error,
  isRevalidating,
  onRetry,
}: ParceiroMovimentacoesTabProps) {
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const maskCurrency = (value: number) => {
    if (showSensitiveData) return formatCurrency(value);
    return "R$ ••••";
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTipoLabel = (tipo: string, transacao?: Transacao) => {
    if (tipo === "TRANSFERENCIA" && transacao) {
      const isOrigem = transacao.origem_parceiro_id === parceiroId;
      return isOrigem ? "Transferência Enviada" : "Transferência Recebida";
    }
    
    if (transacao?.status === "RECUSADO") {
      const labels: Record<string, string> = {
        DEPOSITO: "Depósito Recusado",
        SAQUE: "Saque Recusado",
        TRANSFERENCIA: "Transferência Recusada",
        APORTE_FINANCEIRO: "Aporte Recusado",
      };
      return labels[tipo] || `${tipo} Recusado`;
    }
    
    const labels: Record<string, string> = {
      DEPOSITO: "Depósito",
      SAQUE: "Saque",
      TRANSFERENCIA: "Transferência",
      APORTE_FINANCEIRO: "Aporte",
    };
    return labels[tipo] || tipo;
  };

  const getTipoBadgeColor = (tipo: string, status?: string) => {
    if (status === "RECUSADO") {
      return "bg-muted text-muted-foreground border-muted";
    }
    
    if (tipo === "DEPOSITO") return "bg-red-500/20 text-red-500 border-red-500/30";
    if (tipo === "SAQUE") return "bg-green-500/20 text-green-500 border-green-500/30";
    if (tipo === "TRANSFERENCIA") return "bg-blue-500/20 text-blue-500 border-blue-500/30";
    if (tipo === "APORTE_FINANCEIRO") return "bg-emerald-500/20 text-emerald-500 border-emerald-500/30";
    return "bg-muted text-muted-foreground border-muted";
  };

  const getOrigemLabel = (transacao: Transacao) => {
    if (transacao.origem_tipo === "CAIXA_OPERACIONAL") return "Caixa Operacional";
    if (transacao.origem_tipo === "INVESTIDOR" && transacao.nome_investidor) return `Investidor: ${transacao.nome_investidor}`;
    if (transacao.origem_bookmaker_id) return `Casa: ${data?.bookmakerNames.get(transacao.origem_bookmaker_id) || "..."}`;
    if (transacao.origem_conta_bancaria_id) {
      const conta = data?.contasBancarias.find(c => c.id === transacao.origem_conta_bancaria_id);
      return conta ? `${conta.banco} - ${conta.titular}` : "Conta Bancária";
    }
    if (transacao.origem_wallet_id) {
      const wallet = data?.walletsCrypto.find(w => w.id === transacao.origem_wallet_id);
      return wallet ? `${wallet.exchange}` : "Wallet Crypto";
    }
    if (transacao.origem_parceiro_id) return data?.parceiroNames.get(transacao.origem_parceiro_id) || "Parceiro";
    return "-";
  };

  const getDestinoLabel = (transacao: Transacao) => {
    if (transacao.destino_tipo === "CAIXA_OPERACIONAL") return "Caixa Operacional";
    if (transacao.destino_bookmaker_id) return `Casa: ${data?.bookmakerNames.get(transacao.destino_bookmaker_id) || "..."}`;
    if (transacao.destino_conta_bancaria_id) {
      const conta = data?.contasBancarias.find(c => c.id === transacao.destino_conta_bancaria_id);
      return conta ? `${conta.banco} - ${conta.titular}` : "Conta Bancária";
    }
    if (transacao.destino_wallet_id) {
      const wallet = data?.walletsCrypto.find(w => w.id === transacao.destino_wallet_id);
      return wallet ? `${wallet.exchange}` : "Wallet Crypto";
    }
    if (transacao.destino_parceiro_id) return data?.parceiroNames.get(transacao.destino_parceiro_id) || "Parceiro";
    return "-";
  };

  if (loading && !data) {
    return (
      <div className="space-y-2 p-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-destructive gap-3">
        <div className="flex flex-col items-center">
          <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">Erro ao carregar movimentações</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Tentar novamente
          </Button>
        )}
      </div>
    );
  }

  const transacoes = data?.transacoes || [];

  if (transacoes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <AlertCircle className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-sm">Nenhuma movimentação encontrada</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2 p-2">
        {/* Indicator for revalidating */}
        {isRevalidating && (
          <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Atualizando...
          </div>
        )}
        
        {transacoes.map((transacao) => (
          <div
            key={transacao.id}
            className="p-3 border border-border rounded-lg hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <Badge
                variant="outline"
                className={`text-xs ${getTipoBadgeColor(transacao.tipo_transacao, transacao.status)}`}
              >
                {getTipoLabel(transacao.tipo_transacao, transacao)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDate(transacao.data_transacao)}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <span className="truncate max-w-[120px]">{getOrigemLabel(transacao)}</span>
              <ArrowRight className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[120px]">{getDestinoLabel(transacao)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">
                {maskCurrency(transacao.valor)}
              </span>
              {transacao.descricao && (
                <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                  {transacao.descricao}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
