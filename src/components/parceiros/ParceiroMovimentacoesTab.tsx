import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Transacao {
  id: string;
  tipo_transacao: string;
  valor: number;
  moeda: string;
  tipo_moeda: string;
  valor_usd: number | null;
  data_transacao: string;
  status: string;
  descricao: string | null;
  origem_bookmaker_id: string | null;
  destino_bookmaker_id: string | null;
  origem_tipo: string | null;
  destino_tipo: string | null;
  origem_parceiro_id: string | null;
  destino_parceiro_id: string | null;
  origem_conta_bancaria_id: string | null;
  destino_conta_bancaria_id: string | null;
  origem_wallet_id: string | null;
  destino_wallet_id: string | null;
  nome_investidor: string | null;
}

interface MovimentacoesData {
  transacoes: Transacao[];
  bookmakerNames: Map<string, string>;
  parceiroNames: Map<string, string>;
  contasBancarias: Array<{ id: string; banco: string; titular: string; parceiro_id: string }>;
  walletsCrypto: Array<{ id: string; exchange: string; endereco: string; parceiro_id: string }>;
}

interface ParceiroMovimentacoesTabProps {
  parceiroId: string;
  showSensitiveData: boolean;
}

export function ParceiroMovimentacoesTab({ parceiroId, showSensitiveData }: ParceiroMovimentacoesTabProps) {
  const [data, setData] = useState<MovimentacoesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: contasDoParceiroData } = await supabase
        .from("contas_bancarias")
        .select("id")
        .eq("parceiro_id", parceiroId);

      const { data: walletsDoParceiroData } = await supabase
        .from("wallets_crypto")
        .select("id")
        .eq("parceiro_id", parceiroId);

      const contasIds = contasDoParceiroData?.map((c) => c.id) || [];
      const walletsIds = walletsDoParceiroData?.map((w) => w.id) || [];

      const orConditions = [`origem_parceiro_id.eq.${parceiroId}`, `destino_parceiro_id.eq.${parceiroId}`];

      if (contasIds.length > 0) {
        orConditions.push(`origem_conta_bancaria_id.in.(${contasIds.join(",")})`);
        orConditions.push(`destino_conta_bancaria_id.in.(${contasIds.join(",")})`);
      }

      if (walletsIds.length > 0) {
        orConditions.push(`origem_wallet_id.in.(${walletsIds.join(",")})`);
        orConditions.push(`destino_wallet_id.in.(${walletsIds.join(",")})`);
      }

      const { data: transacoesData, error: transacoesError } = await supabase
        .from("cash_ledger")
        .select("*")
        .or(orConditions.join(","))
        .order("data_transacao", { ascending: false });

      if (transacoesError) throw transacoesError;

      const bookmakerIds = new Set<string>();
      const parceiroIds = new Set<string>();
      const contaIdsSet = new Set<string>();
      const walletIdsSet = new Set<string>();

      transacoesData?.forEach((t) => {
        if (t.origem_bookmaker_id) bookmakerIds.add(t.origem_bookmaker_id);
        if (t.destino_bookmaker_id) bookmakerIds.add(t.destino_bookmaker_id);
        if (t.origem_parceiro_id) parceiroIds.add(t.origem_parceiro_id);
        if (t.destino_parceiro_id) parceiroIds.add(t.destino_parceiro_id);
        if (t.origem_conta_bancaria_id) contaIdsSet.add(t.origem_conta_bancaria_id);
        if (t.destino_conta_bancaria_id) contaIdsSet.add(t.destino_conta_bancaria_id);
        if (t.origem_wallet_id) walletIdsSet.add(t.origem_wallet_id);
        if (t.destino_wallet_id) walletIdsSet.add(t.destino_wallet_id);
      });

      const bmNames = new Map<string, string>();
      if (bookmakerIds.size > 0) {
        const { data: bookmakersData } = await supabase
          .from("bookmakers")
          .select("id, nome")
          .in("id", Array.from(bookmakerIds));
        bookmakersData?.forEach((b) => bmNames.set(b.id, b.nome));
      }

      const pNames = new Map<string, string>();
      if (parceiroIds.size > 0) {
        const { data: parceirosData } = await supabase
          .from("parceiros")
          .select("id, nome")
          .in("id", Array.from(parceiroIds));
        parceirosData?.forEach((p) => pNames.set(p.id, p.nome));
      }

      let contasBancariasResult: Array<{ id: string; banco: string; titular: string; parceiro_id: string }> = [];
      if (contaIdsSet.size > 0) {
        const { data: contasData } = await supabase
          .from("contas_bancarias")
          .select("id, banco, titular, parceiro_id")
          .in("id", Array.from(contaIdsSet));
        contasBancariasResult = contasData || [];
      }

      let walletsCryptoResult: Array<{ id: string; exchange: string; endereco: string; parceiro_id: string }> = [];
      if (walletIdsSet.size > 0) {
        const { data: walletsData } = await supabase
          .from("wallets_crypto")
          .select("id, exchange, endereco, parceiro_id")
          .in("id", Array.from(walletIdsSet));
        walletsCryptoResult = walletsData || [];
      }

      setData({
        transacoes: transacoesData || [],
        bookmakerNames: bmNames,
        parceiroNames: pNames,
        contasBancarias: contasBancariasResult,
        walletsCrypto: walletsCryptoResult,
      });
    } catch (err: any) {
      console.error("Erro ao carregar movimentações:", err);
      setError(err.message || "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [parceiroId]);

  const formatCurrency = (value: number, moeda: string = "BRL") => {
    const symbol = moeda === "USD" || moeda === "USDT" ? "$" : "R$";
    const formatted = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
    return `${symbol} ${formatted}`;
  };

  const getDisplayValue = (transacao: Transacao): { valor: number; moeda: string } => {
    if (transacao.tipo_moeda === "CRYPTO") {
      return { valor: transacao.valor_usd ?? transacao.valor, moeda: "USD" };
    }
    return { valor: transacao.valor, moeda: transacao.moeda || "BRL" };
  };

  const maskCurrency = (transacao: Transacao) => {
    const { valor, moeda } = getDisplayValue(transacao);
    if (showSensitiveData) return formatCurrency(valor, moeda);
    return moeda === "USD" || moeda === "USDT" ? "$ ••••" : "R$ ••••";
  };

  const getMoedaBadge = (transacao: Transacao) => {
    if (transacao.tipo_moeda === "CRYPTO") {
      return (
        <Badge variant="outline" className="text-[10px] ml-1 bg-amber-500/10 text-amber-500 border-amber-500/30">
          CRYPTO
        </Badge>
      );
    }
    if (transacao.moeda === "USD") {
      return (
        <Badge variant="outline" className="text-[10px] ml-1 bg-blue-500/10 text-blue-500 border-blue-500/30">
          USD
        </Badge>
      );
    }
    return null;
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
      const conta = data?.contasBancarias.find((c) => c.id === transacao.origem_conta_bancaria_id);
      return conta ? `${conta.banco} - ${conta.titular}` : "Conta Bancária";
    }
    if (transacao.origem_wallet_id) {
      const wallet = data?.walletsCrypto.find((w) => w.id === transacao.origem_wallet_id);
      return wallet ? `${wallet.exchange}` : "Wallet Crypto";
    }
    if (transacao.origem_parceiro_id) return data?.parceiroNames.get(transacao.origem_parceiro_id) || "Parceiro";
    return "-";
  };

  const getDestinoLabel = (transacao: Transacao) => {
    if (transacao.destino_tipo === "CAIXA_OPERACIONAL") return "Caixa Operacional";
    if (transacao.destino_bookmaker_id) return `Casa: ${data?.bookmakerNames.get(transacao.destino_bookmaker_id) || "..."}`;
    if (transacao.destino_conta_bancaria_id) {
      const conta = data?.contasBancarias.find((c) => c.id === transacao.destino_conta_bancaria_id);
      return conta ? `${conta.banco} - ${conta.titular}` : "Conta Bancária";
    }
    if (transacao.destino_wallet_id) {
      const wallet = data?.walletsCrypto.find((w) => w.id === transacao.destino_wallet_id);
      return wallet ? `${wallet.exchange}` : "Wallet Crypto";
    }
    if (transacao.destino_parceiro_id) return data?.parceiroNames.get(transacao.destino_parceiro_id) || "Parceiro";
    return "-";
  };

  // Estados de loading/erro/vazio ocupam 100% do container pai
  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 shrink-0" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-destructive gap-3">
        <AlertCircle className="h-8 w-8 opacity-50" />
        <p className="text-sm">Erro ao carregar movimentações</p>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-3 w-3 mr-2" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  const transacoes = data?.transacoes || [];

  if (transacoes.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-muted-foreground">
        <AlertCircle className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-sm">Nenhuma movimentação encontrada</p>
      </div>
    );
  }

  // Conteúdo real: ScrollArea gerencia o scroll
  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="space-y-2 pr-2">
        {transacoes.map((transacao) => (
          <div
            key={transacao.id}
            className="p-3 border border-border rounded-lg hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <Badge variant="outline" className={`text-xs ${getTipoBadgeColor(transacao.tipo_transacao, transacao.status)}`}>
                {getTipoLabel(transacao.tipo_transacao, transacao)}
              </Badge>
              <span className="text-xs text-muted-foreground">{formatDate(transacao.data_transacao)}</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <span className="truncate max-w-[120px]">{getOrigemLabel(transacao)}</span>
              <ArrowRight className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[120px]">{getDestinoLabel(transacao)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold flex items-center">
                {maskCurrency(transacao)}
                {getMoedaBadge(transacao)}
              </span>
              {transacao.descricao && (
                <span className="text-xs text-muted-foreground truncate max-w-[150px]">{transacao.descricao}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
