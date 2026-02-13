import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wallet, Building2, Bitcoin, Loader2, AlertTriangle } from "lucide-react";
import { useCotacoes } from "@/hooks/useCotacoes";

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
  parceiro_id: string;
  moeda: string[] | null;
}

interface Parceiro {
  id: string;
  nome: string;
}

interface SaldoParceiroContas {
  conta_id: string;
  parceiro_id: string;
  saldo: number;
  moeda: string;
}

interface SaldoParceiroWallets {
  wallet_id: string;
  parceiro_id: string;
  coin: string;
  saldo_usd: number;
  saldo_coin: number;
}

interface SaldoCaixaFiat {
  moeda: string;
  saldo: number;
}

interface SaldoCaixaCrypto {
  coin: string;
  saldo_usd: number;
  saldo_coin: number;
}

export interface OrigemPagamentoData {
  origemTipo: "CAIXA_OPERACIONAL" | "PARCEIRO_CONTA" | "PARCEIRO_WALLET";
  origemParceiroId?: string;
  origemContaBancariaId?: string;
  origemWalletId?: string;
  tipoMoeda: "FIAT" | "CRYPTO";
  moeda: string;
  coin?: string;
  cotacao?: number;
  /** Preço da crypto em USD (para BTC, ETH, etc.) - stablecoins = 1 */
  coinPriceUSD?: number;
  saldoDisponivel: number;
  saldoInsuficiente?: boolean;
}

interface OrigemPagamentoSelectProps {
  value: OrigemPagamentoData;
  onChange: (data: OrigemPagamentoData) => void;
  valorPagamento: number;
  disabled?: boolean;
  /** Em modo edição, valor original já debitado que deve ser devolvido ao saldo para validação */
  valorCreditoEdicao?: number;
}

