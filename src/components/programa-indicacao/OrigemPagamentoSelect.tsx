import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Wallet, Building2, Bitcoin, Loader2, AlertTriangle, ChevronsUpDown, Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCotacoes } from "@/hooks/useCotacoes";

interface ContaBancaria {
  id: string;
  banco: string;
  titular: string;
  parceiro_id: string;
  moeda?: string;
}

interface CaixaContaInfo {
  id: string;
  banco: string;
  saldo: number;
}

interface CaixaWalletInfo {
  id: string;
  label?: string | null;
  exchange: string;
  endereco: string;
  saldo_coin: number;
  saldo_usd: number;
}

interface WalletCrypto {
  id: string;
  label?: string | null;
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

  const DEBUG_WALLET_FLOW = true;
  const debugLog = useCallback((stage: string, payload?: unknown) => {
    if (!DEBUG_WALLET_FLOW) return;
    if (payload !== undefined) {
      console.log(`[OrigemPagamentoSelect][${stage}]`, payload);
      return;
    }
    console.log(`[OrigemPagamentoSelect][${stage}]`);
  }, []);
  
  // Data
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [walletsCrypto, setWalletsCrypto] = useState<WalletCrypto[]>([]);
  const [saldosCaixaFiat, setSaldosCaixaFiat] = useState<SaldoCaixaFiat[]>([]);
  const [saldosCaixaCrypto, setSaldosCaixaCrypto] = useState<SaldoCaixaCrypto[]>([]);
  const [saldosParceirosContas, setSaldosParceirosContas] = useState<SaldoParceiroContas[]>([]);
  const [saldosParceirosWallets, setSaldosParceirosWallets] = useState<SaldoParceiroWallets[]>([]);

  // 🔒 CORREÇÃO: Mapeamentos de contas/wallets da Caixa Operacional para resolver IDs
  // Quando origem = CAIXA_OPERACIONAL, precisamos propagar o conta_bancaria_id/wallet_id
  // para que as views de saldo (v_saldo_parceiro_contas) contabilizem o débito.
  const [caixaContasByMoeda, setCaixaContasByMoeda] = useState<Record<string, CaixaContaInfo[]>>({});
  const [caixaWalletsByCoin, setCaixaWalletsByCoin] = useState<Record<string, CaixaWalletInfo[]>>({});
  const [caixaParceiroIdRef, setCaixaParceiroIdRef] = useState<string | null>(null);

  // Flag para indicar que os dados foram carregados
  const [dataLoaded, setDataLoaded] = useState(false);
  const [parceiroContaOpen, setParceiroContaOpen] = useState(false);
  const [parceiroWalletOpen, setParceiroWalletOpen] = useState(false);
  const [parceiroContaSearch, setParceiroContaSearch] = useState("");
  const [parceiroWalletSearch, setParceiroWalletSearch] = useState("");

  // Extrair lista de moedas crypto únicas para buscar cotações em tempo real
  // MEMOIZADO para evitar re-renders desnecessários no useCotacoes
  const cryptoCoins = useMemo(() => {
    return [...new Set([
      ...saldosCaixaCrypto.map(s => s.coin),
      ...saldosParceirosWallets.map(s => s.coin)
    ])].filter(Boolean);
  }, [saldosCaixaCrypto, saldosParceirosWallets]);

  // Usar hook de cotações com as moedas crypto detectadas
  const { cotacaoUSD, getCryptoPrice, loading: cotacoesLoading } = useCotacoes(cryptoCoins);

