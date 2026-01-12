import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, AlertCircle, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  ajuste_direcao: string | null;
  ajuste_motivo: string | null;
}

interface ContaBancaria {
  id: string;
  banco: string;
  titular: string;
  parceiro_id: string;
}

interface WalletCrypto {
  id: string;
  exchange: string;
  endereco: string;
  network?: string;
  parceiro_id: string;
}

interface MovimentacoesData {
  transacoes: Transacao[];
  bookmakerNames: Map<string, string>;
  parceiroNames: Map<string, string>;
  contasBancarias: ContaBancaria[];
  walletsCrypto: WalletCrypto[];
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

      let contasBancariasResult: ContaBancaria[] = [];
      if (contaIdsSet.size > 0) {
        const { data: contasData } = await supabase
          .from("contas_bancarias")
          .select("id, banco, titular, parceiro_id")
          .in("id", Array.from(contaIdsSet));
        contasBancariasResult = contasData || [];
      }

      let walletsCryptoResult: WalletCrypto[] = [];
      if (walletIdsSet.size > 0) {
        const { data: walletsData } = await supabase
          .from("wallets_crypto")
          .select("id, exchange, endereco, network, parceiro_id")
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

  // Mapeamento de tipos para labels amigáveis
  const getTipoLabel = (tipo: string, transacao?: Transacao): string => {
    // Transferência: diferencia enviada/recebida
    if (tipo === "TRANSFERENCIA" && transacao) {
      const isOrigem = transacao.origem_parceiro_id === parceiroId ||
        data?.contasBancarias.some(c => c.id === transacao.origem_conta_bancaria_id && c.parceiro_id === parceiroId) ||
        data?.walletsCrypto.some(w => w.id === transacao.origem_wallet_id && w.parceiro_id === parceiroId);
      return isOrigem ? "Transferência Enviada" : "Transferência Recebida";
    }

    // Status recusado
    if (transacao?.status === "RECUSADO") {
      const labels: Record<string, string> = {
        DEPOSITO: "Depósito Recusado",
        SAQUE: "Saque Recusado",
        TRANSFERENCIA: "Transferência Recusada",
        APORTE_FINANCEIRO: "Aporte Recusado",
      };
      return labels[tipo] || `${tipo.replace(/_/g, " ")} Recusado`;
    }

    const labels: Record<string, string> = {
      DEPOSITO: "Depósito",
      SAQUE: "Saque",
      TRANSFERENCIA: "Transferência",
      APORTE_FINANCEIRO: "Aporte",
      DESPESA_ADMINISTRATIVA: "Despesa Admin.",
      AJUSTE_MANUAL: "Ajuste Manual",
      AJUSTE_SALDO: "Ajuste de Saldo",
      COMISSAO_INDICADOR: "Comissão Indicador",
      PAGTO_PARCEIRO: "Pagamento Parceiro",
      CREDITO_GIRO: "Crédito de Giro",
      ESTORNO: "Estorno",
      CONCILIACAO: "Conciliação",
      // Tipos promocionais
      GIRO_GRATIS_GANHO: "Giro Grátis",
      FREEBET_CONVERTIDA: "Freebet Convertida",
      BONUS_CREDITADO: "Bônus Creditado",
      CREDITO_PROMOCIONAL: "Crédito Promocional",
    };
    return labels[tipo] || tipo.replace(/_/g, " ");
  };

  // Cores para badges de tipo
  const getTipoBadgeColor = (tipo: string, status?: string): string => {
    if (status === "RECUSADO") {
      return "bg-muted text-muted-foreground border-muted line-through";
    }

    const colors: Record<string, string> = {
      DEPOSITO: "bg-red-500/20 text-red-500 border-red-500/30",
      SAQUE: "bg-green-500/20 text-green-500 border-green-500/30",
      TRANSFERENCIA: "bg-blue-500/20 text-blue-500 border-blue-500/30",
      APORTE_FINANCEIRO: "bg-emerald-500/20 text-emerald-500 border-emerald-500/30",
      DESPESA_ADMINISTRATIVA: "bg-orange-500/20 text-orange-500 border-orange-500/30",
      AJUSTE_MANUAL: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
      AJUSTE_SALDO: "bg-purple-500/20 text-purple-500 border-purple-500/30",
      COMISSAO_INDICADOR: "bg-cyan-500/20 text-cyan-500 border-cyan-500/30",
      PAGTO_PARCEIRO: "bg-pink-500/20 text-pink-500 border-pink-500/30",
      CREDITO_GIRO: "bg-indigo-500/20 text-indigo-500 border-indigo-500/30",
      ESTORNO: "bg-rose-500/20 text-rose-500 border-rose-500/30",
      CONCILIACAO: "bg-slate-500/20 text-slate-400 border-slate-500/30",
      // Tipos promocionais (destacados em verde/teal)
      GIRO_GRATIS_GANHO: "bg-teal-500/20 text-teal-400 border-teal-500/30",
      FREEBET_CONVERTIDA: "bg-lime-500/20 text-lime-400 border-lime-500/30",
      BONUS_CREDITADO: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      CREDITO_PROMOCIONAL: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    };
    return colors[tipo] || "bg-muted text-muted-foreground border-muted";
  };

  // Formatar label de conta bancária com banco + titular
  const formatContaBancaria = (conta: ContaBancaria | undefined, parceiroNome?: string): string => {
    if (!conta) return "Conta Bancária";
    const parts = [conta.banco];
    if (conta.titular) parts.push(conta.titular);
    return parts.join("\n");
  };

  // Formatar label de wallet
  const formatWallet = (wallet: WalletCrypto | undefined): string => {
    if (!wallet) return "Wallet Crypto";
    const parts = [wallet.exchange];
    if (wallet.network) parts.push(`(${wallet.network})`);
    return parts.join(" ");
  };

  // Gera label de origem com informações completas
  const getOrigemLabel = (transacao: Transacao): { principal: string; secundario?: string } => {
    // Caixa Operacional
    if (transacao.origem_tipo === "CAIXA_OPERACIONAL") {
      return { principal: "Caixa Operacional" };
    }

    // Investidor
    if (transacao.origem_tipo === "INVESTIDOR" && transacao.nome_investidor) {
      return { principal: "Investidor", secundario: transacao.nome_investidor };
    }

    // Bookmaker/Casa
    if (transacao.origem_bookmaker_id) {
      const nome = data?.bookmakerNames.get(transacao.origem_bookmaker_id);
      return { principal: nome || "Casa de Apostas" };
    }

    // Conta Bancária
    if (transacao.origem_conta_bancaria_id) {
      const conta = data?.contasBancarias.find((c) => c.id === transacao.origem_conta_bancaria_id);
      const parceiroNome = transacao.origem_parceiro_id 
        ? data?.parceiroNames.get(transacao.origem_parceiro_id) 
        : undefined;
      
      if (conta) {
        return { 
          principal: conta.banco, 
          secundario: parceiroNome || conta.titular 
        };
      }
      return { principal: "Conta Bancária" };
    }

    // Wallet Crypto
    if (transacao.origem_wallet_id) {
      const wallet = data?.walletsCrypto.find((w) => w.id === transacao.origem_wallet_id);
      if (wallet) {
        return { 
          principal: formatWallet(wallet),
          secundario: wallet.endereco ? `${wallet.endereco.slice(0, 8)}...` : undefined
        };
      }
      return { principal: "Wallet Crypto" };
    }

    // Parceiro direto
    if (transacao.origem_parceiro_id) {
      const nome = data?.parceiroNames.get(transacao.origem_parceiro_id);
      return { principal: nome || "Parceiro" };
    }

    return { principal: "-" };
  };

  // Gera label de destino com informações completas
  const getDestinoLabel = (transacao: Transacao): { principal: string; secundario?: string } => {
    // Despesas administrativas → destino é "Despesa Externa"
    if (transacao.tipo_transacao === "DESPESA_ADMINISTRATIVA") {
      return { principal: "Despesa Externa" };
    }

    // Caixa Operacional
    if (transacao.destino_tipo === "CAIXA_OPERACIONAL") {
      return { principal: "Caixa Operacional" };
    }

    // Bookmaker/Casa
    if (transacao.destino_bookmaker_id) {
      const nome = data?.bookmakerNames.get(transacao.destino_bookmaker_id);
      return { principal: nome || "Casa de Apostas" };
    }

    // Conta Bancária
    if (transacao.destino_conta_bancaria_id) {
      const conta = data?.contasBancarias.find((c) => c.id === transacao.destino_conta_bancaria_id);
      const parceiroNome = transacao.destino_parceiro_id 
        ? data?.parceiroNames.get(transacao.destino_parceiro_id) 
        : undefined;
      
      if (conta) {
        return { 
          principal: conta.banco, 
          secundario: parceiroNome || conta.titular 
        };
      }
      return { principal: "Conta Bancária" };
    }

    // Wallet Crypto
    if (transacao.destino_wallet_id) {
      const wallet = data?.walletsCrypto.find((w) => w.id === transacao.destino_wallet_id);
      if (wallet) {
        return { 
          principal: formatWallet(wallet),
          secundario: wallet.endereco ? `${wallet.endereco.slice(0, 8)}...` : undefined
        };
      }
      return { principal: "Wallet Crypto" };
    }

    // Parceiro direto
    if (transacao.destino_parceiro_id) {
      const nome = data?.parceiroNames.get(transacao.destino_parceiro_id);
      return { principal: nome || "Parceiro" };
    }

    return { principal: "-" };
  };

  // Componente para exibir origem/destino com duas linhas
  const FlowLabel = ({ label, align = "left" }: { label: { principal: string; secundario?: string }; align?: "left" | "right" }) => {
    const alignClass = align === "right" ? "text-right items-end" : "text-left items-start";
    return (
      <div className={`flex flex-col ${alignClass} min-w-0`}>
        <span className="text-xs font-medium text-foreground truncate max-w-[140px]">
          {label.principal}
        </span>
        {label.secundario && (
          <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
            {label.secundario}
          </span>
        )}
      </div>
    );
  };

  // LOADING
  if (loading) {
    return (
      <div className="h-full flex flex-col gap-2 overflow-y-auto p-1">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-20 shrink-0" />
        ))}
      </div>
    );
  }

  // ERROR
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-destructive gap-3">
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

  // EMPTY
  if (transacoes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <AlertCircle className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-sm">Nenhuma movimentação encontrada</p>
      </div>
    );
  }

  // CONTENT
  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="space-y-2 pr-1">
          {transacoes.map((transacao) => {
            const origem = getOrigemLabel(transacao);
            const destino = getDestinoLabel(transacao);

            return (
              <div
                key={transacao.id}
                className="p-3 border border-border rounded-lg hover:bg-muted/20 transition-colors"
              >
                {/* Header: Badge + Info Icon + Data */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1.5">
                    <Badge 
                      variant="outline" 
                      className={`text-xs font-medium ${getTipoBadgeColor(transacao.tipo_transacao, transacao.status)}`}
                    >
                      {getTipoLabel(transacao.tipo_transacao, transacao)}
                    </Badge>
                    
                    {/* Info icon com descrição/motivo ao lado do badge */}
                    {(transacao.descricao || transacao.ajuste_motivo) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center justify-center h-5 w-5 rounded-full bg-muted/50 hover:bg-muted cursor-help transition-colors">
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[300px]">
                          <p className="text-xs whitespace-pre-wrap">
                            {transacao.ajuste_motivo || transacao.descricao}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(transacao.data_transacao)}
                  </span>
                </div>

                {/* Flow: Origem → Destino */}
                <div className="flex items-center gap-2 mb-3">
                  <FlowLabel label={origem} align="left" />
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <FlowLabel label={destino} align="left" />
                </div>

                {/* Footer: Valor */}
                <div className="flex items-center">
                  <span className="text-sm font-semibold flex items-center">
                    {maskCurrency(transacao)}
                    {getMoedaBadge(transacao)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
