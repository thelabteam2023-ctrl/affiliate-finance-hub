import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProjectCurrencyFormat } from "@/hooks/useProjectCurrencyFormat";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { 
  ArrowRight, 
  Calendar, 
  Filter, 
  AlertCircle, 
  Building2, 
  Wallet, 
  Clock, 
  CheckCircle2, 
  XCircle,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  Banknote
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLocalDateTime } from "@/utils/dateUtils";

interface ProjetoMovimentacoesTabProps {
  projetoId: string;
}

interface Transacao {
  id: string;
  tipo_transacao: string;
  data_transacao: string;
  valor: number;
  moeda: string;
  descricao: string | null;
  status: string;
  origem_tipo: string | null;
  origem_bookmaker_id: string | null;
  origem_conta_bancaria_id: string | null;
  origem_wallet_id: string | null;
  origem_parceiro_id: string | null;
  destino_tipo: string | null;
  destino_bookmaker_id: string | null;
  destino_conta_bancaria_id: string | null;
  destino_wallet_id: string | null;
  destino_parceiro_id: string | null;
  investidor_id: string | null;
  nome_investidor: string | null;
}

interface BookmakerInfo {
  id: string;
  nome: string;
  logo_url: string | null;
  parceiro_id: string | null;
}

interface ContaBancariaInfo {
  id: string;
  banco: string;
  titular: string;
}

interface WalletInfo {
  id: string;
  exchange: string;
  rede: string;
  parceiro_id: string | null;
}

interface ParceiroInfo {
  id: string;
  nome: string;
}

const getTipoConfig = (tipo: string) => {
  const configs: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    DEPOSITO: { 
      label: "Depósito", 
      color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      icon: <ArrowDownLeft className="h-3 w-3" />
    },
    SAQUE: { 
      label: "Saque", 
      color: "bg-red-500/20 text-red-400 border-red-500/30",
      icon: <ArrowUpRight className="h-3 w-3" />
    },
    TRANSFERENCIA: { 
      label: "Transferência", 
      color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      icon: <ArrowRightLeft className="h-3 w-3" />
    },
    APORTE_FIAT: { 
      label: "Aporte FIAT", 
      color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      icon: <TrendingUp className="h-3 w-3" />
    },
    APORTE_CRYPTO: { 
      label: "Aporte Crypto", 
      color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      icon: <TrendingUp className="h-3 w-3" />
    },
    LIQUIDACAO_FIAT: { 
      label: "Liquidação FIAT", 
      color: "bg-pink-500/20 text-pink-400 border-pink-500/30",
      icon: <TrendingDown className="h-3 w-3" />
    },
    LIQUIDACAO_CRYPTO: { 
      label: "Liquidação Crypto", 
      color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      icon: <TrendingDown className="h-3 w-3" />
    },
    AJUSTE_SALDO: { 
      label: "Ajuste", 
      color: "bg-gray-500/20 text-gray-400 border-gray-500/30",
      icon: <Banknote className="h-3 w-3" />
    },
    CASHBACK_MANUAL: { 
      label: "Cashback", 
      color: "bg-teal-500/20 text-teal-400 border-teal-500/30",
      icon: <Banknote className="h-3 w-3" />
    },
  };
  return configs[tipo] || { 
    label: tipo, 
    color: "bg-muted text-muted-foreground",
    icon: <ArrowRightLeft className="h-3 w-3" />
  };
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "PENDENTE":
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 gap-1 text-[10px]">
          <Clock className="h-2.5 w-2.5" />
          Pendente
        </Badge>
      );
    case "CONFIRMADO":
      return (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1 text-[10px]">
          <CheckCircle2 className="h-2.5 w-2.5" />
          Confirmado
        </Badge>
      );
    case "RECUSADO":
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1 text-[10px]">
          <XCircle className="h-2.5 w-2.5" />
          Recusado
        </Badge>
      );
    default:
      return null;
  }
};