  useEffect(() => {
    debugLog("component-mounted", {
      origemTipo: value.origemTipo,
      tipoMoeda: value.tipoMoeda,
      valorPagamento,
      valorEfetivo,
    });
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    setLoading(true);
    debugLog("fetchData:start");
    try {
      // STEP 1: Identify Caixa Operacional partner
      const { data: caixaParceiro } = await supabase
        .from("parceiros")
        .select("id")
        .eq("is_caixa_operacional", true)
        .maybeSingle();
      const caixaParceiroId = caixaParceiro?.id || null;

      const [
        parceirosRes,
        contasRes,
        walletsRes,
        // UNIFIED SOURCE: Use v_saldo_parceiro_contas/wallets for ALL balances
        allContasSaldoRes,
        allWalletsSaldoRes,
      ] = await Promise.all([
        supabase.from("parceiros").select("id, nome").eq("status", "ativo").order("nome"),
        supabase.from("contas_bancarias").select("id, banco, titular, parceiro_id").order("banco"),
        supabase.from("wallets_crypto").select("id, label, exchange, endereco, parceiro_id, moeda").order("exchange"),
        supabase.from("v_saldo_parceiro_contas").select("conta_id, parceiro_id, saldo, moeda"),
        supabase.from("v_saldo_parceiro_wallets").select("wallet_id, parceiro_id, coin, saldo_usd, saldo_coin"),
      ]);

      if (parceirosRes.error || contasRes.error || walletsRes.error || allContasSaldoRes.error || allWalletsSaldoRes.error) {
        debugLog("fetchData:query-errors", {
          parceirosError: parceirosRes.error,
          contasError: contasRes.error,
          walletsError: walletsRes.error,
          contasSaldoError: allContasSaldoRes.error,
          walletsSaldoError: allWalletsSaldoRes.error,
        });
      }

      const allContas = allContasSaldoRes.data || [];
      const allWallets = allWalletsSaldoRes.data || [];

      // Caixa FIAT = contas do parceiro caixa operacional, agrupadas por moeda
      const caixaFiatMap: Record<string, number> = {};
      // 🔒 CORREÇÃO: Mapear contas bancárias da Caixa por moeda
      const contasByMoeda: Record<string, CaixaContaInfo[]> = {};
      const contasData = contasRes.data || [];
      
      allContas.forEach((row: any) => {
        if (caixaParceiroId && row.parceiro_id === caixaParceiroId) {
          const m = row.moeda || "BRL";
          caixaFiatMap[m] = (caixaFiatMap[m] || 0) + (row.saldo || 0);
          if (row.conta_id) {
            if (!contasByMoeda[m]) contasByMoeda[m] = [];
            if (!contasByMoeda[m].find(c => c.id === row.conta_id)) {
              const contaInfo = contasData.find((c: any) => c.id === row.conta_id);
              contasByMoeda[m].push({
                id: row.conta_id,
                banco: contaInfo?.banco || "Conta",
                saldo: row.saldo || 0,
              });
            }
          }
        }
      });

      // Caixa CRYPTO = wallets do parceiro caixa operacional, agrupadas por coin
      const caixaCryptoMap: Record<string, { saldo_coin: number; saldo_usd: number }> = {};
      const walletsByCoin: Record<string, CaixaWalletInfo[]> = {};
      const walletsData = walletsRes.data || [];
      
      allWallets.forEach((row: any) => {
        if (caixaParceiroId && row.parceiro_id === caixaParceiroId) {
          const c = row.coin || "USDT";
          if (!caixaCryptoMap[c]) caixaCryptoMap[c] = { saldo_coin: 0, saldo_usd: 0 };
          caixaCryptoMap[c].saldo_coin += (row.saldo_coin || 0);
          caixaCryptoMap[c].saldo_usd += (row.saldo_usd || 0);
          if (row.wallet_id) {
            if (!walletsByCoin[c]) walletsByCoin[c] = [];
            if (!walletsByCoin[c].find(w => w.id === row.wallet_id)) {
              const walletInfo = walletsData.find((w: any) => w.id === row.wallet_id);
              walletsByCoin[c].push({
                id: row.wallet_id,
                label: walletInfo?.label,
                exchange: walletInfo?.exchange || "Wallet",
                endereco: walletInfo?.endereco || "",
                saldo_coin: row.saldo_coin || 0,
                saldo_usd: row.saldo_usd || 0,
              });
            }
          }
        }
      });

      // Parceiros = EXCLUINDO caixa operacional
      const parceirosContasSaldo = allContas.filter((row: any) => !caixaParceiroId || row.parceiro_id !== caixaParceiroId);
      const parceirosWalletsSaldo = allWallets.filter((row: any) => !caixaParceiroId || row.parceiro_id !== caixaParceiroId);

      setParceiros(parceirosRes.data || []);
      setContasBancarias(contasData);
      setWalletsCrypto(walletsRes.data || []);
      setSaldosCaixaFiat(Object.entries(caixaFiatMap).map(([moeda, saldo]) => ({ moeda, saldo })));
      setSaldosCaixaCrypto(Object.entries(caixaCryptoMap).map(([coin, vals]) => ({ coin, ...vals })));
      setSaldosParceirosContas(parceirosContasSaldo);
      setSaldosParceirosWallets(parceirosWalletsSaldo);
      
      // 🔒 CORREÇÃO: Salvar mapeamentos da Caixa
      setCaixaContasByMoeda(contasByMoeda);
      setCaixaWalletsByCoin(walletsByCoin);
      setCaixaParceiroIdRef(caixaParceiroId);
      
      setDataLoaded(true);

      debugLog("fetchData:success", {
        parceiros: (parceirosRes.data || []).length,
        contas: (contasRes.data || []).length,
        wallets: (walletsRes.data || []).length,
        saldoCaixaFiat: Object.keys(caixaFiatMap).length,
        saldoCaixaCrypto: Object.keys(caixaCryptoMap).length,
        saldoParceirosContas: parceirosContasSaldo.length,
        saldoParceirosWallets: parceirosWalletsSaldo.length,
      });
    } catch (error) {
      console.error("[OrigemPagamentoSelect][fetchData:catch]", error);
    } finally {
      debugLog("fetchData:finally");
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
    const safeCoin = (coin || "").toUpperCase().trim();
    if (!safeCoin) {
      console.error("[OrigemPagamentoSelect][getCoinPriceUSD] coin inválida", { coin });
      return 0;
    }

    // Stablecoins = 1 USD
    if (safeCoin === "USDT" || safeCoin === "USDC") return 1;
    // Buscar cotação real-time
    const price = getCryptoPrice(safeCoin);
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
  // Ref para evitar loop infinito: rastreia últimos valores emitidos
  const lastEmittedRef = useRef<{ saldo: number; insuf: boolean; cotacao: number; coinPrice: number }>({
    saldo: -1, insuf: false, cotacao: -1, coinPrice: -1,
  });

  // Ref estável para cotacaoUSD - permite acessar valor atual sem incluir na dep array
  const cotacaoUSDRef = useRef(cotacaoUSD);
  cotacaoUSDRef.current = cotacaoUSD;

  // Ref estável para o value atual - evita incluir value fields voláteis nas deps
  const valueRef = useRef(value);
  valueRef.current = value;

  // Ref estável para onChange
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Efeito principal: reage a mudanças de seleção e dados carregados
  useEffect(() => {
    if (!dataLoaded) return;

    const currentValue = valueRef.current;
    const currentCotacao = cotacaoUSDRef.current;

    debugLog("effect:selection:start", {
      origemTipo: currentValue.origemTipo,
      tipoMoeda: currentValue.tipoMoeda,
      coin: currentValue.coin,
      origemContaBancariaId: currentValue.origemContaBancariaId,
      origemWalletId: currentValue.origemWalletId,
      cotacaoUSD: currentCotacao,
      valorEfetivo,
    });

    const { saldoDisponivel, saldoInsuficiente } = calcularSaldoEValidar(
      currentValue.origemTipo,
      currentValue.tipoMoeda,
      currentValue.coin,
      currentValue.origemContaBancariaId,
      currentValue.origemWalletId
    );

    // 🔒 Propagar cotação e preço da crypto quando disponíveis
    let newCotacao = currentValue.cotacao ?? 0;
    let newCoinPriceUSD = currentValue.coinPriceUSD ?? 0;
    
    if (currentValue.tipoMoeda === "CRYPTO") {
      newCotacao = currentCotacao;
      if (currentValue.coin) {
        newCoinPriceUSD = getCoinPriceUSD(currentValue.coin);
      }
    }

    if (Number.isNaN(saldoDisponivel) || Number.isNaN(newCotacao) || Number.isNaN(newCoinPriceUSD)) {
      console.error("[OrigemPagamentoSelect][effect:selection:nan-detected]", {
        saldoDisponivel,
        newCotacao,
        newCoinPriceUSD,
        currentValue,
      });
    }

    // Comparar com últimos valores emitidos (tolerância para floats)
    const prev = lastEmittedRef.current;
    const changed =
      Math.abs(prev.saldo - saldoDisponivel) > 0.01 ||
      prev.insuf !== saldoInsuficiente ||
      (currentValue.tipoMoeda === "CRYPTO" && Math.abs(prev.cotacao - newCotacao) > 0.01) ||
      (currentValue.tipoMoeda === "CRYPTO" && Math.abs(prev.coinPrice - newCoinPriceUSD) > 0.01);

    debugLog("effect:selection:diff", {
      changed,
      prev,
      next: { saldoDisponivel, saldoInsuficiente, newCotacao, newCoinPriceUSD },
    });

    if (changed) {
      lastEmittedRef.current = {
        saldo: saldoDisponivel,
        insuf: saldoInsuficiente,
        cotacao: newCotacao,
        coinPrice: newCoinPriceUSD,
      };

      debugLog("effect:selection:emit-onChange", {
        origemTipo: currentValue.origemTipo,
        tipoMoeda: currentValue.tipoMoeda,
      });

      // 🔒 Auto-resolver IDs da Caixa Operacional (apenas se há UMA conta, senão o user escolhe)
      let resolvedIds: Partial<OrigemPagamentoData> = {};
      if (currentValue.origemTipo === "CAIXA_OPERACIONAL" && !currentValue.origemContaBancariaId && !currentValue.origemWalletId) {
        if (currentValue.tipoMoeda === "FIAT") {
          const m = currentValue.moeda || "BRL";
          const contas = caixaContasByMoeda[m] || [];
          if (contas.length === 1) {
            resolvedIds = { origemContaBancariaId: contas[0].id, origemParceiroId: caixaParceiroIdRef || undefined };
          } else if (contas.length > 1) {
            // Múltiplas contas: não auto-selecionar, user precisa escolher
            resolvedIds = { origemParceiroId: caixaParceiroIdRef || undefined };
          }
        } else {
          const c = currentValue.coin || "USDT";
          const wallets = caixaWalletsByCoin[c] || [];
          if (wallets.length === 1) {
            resolvedIds = { origemWalletId: wallets[0].id, origemParceiroId: caixaParceiroIdRef || undefined };
          } else if (wallets.length > 1) {
            resolvedIds = { origemParceiroId: caixaParceiroIdRef || undefined };
          }
        }
      }

      onChangeRef.current({
        ...currentValue,
        ...resolvedIds,
        saldoDisponivel,
        saldoInsuficiente,
        cotacao: currentValue.tipoMoeda === "CRYPTO" ? newCotacao : currentValue.cotacao,
        coinPriceUSD: currentValue.tipoMoeda === "CRYPTO" ? newCoinPriceUSD : currentValue.coinPriceUSD,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLoaded, valorPagamento, value.origemTipo, value.tipoMoeda, value.coin, value.origemContaBancariaId, value.origemWalletId]);

  // Efeito SEPARADO: atualiza saldo quando cotações mudam (com debounce implícito via ref)
  useEffect(() => {
    if (!dataLoaded || valueRef.current.tipoMoeda !== "CRYPTO") return;
    
    const currentValue = valueRef.current;
    debugLog("effect:rates:start", {
      origemTipo: currentValue.origemTipo,
      coin: currentValue.coin,
      cotacaoUSD,
    });

    const { saldoDisponivel, saldoInsuficiente } = calcularSaldoEValidar(
      currentValue.origemTipo,
      currentValue.tipoMoeda,
      currentValue.coin,
      currentValue.origemContaBancariaId,
      currentValue.origemWalletId
    );

    const newCotacao = cotacaoUSD;
    const newCoinPriceUSD = currentValue.coin ? getCoinPriceUSD(currentValue.coin) : (currentValue.coinPriceUSD ?? 0);

    if (Number.isNaN(saldoDisponivel) || Number.isNaN(newCotacao) || Number.isNaN(newCoinPriceUSD)) {
      console.error("[OrigemPagamentoSelect][effect:rates:nan-detected]", {
        saldoDisponivel,
        newCotacao,
        newCoinPriceUSD,
        currentValue,
      });
    }

    const prev = lastEmittedRef.current;
    const changed =
      Math.abs(prev.saldo - saldoDisponivel) > 0.01 ||
      prev.insuf !== saldoInsuficiente ||
      Math.abs(prev.cotacao - newCotacao) > 0.01;

    debugLog("effect:rates:diff", {
      changed,
      prev,
      next: { saldoDisponivel, saldoInsuficiente, newCotacao, newCoinPriceUSD },
    });

    if (changed) {
      lastEmittedRef.current = {
        saldo: saldoDisponivel,
        insuf: saldoInsuficiente,
        cotacao: newCotacao,
        coinPrice: newCoinPriceUSD,
      };
      debugLog("effect:rates:emit-onChange");
      onChangeRef.current({
        ...currentValue,
        saldoDisponivel,
        saldoInsuficiente,
        cotacao: newCotacao,
        coinPriceUSD: newCoinPriceUSD,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotacaoUSD, dataLoaded]);

  // 🔒 Resolver conta/wallet da Caixa Operacional para propagar no onChange
  // Auto-seleciona APENAS se houver uma única conta/wallet; se múltiplas, retorna undefined (user escolhe)
  const resolveCaixaIds = useCallback((tipoMoeda: "FIAT" | "CRYPTO", moeda?: string, coin?: string) => {
    if (tipoMoeda === "FIAT") {
      const m = moeda || "BRL";
      const contas = caixaContasByMoeda[m] || [];
      return {
        origemContaBancariaId: contas.length === 1 ? contas[0].id : undefined,
        origemWalletId: undefined,
        origemParceiroId: caixaParceiroIdRef || undefined,
      };
    } else {
      const c = coin || "USDT";
      const wallets = caixaWalletsByCoin[c] || [];
      return {
        origemContaBancariaId: undefined,
        origemWalletId: wallets.length === 1 ? wallets[0].id : undefined,
        origemParceiroId: caixaParceiroIdRef || undefined,
      };
    }
  }, [caixaContasByMoeda, caixaWalletsByCoin, caixaParceiroIdRef]);

  // Handle origem type change
  const handleOrigemTipoChange = (tipo: "CAIXA_OPERACIONAL" | "PARCEIRO_CONTA" | "PARCEIRO_WALLET") => {
    debugLog("handler:origemTipo:before-click", {
      from: value.origemTipo,
      to: tipo,
      currentTipoMoeda: value.tipoMoeda,
    });

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

    // 🔒 CORREÇÃO: Resolver IDs da conta/wallet da Caixa quando selecionada
    const caixaIds = tipo === "CAIXA_OPERACIONAL" 
      ? resolveCaixaIds(tipoMoeda, moeda, coinSelecionada) 
      : { origemContaBancariaId: undefined, origemWalletId: undefined, origemParceiroId: undefined };

    const newData: OrigemPagamentoData = {
      ...value,
      origemTipo: tipo,
      origemParceiroId: caixaIds.origemParceiroId,
      origemContaBancariaId: caixaIds.origemContaBancariaId,
      origemWalletId: caixaIds.origemWalletId,
      tipoMoeda,
      moeda,
      coin: coinSelecionada,
      // 🔒 PROPAGAR cotação quando CRYPTO é selecionado
      cotacao: tipoMoeda === "CRYPTO" ? cotacaoUSD : undefined,
      coinPriceUSD: saldoCrypto?.priceUSD || 1,
      saldoDisponivel,
      saldoInsuficiente,
    };

    debugLog("handler:origemTipo:emit-onChange", newData);
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

    // 🔒 CORREÇÃO: Resolver IDs da conta/wallet da Caixa
    const moeda = tipoMoeda === "FIAT" ? "BRL" : "USD";
    const caixaIds = resolveCaixaIds(tipoMoeda, moeda, coinSelecionada);

    onChange({
      ...value,
      tipoMoeda,
      moeda,
      coin: coinSelecionada,
      origemParceiroId: caixaIds.origemParceiroId,
      origemContaBancariaId: caixaIds.origemContaBancariaId,
      origemWalletId: caixaIds.origemWalletId,
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

    // 🔒 CORREÇÃO: Resolver wallet_id da Caixa para a coin selecionada
    const caixaIds = resolveCaixaIds("CRYPTO", "USD", coin);

    onChange({
      ...value,
      coin,
      cotacao: cotacaoUSD,
      coinPriceUSD: saldoCrypto.priceUSD,
      saldoDisponivel: saldoCrypto.saldoBRL,
      saldoInsuficiente,
      origemWalletId: caixaIds.origemWalletId,
      origemParceiroId: caixaIds.origemParceiroId,
    });
  };

  // Handle partner selection
  const handleParceiroChange = (parceiroId: string) => {
    debugLog("handler:parceiro:click", {
      origemTipo: value.origemTipo,
      parceiroId,
    });

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
    debugLog("handler:conta:click", { contaId, saldo });

    onChange({
      ...value,
      origemContaBancariaId: contaId,
      saldoDisponivel: saldo,
      saldoInsuficiente: valorEfetivo > 0 && saldo < valorEfetivo,
    });
  };

  // Handle wallet selection
  const handleWalletChange = (walletId: string) => {
    debugLog("handler:wallet:click", {
      walletId,
      origemParceiroId: value.origemParceiroId,
      valorEfetivo,
    });

    const walletSaldo = getSaldoWalletParceiro(walletId);
    debugLog("handler:wallet:saldo-calculado", walletSaldo);

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

  const renderWalletSection = () => {
    try {
      debugLog("wallet-section:render:start", {
        origemParceiroId: value.origemParceiroId,
        origemWalletId: value.origemWalletId,
        walletsParceiroSelecionado: walletsParceiroSelecionado.length,
      });

      return (
        <div className="space-y-3 pt-2 border-t">
         <div className="space-y-2">
            <Label className="text-xs text-muted-foreground text-center block">Selecione o Parceiro</Label>
            <Popover open={parceiroWalletOpen} onOpenChange={setParceiroWalletOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={parceiroWalletOpen}
                  disabled={disabled}
                  className="w-full justify-center font-normal relative"
                >
                  <span className="text-center flex-1">
                    {value.origemParceiroId
                      ? parceiros.find(p => p.id === value.origemParceiroId)?.nome || "Parceiro"
                      : "Buscar parceiro..."}
                  </span>
                  <ChevronsUpDown className="absolute right-3 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Buscar por nome..."
                    value={parceiroWalletSearch}
                    onValueChange={setParceiroWalletSearch}
                  />
                  <CommandList>
                    <CommandEmpty>Nenhum parceiro encontrado.</CommandEmpty>
                    <CommandGroup>
                      {parceiros
                        .map((p) => {
                          const walletsDoParceiro = walletsCrypto.filter(w => w.parceiro_id === p.id);
                          const saldosDoParceiroWallets2 = saldosParceirosWallets.filter(s => s.parceiro_id === p.id);
                          const saldoTotalUSD = saldosDoParceiroWallets2.reduce((acc, s) => {
                            const coinSafe = (s.coin || "USDT").toUpperCase();
                            const priceUSD = getCoinPriceUSD(coinSafe);
                            return acc + (s.saldo_coin || 0) * priceUSD;
                          }, 0);
                          return { ...p, saldoTotalUSD, temSaldo: saldoTotalUSD > 0, temWallets: walletsDoParceiro.length > 0, saldos: saldosDoParceiroWallets2 };
                        })
                        .filter((p) => {
                          if (!parceiroWalletSearch) return p.temSaldo;
                          return p.nome.toLowerCase().includes(parceiroWalletSearch.toLowerCase());
                        })
                        .sort((a, b) => b.saldoTotalUSD - a.saldoTotalUSD)
                        .map((p) => (
                          <CommandItem
                            key={p.id}
                            value={p.id}
                            onSelect={() => {
                              handleParceiroChange(p.id);
                              setParceiroWalletOpen(false);
                              setParceiroWalletSearch("");
                            }}
                            className="flex flex-col items-start gap-0.5"
                          >
                            <div className="flex items-center gap-2 w-full">
                              <Check className={cn("h-4 w-4 shrink-0", value.origemParceiroId === p.id ? "opacity-100" : "opacity-0")} />
                              <span className={`font-medium ${!p.temSaldo ? "text-muted-foreground" : ""}`}>
                                {p.nome}
                              </span>
                            </div>
                            {p.temWallets ? (
                              <div className="space-y-0.5 ml-6">
                                {p.saldos.length > 0 ? (
                                  p.saldos.map((s, idx) => {
                                    const coinSafe = (s.coin || "USDT").toUpperCase();
                                    return (
                                      <div key={`${s.wallet_id}-${coinSafe}-${idx}`} className="flex items-center gap-2 text-xs">
                                        <span className="text-muted-foreground">•</span>
                                        <span className={s.saldo_coin > 0 ? "text-emerald-600" : "text-muted-foreground"}>
                                          {coinSafe} {s.saldo_coin?.toFixed(4) || "0"}
                                        </span>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">Sem saldo</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic ml-6">Sem wallets</span>
                            )}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {value.origemParceiroId && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground text-center block">Selecione a Wallet</Label>
              {walletsParceiroSelecionado.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center">
                  Este parceiro não possui wallets cadastradas.
                </p>
              ) : (
                <Select
                  value={value.origemWalletId || ""}
                  onValueChange={handleWalletChange}
                  disabled={disabled}
                >
                  <SelectTrigger className="text-center [&>span]:w-full [&>span]:text-center">
                    <SelectValue placeholder="Escolha uma wallet..." />
                  </SelectTrigger>
                  <SelectContent>
                    {walletsParceiroSelecionado.map((w) => {
                      const walletSaldo = getSaldoWalletParceiro(w.id);
                      const exchangeDisplay = w.label || w.exchange || "Wallet";
                      const enderecoDisplay = w.endereco ? `${w.endereco.slice(0, 12)}...` : "—";
                      return (
                        <SelectItem key={w.id} value={w.id}>
                          <div className="flex items-center justify-between w-full gap-4">
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{exchangeDisplay}</span>
                              <span className="text-xs text-muted-foreground">
                                {enderecoDisplay}
                                {w.label && w.exchange && <span className="ml-1 text-[10px] opacity-70">({w.exchange})</span>}
                              </span>
                            </div>
                            <div className="flex flex-col items-end text-xs">
                              <span className={walletSaldo.saldoBRL < valorEfetivo ? "text-destructive font-medium" : "text-emerald-600 font-medium"}>
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

          {value.origemWalletId && isInsuficiente && valorEfetivo > 0 && (
            <div className="p-2.5 rounded-lg text-sm flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Saldo disponível: ≈ {formatCurrency(value.saldoDisponivel)} — Insuficiente</span>
            </div>
          )}
        </div>
      );
    } catch (error) {
      console.error("[OrigemPagamentoSelect][wallet-section:render:crash]", {
        error,
        value,
        walletsParceiroSelecionado,
        saldosParceirosWallets,
      });

      return (
        <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm">
          Erro ao renderizar Wallet. Verifique o console para detalhes.
        </div>
      );
    }
  };

  debugLog("render:before-loading-check", {
    loading,
    origemTipo: value.origemTipo,
    tipoMoeda: value.tipoMoeda,
  });

  if (loading) {
    debugLog("render:return-loading");
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  debugLog("render:return-main", {
    origemTipo: value.origemTipo,
    tipoMoeda: value.tipoMoeda,
    isInsuficiente,
  });

  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium">Origem do Pagamento</Label>
      
      <RadioGroup
        value={value.origemTipo}
        onValueChange={(v) => {
          debugLog("radio:onValueChange", { selected: v });
          handleOrigemTipoChange(v as any);
        }}
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

          {/* FIAT: Seletor de conta específica quando há múltiplas contas */}
          {value.tipoMoeda === "FIAT" && (() => {
            const contasCaixa = caixaContasByMoeda["BRL"] || [];
            if (contasCaixa.length > 1) {
              return (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Selecione a Conta</Label>
                  <Select
                    value={value.origemContaBancariaId || ""}
                    onValueChange={(contaId) => {
                      const contaInfo = contasCaixa.find(c => c.id === contaId);
                      onChange({
                        ...value,
                        origemContaBancariaId: contaId,
                        saldoDisponivel: contaInfo?.saldo || 0,
                        saldoInsuficiente: valorEfetivo > 0 && (contaInfo?.saldo || 0) < valorEfetivo,
                      });
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha a conta..." />
                    </SelectTrigger>
                    <SelectContent>
                      {contasCaixa.map((conta) => {
                        const insuficiente = conta.saldo < valorEfetivo;
                        return (
                          <SelectItem key={conta.id} value={conta.id}>
                            <div className="flex items-center justify-between w-full gap-4">
                              <span className="font-medium">{conta.banco}</span>
                              <span className={`text-xs font-medium ${insuficiente ? "text-destructive" : "text-muted-foreground"}`}>
                                {formatCurrency(conta.saldo)}
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              );
            }
            return null;
          })()}

          {/* CRYPTO: Seletor de wallet específica quando há múltiplas wallets */}
          {value.tipoMoeda === "CRYPTO" && value.coin && (() => {
            const walletsCaixa = caixaWalletsByCoin[value.coin] || [];
            if (walletsCaixa.length > 1) {
              return (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Selecione a Wallet</Label>
                  <Select
                    value={value.origemWalletId || ""}
                    onValueChange={(walletId) => {
                      const walletInfo = walletsCaixa.find(w => w.id === walletId);
                      const saldoBRL = (walletInfo?.saldo_usd || 0) * cotacaoUSD;
                      onChange({
                        ...value,
                        origemWalletId: walletId,
                        saldoDisponivel: saldoBRL,
                        saldoInsuficiente: valorEfetivo > 0 && saldoBRL < valorEfetivo,
                      });
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha a wallet..." />
                    </SelectTrigger>
                    <SelectContent>
                      {walletsCaixa.map((wallet) => {
                        const saldoBRL = wallet.saldo_usd * cotacaoUSD;
                        const insuficiente = saldoBRL < valorEfetivo;
                        const enderecoShort = wallet.endereco 
                          ? `${wallet.endereco.slice(0, 6)}...${wallet.endereco.slice(-4)}`
                          : "";
                        return (
                          <SelectItem key={wallet.id} value={wallet.id}>
                            <div className="flex items-center justify-between w-full gap-4">
                              <div className="flex flex-col">
                                <span className="font-medium text-sm">{wallet.exchange}</span>
                                <span className="text-xs text-muted-foreground">{enderecoShort}</span>
                              </div>
                              <span className={`text-xs font-medium ${insuficiente ? "text-destructive" : "text-muted-foreground"}`}>
                                {formatCoin(wallet.saldo_coin, value.coin!)} ≈ {formatCurrency(saldoBRL)}
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              );
            }
            return null;
          })()}

          {value.tipoMoeda === "FIAT" && (() => {
            const contasCaixa = caixaContasByMoeda["BRL"] || [];
            const hasMultiple = contasCaixa.length > 1;
            // Se múltiplas contas: mostrar saldo da conta selecionada; senão: saldo total
            const saldoExibido = hasMultiple && value.origemContaBancariaId
              ? (contasCaixa.find(c => c.id === value.origemContaBancariaId)?.saldo || 0)
              : saldoCaixaFiat;
            const needsSelection = hasMultiple && !value.origemContaBancariaId;
            
            if (needsSelection) {
              return (
                <div className="p-3 rounded-lg text-sm flex items-center gap-2 bg-muted/50 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                  <span>Selecione a conta para continuar</span>
                </div>
              );
            }
            
            return (
              <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                saldoExibido < valorEfetivo && valorEfetivo > 0
                  ? "bg-destructive/10 border border-destructive/30 text-destructive" 
                  : "bg-muted/50 text-muted-foreground"
              }`}>
                {saldoExibido < valorEfetivo && valorEfetivo > 0 && (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                )}
                <span>
                  Saldo disponível: {formatCurrency(saldoExibido)}
                  {valorCreditoEdicao > 0 && <span className="ml-1">(+ {formatCurrency(valorCreditoEdicao)} crédito edição)</span>}
                  {saldoExibido < valorEfetivo && valorEfetivo > 0 && (
                    <span className="ml-2 font-semibold">— Saldo insuficiente!</span>
                  )}
                </span>
              </div>
            );
          })()}

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
            <Label className="text-xs text-muted-foreground text-center block">Selecione o Parceiro</Label>
            <Popover open={parceiroContaOpen} onOpenChange={setParceiroContaOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={parceiroContaOpen}
                  disabled={disabled}
                  className="w-full justify-center font-normal relative"
                >
                  <span className="text-center flex-1">
                    {value.origemParceiroId
                      ? parceiros.find(p => p.id === value.origemParceiroId)?.nome || "Parceiro"
                      : "Buscar parceiro..."}
                  </span>
                  <ChevronsUpDown className="absolute right-3 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Buscar por nome..."
                    value={parceiroContaSearch}
                    onValueChange={setParceiroContaSearch}
                  />
                  <CommandList>
                    <CommandEmpty>Nenhum parceiro encontrado.</CommandEmpty>
                    <CommandGroup>
                      {parceiros
                        .map((p) => {
                          const contasDoParceiro = saldosParceirosContas.filter(s => s.parceiro_id === p.id);
                          const saldoTotal = contasDoParceiro.reduce((acc, c) => acc + (c.saldo || 0), 0);
                          return { ...p, saldoTotal, temSaldo: saldoTotal > 0 };
                        })
                        .filter((p) => {
                          if (!parceiroContaSearch) return p.temSaldo;
                          return p.nome.toLowerCase().includes(parceiroContaSearch.toLowerCase());
                        })
                        .sort((a, b) => b.saldoTotal - a.saldoTotal)
                        .map((p) => (
                          <CommandItem
                            key={p.id}
                            value={p.id}
                            onSelect={() => {
                              handleParceiroChange(p.id);
                              setParceiroContaOpen(false);
                              setParceiroContaSearch("");
                            }}
                            className="flex flex-col items-start gap-0.5"
                          >
                            <div className="flex items-center gap-2 w-full">
                              <Check className={cn("h-4 w-4 shrink-0", value.origemParceiroId === p.id ? "opacity-100" : "opacity-0")} />
                              <span className={`font-medium ${!p.temSaldo ? "text-muted-foreground" : ""}`}>
                                {p.nome}
                              </span>
                            </div>
                            <span className={`text-xs ml-6 ${p.temSaldo ? "text-emerald-600 font-medium" : "text-muted-foreground"}`}>
                              Saldo: {formatCurrency(p.saldoTotal)}
                            </span>
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
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
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{c.banco}</span>
                              <span className="text-xs text-muted-foreground">{c.titular}</span>
                            </div>
                            <span className={`text-xs font-medium ${saldo < valorEfetivo ? "text-destructive" : "text-emerald-600"}`}>
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

          {/* Alerta único de saldo insuficiente para conta selecionada */}
          {value.origemContaBancariaId && isInsuficiente && valorEfetivo > 0 && (
            <div className="p-2.5 rounded-lg text-sm flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Saldo disponível: {formatCurrency(value.saldoDisponivel)} — Insuficiente</span>
            </div>
          )}
        </div>
      )}

      {/* Partner selection for PARCEIRO_WALLET (CRYPTO) */}
      {value.origemTipo === "PARCEIRO_WALLET" && renderWalletSection()}

    </div>
  );
}
