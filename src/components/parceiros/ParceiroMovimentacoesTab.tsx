import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, AlertCircle, RefreshCw, Info, Building2, Wallet, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  getGlobalMovimentacoesCache, 
  MovimentacoesData, 
  Transacao, 
  ContaBancaria, 
  WalletCrypto 
} from "@/hooks/useParceiroTabsCache";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { parseLocalDateTime } from "@/utils/dateUtils";
import { CryptoTransactionCard, CryptoTransactionData, CryptoParty } from "./CryptoTransactionCard";

interface ParceiroMovimentacoesTabProps {
  parceiroId: string;
  showSensitiveData: boolean;
}

/**
 * ARQUITETURA: Tab de Movimentações com Cache
 * 
 * Este componente usa um cache global (LRU) para evitar refetch ao alternar entre abas.
 * Os dados só são recarregados quando:
 * - O parceiroId muda
 * - O usuário clica em "Atualizar" explicitamente
 * - O cache expira (TTL de 5 minutos)
 */
export const ParceiroMovimentacoesTab = memo(function ParceiroMovimentacoesTab({ 
  parceiroId, 
  showSensitiveData 
}: ParceiroMovimentacoesTabProps) {
  const [data, setData] = useState<MovimentacoesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getLogoUrl } = useBookmakerLogoMap();
  
  // Referência para evitar race conditions
  const lastFetchedIdRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);
  const isMountedRef = useRef(true);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!parceiroId) return;
    
    // Evitar fetch duplicado
    if (isFetchingRef.current) return;
    
    const cache = getGlobalMovimentacoesCache();
    
    // Verificar cache primeiro (se não for refresh forçado)
    if (!forceRefresh) {
      const cached = cache.get(parceiroId);
      if (cached) {
        setData(cached);
        setLoading(false);
        setError(null);
        lastFetchedIdRef.current = parceiroId;
        return;
      }
    }
    
    // Evitar refetch se já buscamos esse parceiro e não é refresh forçado
    if (!forceRefresh && lastFetchedIdRef.current === parceiroId && data) {
      return;
    }
    
    isFetchingRef.current = true;
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

      const newData: MovimentacoesData = {
        transacoes: transacoesData || [],
        bookmakerNames: bmNames,
        parceiroNames: pNames,
        contasBancarias: contasBancariasResult,
        walletsCrypto: walletsCryptoResult,
      };

      // Salvar no cache global
      cache.set(parceiroId, newData);
      lastFetchedIdRef.current = parceiroId;
      
      if (isMountedRef.current) {
        setData(newData);
      }
    } catch (err: any) {
      console.error("Erro ao carregar movimentações:", err);
      if (isMountedRef.current) {
        setError(err.message || "Erro ao carregar dados");
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
      isFetchingRef.current = false;
    }
  }, [parceiroId, data]);

  // Effect: Carregar dados apenas quando parceiroId muda
  useEffect(() => {
    isMountedRef.current = true;
    
    // Verificar cache antes de fazer fetch
    const cache = getGlobalMovimentacoesCache();
    const cached = cache.get(parceiroId);
    
    if (cached && lastFetchedIdRef.current !== parceiroId) {
      // Temos cache - usar imediatamente
      setData(cached);
      lastFetchedIdRef.current = parceiroId;
    } else if (lastFetchedIdRef.current !== parceiroId) {
      // Sem cache e parceiro diferente - buscar
      fetchData(false);
    }
    
    return () => {
      isMountedRef.current = false;
    };
  }, [parceiroId]);

  const handleRefresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

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
    return parseLocalDateTime(date).toLocaleDateString("pt-BR", {
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

  // Helper to abbreviate wallet address (0x5d6A...fa1070)
  const abbreviateAddress = (address: string | null | undefined): string | undefined => {
    if (!address) return undefined;
    if (address.length <= 14) return address;
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  };

  // Tipo de entidade para escolher o ícone correto
  type EntityType = "bookmaker" | "wallet" | "conta_bancaria" | "caixa" | "parceiro" | "investidor" | "despesa" | "unknown";
  
  interface FlowLabelData {
    principal: string;
    secundario?: string;
    tipo: EntityType;
    logoUrl?: string | null;
  }

  // Gera label de origem com informações completas
  const getOrigemLabel = (transacao: Transacao): FlowLabelData => {
    // Caixa Operacional
    if (transacao.origem_tipo === "CAIXA_OPERACIONAL") {
      return { principal: "Caixa Operacional", tipo: "caixa" };
    }

    // Investidor
    if (transacao.origem_tipo === "INVESTIDOR" && transacao.nome_investidor) {
      return { principal: "Investidor", secundario: transacao.nome_investidor, tipo: "investidor" };
    }

    // Bookmaker/Casa
    if (transacao.origem_bookmaker_id) {
      const nome = data?.bookmakerNames.get(transacao.origem_bookmaker_id) || "Casa de Apostas";
      const logoUrl = getLogoUrl(nome);
      return { principal: nome, tipo: "bookmaker", logoUrl };
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
          secundario: parceiroNome || conta.titular,
          tipo: "conta_bancaria"
        };
      }
      return { principal: "Conta Bancária", tipo: "conta_bancaria" };
    }

    // Wallet Crypto
    if (transacao.origem_wallet_id) {
      const wallet = data?.walletsCrypto.find((w) => w.id === transacao.origem_wallet_id);
      if (wallet) {
        return { 
          principal: formatWallet(wallet),
          secundario: abbreviateAddress(wallet.endereco),
          tipo: "wallet"
        };
      }
      return { principal: "Wallet Crypto", tipo: "wallet" };
    }

    // Parceiro direto
    if (transacao.origem_parceiro_id) {
      const nome = data?.parceiroNames.get(transacao.origem_parceiro_id);
      return { principal: nome || "Parceiro", tipo: "parceiro" };
    }

    return { principal: "-", tipo: "unknown" };
  };

  // Gera label de destino com informações completas
  const getDestinoLabel = (transacao: Transacao): FlowLabelData => {
    // Despesas administrativas → destino é "Despesa Externa"
    if (transacao.tipo_transacao === "DESPESA_ADMINISTRATIVA") {
      return { principal: "Despesa Externa", tipo: "despesa" };
    }

    // Caixa Operacional
    if (transacao.destino_tipo === "CAIXA_OPERACIONAL") {
      return { principal: "Caixa Operacional", tipo: "caixa" };
    }

    // Bookmaker/Casa
    if (transacao.destino_bookmaker_id) {
      const nome = data?.bookmakerNames.get(transacao.destino_bookmaker_id) || "Casa de Apostas";
      const logoUrl = getLogoUrl(nome);
      return { principal: nome, tipo: "bookmaker", logoUrl };
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
          secundario: parceiroNome || conta.titular,
          tipo: "conta_bancaria"
        };
      }
      return { principal: "Conta Bancária", tipo: "conta_bancaria" };
    }

    // Wallet Crypto
    if (transacao.destino_wallet_id) {
      const wallet = data?.walletsCrypto.find((w) => w.id === transacao.destino_wallet_id);
      if (wallet) {
        return { 
          principal: formatWallet(wallet),
          secundario: abbreviateAddress(wallet.endereco),
          tipo: "wallet"
        };
      }
      return { principal: "Wallet Crypto", tipo: "wallet" };
    }

    // Parceiro direto
    if (transacao.destino_parceiro_id) {
      const nome = data?.parceiroNames.get(transacao.destino_parceiro_id);
      return { principal: nome || "Parceiro", tipo: "parceiro" };
    }

    return { principal: "-", tipo: "unknown" };
  };

  // Componente para renderizar o ícone apropriado
  const EntityIcon = ({ data: labelData }: { data: FlowLabelData }) => {
    const iconClass = "h-5 w-5 shrink-0";
    
    // Bookmaker com logo
    if (labelData.tipo === "bookmaker" && labelData.logoUrl) {
      return (
        <img 
          src={labelData.logoUrl} 
          alt={labelData.principal} 
          className="h-5 w-5 rounded object-contain bg-background shrink-0"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      );
    }
    
    // Fallback icons por tipo
    switch (labelData.tipo) {
      case "bookmaker":
        return <Building2 className={`${iconClass} text-muted-foreground`} />;
      case "wallet":
        return <Wallet className={`${iconClass} text-muted-foreground`} />;
      case "conta_bancaria":
        return <Landmark className={`${iconClass} text-muted-foreground`} />;
      case "caixa":
        return <Building2 className={`${iconClass} text-muted-foreground`} />;
      default:
        return null;
    }
  };

  // Componente para exibir origem/destino com ícone e duas linhas
  const FlowLabel = ({ label, align = "left" }: { label: FlowLabelData; align?: "left" | "right" }) => {
    const isRight = align === "right";
    return (
      <div className={`flex items-center gap-2 min-w-0 ${isRight ? "flex-row-reverse" : ""}`}>
        <EntityIcon data={label} />
        <div className={`flex flex-col min-w-0 ${isRight ? "text-right items-end" : "text-left items-start"}`}>
          <span className="text-xs font-medium text-foreground truncate max-w-[140px]">
            {label.principal}
          </span>
          {label.secundario && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
              {label.secundario}
            </span>
          )}
        </div>
      </div>
    );
  };

  // LOADING (apenas no primeiro carregamento)
  if (loading && !data) {
    return (
      <div className="h-full flex flex-col gap-2 overflow-y-auto p-1">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-20 shrink-0" />
        ))}
      </div>
    );
  }

  // ERROR
  if (error && !data) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-destructive gap-3">
        <AlertCircle className="h-8 w-8 opacity-50" />
        <p className="text-sm">Erro ao carregar movimentações</p>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-3 w-3 mr-2" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  const transacoes = data?.transacoes || [];

  // =========================================================================
  // TRANSFORMAÇÃO: Converter transação para formato de card crypto
  // =========================================================================
  const transformToCryptoCard = (transacao: Transacao): CryptoTransactionData | null => {
    if (transacao.tipo_moeda !== "CRYPTO") return null;
    
    // Determinar se é enviada ou recebida do ponto de vista do parceiro atual
    const isOrigem = transacao.origem_parceiro_id === parceiroId ||
      data?.contasBancarias.some(c => c.id === transacao.origem_conta_bancaria_id && c.parceiro_id === parceiroId) ||
      data?.walletsCrypto.some(w => w.id === transacao.origem_wallet_id && w.parceiro_id === parceiroId);
    
    // Buscar dados da wallet de origem
    const origemWallet = transacao.origem_wallet_id 
      ? data?.walletsCrypto.find(w => w.id === transacao.origem_wallet_id)
      : null;
    const origemParceiro = transacao.origem_parceiro_id
      ? data?.parceiroNames.get(transacao.origem_parceiro_id)
      : (origemWallet?.parceiro_id ? data?.parceiroNames.get(origemWallet.parceiro_id) : null);
    
    // Buscar dados da wallet de destino
    const destinoWallet = transacao.destino_wallet_id
      ? data?.walletsCrypto.find(w => w.id === transacao.destino_wallet_id)
      : null;
    const destinoParceiro = transacao.destino_parceiro_id
      ? data?.parceiroNames.get(transacao.destino_parceiro_id)
      : (destinoWallet?.parceiro_id ? data?.parceiroNames.get(destinoWallet.parceiro_id) : null);
    
    // Resolver nome da bookmaker de origem (quando tipo é BOOKMAKER)
    const origemBookmakerName = transacao.origem_tipo === "BOOKMAKER" && transacao.origem_bookmaker_id
      ? data?.bookmakerNames.get(transacao.origem_bookmaker_id) || null
      : null;

    // Resolver nome da bookmaker de destino (quando tipo é BOOKMAKER)
    const destinoBookmakerName = transacao.destino_tipo === "BOOKMAKER" && transacao.destino_bookmaker_id
      ? data?.bookmakerNames.get(transacao.destino_bookmaker_id) || null
      : null;

    // Detectar tipos automáticos sem origem/destino explícito
    const isAutoAdjust = ["GANHO_CAMBIAL", "PERDA_CAMBIAL"].includes(transacao.tipo_transacao);
    
    // Resolver referência do lançamento automático (buscar bookmaker do saque original)
    let autoAdjustLabel: string | null = null;
    if (isAutoAdjust && transacao.descricao) {
      // Extrair nome da bookmaker da descrição (ex: "Ganho na liquidação cripto - MAFIA CASINO (diferença: ...)")
      const match = transacao.descricao.match(/cripto\s*-\s*(.+?)\s*\(/);
      autoAdjustLabel = match?.[1] || "Liquidação Cripto";
    }

    // Resolver logos de bookmakers
    const origemBookmakerLogo = origemBookmakerName ? getLogoUrl(origemBookmakerName) : null;
    const destinoBookmakerLogo = destinoBookmakerName ? getLogoUrl(destinoBookmakerName) : null;
    const autoAdjustLogo = autoAdjustLabel ? getLogoUrl(autoAdjustLabel) : null;

    // Construir party de origem
    const from: CryptoParty = {
      owner_name: origemParceiro 
        || (transacao.origem_tipo === "CAIXA_OPERACIONAL" ? "Caixa Operacional" : null)
        || (transacao.origem_tipo === "BOOKMAKER" ? origemBookmakerName : null)
        || (isAutoAdjust && !transacao.origem_tipo ? (autoAdjustLabel || "Ajuste Cambial") : null),
      wallet_name: origemWallet?.exchange 
        || (transacao.origem_tipo === "CAIXA_OPERACIONAL" ? "Operacional" : null)
        || (transacao.origem_tipo === "BOOKMAKER" ? "Conta Bookmaker" : null)
        || (isAutoAdjust && !transacao.origem_tipo ? "Conciliação" : null),
      address: origemWallet?.endereco || null,
      logo_url: origemBookmakerLogo || (isAutoAdjust && !transacao.origem_tipo ? autoAdjustLogo : null),
    };
    
    // Construir party de destino
    const to: CryptoParty = {
      owner_name: destinoParceiro 
        || (transacao.destino_tipo === "CAIXA_OPERACIONAL" ? "Caixa Operacional" : null)
        || (transacao.destino_tipo === "BOOKMAKER" ? destinoBookmakerName : null)
        || (isAutoAdjust && !transacao.destino_tipo ? (autoAdjustLabel || "Ajuste Cambial") : null),
      wallet_name: destinoWallet?.exchange 
        || (transacao.destino_tipo === "CAIXA_OPERACIONAL" ? "Operacional" : null)
        || (transacao.destino_tipo === "BOOKMAKER" ? "Conta Bookmaker" : null)
        || (isAutoAdjust && !transacao.destino_tipo ? "Conciliação" : null),
      address: destinoWallet?.endereco || null,
      logo_url: destinoBookmakerLogo || (isAutoAdjust && !transacao.destino_tipo ? autoAdjustLogo : null),
    };
    
    // Determinar a rede (da wallet de origem ou destino)
    const network = origemWallet?.network || destinoWallet?.network || null;
    
    return {
      id: transacao.id,
      type: isOrigem ? "sent" : "received",
      asset: transacao.coin,
      network,
      amount: transacao.qtd_coin ?? transacao.valor,
      amount_usd: transacao.valor_usd,
      date: transacao.data_transacao,
      description: transacao.descricao,
      status: transacao.status,
      from,
      to,
    };
  };

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
            // ===============================================================
            // RENDERIZAÇÃO CONDICIONAL: Card Crypto vs Card Padrão
            // ===============================================================
            const cryptoData = transformToCryptoCard(transacao);
            
            if (cryptoData) {
              // Renderizar card crypto institucional
              return (
                <CryptoTransactionCard
                  key={transacao.id}
                  transaction={cryptoData}
                  showSensitiveData={showSensitiveData}
                  formatDate={formatDate}
                />
              );
            }
            
            // Renderizar card padrão para transações FIAT
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
                    <Badge variant="outline" className={`text-[10px] ${getTipoBadgeColor(transacao.tipo_transacao, transacao.status)}`}>
                      {getTipoLabel(transacao.tipo_transacao, transacao)}
                    </Badge>
                    {getMoedaBadge(transacao)}
                    {transacao.descricao && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[200px]">
                          <p className="text-xs">{transacao.descricao}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDate(transacao.data_transacao)}
                  </span>
                </div>

                {/* Flow: Origem → Valor → Destino */}
                <div className="flex items-center gap-3">
                  <FlowLabel label={origem} align="left" />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">
                      {maskCurrency(transacao)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <FlowLabel label={destino} align="right" />
                </div>

                {/* Footer: Status Badge */}
                {transacao.status !== "CONFIRMADO" && (
                  <div className="mt-2 flex justify-end">
                    <Badge
                      variant="outline"
                      className={`text-[9px] ${
                        transacao.status === "PENDENTE"
                          ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/30"
                          : transacao.status === "RECUSADO"
                          ? "bg-destructive/10 text-destructive border-destructive/30"
                          : "bg-muted text-muted-foreground border-muted"
                      }`}
                    >
                      {transacao.status}
                    </Badge>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
});