export function ProjetoMovimentacoesTab({ projetoId }: ProjetoMovimentacoesTabProps) {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [bookmakers, setBookmakers] = useState<Record<string, BookmakerInfo>>({});
  const [allBookmakers, setAllBookmakers] = useState<Record<string, BookmakerInfo>>({});
  const [contasBancarias, setContasBancarias] = useState<Record<string, ContaBancariaInfo>>({});
  const [wallets, setWallets] = useState<Record<string, WalletInfo>>({});
  const [parceiros, setParceiros] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("TODOS");
  const [dataInicio, setDataInicio] = useState<Date | undefined>(subDays(new Date(), 30));
  const [dataFim, setDataFim] = useState<Date | undefined>(new Date());
  
  const { formatCurrency } = useProjectCurrencyFormat();
  const { getLogoUrl } = useBookmakerLogoMap();

  // Buscar bookmakers vinculadas ao projeto
  const fetchBookmakers = useCallback(async () => {
    const { data, error } = await supabase
      .from("bookmakers")
      .select("id, nome, parceiro_id, bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey(logo_url)")
      .eq("projeto_id", projetoId);

    if (!error && data) {
      const map: Record<string, BookmakerInfo> = {};
      data.forEach((b: any) => {
        map[b.id] = {
          id: b.id,
          nome: b.nome,
          logo_url: b.bookmakers_catalogo?.logo_url || null,
          parceiro_id: b.parceiro_id
        };
      });
      setBookmakers(map);
      return Object.keys(map);
    }
    return [];
  }, [projetoId]);

  // Buscar todas as bookmakers (para transações que referenciam outras)
  const fetchAllBookmakers = useCallback(async () => {
    const { data } = await supabase
      .from("bookmakers")
      .select("id, nome, parceiro_id, bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey(logo_url)");

    if (data) {
      const map: Record<string, BookmakerInfo> = {};
      data.forEach((b: any) => {
        map[b.id] = {
          id: b.id,
          nome: b.nome,
          logo_url: b.bookmakers_catalogo?.logo_url || null,
          parceiro_id: b.parceiro_id
        };
      });
      setAllBookmakers(map);
    }
  }, []);

  // Buscar parceiros para nomes secundários
  const fetchParceiros = useCallback(async () => {
    const { data } = await supabase
      .from("parceiros")
      .select("id, nome");

    if (data) {
      const map: Record<string, string> = {};
      data.forEach((p: any) => {
        map[p.id] = p.nome;
      });
      setParceiros(map);
    }
  }, []);

  // Buscar contas bancárias
  const fetchContasBancarias = useCallback(async () => {
    const { data } = await supabase
      .from("contas_bancarias")
      .select("id, banco, titular");

    if (data) {
      const map: Record<string, ContaBancariaInfo> = {};
      data.forEach((c: any) => {
        map[c.id] = { id: c.id, banco: c.banco, titular: c.titular };
      });
      setContasBancarias(map);
    }
  }, []);

  // Buscar wallets
  const fetchWallets = useCallback(async () => {
    const { data } = await supabase
      .from("wallets_crypto")
      .select("id, exchange, rede, parceiro_id");

    if (data) {
      const map: Record<string, WalletInfo> = {};
      data.forEach((w: any) => {
        map[w.id] = { id: w.id, exchange: w.exchange, rede: w.rede, parceiro_id: w.parceiro_id };
      });
      setWallets(map);
    }
  }, []);

  // Buscar transações do cash_ledger relacionadas às bookmakers do projeto
  const fetchTransacoes = useCallback(async () => {
    setLoading(true);
    try {
      const bookmakerIds = await fetchBookmakers();
      
      if (bookmakerIds.length === 0) {
        setTransacoes([]);
        setLoading(false);
        return;
      }

      // Buscar dados auxiliares em paralelo
      await Promise.all([fetchContasBancarias(), fetchWallets(), fetchAllBookmakers(), fetchParceiros()]);

      // Buscar transações onde origem OU destino é uma bookmaker do projeto
      let query = supabase
        .from("cash_ledger")
        .select("*")
        .or(`origem_bookmaker_id.in.(${bookmakerIds.join(",")}),destino_bookmaker_id.in.(${bookmakerIds.join(",")})`)
        .order("data_transacao", { ascending: false });

      if (dataInicio) {
        query = query.gte("data_transacao", startOfDay(dataInicio).toISOString());
      }
      if (dataFim) {
        query = query.lte("data_transacao", endOfDay(dataFim).toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      setTransacoes(data || []);
    } catch (error: any) {
      console.error("Erro ao buscar movimentações:", error.message);
    } finally {
      setLoading(false);
    }
  }, [projetoId, dataInicio, dataFim, fetchBookmakers, fetchContasBancarias, fetchWallets, fetchAllBookmakers, fetchParceiros]);

  useEffect(() => {
    fetchTransacoes();
  }, [fetchTransacoes]);

  // Filtrar transações por tipo
  const transacoesFiltradas = useMemo(() => {
    if (filtroTipo === "TODOS") return transacoes;
    if (filtroTipo === "APORTE_FINANCEIRO") {
      return transacoes.filter(t => 
        ["APORTE_FIAT", "APORTE_CRYPTO", "LIQUIDACAO_FIAT", "LIQUIDACAO_CRYPTO"].includes(t.tipo_transacao)
      );
    }
    return transacoes.filter(t => t.tipo_transacao === filtroTipo);
  }, [transacoes, filtroTipo]);

  // Calcular totais
  const totais = useMemo(() => {
    const depositos = transacoes
      .filter(t => t.tipo_transacao === "DEPOSITO")
      .reduce((acc, t) => acc + t.valor, 0);
    const saques = transacoes
      .filter(t => t.tipo_transacao === "SAQUE")
      .reduce((acc, t) => acc + t.valor, 0);
    return { depositos, saques, saldo: depositos - saques };
  }, [transacoes]);

  const handlePeriodoRapido = (dias: number | null) => {
    if (dias === null) {
      setDataInicio(undefined);
      setDataFim(undefined);
    } else if (dias === 0) {
      setDataInicio(startOfDay(new Date()));
      setDataFim(endOfDay(new Date()));
    } else {
      setDataInicio(subDays(new Date(), dias));
      setDataFim(new Date());
    }
  };

  const getPeriodoAtivo = () => {
    if (!dataInicio && !dataFim) return "todos";
    if (dataInicio && dataFim && isToday(dataInicio) && isToday(dataFim)) return "hoje";
    const hoje = new Date();
    const diffDays = dataInicio ? Math.floor((hoje.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24)) : null;
    if (diffDays === 7) return "7dias";
    if (diffDays === 30) return "30dias";
    return "custom";
  };

  // Função para obter bookmaker (do projeto ou global)
  const getBookmaker = (id: string | null) => {
    if (!id) return null;
    return bookmakers[id] || allBookmakers[id] || null;
  };

  const getOrigemInfo = (transacao: Transacao): { primary: string; secondary?: string } => {
    if (transacao.origem_tipo === "CAIXA_OPERACIONAL") {
      return { primary: "Caixa Operacional" };
    }
    
    if (transacao.origem_bookmaker_id) {
      const bk = getBookmaker(transacao.origem_bookmaker_id);
      const parceiroNome = bk?.parceiro_id ? parceiros[bk.parceiro_id] : undefined;
      return { 
        primary: bk?.nome || "Bookmaker",
        secondary: parceiroNome
      };
    }
    
    if (transacao.origem_conta_bancaria_id && contasBancarias[transacao.origem_conta_bancaria_id]) {
      const conta = contasBancarias[transacao.origem_conta_bancaria_id];
      return { primary: conta.banco, secondary: conta.titular };
    }
    
    if (transacao.origem_wallet_id && wallets[transacao.origem_wallet_id]) {
      const wallet = wallets[transacao.origem_wallet_id];
      const parceiroNome = wallet.parceiro_id ? parceiros[wallet.parceiro_id] : undefined;
      return { 
        primary: wallet.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET',
        secondary: parceiroNome
      };
    }
    
    if (transacao.nome_investidor) return { primary: transacao.nome_investidor };
    return { primary: "Origem" };
  };

  const getDestinoInfo = (transacao: Transacao): { primary: string; secondary?: string } => {
    if (transacao.destino_tipo === "CAIXA_OPERACIONAL") {
      return { primary: "Caixa Operacional" };
    }
    
    if (transacao.destino_bookmaker_id) {
      const bk = getBookmaker(transacao.destino_bookmaker_id);
      const parceiroNome = bk?.parceiro_id ? parceiros[bk.parceiro_id] : undefined;
      return { 
        primary: bk?.nome || "Bookmaker",
        secondary: parceiroNome
      };
    }
    
    if (transacao.destino_conta_bancaria_id && contasBancarias[transacao.destino_conta_bancaria_id]) {
      const conta = contasBancarias[transacao.destino_conta_bancaria_id];
      return { primary: conta.banco, secondary: conta.titular };
    }
    
    if (transacao.destino_wallet_id && wallets[transacao.destino_wallet_id]) {
      const wallet = wallets[transacao.destino_wallet_id];
      const parceiroNome = wallet.parceiro_id ? parceiros[wallet.parceiro_id] : undefined;
      return { 
        primary: wallet.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET',
        secondary: parceiroNome
      };
    }
    
    if (transacao.nome_investidor) return { primary: transacao.nome_investidor };
    return { primary: "Destino" };
  };

  const getOrigemIcon = (transacao: Transacao) => {
    if (transacao.origem_bookmaker_id) {
      const bk = getBookmaker(transacao.origem_bookmaker_id);
      const logoUrl = bk?.logo_url || getLogoUrl(bk?.nome || '');
      if (logoUrl) {
        return (
          <img 
            src={logoUrl} 
            alt={bk?.nome} 
            className="h-5 w-5 rounded object-contain bg-background shrink-0"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        );
      }
    }
    if (transacao.origem_wallet_id) {
      return <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
    if (transacao.origem_conta_bancaria_id) {
      return <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
    if (transacao.origem_tipo === "CAIXA_OPERACIONAL") {
      return <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
    return <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />;
  };

  const getDestinoIcon = (transacao: Transacao) => {
    if (transacao.destino_bookmaker_id) {
      const bk = getBookmaker(transacao.destino_bookmaker_id);
      const logoUrl = bk?.logo_url || getLogoUrl(bk?.nome || '');
      if (logoUrl) {
        return (
          <img 
            src={logoUrl} 
            alt={bk?.nome} 
            className="h-5 w-5 rounded object-contain bg-background shrink-0"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        );
      }
    }
    if (transacao.destino_wallet_id) {
      return <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
    if (transacao.destino_conta_bancaria_id) {
      return <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
    if (transacao.destino_tipo === "CAIXA_OPERACIONAL") {
      return <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
    return <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Depósitos</CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {formatCurrency(totais.depositos, "BRL")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saques</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">
              {formatCurrency(totais.saques, "BRL")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Período</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totais.saldo >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatCurrency(totais.saldo, "BRL")}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Movimentações do Projeto</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchTransacoes}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tipo de transação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos os tipos</SelectItem>
                  <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
                  <SelectItem value="DEPOSITO">Depósito</SelectItem>
                  <SelectItem value="SAQUE">Saque</SelectItem>
                  <SelectItem value="APORTE_FINANCEIRO">Aporte & Liquidação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[130px] justify-start text-left text-sm">
                    {dataInicio ? format(dataInicio, "dd/MM/yyyy") : "Data início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent 
                    mode="single" 
                    selected={dataInicio} 
                    onSelect={setDataInicio} 
                    locale={ptBR}
                    initialFocus 
                    className="pointer-events-auto" 
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground text-sm">até</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[130px] justify-start text-left text-sm">
                    {dataFim ? format(dataFim, "dd/MM/yyyy") : "Data fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent 
                    mode="single" 
                    selected={dataFim} 
                    onSelect={setDataFim}
                    locale={ptBR}
                    initialFocus 
                    className="pointer-events-auto" 
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Atalhos de período */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Período:</span>
            {[
              { key: "hoje", label: "Hoje", dias: 0 },
              { key: "7dias", label: "7 dias", dias: 7 },
              { key: "30dias", label: "30 dias", dias: 30 },
              { key: "todos", label: "Todo período", dias: null },
            ].map((p) => (
              <Button
                key={p.key}
                variant={getPeriodoAtivo() === p.key ? "default" : "outline"}
                size="sm"
                onClick={() => handlePeriodoRapido(p.dias)}
                className="h-7 px-3 text-xs"
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* Lista de transações */}
          <ScrollArea className="h-[400px]">
            {transacoesFiltradas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                <p>Nenhuma movimentação encontrada</p>
                <p className="text-sm">Ajuste os filtros ou período</p>
              </div>
            ) : (
              <div className="space-y-2">
                {transacoesFiltradas.map((transacao) => {
                  const tipoConfig = getTipoConfig(transacao.tipo_transacao);
                  const origemBookmaker = transacao.origem_bookmaker_id ? bookmakers[transacao.origem_bookmaker_id] : null;
                  const destinoBookmaker = transacao.destino_bookmaker_id ? bookmakers[transacao.destino_bookmaker_id] : null;
                  
                  return (
                    <div 
                      key={transacao.id} 
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Tipo */}
                        <Badge className={`${tipoConfig.color} gap-1 shrink-0`}>
                          {tipoConfig.icon}
                          {tipoConfig.label}
                        </Badge>

                        {/* Origem → Destino */}
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {/* Origem */}
                          {(() => {
                            const origemInfo = getOrigemInfo(transacao);
                            return (
                              <div className="flex items-center gap-2">
                                {getOrigemIcon(transacao)}
                                <div className="flex flex-col min-w-0">
                                  <span className="text-sm text-muted-foreground truncate">{origemInfo.primary}</span>
                                  {origemInfo.secondary && (
                                    <span className="text-xs text-muted-foreground/70 truncate">{origemInfo.secondary}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          <ArrowRight className="h-4 w-4 text-primary shrink-0" />

                          {/* Destino */}
                          {(() => {
                            const destinoInfo = getDestinoInfo(transacao);
                            return (
                              <div className="flex items-center gap-2">
                                {getDestinoIcon(transacao)}
                                <div className="flex flex-col min-w-0">
                                  <span className="text-sm text-muted-foreground truncate">{destinoInfo.primary}</span>
                                  {destinoInfo.secondary && (
                                    <span className="text-xs text-muted-foreground/70 truncate">{destinoInfo.secondary}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Valor e Data */}
                      <div className="flex items-center gap-4 shrink-0">
                        {/* Mostrar badge de status para TODOS os tipos com status não-confirmado */}
                        {transacao.status !== "CONFIRMADO" && getStatusBadge(transacao.status)}
                        <div className="text-right">
                          <p className={`font-semibold ${
                            transacao.tipo_transacao === "DEPOSITO" 
                              ? (transacao.status === "CONFIRMADO" ? "text-emerald-400" : "text-yellow-400")
                              : transacao.tipo_transacao === "SAQUE" ? "text-red-400" : ""
                          }`}>
                            {formatCurrency(transacao.valor, transacao.moeda)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseLocalDateTime(transacao.data_transacao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <div className="text-sm text-muted-foreground text-center pt-2 border-t">
            {transacoesFiltradas.length} movimentações encontradas
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
