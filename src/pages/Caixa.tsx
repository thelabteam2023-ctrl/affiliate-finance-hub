import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCotacoes } from "@/hooks/useCotacoes";
import { Button } from "@/components/ui/button";
import { Plus, TrendingUp, TrendingDown, Wallet, AlertCircle, ArrowRight, Calendar, Filter, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CaixaTransacaoDialog } from "@/components/caixa/CaixaTransacaoDialog";
import { CaixaRelatorios } from "@/components/caixa/CaixaRelatorios";
import { SaldosParceirosSheet } from "@/components/caixa/SaldosParceirosSheet";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

interface LocationState {
  openDialog?: boolean;
}

interface Transacao {
  id: string;
  data_transacao: string;
  tipo_transacao: string;
  tipo_moeda: string;
  moeda: string;
  coin: string | null;
  valor: number;
  valor_usd: number | null;
  qtd_coin: number | null;
  origem_tipo: string | null;
  destino_tipo: string | null;
  descricao: string | null;
  status: string;
  origem_parceiro_id: string | null;
  origem_conta_bancaria_id: string | null;
  origem_wallet_id: string | null;
  origem_bookmaker_id: string | null;
  destino_parceiro_id: string | null;
  destino_conta_bancaria_id: string | null;
  destino_wallet_id: string | null;
  destino_bookmaker_id: string | null;
  nome_investidor: string | null;
}

interface SaldoFiat {
  moeda: string;
  saldo: number;
}

interface SaldoCrypto {
  coin: string;
  saldo_coin: number;
  saldo_usd: number;
}