export function OrigemPagamentoSelect({
  value,
  onChange,
  valorPagamento,
  disabled = false,
  valorCreditoEdicao = 0,
}: OrigemPagamentoSelectProps) {
  // Valor efetivo para comparação de saldo: desconta o crédito virtual da edição
  const valorEfetivo = Math.max(0, valorPagamento - valorCreditoEdicao);
  const [loading, setLoading] = useState(true);
  
  // Data
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [walletsCrypto, setWalletsCrypto] = useState<WalletCrypto[]>([]);
  const [saldosCaixaFiat, setSaldosCaixaFiat] = useState<SaldoCaixaFiat[]>([]);
  const [saldosCaixaCrypto, setSaldosCaixaCrypto] = useState<SaldoCaixaCrypto[]>([]);
  const [saldosParceirosContas, setSaldosParceirosContas] = useState<SaldoParceiroContas[]>([]);
  const [saldosParceirosWallets, setSaldosParceirosWallets] = useState<SaldoParceiroWallets[]>([]);

  // Flag para indicar que os dados foram carregados
  const [dataLoaded, setDataLoaded] = useState(false);

  // Extrair lista de moedas crypto únicas para buscar cotações em tempo real
  const cryptoCoins = [...new Set([
    ...saldosCaixaCrypto.map(s => s.coin),
    ...saldosParceirosWallets.map(s => s.coin)
  ])].filter(Boolean);

  // Usar hook de cotações com as moedas crypto detectadas
  const { cotacaoUSD, getCryptoPrice, loading: cotacoesLoading } = useCotacoes(cryptoCoins);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [
        parceirosRes,
        contasRes,
        walletsRes,
        saldoFiatRes,
        saldoCryptoRes,
        saldoContasRes,
        saldoWalletsRes,
      ] = await Promise.all([
        supabase.from("parceiros").select("id, nome").eq("status", "ativo").order("nome"),
        supabase.from("contas_bancarias").select("id, banco, titular, parceiro_id").order("banco"),
        supabase.from("wallets_crypto").select("id, exchange, endereco, parceiro_id, moeda").order("exchange"),
        supabase.from("v_saldo_caixa_fiat").select("moeda, saldo"),
        supabase.from("v_saldo_caixa_crypto").select("coin, saldo_usd, saldo_coin"),
        supabase.from("v_saldo_parceiro_contas").select("conta_id, parceiro_id, saldo, moeda"),
        supabase.from("v_saldo_parceiro_wallets").select("wallet_id, parceiro_id, coin, saldo_usd, saldo_coin"),
      ]);

      setParceiros(parceirosRes.data || []);
      setContasBancarias(contasRes.data || []);
      setWalletsCrypto(walletsRes.data || []);
      setSaldosCaixaFiat(saldoFiatRes.data || []);
      setSaldosCaixaCrypto(saldoCryptoRes.data || []);
      setSaldosParceirosContas(saldoContasRes.data || []);
      setSaldosParceirosWallets(saldoWalletsRes.data || []);
      setDataLoaded(true);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate Caixa Operacional FIAT balance
  const getSaldoCaixaFiat = () => {
    const saldo = saldosCaixaFiat.find(s => s.moeda === "BRL");
    return saldo?.saldo || 0;
  };

  // Obter preço da crypto em USD (usa cotação real-time da Binance)
  const getCoinPriceUSD = (coin: string): number => {
    // Stablecoins = 1 USD
    if (coin === "USDT" || coin === "USDC") return 1;
    // Buscar cotação real-time
    const price = getCryptoPrice(coin);
    return price ?? 0;
  };

  // Get Caixa Operacional CRYPTO balance by coin
  const getSaldoCaixaCryptoByCoin = (coin: string) => {
    const saldo = saldosCaixaCrypto.find(s => s.coin === coin);
    const saldoCoin = saldo?.saldo_coin || 0;
    const priceUSD = getCoinPriceUSD(coin);
    const saldoUSD = saldoCoin * priceUSD;
    return {
      saldoCoin,
      saldoUSD,
      saldoBRL: saldoUSD * cotacaoUSD,
      priceUSD,
    };
  };

  // Get total crypto balance
  const getTotalCryptoSaldo = () => {
    let totalUSD = 0;
    for (const s of saldosCaixaCrypto) {
      const priceUSD = getCoinPriceUSD(s.coin);
      totalUSD += (s.saldo_coin || 0) * priceUSD;
    }
    return totalUSD * cotacaoUSD;
  };

  // Get partner account balance
  const getSaldoContaParceiro = (contaId: string) => {
    const saldo = saldosParceirosContas.find(s => s.conta_id === contaId);
    return saldo?.saldo || 0;
  };

  // Get partner wallet balance in USD and coin (usando cotações em tempo real)
  const getSaldoWalletParceiro = (walletId: string) => {
    const saldo = saldosParceirosWallets.find(s => s.wallet_id === walletId);
    const coin = saldo?.coin || "USDT";
    const saldoCoin = saldo?.saldo_coin || 0;
    const priceUSD = getCoinPriceUSD(coin);
    const saldoUSD = saldoCoin * priceUSD;
    return {
      coin,
      saldoCoin,
      saldoUSD,
      saldoBRL: saldoUSD * cotacaoUSD,
      priceUSD,
    };
  };

  // Filter accounts by selected partner
  const contasParceiroSelecionado = contasBancarias.filter(
    c => c.parceiro_id === value.origemParceiroId
  );

  // Filter wallets by selected partner
  const walletsParceiroSelecionado = walletsCrypto.filter(
    w => w.parceiro_id === value.origemParceiroId
  );

  // 🔒 VALIDAÇÃO CENTRALIZADA DE SALDO (usa cotações em tempo real)
  const calcularSaldoEValidar = (origemTipo: string, tipoMoeda: string, coin?: string, contaId?: string, walletId?: string, saldosFiat?: SaldoCaixaFiat[], saldosCrypto?: SaldoCaixaCrypto[], saldosContas?: SaldoParceiroContas[], saldosWallets?: SaldoParceiroWallets[]) => {
    let saldoDisponivel = 0;

    // Usar arrays passados ou os do estado
    const fiat = saldosFiat || saldosCaixaFiat;
    const crypto = saldosCrypto || saldosCaixaCrypto;
    const contas = saldosContas || saldosParceirosContas;
    const wallets = saldosWallets || saldosParceirosWallets;

    if (origemTipo === "CAIXA_OPERACIONAL") {
      if (tipoMoeda === "FIAT") {
        const saldo = fiat.find(s => s.moeda === "BRL");
        saldoDisponivel = saldo?.saldo || 0;
      } else if (coin) {
        // Usar cotação real-time da moeda
        const saldo = crypto.find(s => s.coin === coin);
        const saldoCoin = saldo?.saldo_coin || 0;
        const priceUSD = getCoinPriceUSD(coin);
        saldoDisponivel = saldoCoin * priceUSD * cotacaoUSD;
      } else {
        // Total de todas as cryptos
        let totalBRL = 0;
        for (const s of crypto) {
          const priceUSD = getCoinPriceUSD(s.coin);
          totalBRL += (s.saldo_coin || 0) * priceUSD * cotacaoUSD;
        }
        saldoDisponivel = totalBRL;
      }
    } else if (origemTipo === "PARCEIRO_CONTA" && contaId) {
      const saldo = contas.find(s => s.conta_id === contaId);
      saldoDisponivel = saldo?.saldo || 0;
    } else if (origemTipo === "PARCEIRO_WALLET" && walletId) {
      const saldo = wallets.find(s => s.wallet_id === walletId);
      const coinWallet = saldo?.coin || "USDT";
      const saldoCoin = saldo?.saldo_coin || 0;
      const priceUSD = getCoinPriceUSD(coinWallet);
      saldoDisponivel = saldoCoin * priceUSD * cotacaoUSD;
    }

    return {
      saldoDisponivel,
      saldoInsuficiente: valorEfetivo > 0 && saldoDisponivel < valorEfetivo,
    };
  };

  // 🔒 EFEITO CRÍTICO: Recalcula e propaga saldoInsuficiente quando dados são carregados ou valor muda
  useEffect(() => {
    if (!dataLoaded) return;

    const { saldoDisponivel, saldoInsuficiente } = calcularSaldoEValidar(
      value.origemTipo,
      value.tipoMoeda,
      value.coin,
      value.origemContaBancariaId,
      value.origemWalletId
    );

    // 🔒 Propagar cotação e preço da crypto quando disponíveis
    let newCotacao = value.cotacao;
    let newCoinPriceUSD = value.coinPriceUSD;
    
    if (value.tipoMoeda === "CRYPTO") {
      newCotacao = cotacaoUSD;
      if (value.coin) {
        newCoinPriceUSD = getCoinPriceUSD(value.coin);
      }
    }

    // Só atualiza se houver diferença para evitar loop infinito
    const needsUpdate = 
      value.saldoDisponivel !== saldoDisponivel || 
      value.saldoInsuficiente !== saldoInsuficiente ||
      (value.tipoMoeda === "CRYPTO" && value.cotacao !== newCotacao) ||
      (value.tipoMoeda === "CRYPTO" && value.coinPriceUSD !== newCoinPriceUSD);
      
    if (needsUpdate) {
      onChange({
        ...value,
        saldoDisponivel,
        saldoInsuficiente,
        cotacao: value.tipoMoeda === "CRYPTO" ? newCotacao : value.cotacao,
        coinPriceUSD: value.tipoMoeda === "CRYPTO" ? newCoinPriceUSD : value.coinPriceUSD,
      });
    }
  }, [dataLoaded, valorPagamento, value.origemTipo, value.tipoMoeda, value.coin, value.origemContaBancariaId, value.origemWalletId, saldosCaixaFiat, saldosCaixaCrypto, saldosParceirosContas, saldosParceirosWallets, cotacaoUSD]);

  // Handle origem type change
  const handleOrigemTipoChange = (tipo: "CAIXA_OPERACIONAL" | "PARCEIRO_CONTA" | "PARCEIRO_WALLET") => {
    const tipoMoeda: "FIAT" | "CRYPTO" = tipo === "PARCEIRO_WALLET" ? "CRYPTO" : "FIAT";
    const moeda = tipoMoeda === "FIAT" ? "BRL" : "USD";
    
    // Para Caixa Crypto, pré-selecionar primeira moeda disponível
    const coinSelecionada = tipo === "CAIXA_OPERACIONAL" && saldosCaixaCrypto.length > 0 
      ? saldosCaixaCrypto[0].coin 
      : undefined;

    // Obter dados da moeda crypto selecionada
    const saldoCrypto = coinSelecionada ? getSaldoCaixaCryptoByCoin(coinSelecionada) : null;

    const { saldoDisponivel, saldoInsuficiente } = calcularSaldoEValidar(
      tipo, 
      tipoMoeda, 
      coinSelecionada
    );

    const newData: OrigemPagamentoData = {
      ...value,
      origemTipo: tipo,
      origemParceiroId: undefined,
      origemContaBancariaId: undefined,
      origemWalletId: undefined,
      tipoMoeda,
      moeda,
      coin: coinSelecionada,
      // 🔒 PROPAGAR cotação quando CRYPTO é selecionado
      cotacao: tipoMoeda === "CRYPTO" ? cotacaoUSD : undefined,
      coinPriceUSD: saldoCrypto?.priceUSD || 1,
      saldoDisponivel,
      saldoInsuficiente,
    };

    onChange(newData);
  };

  // Handle tipo moeda change for Caixa Operacional
  const handleTipoMoedaChange = (tipoMoeda: "FIAT" | "CRYPTO") => {
    const coinSelecionada = tipoMoeda === "CRYPTO" && saldosCaixaCrypto.length > 0 
      ? saldosCaixaCrypto[0].coin 
      : undefined;

    // Obter dados da moeda crypto selecionada
    const saldoCrypto = coinSelecionada ? getSaldoCaixaCryptoByCoin(coinSelecionada) : null;

    const { saldoDisponivel, saldoInsuficiente } = calcularSaldoEValidar(
      "CAIXA_OPERACIONAL",
      tipoMoeda,
      coinSelecionada
    );

    onChange({
      ...value,
      tipoMoeda,
      moeda: tipoMoeda === "FIAT" ? "BRL" : "USD",
      coin: coinSelecionada,
      // 🔒 PROPAGAR cotação e preço da crypto quando CRYPTO é selecionado
      cotacao: tipoMoeda === "CRYPTO" ? cotacaoUSD : undefined,
      coinPriceUSD: saldoCrypto?.priceUSD || 1,
      saldoDisponivel,
      saldoInsuficiente,
    });
  };

  // Handle coin selection for Caixa Crypto
  const handleCoinChange = (coin: string) => {
    const saldoCrypto = getSaldoCaixaCryptoByCoin(coin);
    const saldoInsuficiente = valorEfetivo > 0 && saldoCrypto.saldoBRL < valorEfetivo;

    onChange({
      ...value,
      coin,
      cotacao: cotacaoUSD,
      coinPriceUSD: saldoCrypto.priceUSD,
      saldoDisponivel: saldoCrypto.saldoBRL,
      saldoInsuficiente,
    });
  };

  // Handle partner selection
  const handleParceiroChange = (parceiroId: string) => {
    onChange({
      ...value,
      origemParceiroId: parceiroId,
      origemContaBancariaId: undefined,
      origemWalletId: undefined,
      saldoDisponivel: 0,
      saldoInsuficiente: valorEfetivo > 0,
    });
  };

  // Handle account selection
  const handleContaChange = (contaId: string) => {
    const saldo = getSaldoContaParceiro(contaId);
    onChange({
      ...value,
      origemContaBancariaId: contaId,
      saldoDisponivel: saldo,
      saldoInsuficiente: valorEfetivo > 0 && saldo < valorEfetivo,
    });
  };

  // Handle wallet selection
  const handleWalletChange = (walletId: string) => {
    const walletSaldo = getSaldoWalletParceiro(walletId);
    onChange({
      ...value,
      origemWalletId: walletId,
      saldoDisponivel: walletSaldo.saldoBRL,
      coin: walletSaldo.coin,
      cotacao: cotacaoUSD,
      coinPriceUSD: walletSaldo.priceUSD,
      saldoInsuficiente: valorEfetivo > 0 && walletSaldo.saldoBRL < valorEfetivo,
    });
  };

  const formatCurrency = (val: number, currency: string = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency,
    }).format(val);
  };

  const formatUSD = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(val);
  };

  const formatCoin = (val: number, coin: string) => {
    return `${val.toFixed(4)} ${coin}`;
  };

  // Get current saldo display
  const saldoCaixaFiat = getSaldoCaixaFiat();
  const saldoCaixaCryptoTotal = getTotalCryptoSaldo();
  
  // Check if insufficient based on current selection
  const isInsuficiente = value.saldoInsuficiente || (
    value.origemTipo === "CAIXA_OPERACIONAL" 
      ? (value.tipoMoeda === "FIAT" ? saldoCaixaFiat : (value.coin ? getSaldoCaixaCryptoByCoin(value.coin).saldoBRL : saldoCaixaCryptoTotal)) < valorEfetivo
      : value.saldoDisponivel < valorEfetivo
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium">Origem do Pagamento</Label>
      
      <RadioGroup
        value={value.origemTipo}
        onValueChange={(v) => handleOrigemTipoChange(v as any)}
        disabled={disabled}
        className="grid gap-2"
      >
        {/* Caixa Operacional Option */}
        <div className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
          value.origemTipo === "CAIXA_OPERACIONAL" 
            ? "border-primary bg-primary/5" 
            : "border-border hover:border-muted-foreground/50"
        }`}>
          <RadioGroupItem value="CAIXA_OPERACIONAL" id="caixa" />
          <label htmlFor="caixa" className="flex-1 cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                <span className="font-medium">Caixa Operacional</span>
              </div>
            </div>
          </label>
        </div>

        {/* Conta Bancária de Parceiro Option */}
        <div className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
          value.origemTipo === "PARCEIRO_CONTA" 
            ? "border-primary bg-primary/5" 
            : "border-border hover:border-muted-foreground/50"
        }`}>
          <RadioGroupItem value="PARCEIRO_CONTA" id="conta" />
          <label htmlFor="conta" className="flex-1 cursor-pointer">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-500" />
              <span className="font-medium">Conta de Parceiro (FIAT)</span>
            </div>
          </label>
        </div>

        {/* Wallet Crypto de Parceiro Option */}
        <div className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
          value.origemTipo === "PARCEIRO_WALLET" 
            ? "border-primary bg-primary/5" 
            : "border-border hover:border-muted-foreground/50"
        }`}>
          <RadioGroupItem value="PARCEIRO_WALLET" id="wallet" />
          <label htmlFor="wallet" className="flex-1 cursor-pointer">
            <div className="flex items-center gap-2">
              <Bitcoin className="h-4 w-4 text-orange-500" />
              <span className="font-medium">Wallet de Parceiro (CRYPTO)</span>
            </div>
          </label>
        </div>
      </RadioGroup>

      {/* Caixa Operacional - FIAT/CRYPTO selection */}
      {value.origemTipo === "CAIXA_OPERACIONAL" && (
        <div className="space-y-3 pt-2 border-t">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Tipo de Moeda</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleTipoMoedaChange("FIAT")}
                disabled={disabled}
                className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-colors ${
                  value.tipoMoeda === "FIAT"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-muted-foreground/50"
                }`}
              >
                <div className="flex flex-col items-center gap-1">
                  <span>FIAT (BRL)</span>
                  <span className={`text-xs ${saldoCaixaFiat < valorEfetivo && value.tipoMoeda === "FIAT" ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                    {formatCurrency(saldoCaixaFiat)}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleTipoMoedaChange("CRYPTO")}
                disabled={disabled || saldosCaixaCrypto.length === 0}
                className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-colors ${
                  value.tipoMoeda === "CRYPTO"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-muted-foreground/50"
                } ${saldosCaixaCrypto.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex flex-col items-center gap-1">
                  <span>CRYPTO</span>
                  <span className={`text-xs ${saldosCaixaCrypto.length === 0 ? "text-muted-foreground italic" : "text-muted-foreground"}`}>
                    {saldosCaixaCrypto.length === 0 ? "Sem saldo" : `≈ ${formatCurrency(saldoCaixaCryptoTotal)}`}
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Crypto coin selector */}
          {value.tipoMoeda === "CRYPTO" && saldosCaixaCrypto.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Selecione a Moeda</Label>
              <Select
                value={value.coin || ""}
                onValueChange={handleCoinChange}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha a moeda..." />
                </SelectTrigger>
                <SelectContent>
                  {saldosCaixaCrypto.map((crypto) => {
                    const saldoBRL = crypto.saldo_usd * cotacaoUSD;
                    const insuficiente = saldoBRL < valorEfetivo;
                    return (
                      <SelectItem key={crypto.coin} value={crypto.coin}>
                        <div className="flex items-center justify-between w-full gap-4">
                          <span className="font-medium">{crypto.coin}</span>
                          <div className="flex flex-col items-end text-xs">
                            <span className={insuficiente ? "text-destructive font-semibold" : "text-muted-foreground"}>
                              {formatCoin(crypto.saldo_coin, crypto.coin)}
                            </span>
                            <span className="text-muted-foreground/70">
                              ≈ {formatCurrency(saldoBRL)}
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Show selected balance for Caixa */}
          {value.tipoMoeda === "FIAT" && (
            <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
              saldoCaixaFiat < valorEfetivo && valorEfetivo > 0
                ? "bg-destructive/10 border border-destructive/30 text-destructive" 
                : "bg-muted/50 text-muted-foreground"
            }`}>
              {saldoCaixaFiat < valorEfetivo && valorEfetivo > 0 && (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              <span>
                Saldo disponível: {formatCurrency(saldoCaixaFiat)}
                {valorCreditoEdicao > 0 && <span className="ml-1">(+ {formatCurrency(valorCreditoEdicao)} crédito edição)</span>}
                {saldoCaixaFiat < valorEfetivo && valorEfetivo > 0 && (
                  <span className="ml-2 font-semibold">— Saldo insuficiente!</span>
                )}
              </span>
            </div>
          )}

          {value.tipoMoeda === "CRYPTO" && value.coin && (
            <div className="space-y-2">
              {/* Saldo disponível */}
              <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                getSaldoCaixaCryptoByCoin(value.coin).saldoBRL < valorEfetivo && valorEfetivo > 0
                  ? "bg-destructive/10 border border-destructive/30 text-destructive" 
                  : "bg-muted/50 text-muted-foreground"
              }`}>
                {getSaldoCaixaCryptoByCoin(value.coin).saldoBRL < valorEfetivo && valorEfetivo > 0 && (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                )}
                <span>
                  Saldo disponível: {formatCoin(getSaldoCaixaCryptoByCoin(value.coin).saldoCoin, value.coin)} 
                  {" "}≈ {formatCurrency(getSaldoCaixaCryptoByCoin(value.coin).saldoBRL)}
                  {getSaldoCaixaCryptoByCoin(value.coin).saldoBRL < valorEfetivo && valorEfetivo > 0 && (
                    <span className="ml-2 font-semibold">— Saldo insuficiente!</span>
                  )}
                </span>
              </div>
              
              {/* Preview de conversão - mostra exatamente quanto será debitado */}
              {valorPagamento > 0 && cotacaoUSD > 0 && (() => {
                const cryptoData = getSaldoCaixaCryptoByCoin(value.coin);
                const priceUSD = cryptoData.priceUSD;
                const valorUSD = valorPagamento / cotacaoUSD;
                // Para stablecoins (USDT/USDC), 1 coin = 1 USD; para outras, divide pelo preço
                const qtdCoin = priceUSD > 0 ? valorUSD / priceUSD : 0;
                const isStablecoin = value.coin === "USDT" || value.coin === "USDC";
                
                return (
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 text-sm">
                    <div className="font-medium text-primary mb-2">📋 Resumo da Conversão</div>
                    <div className="space-y-1 text-foreground">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Valor devido:</span>
                        <span className="font-semibold">{formatCurrency(valorPagamento)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cotação USD/BRL:</span>
                        <span>{cotacaoUSD.toFixed(4)} <span className="text-xs text-muted-foreground">(tempo real)</span></span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Equivalente USD:</span>
                        <span>{formatUSD(valorUSD)}</span>
                      </div>
                      {!isStablecoin && priceUSD > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cotação {value.coin}/USD:</span>
                          <span>{formatUSD(priceUSD)} <span className="text-xs text-muted-foreground">(tempo real)</span></span>
                        </div>
                      )}
                      <div className="border-t border-primary/30 my-2" />
                      <div className="flex justify-between font-semibold text-primary">
                        <span>Será debitado:</span>
                        <span>{qtdCoin.toFixed(isStablecoin ? 4 : 8)} {value.coin}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Partner selection for PARCEIRO_CONTA (FIAT) */}
      {value.origemTipo === "PARCEIRO_CONTA" && (
        <div className="space-y-3 pt-2 border-t">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Selecione o Parceiro</Label>
            <Select
              value={value.origemParceiroId || ""}
              onValueChange={handleParceiroChange}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha um parceiro..." />
              </SelectTrigger>
              <SelectContent>
                {parceiros.map((p) => {
                  // Calcular saldo total FIAT do parceiro
                  const contasDoParceiro = saldosParceirosContas.filter(s => s.parceiro_id === p.id);
                  const saldoTotal = contasDoParceiro.reduce((acc, c) => acc + (c.saldo || 0), 0);
                  const temSaldo = saldoTotal > 0;
                  
                  return (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex flex-col w-full gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${!temSaldo ? "text-muted-foreground" : ""}`}>
                            {p.nome}
                          </span>
                        </div>
                        <span className={`text-xs ${temSaldo ? "text-emerald-600 font-medium" : "text-muted-foreground"}`}>
                          Saldo: {formatCurrency(saldoTotal)}
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Account selection for FIAT */}
          {value.origemParceiroId && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Selecione a Conta</Label>
              {contasParceiroSelecionado.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Este parceiro não possui contas bancárias cadastradas.
                </p>
              ) : (
                <Select
                  value={value.origemContaBancariaId || ""}
                  onValueChange={handleContaChange}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha uma conta..." />
                  </SelectTrigger>
                  <SelectContent>
                    {contasParceiroSelecionado.map((c) => {
                      const saldo = getSaldoContaParceiro(c.id);
                      return (
                        <SelectItem key={c.id} value={c.id}>
                          <div className="flex items-center justify-between w-full gap-4">
                            <span>{c.banco} - {c.titular}</span>
                            <span className={`text-xs ${saldo < valorEfetivo ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                              {formatCurrency(saldo)}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Show selected balance for Partner accounts */}
          {value.origemContaBancariaId && (
            <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
              isInsuficiente && valorEfetivo > 0
                ? "bg-destructive/10 border border-destructive/30 text-destructive" 
                : "bg-muted/50 text-muted-foreground"
            }`}>
              {isInsuficiente && valorEfetivo > 0 && (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              <span>
                Saldo disponível: {formatCurrency(value.saldoDisponivel)}
                {isInsuficiente && valorEfetivo > 0 && (
                  <span className="ml-2 font-semibold">— Saldo insuficiente!</span>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Partner selection for PARCEIRO_WALLET (CRYPTO) */}
      {value.origemTipo === "PARCEIRO_WALLET" && (
        <div className="space-y-3 pt-2 border-t">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Selecione o Parceiro</Label>
            <Select
              value={value.origemParceiroId || ""}
              onValueChange={handleParceiroChange}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha um parceiro..." />
              </SelectTrigger>
              <SelectContent>
                {parceiros.map((p) => {
                  // Buscar todas as wallets do parceiro
                  const walletsDoParceiro = walletsCrypto.filter(w => w.parceiro_id === p.id);
                  const saldosDoParceiroWallets = saldosParceirosWallets.filter(s => s.parceiro_id === p.id);
                  
                  // Calcular saldo total em USD de todas as wallets
                  const saldoTotalUSD = saldosDoParceiroWallets.reduce((acc, s) => {
                    const priceUSD = getCoinPriceUSD(s.coin);
                    return acc + (s.saldo_coin || 0) * priceUSD;
                  }, 0);
                  const saldoTotalBRL = saldoTotalUSD * cotacaoUSD;
                  const temSaldo = saldoTotalUSD > 0;
                  const temWallets = walletsDoParceiro.length > 0;
                  
                  return (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex flex-col w-full gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${!temSaldo ? "text-muted-foreground" : ""}`}>
                            {p.nome}
                          </span>
                        </div>
                        {temWallets ? (
                          <div className="space-y-0.5">
                            {saldosDoParceiroWallets.length > 0 ? (
                              saldosDoParceiroWallets.map(s => {
                                const wallet = walletsDoParceiro.find(w => 
                                  saldosParceirosWallets.find(sw => sw.wallet_id === w.id && sw.coin === s.coin)
                                );
                                return (
                                  <div key={s.wallet_id} className="flex items-center gap-2 text-xs">
                                    <span className="text-muted-foreground">•</span>
                                    <span className={s.saldo_coin > 0 ? "text-emerald-600" : "text-muted-foreground"}>
                                      {s.coin} {s.saldo_coin?.toFixed(4) || "0"}
                                    </span>
                                  </div>
                                );
                              })
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                Sem saldo em wallets
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            Sem wallets cadastradas
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Wallet selection for CRYPTO */}
          {value.origemParceiroId && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Selecione a Wallet</Label>
              {walletsParceiroSelecionado.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Este parceiro não possui wallets cadastradas.
                </p>
              ) : (
                <Select
                  value={value.origemWalletId || ""}
                  onValueChange={handleWalletChange}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha uma wallet..." />
                  </SelectTrigger>
                  <SelectContent>
                    {walletsParceiroSelecionado.map((w) => {
                      const walletSaldo = getSaldoWalletParceiro(w.id);
                      return (
                        <SelectItem key={w.id} value={w.id}>
                          <div className="flex items-center justify-between w-full gap-4">
                            <span>{w.exchange} - {w.endereco.slice(0, 8)}...</span>
                            <div className="flex flex-col items-end text-xs">
                              <span className={walletSaldo.saldoBRL < valorEfetivo ? "text-destructive font-semibold" : "text-muted-foreground"}>
                                {formatCoin(walletSaldo.saldoCoin, walletSaldo.coin)}
                              </span>
                              <span className="text-muted-foreground/70">
                                ≈ {formatCurrency(walletSaldo.saldoBRL)}
                              </span>
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Show selected balance for Partner wallets */}
          {value.origemWalletId && (
            <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
              isInsuficiente && valorEfetivo > 0
                ? "bg-destructive/10 border border-destructive/30 text-destructive" 
                : "bg-muted/50 text-muted-foreground"
            }`}>
              {isInsuficiente && valorEfetivo > 0 && (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              <span>
                Saldo disponível: {formatCoin(getSaldoWalletParceiro(value.origemWalletId).saldoCoin, getSaldoWalletParceiro(value.origemWalletId).coin)} ≈ {formatCurrency(value.saldoDisponivel)}
                {isInsuficiente && valorEfetivo > 0 && (
                  <span className="ml-2 font-semibold">— Saldo insuficiente!</span>
                )}
              </span>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