export default function Caixa() {
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as LocationState | null;
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [saldosFiat, setSaldosFiat] = useState<SaldoFiat[]>([]);
  const [saldosCrypto, setSaldosCrypto] = useState<SaldoCrypto[]>([]);
  const [loading, setLoading] = useState(true);

  // Hook centralizado de cotações
  const cryptoSymbols = useMemo(() => saldosCrypto.map(s => s.coin), [saldosCrypto]);
  const { cotacaoUSD, cryptoPrices, getCryptoUSDValue } = useCotacoes(cryptoSymbols);
  
  // Filters
  const [filtroTipo, setFiltroTipo] = useState<string>("TODOS");
  const [dataInicio, setDataInicio] = useState<Date | undefined>(subDays(new Date(), 30));
  const [dataFim, setDataFim] = useState<Date | undefined>(new Date());
  
  // Data for displaying names
  const [parceiros, setParceiros] = useState<{ [key: string]: string }>({});
  const [contas, setContas] = useState<{ [key: string]: string }>({});
  const [contasBancarias, setContasBancarias] = useState<Array<{ id: string; banco: string; titular: string }>>([]);
  const [wallets, setWallets] = useState<{ [key: string]: string }>({});
  const [walletsDetalhes, setWalletsDetalhes] = useState<Array<{ id: string; exchange: string; endereco: string; network: string; parceiro_id: string }>>([]);
  const [bookmakers, setBookmakers] = useState<{ [key: string]: string }>({});

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch transactions
      const { data: transacoesData, error: transacoesError } = await supabase
        .from("cash_ledger")
        .select("*")
        .order("data_transacao", { ascending: false })
        .limit(50);

      if (transacoesError) throw transacoesError;
      setTransacoes(transacoesData || []);

      // Fetch reference data for names
      const { data: parceirosData } = await supabase
        .from("parceiros")
        .select("id, nome");
      
      const { data: contasData } = await supabase
        .from("contas_bancarias")
        .select("id, banco, titular");
      
      const { data: walletsData } = await supabase
        .from("wallets_crypto")
        .select("id, exchange, endereco, network, parceiro_id");
      
      const { data: bookmakersData } = await supabase
        .from("bookmakers")
        .select("id, nome");

      // Create lookup maps
      const parceirosMap: { [key: string]: string } = {};
      parceirosData?.forEach(p => parceirosMap[p.id] = p.nome);
      setParceiros(parceirosMap);

      const contasMap: { [key: string]: string } = {};
      contasData?.forEach(c => contasMap[c.id] = c.banco);
      setContas(contasMap);
      setContasBancarias(contasData || []);

      const walletsMap: { [key: string]: string } = {};
      walletsData?.forEach(w => walletsMap[w.id] = w.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET');
      setWallets(walletsMap);
      setWalletsDetalhes(walletsData || []);

      const bookmakersMap: { [key: string]: string } = {};
      bookmakersData?.forEach(b => bookmakersMap[b.id] = b.nome);
      setBookmakers(bookmakersMap);

      // Fetch FIAT balances
      const { data: saldosFiatData, error: fiatError } = await supabase
        .from("v_saldo_caixa_fiat")
        .select("*");

      if (fiatError) throw fiatError;
      setSaldosFiat(saldosFiatData || []);

      // Fetch CRYPTO balances
      const { data: saldosCryptoData, error: cryptoError } = await supabase
        .from("v_saldo_caixa_crypto")
        .select("*");

      if (cryptoError) throw cryptoError;
      setSaldosCrypto(saldosCryptoData || []);

    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handle navigation state to open dialog
  useEffect(() => {
    if (locationState?.openDialog) {
      setDialogOpen(true);
      // Clear state to prevent reopening on refresh
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [locationState]);
  const getTotalCryptoUSD = () => {
    return saldosCrypto.reduce((acc, s) => {
      return acc + getCryptoUSDValue(s.coin, s.saldo_coin, s.saldo_usd);
    }, 0);
  };

  const getTransacoesFiltradas = () => {
    return transacoes.filter((t) => {
      const dataTransacao = new Date(t.data_transacao);
      const matchDataInicio = !dataInicio || dataTransacao >= startOfDay(dataInicio);
      const matchDataFim = !dataFim || dataTransacao <= endOfDay(dataFim);
      
      // Include both APORTE and LIQUIDACAO when filter is APORTE_FINANCEIRO
      const matchTipo = filtroTipo === "TODOS" || 
        (filtroTipo === "APORTE_FINANCEIRO" && (t.tipo_transacao === "APORTE" || t.tipo_transacao === "LIQUIDACAO")) ||
        t.tipo_transacao === filtroTipo;
      
      return matchTipo && matchDataInicio && matchDataFim;
    });
  };

  const getChartData = () => {
    if (transacoes.length === 0) return [];

    // Sort transactions by date
    const sortedTransacoes = [...transacoes].sort(
      (a, b) => new Date(a.data_transacao).getTime() - new Date(b.data_transacao).getTime()
    );

    const dataPoints: { [key: string]: any } = {};

    sortedTransacoes.forEach((t) => {
      const dateKey = format(new Date(t.data_transacao), "dd/MM");
      
      if (!dataPoints[dateKey]) {
        dataPoints[dateKey] = { date: dateKey, BRL: 0, USD: 0, EUR: 0, Crypto: 0 };
      }

      // Calculate balance impact
      const valorImpacto = t.tipo_transacao === "APORTE" || t.destino_tipo === "CAIXA_OPERACIONAL"
        ? t.valor
        : t.tipo_transacao === "LIQUIDACAO" || t.origem_tipo === "CAIXA_OPERACIONAL"
        ? -t.valor
        : 0;

      if (t.tipo_moeda === "FIAT") {
        if (dataPoints[dateKey][t.moeda] !== undefined) {
          dataPoints[dateKey][t.moeda] += valorImpacto;
        }
      } else if (t.tipo_moeda === "CRYPTO" && t.valor_usd) {
        dataPoints[dateKey].Crypto += t.valor_usd;
      }
    });

    // Convert to array and accumulate values
    const chartData: any[] = [];
    let accumulatedBRL = 0;
    let accumulatedUSD = 0;
    let accumulatedEUR = 0;
    let accumulatedCrypto = 0;

    Object.keys(dataPoints).forEach((date) => {
      accumulatedBRL += dataPoints[date].BRL || 0;
      accumulatedUSD += dataPoints[date].USD || 0;
      accumulatedEUR += dataPoints[date].EUR || 0;
      accumulatedCrypto += dataPoints[date].Crypto || 0;

      chartData.push({
        date,
        BRL: accumulatedBRL,
        USD: accumulatedUSD,
        EUR: accumulatedEUR,
        Crypto: accumulatedCrypto,
      });
    });

    return chartData;
  };

  const getTipoLabel = (tipo: string, transacao?: Transacao) => {
    // Para APORTE_FINANCEIRO, determinamos se é Aporte ou Liquidação pela direção
    if (tipo === "APORTE_FINANCEIRO" && transacao) {
      // Se destino é CAIXA_OPERACIONAL → é Aporte (Investidor → Caixa)
      if (transacao.destino_tipo === "CAIXA_OPERACIONAL") {
        return "Aporte";
      }
      // Se origem é CAIXA_OPERACIONAL → é Liquidação (Caixa → Investidor)
      if (transacao.origem_tipo === "CAIXA_OPERACIONAL") {
        return "Liquidação";
      }
    }
    
    const labels: { [key: string]: string } = {
      APORTE: "Aporte",
      LIQUIDACAO: "Liquidação",
      TRANSFERENCIA: "Transferência",
      DEPOSITO: "Depósito",
      SAQUE: "Saque",
    };
    return labels[tipo] || tipo;
  };

  const getTipoColor = (tipo: string, transacao?: Transacao) => {
    // Para APORTE_FINANCEIRO, determinamos a cor pela direção
    if (tipo === "APORTE_FINANCEIRO" && transacao) {
      // Se destino é CAIXA_OPERACIONAL → é Aporte (verde)
      if (transacao.destino_tipo === "CAIXA_OPERACIONAL") {
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      }
      // Se origem é CAIXA_OPERACIONAL → é Liquidação (amarelo)
      if (transacao.origem_tipo === "CAIXA_OPERACIONAL") {
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      }
    }
    
    const colors: { [key: string]: string } = {
      APORTE: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      LIQUIDACAO: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      TRANSFERENCIA: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      DEPOSITO: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      SAQUE: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    };
    return colors[tipo] || "bg-muted text-muted-foreground";
  };

  const formatCurrency = (value: number, currency: string) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency,
    }).format(value);
  };

  const getOrigemLabel = (transacao: Transacao): string => {
    // Para APORTE_FINANCEIRO, verificamos o fluxo pela direção
    if (transacao.tipo_transacao === "APORTE_FINANCEIRO") {
      // Se destino é CAIXA_OPERACIONAL, é um aporte (Investidor → Caixa)
      if (transacao.destino_tipo === "CAIXA_OPERACIONAL") {
        return transacao.nome_investidor || "Investidor Externo";
      }
      // Se origem é CAIXA_OPERACIONAL, é uma liquidação (Caixa → Investidor)
      if (transacao.origem_tipo === "CAIXA_OPERACIONAL") {
        return "Caixa Operacional";
      }
    }
    
    if (transacao.tipo_transacao === "APORTE") {
      return transacao.nome_investidor || "Investidor Externo";
    }
    
    if (transacao.tipo_transacao === "LIQUIDACAO") {
      return "Caixa Operacional";
    }
    
    if (transacao.origem_tipo === "CAIXA_OPERACIONAL") {
      return "Caixa Operacional";
    }
    
    if (transacao.origem_tipo === "PARCEIRO_CONTA" && transacao.origem_conta_bancaria_id) {
      return contas[transacao.origem_conta_bancaria_id] || "Conta Bancária";
    }
    
    if (transacao.origem_tipo === "PARCEIRO_WALLET" && transacao.origem_wallet_id) {
      return wallets[transacao.origem_wallet_id] || "Wallet";
    }
    
    if (transacao.origem_tipo === "BOOKMAKER" && transacao.origem_bookmaker_id) {
      return bookmakers[transacao.origem_bookmaker_id] || "Bookmaker";
    }
    
    return "Origem";
  };

  const getDestinoLabel = (transacao: Transacao): string => {
    // Para APORTE_FINANCEIRO, verificamos o fluxo pela direção
    if (transacao.tipo_transacao === "APORTE_FINANCEIRO") {
      // Se destino é CAIXA_OPERACIONAL, é um aporte (Investidor → Caixa)
      if (transacao.destino_tipo === "CAIXA_OPERACIONAL") {
        return "Caixa Operacional";
      }
      // Se origem é CAIXA_OPERACIONAL, é uma liquidação (Caixa → Investidor)
      if (transacao.origem_tipo === "CAIXA_OPERACIONAL") {
        return transacao.nome_investidor || "Investidor Externo";
      }
    }
    
    if (transacao.tipo_transacao === "APORTE") {
      return "Caixa Operacional";
    }
    
    if (transacao.tipo_transacao === "LIQUIDACAO") {
      return transacao.nome_investidor || "Investidor Externo";
    }
    
    if (transacao.destino_tipo === "CAIXA_OPERACIONAL") {
      return "Caixa Operacional";
    }
    
    if (transacao.destino_tipo === "PARCEIRO_CONTA" && transacao.destino_conta_bancaria_id) {
      return contas[transacao.destino_conta_bancaria_id] || "Conta Bancária";
    }
    
    if (transacao.destino_tipo === "PARCEIRO_WALLET" && transacao.destino_wallet_id) {
      return wallets[transacao.destino_wallet_id] || "Wallet";
    }
    
    if (transacao.destino_tipo === "BOOKMAKER" && transacao.destino_bookmaker_id) {
      return bookmakers[transacao.destino_bookmaker_id] || "Bookmaker";
    }
    
    return "Destino";
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Caixa Operacional</h1>
          <p className="text-muted-foreground">
            Gestão centralizada de movimentações financeiras
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SaldosParceirosSheet />
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Transação
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Saldos FIAT consolidados */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldos FIAT</CardTitle>
            <Wallet className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {saldosFiat.map((saldoFiat) => (
                <div key={saldoFiat.moeda} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{saldoFiat.moeda}</span>
                  <span className="text-lg font-bold text-emerald-400">
                    {formatCurrency(saldoFiat.saldo, saldoFiat.moeda)}
                  </span>
                </div>
              ))}
              {saldosFiat.length === 0 && (
                <div className="text-sm text-muted-foreground italic">Nenhum saldo FIAT</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Exposição Crypto com Popover */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Exposição Crypto (USD)</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-blue-400">
                {formatCurrency(getTotalCryptoUSD(), "USD")}
              </span>
              {saldosCrypto.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-full hover:bg-blue-500/20"
                    >
                      <Info className="h-4 w-4 text-muted-foreground hover:text-blue-400 transition-colors" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent 
                    className="w-auto min-w-[240px] z-50 bg-popover" 
                    align="start"
                    side="right"
                    sideOffset={8}
                  >
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground mb-2">Cotações em tempo real (Binance)</p>
                      <div className={`grid gap-3 ${saldosCrypto.length > 3 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {saldosCrypto.map((saldo) => {
                          const price = cryptoPrices[saldo.coin];
                          const usdValue = getCryptoUSDValue(saldo.coin, saldo.saldo_coin, saldo.saldo_usd);
                          return (
                            <div key={saldo.coin} className="flex items-center justify-between gap-4 text-sm">
                              <div>
                                <span className="font-medium">{saldo.coin}</span>
                                {price && (
                                  <div className="text-[10px] text-blue-400">
                                    ${price.toFixed(price < 1 ? 6 : 2)}
                                  </div>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="font-mono text-xs">{saldo.saldo_coin.toFixed(saldo.saldo_coin < 1 ? 8 : 2)}</div>
                                <div className="text-xs text-muted-foreground">
                                  ≈ {formatCurrency(usdValue, "USD")}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Evolução */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Evolução dos Saldos</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={getChartData()}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="BRL" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="USD" stroke="#3b82f6" strokeWidth={2} />
              <Line type="monotone" dataKey="EUR" stroke="#f59e0b" strokeWidth={2} />
              <Line type="monotone" dataKey="Crypto" stroke="#8b5cf6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>


      {/* Relatórios Consolidados */}
      <CaixaRelatorios
        transacoes={transacoes}
        parceiros={parceiros}
        contas={contas}
        contasBancarias={contasBancarias}
        wallets={wallets}
        walletsDetalhes={walletsDetalhes}
        bookmakers={bookmakers}
        loading={loading}
        filtroTipo={filtroTipo}
        setFiltroTipo={setFiltroTipo}
        dataInicio={dataInicio}
        setDataInicio={setDataInicio}
        dataFim={dataFim}
        setDataFim={setDataFim}
        getTransacoesFiltradas={getTransacoesFiltradas}
        getTipoLabel={getTipoLabel}
        getTipoColor={getTipoColor}
        getOrigemLabel={getOrigemLabel}
        getDestinoLabel={getDestinoLabel}
        formatCurrency={formatCurrency}
      />

      {/* Dialog */}
      <CaixaTransacaoDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={() => {
          setDialogOpen(false);
          fetchData();
        }}
      />
    </div>
  );
}
