import { useState, useEffect, useRef } from "react";
import { isWalletCompatibleWithCoin } from "@/lib/cryptoNetworkCompat";
import { getTodayCivilDate } from "@/utils/dateUtils";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCotacoes } from "@/hooks/useCotacoes";
import { useToast } from "@/hooks/use-toast";
import { dispatchCaixaDataChanged } from "@/hooks/useInvalidateCaixaData";
import { DatePicker } from "@/components/ui/date-picker";
import { Calendar, Info as InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ParceiroSelect, { ParceiroSelectRef } from "@/components/parceiros/ParceiroSelect";
import ParceiroDialog from "@/components/parceiros/ParceiroDialog";
import BookmakerSelect, { BookmakerSelectRef } from "@/components/bookmakers/BookmakerSelect";
import { InvestidorSelect } from "@/components/investidores/InvestidorSelect";
import { Loader2, ArrowLeftRight, ArrowRightLeft, AlertTriangle, TrendingDown, TrendingUp, Info } from "lucide-react";

// Constantes de moedas disponíveis (todas as 8 moedas FIAT suportadas)
const MOEDAS_FIAT = [
  { value: "BRL", label: "Real Brasileiro" },
  { value: "USD", label: "Dólar Americano" },
  { value: "EUR", label: "Euro" },
  { value: "GBP", label: "Libra Esterlina" },
  { value: "MXN", label: "Peso Mexicano" },
  { value: "MYR", label: "Ringgit Malaio" },
  { value: "ARS", label: "Peso Argentino" },
  { value: "COP", label: "Peso Colombiano" },
];

const MOEDAS_CRYPTO = [
  { value: "USDT", label: "Tether (USDT)" },
  { value: "USDC", label: "USD Coin (USDC)" },
  { value: "BTC", label: "Bitcoin (BTC)" },
  { value: "ETH", label: "Ethereum (ETH)" },
  { value: "BNB", label: "Binance Coin (BNB)" },
  { value: "TRX", label: "Tron (TRX)" },
  { value: "SOL", label: "Solana (SOL)" },
  { value: "MATIC", label: "Polygon (MATIC)" },
  { value: "ADA", label: "Cardano (ADA)" },
  { value: "DOT", label: "Polkadot (DOT)" },
  { value: "AVAX", label: "Avalanche (AVAX)" },
  { value: "LINK", label: "Chainlink (LINK)" },
  { value: "UNI", label: "Uniswap (UNI)" },
  { value: "LTC", label: "Litecoin (LTC)" },
  { value: "XRP", label: "Ripple (XRP)" },
];

interface CaixaTransacaoDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultTipoTransacao?: string;
  defaultOrigemBookmakerId?: string;
  defaultDestinoBookmakerId?: string;
  defaultOrigemParceiroId?: string;
  defaultDestinoParceiroId?: string;
  defaultTipoMoeda?: "FIAT" | "CRYPTO";
  defaultMoeda?: string;
  defaultCoin?: string;
  /** Entry point identifier for guided focus sequences */
  entryPoint?: string;
  /** Restrict which transaction types are shown in the selector */
  allowedTipoTransacao?: string[];
}

interface BancoTaxa {
  taxa_deposito_tipo: "percentual" | "fixo" | null;
  taxa_deposito_valor: number | null;
  taxa_saque_tipo: "percentual" | "fixo" | null;
  taxa_saque_valor: number | null;
  taxa_moeda: string | null;
}

interface ContaBancaria {
  id: string;
  banco: string;
  titular: string;
  parceiro_id: string;
  moeda: string;
  banco_id: string | null;
  bancoTaxa?: BancoTaxa | null;
}

interface WalletCrypto {
  id: string;
  exchange: string;
  endereco: string;
  parceiro_id: string;
  moeda: string[] | null;
  network: string | null;
}

interface Bookmaker {
  id: string;
  nome: string;
  saldo_atual: number;
  saldo_usd: number;
  moeda: string;
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
  // Novos campos para dinheiro em trânsito
  saldo_locked: number;
  saldo_disponivel: number;
}

export function CaixaTransacaoDialog({
  open,
  onClose,
  onSuccess,
  defaultTipoTransacao,
  defaultOrigemBookmakerId,
  defaultDestinoBookmakerId,
  defaultOrigemParceiroId,
  defaultDestinoParceiroId,
  defaultTipoMoeda,
  defaultMoeda,
  defaultCoin,
  entryPoint,
  allowedTipoTransacao,
}: CaixaTransacaoDialogProps) {
  const { toast } = useToast();
  const { workspaceId } = useWorkspace();
  const { 
    cotacaoUSD, cotacaoEUR, cotacaoGBP, 
    cotacaoMXN, cotacaoMYR, cotacaoARS, cotacaoCOP,
    getRate, convertToBRL, source, dataSource, isUsingFallback 
  } = useCotacoes();
  // NOTA: O lock de saldo é feito automaticamente pelo trigger do banco
  // O hook useWalletTransitBalance não é mais necessário aqui
  const [loading, setLoading] = useState(false);

  // Form state
  const [tipoTransacao, setTipoTransacao] = useState<string>("");
  const [fluxoAporte, setFluxoAporte] = useState<"APORTE" | "LIQUIDACAO">("APORTE");
  const [investidorId, setInvestidorId] = useState<string>("");
  const [tipoMoeda, setTipoMoeda] = useState<string>("FIAT");
  const [moeda, setMoeda] = useState<string>("");
  const [coin, setCoin] = useState<string>("");
  const [valor, setValor] = useState<string>("");
  const [valorDisplay, setValorDisplay] = useState<string>("");
  const [qtdCoin, setQtdCoin] = useState<string>("");
  const [cotacao, setCotacao] = useState<string>("");
  const [descricao, setDescricao] = useState<string>("");
  const [dataTransacao, setDataTransacao] = useState<string>("");
  
  // REMOVIDO: valorCreditado e valorCreditadoDisplay
  // O valor creditado real agora é informado na tela de Conciliação, não aqui

  // Estados para cotação em tempo real da Binance
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Refs para auto-focus
  const coinSelectRef = useRef<HTMLButtonElement>(null);
  const qtdCoinInputRef = useRef<HTMLInputElement>(null);
  const moedaFiatSelectRef = useRef<HTMLButtonElement>(null);
  const valorFiatInputRef = useRef<HTMLInputElement>(null);
  const parceiroSelectRef = useRef<ParceiroSelectRef>(null);
  const contaBancariaSelectRef = useRef<HTMLButtonElement>(null);
  const walletCryptoSelectRef = useRef<HTMLButtonElement>(null);
  const bookmakerSelectRef = useRef<BookmakerSelectRef>(null);
  const tipoMoedaSelectRef = useRef<HTMLButtonElement>(null);
  const parceiroDestinoSelectRef = useRef<ParceiroSelectRef>(null);
  const destinoContaBancariaSelectRef = useRef<HTMLButtonElement>(null);
  const destinoWalletSelectRef = useRef<HTMLButtonElement>(null);

  // Guided focus sequence state for affiliate deposit flow
  const affiliateFocusActiveRef = useRef<boolean>(false);
  const affiliateFocusStepRef = useRef<number>(0);

  // Guided focus sequence state for Parceiro→Parceiro transfer flow
  const transferFocusActiveRef = useRef<boolean>(false);
  const transferFocusStepRef = useRef<number>(0);

  // Track previous values to detect changes (origemParceiroId and origemWalletId tracked after their declarations)
  const prevTipoMoeda = useRef<string>(tipoMoeda);
  const prevMoeda = useRef<string>(moeda);
  const prevValor = useRef<string>(valor);
  const prevQtdCoin = useRef<string>(qtdCoin);
  const prevOrigemContaId = useRef<string>("");
  
  // Flag para evitar re-execução de efeitos durante reset
  const isResettingContext = useRef<boolean>(false);

  // ============================================================================
  // FIX: Ref para armazenar defaults pendentes que devem ser aplicados
  // APÓS o efeito de tipoTransacao ter sido executado (evita race condition)
  // ============================================================================
  const pendingDefaultsRef = useRef<{
    origemBookmakerId?: string;
    destinoBookmakerId?: string;
    origemParceiroId?: string;
    destinoParceiroId?: string;
    tipoMoeda?: "FIAT" | "CRYPTO";
    moeda?: string;
    coin?: string;
  } | null>(null);

  // ============================================================================
  // INTELIGÊNCIA DE SAQUE: Detectar origem do último depósito para pré-selecionar
  // tipo de moeda correto (FIAT vs CRYPTO) baseado na verdade operacional
  // "A origem do dinheiro define o saque, não a moeda contábil da casa."
  // ============================================================================
  const fetchLastDepositFundingSource = async (bookmakerId: string): Promise<{
    tipoMoeda: "FIAT" | "CRYPTO";
    moeda?: string;
    coin?: string;
  } | null> => {
    try {
      const { data, error } = await supabase
        .from("cash_ledger")
        .select("tipo_moeda, moeda, coin")
        .eq("destino_bookmaker_id", bookmakerId)
        .eq("tipo_transacao", "DEPOSITO")
        .in("status", ["CONFIRMADO", "PENDENTE", "LIQUIDADO"])
        .order("data_transacao", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;

      console.log("[CaixaTransacaoDialog] Último depósito detectado:", data);
      return {
        tipoMoeda: data.tipo_moeda === "CRYPTO" ? "CRYPTO" : "FIAT",
        moeda: data.moeda || undefined,
        coin: data.coin || undefined,
      };
    } catch (err) {
      console.error("[CaixaTransacaoDialog] Erro ao buscar último depósito:", err);
      return null;
    }
  };

  // Aplicar defaults quando dialog abre
  useEffect(() => {
    if (open) {
      resetForm();
      
      // CRÍTICO: Armazenar os defaults que devem ser aplicados APÓS o reset do tipoTransacao
      if (defaultOrigemBookmakerId || defaultDestinoBookmakerId || defaultOrigemParceiroId || defaultDestinoParceiroId || defaultTipoMoeda || defaultMoeda || defaultCoin) {
        pendingDefaultsRef.current = {
          origemBookmakerId: defaultOrigemBookmakerId,
          destinoBookmakerId: defaultDestinoBookmakerId,
          origemParceiroId: defaultOrigemParceiroId,
          destinoParceiroId: defaultDestinoParceiroId,
          tipoMoeda: defaultTipoMoeda,
          moeda: defaultMoeda,
          coin: defaultCoin,
        };
      } else {
        pendingDefaultsRef.current = null;
      }
      
      // ========================================================================
      // SAQUE INTELIGENTE: Se é um saque com bookmaker pré-definida,
      // buscar o último depósito para detectar a origem real do dinheiro
      // e sobrescrever tipoMoeda/moeda/coin nos pendingDefaults
      // ========================================================================
      if (defaultTipoTransacao === "SAQUE" && defaultOrigemBookmakerId) {
        fetchLastDepositFundingSource(defaultOrigemBookmakerId).then((fundingSource) => {
          if (fundingSource && pendingDefaultsRef.current) {
            console.log("[CaixaTransacaoDialog] Sobrescrevendo defaults com origem do último depósito:", fundingSource);
            pendingDefaultsRef.current = {
              ...pendingDefaultsRef.current,
              tipoMoeda: fundingSource.tipoMoeda,
              moeda: fundingSource.tipoMoeda === "FIAT" ? (fundingSource.moeda || pendingDefaultsRef.current.moeda) : undefined,
              coin: fundingSource.tipoMoeda === "CRYPTO" ? (fundingSource.coin || undefined) : undefined,
            };
          }
          // Aplicar tipo de transação APÓS a detecção (para que pendingDefaults esteja atualizado)
          setTipoTransacao(defaultTipoTransacao);
        });
      } else {
        // Aplicar tipo de transação imediatamente - isso dispara o reset de contexto
        // Os outros defaults serão aplicados pelo efeito de tipoTransacao
        if (defaultTipoTransacao) {
          setTipoTransacao(defaultTipoTransacao);
        }
      }
    }
  }, [open, defaultTipoTransacao, defaultOrigemBookmakerId, defaultDestinoBookmakerId, defaultOrigemParceiroId, defaultDestinoParceiroId, defaultTipoMoeda, defaultMoeda, defaultCoin]);

  // ============================================================================
  // FUNÇÃO CENTRALIZADA: Reset de contexto de transação
  // Qualquer mudança em tipoMoeda/moeda/coin deve chamar esta função
  // ============================================================================
  /**
   * Reset de contexto dependente.
   * @param resetMoedaCoin - Resetar moeda/coin (quando muda tipoMoeda)
   * @param resetValores - Resetar valores monetários
   * @param preserveTransactionContext - Se true, preserva parceiro e bookmaker (identidade da transação)
   *   Usado ao alternar FIAT ↔ CRYPTO, onde apenas a origem financeira muda.
   */
  const resetContextoDependente = (resetMoedaCoin: boolean = true, resetValores: boolean = true, preserveTransactionContext: boolean = false) => {
    isResettingContext.current = true;
    
    // Reset valores monetários
    if (resetValores) {
      setValor("");
      setValorDisplay("");
      setQtdCoin("");
      setCotacao("");
    }
    
    // Reset moeda/coin (quando muda tipoMoeda)
    if (resetMoedaCoin) {
      setCoin("");
      setMoeda("");
    }
    
    // Reset contas/wallets (sempre resetam - são dependentes da moeda)
    setOrigemContaId("");
    setOrigemWalletId("");
    setDestinoContaId("");
    setDestinoWalletId("");
    
    if (!preserveTransactionContext) {
      // Reset COMPLETO: parceiro e bookmaker também
      setOrigemParceiroId("");
      setOrigemBookmakerId("");
      setDestinoParceiroId("");
      setDestinoBookmakerId("");
      setDescricao("");
      
      // Reset refs de parceiro/bookmaker
      prevDestinoParceiroId.current = "";
      prevOrigemBookmakerId.current = "";
      prevOrigemParceiroId.current = "";
      prevDestinoBookmakerId.current = "";
    }
    
    // Reset refs de contas/wallets (sempre)
    prevCoin.current = resetMoedaCoin ? "" : coin;
    prevDestinoWalletId.current = "";
    prevDestinoContaId.current = "";
    prevOrigemContaId.current = "";
    prevOrigemWalletId.current = "";
    prevMoeda.current = resetMoedaCoin ? "" : moeda;
    prevValor.current = "";
    prevQtdCoin.current = "";
    
    // Liberar flag após reset (usar setTimeout para garantir que os estados foram atualizados)
    setTimeout(() => {
      isResettingContext.current = false;
    }, 50);
  };

  // ============================================================================
  // CONTEXTO GLOBAL: Quando tipoMoeda muda, RESET TOTAL
  // Nenhum dado do contexto anterior pode sobreviver
  // NOTA: O auto-focus para SAQUE CRYPTO (bookmaker first) é tratado em outro useEffect
  //       após bookmakers serem carregados
  // ============================================================================
  useEffect(() => {
    if (tipoMoeda === prevTipoMoeda.current) return; // Sem mudança real
    
    // 🔒 RESET FINANCEIRO APENAS - Preservar parceiro e bookmaker (identidade da transação)
    // "Trocar FIAT ↔ CRYPTO não muda a transação. Muda apenas a origem financeira."
    resetContextoDependente(true, true, true);
    
    // Para affiliate_deposit com moeda já pré-definida, NÃO abrir o seletor de moeda
    // A auto-focus chain (contasBancarias) vai cuidar de abrir o campo correto
    const isAffiliateWithDefaults = entryPoint === "affiliate_deposit" && pendingDefaultsRef.current === null && moeda;
    
    if (!isAffiliateWithDefaults) {
      // Auto-focus baseado no novo contexto
      setTimeout(() => {
        if (tipoMoeda === "CRYPTO") {
          if (tipoTransacao !== "SAQUE") {
            coinSelectRef.current?.focus();
            coinSelectRef.current?.click();
          }
        } else {
          moedaFiatSelectRef.current?.focus();
          moedaFiatSelectRef.current?.click();
        }
      }, 100);
    }
    
    prevTipoMoeda.current = tipoMoeda;
  }, [tipoMoeda, tipoTransacao, entryPoint, moeda]);

  // ============================================================================
  // CONTEXTO: Quando coin muda, resetar seleções de origem/destino
  // (a moeda crypto determina quais wallets são válidas)
  // ============================================================================
  useEffect(() => {
    if (tipoMoeda !== "CRYPTO") return;
    if (isResettingContext.current) return; // Ignorar durante reset de contexto
    if (coin === prevCoin.current) return;
    
    // Resetar valores (cotação pode ser diferente)
    setValor("");
    setValorDisplay("");
    setQtdCoin("");
    setCotacao("");
    
    // Resetar wallets (pode não aceitar a nova moeda)
    setOrigemWalletId("");
    setDestinoWalletId("");
    
    // NÃO resetar parceiros - eles são identidade da transação
    // A wallet será re-selecionada mas o parceiro permanece
    
    // Refs
    prevOrigemWalletId.current = "";
    prevDestinoWalletId.current = "";
    
    prevCoin.current = coin;
    
    // Auto-focus para próximo passo (se não estiver no fluxo de SAQUE CRYPTO que já tem bookmaker)
    // Não abrir parceiro durante fluxo guiado de affiliate_deposit (o fluxo cuida da sequência)
    if (tipoTransacao === "DEPOSITO" && coin && parceiroSelectRef.current && !affiliateFocusActiveRef.current) {
      setTimeout(() => {
        parceiroSelectRef.current?.open();
      }, 100);
    }
  }, [coin, tipoMoeda, tipoTransacao]);

  // ============================================================================
  // CONTEXTO: Quando moeda FIAT muda (BRL/USD), resetar seleções dependentes
  // ============================================================================
  useEffect(() => {
    if (tipoMoeda !== "FIAT") return;
    if (isResettingContext.current) return; // Ignorar durante reset de contexto
    if (moeda === prevMoeda.current) return;
    
    // Resetar valores
    setValor("");
    setValorDisplay("");
    
    // Resetar contas (saldo é por moeda)
    setOrigemContaId("");
    setDestinoContaId("");
    
    // NÃO resetar bookmaker nem parceiro - são identidade da transação
    // A conta bancária será re-selecionada mas parceiro/bookmaker permanecem
    
    // Refs
    prevOrigemContaId.current = "";
    prevDestinoContaId.current = "";
    
    prevMoeda.current = moeda;
    
    // Auto-focus para próximo passo (apenas se parceiro não está preenchido)
    // Não abrir parceiro durante fluxo guiado de affiliate_deposit
    if ((tipoTransacao === "DEPOSITO" || tipoTransacao === "SAQUE") && moeda && parceiroSelectRef.current && !affiliateFocusActiveRef.current) {
      setTimeout(() => {
        parceiroSelectRef.current?.open();
      }, 100);
    }
    // TRANSFERENCIA CAIXA_PARCEIRO: handled in separate effect after fluxoTransferencia declaration
  }, [moeda, tipoMoeda, tipoTransacao]);

  // Auto-focus para outros tipos (não DEPÓSITO): quando moeda é selecionada, foca no Valor
  useEffect(() => {
    if (tipoTransacao !== "DEPOSITO" && tipoMoeda === "FIAT" && moeda && valorFiatInputRef.current) {
      // Não aplicar auto-focus automático para outros tipos de transação
    }
  }, [moeda, tipoMoeda, tipoTransacao]);

  // Auto-focus FIAT valor→parceiro: moved below fluxoTransferencia declaration (see later useEffect)

  // Buscar cotações em tempo real da Binance quando tipo_moeda for CRYPTO
  // e atualizar automaticamente a cada 30 segundos
  useEffect(() => {
    const fetchCryptoPrices = async () => {
      if (tipoMoeda !== "CRYPTO" || !open) return;
      
      setLoadingPrices(true);
      try {
        const { data, error } = await supabase.functions.invoke('get-crypto-prices', {
          body: { symbols: MOEDAS_CRYPTO.map(m => m.value) }
        });

        if (error) {
          console.error('Error fetching crypto prices:', error);
          toast({
            title: "Erro ao buscar cotações",
            description: "Não foi possível obter as cotações em tempo real.",
            variant: "destructive",
          });
        } else if (data?.prices) {
          setCryptoPrices(data.prices);
          console.log('Crypto prices loaded:', data.prices);
        }
      } catch (err) {
        console.error('Error fetching crypto prices:', err);
      } finally {
        setLoadingPrices(false);
      }
    };

    // Busca inicial
    fetchCryptoPrices();

    // Refresh automático a cada 30 segundos
    const intervalId = setInterval(fetchCryptoPrices, 30000);

    // Limpar intervalo quando componente desmontar ou condições mudarem
    return () => clearInterval(intervalId);
  }, [tipoMoeda, open, toast]);

  // Calcular valor USD e cotação automaticamente baseado na quantidade de coins e preço em tempo real
  useEffect(() => {
    if (tipoMoeda === "CRYPTO" && coin && qtdCoin && cryptoPrices[coin]) {
      const qtdNum = parseFloat(qtdCoin);
      const price = cryptoPrices[coin];
      
      if (!isNaN(qtdNum) && qtdNum > 0 && price > 0) {
        const valorUSD = qtdNum * price;
        setValor(valorUSD.toFixed(2));
        setValorDisplay(valorUSD.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }));
        setCotacao(price.toFixed(8));
      }
    }
  }, [tipoMoeda, coin, qtdCoin, cryptoPrices]);

  // Format currency for Brazilian format (1.234,56)
  const formatCurrencyInput = (value: string): string => {
    // Remove non-digits
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    
    // Convert to number and format
    const number = parseInt(digits) / 100;
    return number.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Handle valor change with mask
  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const digits = inputValue.replace(/\D/g, '');
    
    if (!digits) {
      setValor('');
      setValorDisplay('');
      return;
    }
    
    // Store numeric value for database
    const numericValue = (parseInt(digits) / 100).toString();
    setValor(numericValue);
    
    // Store formatted value for display
    setValorDisplay(formatCurrencyInput(inputValue));
  };

  // Origin/Destination state
  const [origemTipo, setOrigemTipo] = useState<string>("");
  const [origemParceiroId, setOrigemParceiroId] = useState<string>("");
  const [origemContaId, setOrigemContaId] = useState<string>("");
  const [origemWalletId, setOrigemWalletId] = useState<string>("");
  const [origemBookmakerId, setOrigemBookmakerId] = useState<string>("");

  const [destinoTipo, setDestinoTipo] = useState<string>("");
  const [destinoParceiroId, setDestinoParceiroId] = useState<string>("");
  const [destinoContaId, setDestinoContaId] = useState<string>("");
  const [destinoWalletId, setDestinoWalletId] = useState<string>("");
  const [destinoBookmakerId, setDestinoBookmakerId] = useState<string>("");

  // Track origemParceiroId and origemWalletId changes for auto-focus (declared after the state)
  const prevOrigemParceiroId = useRef<string>("");
  const prevOrigemWalletId = useRef<string>("");

  // Track destinoBookmakerId changes for auto-focus (CRYPTO deposito flow)
  const prevDestinoBookmakerId = useRef<string>("");
  
  // Track SAQUE flow state changes
  const prevDestinoParceiroId = useRef<string>("");
  const prevDestinoContaId = useRef<string>("");
  const prevDestinoWalletId = useRef<string>("");
  const prevOrigemBookmakerId = useRef<string>("");
  const prevCoin = useRef<string>("");

  // Data for selects
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [walletsCrypto, setWalletsCrypto] = useState<WalletCrypto[]>([]);
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [saldosCaixaFiat, setSaldosCaixaFiat] = useState<SaldoCaixaFiat[]>([]);
  const [saldosCaixaCrypto, setSaldosCaixaCrypto] = useState<SaldoCaixaCrypto[]>([]);
  const [saldosParceirosContas, setSaldosParceirosContas] = useState<SaldoParceiroContas[]>([]);
  const [saldosParceirosWallets, setSaldosParceirosWallets] = useState<SaldoParceiroWallets[]>([]);
  const [investidores, setInvestidores] = useState<Array<{ id: string; nome: string }>>([]);
  const [saquesPendentes, setSaquesPendentes] = useState<Record<string, number>>({});
  
  // Caixa Operacional company account (optional physical destination/origin)
  const [caixaParceiroId, setCaixaParceiroId] = useState<string>("");
  const [caixaContaId, setCaixaContaId] = useState<string>("");
  const [caixaWalletId, setCaixaWalletId] = useState<string>("");
  // Transfer flow type for TRANSFERENCIA
  const [fluxoTransferencia, setFluxoTransferencia] = useState<"CAIXA_PARCEIRO" | "PARCEIRO_PARCEIRO" | "PARCEIRO_CAIXA">("CAIXA_PARCEIRO");
  
  // Alert dialogs state
  const [showNoBankAlert, setShowNoBankAlert] = useState(false);
  const [showNoWalletAlert, setShowNoWalletAlert] = useState(false);
  const [alertParceiroId, setAlertParceiroId] = useState<string>("");
  const [alertTipo, setAlertTipo] = useState<"FIAT" | "CRYPTO">("FIAT");

  // Taxa bancária: alerta antes de confirmar + dados para lançamento automático
  const [showTaxaBancariaAlert, setShowTaxaBancariaAlert] = useState(false);
  const [pendingTransactionData, setPendingTransactionData] = useState<any>(null);
  const [taxaBancariaInfo, setTaxaBancariaInfo] = useState<{
    nomeBanco: string;
    tipo: "percentual" | "fixo";
    valor: number;
    moeda: string;
    valorCalculado: number;
    tipoTransacao: "deposito" | "saque";
  } | null>(null);
  
  // ParceiroDialog state
  const [parceiroDialogOpen, setParceiroDialogOpen] = useState(false);
  const [parceiroToEdit, setParceiroToEdit] = useState<any>(null);
  const [parceiroDialogInitialTab, setParceiroDialogInitialTab] = useState<"dados" | "bancos" | "crypto">("bancos");

  // Auto-focus FIAT: quando valor é preenchido (>0), abre o select Parceiro
  // IMPORTANTE: Apenas para fluxos onde o parceiro é selecionado DEPOIS do valor
  // Exclui: DEPOSITO, SAQUE, e TRANSFERENCIA PARCEIRO→PARCEIRO (parceiro já selecionado antes do valor)
  useEffect(() => {
    const valorNum = parseFloat(valor);
    const prevValorNum = parseFloat(prevValor.current || "0");
    const isTransferenciaParceiroParceiro = tipoTransacao === "TRANSFERENCIA" && fluxoTransferencia === "PARCEIRO_PARCEIRO";
    if (tipoTransacao !== "DEPOSITO" && tipoTransacao !== "SAQUE" && !isTransferenciaParceiroParceiro && tipoMoeda === "FIAT" && valorNum > 0 && prevValorNum === 0 && parceiroSelectRef.current) {
      setTimeout(() => {
        parceiroSelectRef.current?.open();
      }, 150);
    }
    prevValor.current = valor;
  }, [valor, tipoMoeda, tipoTransacao, fluxoTransferencia]);

  // TRANSFERENCIA CAIXA_PARCEIRO: quando moeda é selecionada, abrir parceiro destino
  useEffect(() => {
    if (tipoMoeda !== "FIAT") return;
    if (isResettingContext.current) return;
    if (tipoTransacao !== "TRANSFERENCIA" || fluxoTransferencia !== "CAIXA_PARCEIRO") return;
    if (!moeda) return;
    // Only trigger when parceiro hasn't been selected yet
    if (destinoParceiroId) return;
    
    setTimeout(() => {
      parceiroDestinoSelectRef.current?.open();
    }, 150);
  }, [moeda, tipoMoeda, tipoTransacao, fluxoTransferencia, destinoParceiroId]);

  useEffect(() => {
    if (open) {
      fetchAccountsAndWallets();
      fetchBookmakers();
      fetchSaldosCaixa();
      fetchSaldosParceiros();
      fetchInvestidores();
      fetchSaquesPendentes();
    }
  }, [open]);

  useEffect(() => {
    // ========================================================================
    // CONTEXTO GLOBAL: Mudança de Tipo de Transação = RESET TOTAL
    // Nenhum dado do contexto anterior pode sobreviver
    // ========================================================================
    
    // Capturar defaults pendentes ANTES do reset (podem ter sido setados pela abertura do dialog)
    const pendingDefaults = pendingDefaultsRef.current;
    
    // Reset ORIGEM
    setOrigemTipo("");
    setOrigemParceiroId("");
    setOrigemContaId("");
    setOrigemWalletId("");
    setOrigemBookmakerId("");
    
    // Reset DESTINO
    setDestinoTipo("");
    setDestinoParceiroId("");
    setDestinoContaId("");
    setDestinoWalletId("");
    setDestinoBookmakerId("");
    
    // Reset fluxos específicos
    setFluxoTransferencia("CAIXA_PARCEIRO");
    setFluxoAporte("APORTE");
    setInvestidorId("");
    
    // Reset valores e moedas
    setValor("");
    setValorDisplay("");
    setQtdCoin("");
    setCotacao("");
    setCoin("");
    setTipoMoeda("FIAT");
    setMoeda("");
    setDescricao("");
    
    // Reset TODOS os refs de tracking (evita auto-focus indevido e herança de estado)
    prevCoin.current = "";
    prevDestinoParceiroId.current = "";
    prevDestinoWalletId.current = "";
    prevDestinoContaId.current = "";
    prevOrigemBookmakerId.current = "";
    prevOrigemParceiroId.current = "";
    prevOrigemContaId.current = "";
    prevOrigemWalletId.current = "";
    prevDestinoBookmakerId.current = "";
    prevMoeda.current = "";
    prevTipoMoeda.current = "FIAT";
    prevValor.current = "";
    prevQtdCoin.current = "";

    // Set defaults based on transaction type
    if (tipoTransacao === "APORTE_FINANCEIRO") {
      // Will be set by fluxoAporte toggle
    } else if (tipoTransacao === "DEPOSITO") {
      setOrigemTipo("PARCEIRO_CONTA");
      setDestinoTipo("BOOKMAKER");
    } else if (tipoTransacao === "SAQUE") {
      setOrigemTipo("BOOKMAKER");
      setDestinoTipo("PARCEIRO_CONTA");
      // Aplicar tipoMoeda do default ou FIAT como fallback
      const defaultedTipoMoeda = pendingDefaults?.tipoMoeda || "FIAT";
      setTipoMoeda(defaultedTipoMoeda);
      prevTipoMoeda.current = defaultedTipoMoeda;
    } else if (tipoTransacao === "TRANSFERENCIA") {
      setOrigemTipo("CAIXA_OPERACIONAL");
      setDestinoTipo("PARCEIRO_CONTA");
    }
    
    // ========================================================================
    // FIX: Aplicar defaults pendentes APÓS o reset, com delay para garantir
    // que o React processe os resets antes de aplicar os novos valores
    // ========================================================================
    if (pendingDefaults && tipoTransacao) {
      setTimeout(() => {
        // Aplicar moeda/coin se especificado
        if (pendingDefaults.moeda) {
          setMoeda(pendingDefaults.moeda);
          prevMoeda.current = pendingDefaults.moeda;
        }
        if (pendingDefaults.coin) {
          setCoin(pendingDefaults.coin);
          prevCoin.current = pendingDefaults.coin;
        }
        
        // Aplicar parceiro destino
        if (pendingDefaults.destinoParceiroId) {
          setDestinoParceiroId(pendingDefaults.destinoParceiroId);
          prevDestinoParceiroId.current = pendingDefaults.destinoParceiroId;
        }
        
        // Aplicar parceiro origem (ex: depósito contextual)
        if (pendingDefaults.origemParceiroId) {
          setOrigemParceiroId(pendingDefaults.origemParceiroId);
          // NÃO setar prevOrigemParceiroId.current aqui para affiliate_deposit,
          // para que a auto-focus chain (origemParceiroId → contaBancária) dispare naturalmente
          if (entryPoint !== "affiliate_deposit") {
            prevOrigemParceiroId.current = pendingDefaults.origemParceiroId;
          }
        }
        
        // Aplicar bookmaker origem com delay adicional para garantir que o parceiro foi processado
        if (pendingDefaults.origemBookmakerId) {
          setTimeout(() => {
            setOrigemBookmakerId(pendingDefaults.origemBookmakerId!);
            prevOrigemBookmakerId.current = pendingDefaults.origemBookmakerId!;
          }, 100);
        }
        
        // Aplicar bookmaker destino (ex: depósito contextual)
        if (pendingDefaults.destinoBookmakerId) {
          setTimeout(() => {
            setDestinoBookmakerId(pendingDefaults.destinoBookmakerId!);
            prevDestinoBookmakerId.current = pendingDefaults.destinoBookmakerId!;
          }, 100);
        }
        
        // Limpar ref após aplicar
        pendingDefaultsRef.current = null;
      }, 50);
    }
  }, [tipoTransacao]);
  
  useEffect(() => {
    // Update origem/destino based on transfer flow and currency type
    // NOTA: Os resets de seleção são tratados pelo resetContextoDependente quando tipoMoeda muda
    if (tipoTransacao === "TRANSFERENCIA") {
      if (fluxoTransferencia === "CAIXA_PARCEIRO") {
        setOrigemTipo("CAIXA_OPERACIONAL");
        if (tipoMoeda === "FIAT") {
          setDestinoTipo("PARCEIRO_CONTA");
        } else {
          setDestinoTipo("PARCEIRO_WALLET");
        }
        // Limpar origem apenas quando fluxo muda para CAIXA_PARCEIRO
        setOrigemParceiroId("");
        setOrigemContaId("");
        setOrigemWalletId("");
      } else if (fluxoTransferencia === "PARCEIRO_CAIXA") {
        // PARCEIRO → CAIXA OPERACIONAL
        setDestinoTipo("CAIXA_OPERACIONAL");
        if (tipoMoeda === "FIAT") {
          setOrigemTipo("PARCEIRO_CONTA");
        } else {
          setOrigemTipo("PARCEIRO_WALLET");
        }
        // Limpar destino quando fluxo muda para PARCEIRO_CAIXA
        setDestinoParceiroId("");
        setDestinoContaId("");
        setDestinoWalletId("");
      } else {
        // PARCEIRO_PARCEIRO
        if (tipoMoeda === "FIAT") {
          setOrigemTipo("PARCEIRO_CONTA");
          setDestinoTipo("PARCEIRO_CONTA");
        } else {
          setOrigemTipo("PARCEIRO_WALLET");
          setDestinoTipo("PARCEIRO_WALLET");
        }
      }
    }
    
    // Update origem type for DEPOSITO based on currency type
    if (tipoTransacao === "DEPOSITO") {
      if (tipoMoeda === "FIAT") {
        setOrigemTipo("PARCEIRO_CONTA");
      } else {
        setOrigemTipo("PARCEIRO_WALLET");
      }
      // NOTA: Resets são tratados pelo resetContextoDependente
    }
    
    // Update destino type for SAQUE based on currency type
    if (tipoTransacao === "SAQUE") {
      if (tipoMoeda === "FIAT") {
        setDestinoTipo("PARCEIRO_CONTA");
      } else {
        setDestinoTipo("PARCEIRO_WALLET");
      }
      // NOTA: Resets são tratados pelo resetContextoDependente
    }
  }, [fluxoTransferencia, tipoTransacao, tipoMoeda]);

  // Limpar DESTINO quando ORIGEM mudar (para TRANSFERENCIA e DEPOSITO)
  // CRÍTICO: Wallet/Conta são origens FINANCEIRAS e NÃO devem resetar bookmaker (destino da transação)
  // Apenas mudança de PARCEIRO (identidade) deve resetar bookmaker
  useEffect(() => {
    if (tipoTransacao === "TRANSFERENCIA" && fluxoTransferencia === "PARCEIRO_PARCEIRO") {
      setDestinoParceiroId("");
      setDestinoContaId("");
      setDestinoWalletId("");
    }
    if (tipoTransacao === "DEPOSITO") {
      // Só resetar bookmaker se o PARCEIRO mudou (mudança de identidade)
      // Wallet e conta bancária são origens financeiras - não impactam o destino
      const parceiroMudou = origemParceiroId !== prevOrigemParceiroId.current;
      if (parceiroMudou) {
        setDestinoBookmakerId("");
      }
    }
  }, [origemParceiroId, origemContaId, origemWalletId, tipoTransacao, fluxoTransferencia]);

  // Limpar ORIGEM quando DESTINO mudar (somente para SAQUE FIAT)
  // SAQUE CRYPTO usa fluxo invertido: bookmaker é selecionada primeiro
  // CRÍTICO: Não limpar se estamos no fluxo de defaults (pendingDefaultsRef não foi limpo ainda)
  useEffect(() => {
    if (tipoTransacao === "SAQUE" && tipoMoeda === "FIAT") {
      // Se ainda há defaults pendentes ou se já temos origemBookmakerId setado via defaults, não limpar
      if (pendingDefaultsRef.current?.origemBookmakerId) {
        return; // Não limpar - o default será aplicado
      }
      // Só limpar se houve uma mudança REAL no parceiro (não a primeira aplicação via default)
      if (prevDestinoParceiroId.current && prevDestinoParceiroId.current !== destinoParceiroId) {
        setOrigemBookmakerId("");
      }
    }
  }, [destinoParceiroId, destinoContaId, tipoTransacao, tipoMoeda]);

  // ====== AUTO-FOCUS CHAIN FOR DEPOSIT FLOW ======
  
  // Auto-focus FIAT: quando parceiro é selecionado, abre o select Conta Bancária
  // Também auto-seleciona se houver apenas uma conta disponível
  useEffect(() => {
    if (tipoMoeda === "FIAT" && origemParceiroId && origemParceiroId !== prevOrigemParceiroId.current) {
      // Para affiliate_deposit, aguardar até que contasBancarias esteja carregado
      // antes de tentar abrir o seletor (evita race condition com fetch assíncrono)
      if (entryPoint === "affiliate_deposit" && contasBancarias.length === 0) {
        // Dados ainda não carregaram — não atualizar prevRef, aguardar próximo render
        return;
      }
      
      // Verificar quantas contas com saldo o parceiro tem
      const contasComSaldo = contasBancarias.filter((c) => {
        if (c.parceiro_id !== origemParceiroId) return false;
        const saldo = saldosParceirosContas.find(
          s => s.conta_id === c.id && s.moeda === moeda
        );
        return saldo && saldo.saldo > 0;
      });
      
      // Se houver exatamente uma conta, auto-selecionar
      if (contasComSaldo.length === 1) {
        setOrigemContaId(contasComSaldo[0].id);
        // O próximo useEffect (origemContaId) vai cuidar de abrir o BookmakerSelect
      } else if (contaBancariaSelectRef.current) {
        setTimeout(() => {
          contaBancariaSelectRef.current?.focus();
          contaBancariaSelectRef.current?.click();
        }, 150);
      }
    }
    // Auto-focus CRYPTO: quando parceiro é selecionado, abre o select Wallet Crypto
    if (tipoMoeda === "CRYPTO" && origemParceiroId && origemParceiroId !== prevOrigemParceiroId.current && walletCryptoSelectRef.current) {
      setTimeout(() => {
        walletCryptoSelectRef.current?.focus();
        walletCryptoSelectRef.current?.click();
      }, 150);
    }
    // Só atualizar prevRef quando realmente processamos (não quando aguardando dados)
    if (origemParceiroId && (entryPoint !== "affiliate_deposit" || contasBancarias.length > 0)) {
      prevOrigemParceiroId.current = origemParceiroId;
    }
  }, [origemParceiroId, tipoMoeda, contasBancarias, saldosParceirosContas, moeda, entryPoint]);

  // Auto-focus FIAT DEPÓSITO: quando conta bancária é selecionada, abre o select Bookmaker
  // Se bookmaker já está pré-preenchido (affiliate_deposit), pula direto para o campo Valor
  useEffect(() => {
    if (tipoTransacao === "DEPOSITO" && tipoMoeda === "FIAT" && origemContaId && origemContaId !== prevOrigemContaId.current) {
      if (destinoBookmakerId) {
        // Bookmaker já pré-preenchido → foca no campo Valor
        setTimeout(() => {
          valorFiatInputRef.current?.focus();
        }, 150);
      } else if (bookmakerSelectRef.current) {
        setTimeout(() => {
          bookmakerSelectRef.current?.open();
        }, 150);
      }
    }
    prevOrigemContaId.current = origemContaId;
  }, [origemContaId, tipoMoeda, tipoTransacao, destinoBookmakerId]);

  // ====== AUTO-FOCUS CHAIN FOR SAQUE (WITHDRAWAL) FLOW ======
  
  // SAQUE: quando parceiro é selecionado, abre o select Conta Bancária (DESTINO)
  // Também auto-seleciona se houver apenas uma conta disponível
  useEffect(() => {
    if (tipoTransacao !== "SAQUE" || tipoMoeda !== "FIAT") return;
    if (!destinoParceiroId || destinoParceiroId === prevDestinoParceiroId.current) return;
    
    // Se estamos no fluxo de defaults (bookmaker já pré-setado), não fazer auto-select/focus
    if (pendingDefaultsRef.current?.origemBookmakerId) {
      prevDestinoParceiroId.current = destinoParceiroId;
      return;
    }
    
    // Verificar quantas contas o parceiro tem
    const contasDoParceiro = contasBancarias.filter((c) => c.parceiro_id === destinoParceiroId);
    
    // Se houver exatamente uma conta, auto-selecionar
    if (contasDoParceiro.length === 1) {
      setDestinoContaId(contasDoParceiro[0].id);
      // O próximo useEffect (destinoContaId) vai cuidar de abrir o BookmakerSelect
    } else if (contaBancariaSelectRef.current) {
      setTimeout(() => {
        contaBancariaSelectRef.current?.focus();
        contaBancariaSelectRef.current?.click();
      }, 150);
    }
    
    prevDestinoParceiroId.current = destinoParceiroId;
  }, [destinoParceiroId, tipoTransacao, tipoMoeda, contasBancarias]);

  // SAQUE: quando conta bancária (destino) é selecionada, abre o select Bookmaker (origem)
  useEffect(() => {
    if (tipoTransacao !== "SAQUE" || tipoMoeda !== "FIAT") return;
    if (!destinoContaId || destinoContaId === prevDestinoContaId.current) return;
    
    // Se o bookmaker já está pré-setado (fluxo de defaults), não abrir o select
    if (origemBookmakerId) {
      prevDestinoContaId.current = destinoContaId;
      return;
    }
    
    if (bookmakerSelectRef.current) {
      setTimeout(() => {
        bookmakerSelectRef.current?.open();
      }, 150);
    }
    
    prevDestinoContaId.current = destinoContaId;
  }, [destinoContaId, tipoTransacao, tipoMoeda, origemBookmakerId]);

  // SAQUE: quando bookmaker (origem) é selecionada, foca no campo Valor/Quantidade
  useEffect(() => {
    if (tipoTransacao !== "SAQUE") return;
    if (!origemBookmakerId || origemBookmakerId === prevOrigemBookmakerId.current) return;
    
    // CRYPTO: foca no campo Quantidade de Coins
    if (tipoMoeda === "CRYPTO" && qtdCoinInputRef.current) {
      setTimeout(() => {
        qtdCoinInputRef.current?.focus();
      }, 150);
    } 
    // FIAT: foca no campo Valor
    else if (tipoMoeda === "FIAT" && valorFiatInputRef.current) {
      setTimeout(() => {
        valorFiatInputRef.current?.focus();
      }, 150);
    }
    
    prevOrigemBookmakerId.current = origemBookmakerId;
  }, [origemBookmakerId, tipoTransacao, tipoMoeda]);

  // ====== AUTO-FOCUS CHAIN FOR SAQUE CRYPTO FLOW ======
  
  // SAQUE CRYPTO: quando tipo de moeda muda para CRYPTO, abre o BookmakerSelect primeiro (fluxo invertido)
  useEffect(() => {
    if (tipoTransacao !== "SAQUE") return;
    if (tipoMoeda !== "CRYPTO") return;
    if (prevTipoMoeda.current === "CRYPTO") return; // Não re-executar se já estava em CRYPTO
    
    // Verificar se há bookmakers com saldo USD
    const temBookmakerComSaldoUsd = bookmakers.some(b => b.saldo_usd > 0);
    if (!temBookmakerComSaldoUsd) return;
    
    // Abrir BookmakerSelect para o usuário selecionar a origem
    if (bookmakerSelectRef.current) {
      setTimeout(() => {
        bookmakerSelectRef.current?.open();
      }, 100);
    }
  }, [tipoMoeda, tipoTransacao, bookmakers]);
  
  // SAQUE CRYPTO: quando bookmaker é selecionada, buscar moeda do último depósito crypto
  useEffect(() => {
    if (tipoTransacao !== "SAQUE" || tipoMoeda !== "CRYPTO") return;
    if (!origemBookmakerId) return;
    if (origemBookmakerId === prevOrigemBookmakerId.current) return;
    
    const fetchUltimoDepositoCoin = async () => {
      const { data } = await supabase
        .from("cash_ledger")
        .select("coin")
        .eq("destino_bookmaker_id", origemBookmakerId)
        .eq("tipo_transacao", "DEPOSITO")
        .eq("tipo_moeda", "CRYPTO")
        .not("coin", "is", null)
        .order("data_transacao", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data?.coin) {
        // Pré-seleciona a moeda do último depósito
        setCoin(data.coin);
        // Abre o select de moeda com foco para o usuário confirmar ou alterar
        setTimeout(() => {
          coinSelectRef.current?.focus();
          coinSelectRef.current?.click();
        }, 150);
      } else {
        // Sem histórico de depósito, abre o select para o usuário escolher
        setTimeout(() => {
          coinSelectRef.current?.focus();
          coinSelectRef.current?.click();
        }, 150);
      }
    };
    
    fetchUltimoDepositoCoin();
    
    // Atualizar ref após buscar (não antes, para permitir re-execução se bookmaker mudar)
    prevOrigemBookmakerId.current = origemBookmakerId;
  }, [origemBookmakerId, tipoTransacao, tipoMoeda]);
  
  // SAQUE CRYPTO: quando coin é confirmado/selecionado (após bookmaker), abre o ParceiroSelect
  useEffect(() => {
    if (tipoTransacao !== "SAQUE" || tipoMoeda !== "CRYPTO") return;
    if (!coin || !origemBookmakerId) return; // Precisa ter bookmaker E coin selecionados

    const coinMudou = coin !== prevCoin.current;
    prevCoin.current = coin;
    if (!coinMudou) return;

    // Radix Select pode ignorar o click se outro Select acabou de fechar.
    // Além disso, o ParceiroSelect é renderizado condicionalmente, então o ref pode não estar pronto ainda.
    const OPEN_DELAY_MS = 320;
    const MAX_TRIES = 12;
    const TRY_EVERY_MS = 60;

    let tries = 0;
    const tryOpen = () => {
      tries += 1;
      const ref = parceiroSelectRef.current;

      if (ref) {
        ref.focus();
        // double-rAF ajuda quando o DOM acabou de renderizar
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            ref.open();
          });
        });
        return;
      }

      if (tries < MAX_TRIES) {
        setTimeout(tryOpen, TRY_EVERY_MS);
      }
    };

    const id = window.setTimeout(tryOpen, OPEN_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [coin, tipoTransacao, tipoMoeda, origemBookmakerId]);

  // SAQUE CRYPTO: quando parceiro é selecionado, abre o select Wallet (DESTINO)
  // Também auto-seleciona se houver apenas uma wallet disponível
  useEffect(() => {
    if (tipoTransacao !== "SAQUE" || tipoMoeda !== "CRYPTO") return;
    if (!destinoParceiroId || destinoParceiroId === prevDestinoParceiroId.current) return;
    
    // Verificar quantas wallets o parceiro tem para a moeda selecionada
    const walletsDoParceiro = walletsCrypto.filter(
      (w) => w.parceiro_id === destinoParceiroId && w.moeda?.includes(coin)
    );
    
    // Se houver exatamente uma wallet, auto-selecionar
    if (walletsDoParceiro.length === 1) {
      setDestinoWalletId(walletsDoParceiro[0].id);
      // O próximo useEffect (destinoWalletId) vai cuidar de abrir o BookmakerSelect
    } else if (walletCryptoSelectRef.current) {
      setTimeout(() => {
        walletCryptoSelectRef.current?.focus();
        walletCryptoSelectRef.current?.click();
      }, 150);
    }
    
    prevDestinoParceiroId.current = destinoParceiroId;
  }, [destinoParceiroId, tipoTransacao, tipoMoeda, walletsCrypto, coin]);

  // SAQUE CRYPTO: quando wallet (destino) é selecionada, abre o BookmakerSelect (origem)
  // SKIP when affiliate guided flow is active (bookmaker already pre-filled)
  useEffect(() => {
    if (tipoTransacao !== "SAQUE" || tipoMoeda !== "CRYPTO") return;
    if (!destinoWalletId || destinoWalletId === prevDestinoWalletId.current) return;
    
    // Se o fluxo guiado de afiliado está ativo ou já completou, o bookmaker já está pré-preenchido
    // Pular BookmakerSelect e focar direto no campo Valor
    if (entryPoint === "affiliate_deposit" && origemBookmakerId) {
      prevDestinoWalletId.current = destinoWalletId;
      setTimeout(() => {
        if (qtdCoinInputRef.current) {
          qtdCoinInputRef.current.focus();
        } else if (valorFiatInputRef.current) {
          valorFiatInputRef.current.focus();
        }
      }, 200);
      return;
    }
    
    // Abrir BookmakerSelect para selecionar a origem
    if (bookmakerSelectRef.current) {
      setTimeout(() => {
        bookmakerSelectRef.current?.open();
      }, 150);
    }
    
    prevDestinoWalletId.current = destinoWalletId;
  }, [destinoWalletId, tipoTransacao, tipoMoeda, entryPoint, origemBookmakerId]);

  // Auto-focus CRYPTO DEPÓSITO: quando wallet de origem é selecionada, abre o select Bookmaker (destino)
  useEffect(() => {
    if (tipoTransacao !== "DEPOSITO") return;
    if (tipoMoeda === "CRYPTO" && origemWalletId && origemWalletId !== prevOrigemWalletId.current && bookmakerSelectRef.current) {
      setTimeout(() => {
        bookmakerSelectRef.current?.open();
      }, 150);
    }
    prevOrigemWalletId.current = origemWalletId;
  }, [origemWalletId, tipoMoeda, tipoTransacao]);

  // Auto-focus DEPÓSITO: quando bookmaker é selecionado, foca no campo Valor
  useEffect(() => {
    if (tipoTransacao === "DEPOSITO" && destinoBookmakerId && destinoBookmakerId !== prevDestinoBookmakerId.current) {
      if (tipoMoeda === "CRYPTO" && qtdCoinInputRef.current) {
        setTimeout(() => {
          qtdCoinInputRef.current?.focus();
        }, 150);
      } else if (tipoMoeda === "FIAT" && valorFiatInputRef.current) {
        setTimeout(() => {
          valorFiatInputRef.current?.focus();
        }, 150);
      }
    }
    prevDestinoBookmakerId.current = destinoBookmakerId;
  }, [destinoBookmakerId, tipoMoeda, tipoTransacao]);

  // ====== GUIDED FOCUS SEQUENCE FOR AFFILIATE FLOWS ======
  // Activated only when entryPoint === "affiliate_deposit"
  // DEPOSITO sequence: Tipo de Moeda → Moeda/Coin → Wallet/Conta (origem) → Valor
  // SAQUE sequence: Tipo de Moeda → Moeda/Coin → Wallet/Conta (destino) → Valor
  // SKIP logic: If defaults already fill tipoMoeda+moeda, the existing auto-focus chain
  // (origemParceiroId → contaBancária → bookmaker → valor) handles the rest naturally.
  useEffect(() => {
    if (!open || entryPoint !== "affiliate_deposit") return;
    if (tipoTransacao !== "DEPOSITO" && tipoTransacao !== "SAQUE") return;
    
    // Start guided focus after defaults are applied
    // Use longer delay to ensure defaults (setTimeout 50ms) have been applied and React has re-rendered
    const timer = setTimeout(() => {
      // Read latest values from refs/state (closure might be stale)
      // prevMoeda.current is set synchronously during default application
      const currentMoeda = prevMoeda.current;
      const currentCoin = prevCoin.current;
      const currentTipoMoeda = prevTipoMoeda.current;
      
      const hasTipoMoeda = !!currentTipoMoeda;
      const hasMoedaOrCoin = (currentTipoMoeda === "CRYPTO" && !!currentCoin) || (currentTipoMoeda === "FIAT" && !!currentMoeda);
      
      if (hasTipoMoeda && hasMoedaOrCoin) {
        // Defaults already cover tipoMoeda + moeda/coin.
        // The natural auto-focus chain (origemParceiroId → contaBancária) relies on
        // moeda/tipoMoeda effects firing, but since prevMoeda/prevTipoMoeda are already
        // set to match, those effects are skipped. We need to manually kick the chain.
        affiliateFocusActiveRef.current = false;
        affiliateFocusStepRef.current = 0;
        
        // Manually trigger the parceiro→conta focus chain since the natural effects won't fire
        // Wait for contasBancarias to be available
        const kickContaFocus = () => {
          setTimeout(() => {
            if (currentTipoMoeda === "CRYPTO" && walletCryptoSelectRef.current) {
              walletCryptoSelectRef.current.focus();
              walletCryptoSelectRef.current.click();
            } else if (currentTipoMoeda === "FIAT" && contaBancariaSelectRef.current) {
              contaBancariaSelectRef.current.focus();
              contaBancariaSelectRef.current.click();
            }
          }, 300);
        };
        kickContaFocus();
        return;
      }
      
      affiliateFocusActiveRef.current = true;
      
      if (hasTipoMoeda) {
        // Skip to step 2: open moeda/coin selector
        affiliateFocusStepRef.current = 2;
        setTimeout(() => {
          if (currentTipoMoeda === "CRYPTO" && coinSelectRef.current) {
            coinSelectRef.current.focus();
            coinSelectRef.current.click();
          } else if (currentTipoMoeda === "FIAT" && moedaFiatSelectRef.current) {
            moedaFiatSelectRef.current.focus();
            moedaFiatSelectRef.current.click();
          }
        }, 200);
      } else {
        // Step 1: Open Tipo de Moeda selector
        affiliateFocusStepRef.current = 1;
        if (tipoMoedaSelectRef.current) {
          tipoMoedaSelectRef.current.focus();
          tipoMoedaSelectRef.current.click();
        }
      }
    }, 400);
    
    return () => {
      clearTimeout(timer);
      affiliateFocusActiveRef.current = false;
      affiliateFocusStepRef.current = 0;
    };
  }, [open, entryPoint, tipoTransacao]);

  // Affiliate focus step 2: After tipoMoeda changes, open coin/moeda selector
  useEffect(() => {
    if (!affiliateFocusActiveRef.current || affiliateFocusStepRef.current !== 1) return;
    if (!tipoMoeda) return;
    
    affiliateFocusStepRef.current = 2;
    setTimeout(() => {
      if (tipoMoeda === "CRYPTO" && coinSelectRef.current) {
        coinSelectRef.current.focus();
        coinSelectRef.current.click();
      } else if (tipoMoeda === "FIAT" && moedaFiatSelectRef.current) {
        moedaFiatSelectRef.current.focus();
        moedaFiatSelectRef.current.click();
      }
    }, 200);
  }, [tipoMoeda]);

  // Affiliate focus step 3: After coin/moeda selected, open wallet/conta selector
  useEffect(() => {
    if (!affiliateFocusActiveRef.current || affiliateFocusStepRef.current !== 2) return;
    const hasMoedaOrCoin = (tipoMoeda === "CRYPTO" && coin) || (tipoMoeda === "FIAT" && moeda);
    if (!hasMoedaOrCoin) return;
    
    affiliateFocusStepRef.current = 3;
    // Focus wallet/conta selector after coin/moeda is selected
    setTimeout(() => {
      if (tipoMoeda === "CRYPTO" && walletCryptoSelectRef.current) {
        walletCryptoSelectRef.current.focus();
        walletCryptoSelectRef.current.click();
      } else if (tipoMoeda === "FIAT" && contaBancariaSelectRef.current) {
        contaBancariaSelectRef.current.focus();
        contaBancariaSelectRef.current.click();
      }
    }, 300);
  }, [coin, moeda, tipoMoeda]);

  // Affiliate focus step 4: After wallet/conta selected, focus valor input
  // For DEPOSITO: watches origemWalletId/origemContaId
  // For SAQUE: watches destinoWalletId/destinoContaId (bookmaker already pre-filled, skip it)
  useEffect(() => {
    if (!affiliateFocusActiveRef.current || affiliateFocusStepRef.current !== 3) return;
    
    const hasWalletOrConta = tipoTransacao === "SAQUE"
      ? (tipoMoeda === "CRYPTO" && destinoWalletId) || (tipoMoeda === "FIAT" && destinoContaId)
      : (tipoMoeda === "CRYPTO" && origemWalletId) || (tipoMoeda === "FIAT" && origemContaId);
    if (!hasWalletOrConta) return;
    
    affiliateFocusStepRef.current = 4;
    affiliateFocusActiveRef.current = false;
    
    if (tipoMoeda === "CRYPTO" && qtdCoinInputRef.current) {
      setTimeout(() => {
        qtdCoinInputRef.current?.focus();
      }, 200);
    } else if (tipoMoeda === "FIAT" && valorFiatInputRef.current) {
      setTimeout(() => {
        valorFiatInputRef.current?.focus();
      }, 200);
    }
  }, [origemWalletId, origemContaId, destinoWalletId, destinoContaId, tipoMoeda, tipoTransacao]);

  // ====== GUIDED FOCUS SEQUENCE FOR PARCEIRO→PARCEIRO TRANSFER ======
  // Activated when fluxoTransferencia changes to PARCEIRO_PARCEIRO
  // Sequence: Tipo de Moeda → Moeda/Coin → Parceiro origem → Conta origem → Parceiro destino → Conta destino → Valor
  useEffect(() => {
    if (tipoTransacao !== "TRANSFERENCIA" || fluxoTransferencia !== "PARCEIRO_PARCEIRO") {
      transferFocusActiveRef.current = false;
      transferFocusStepRef.current = 0;
      return;
    }
    
    const timer = setTimeout(() => {
      transferFocusActiveRef.current = true;
      // If tipoMoeda is already set (e.g. "FIAT" default), skip step 1 and go directly to step 2 (moeda selector)
      if (tipoMoeda) {
        transferFocusStepRef.current = 2;
        if (tipoMoeda === "CRYPTO" && coinSelectRef.current) {
          coinSelectRef.current.focus();
          coinSelectRef.current.click();
        } else if (tipoMoeda === "FIAT" && moedaFiatSelectRef.current) {
          moedaFiatSelectRef.current.focus();
          moedaFiatSelectRef.current.click();
        }
      } else {
        transferFocusStepRef.current = 1;
        if (tipoMoedaSelectRef.current) {
          tipoMoedaSelectRef.current.focus();
          tipoMoedaSelectRef.current.click();
        }
      }
    }, 300);
    
    return () => {
      clearTimeout(timer);
    };
  }, [fluxoTransferencia, tipoTransacao]);

  // Transfer focus step 2: After tipoMoeda changes, open coin/moeda selector
  useEffect(() => {
    if (!transferFocusActiveRef.current || transferFocusStepRef.current !== 1) return;
    if (!tipoMoeda) return;
    
    transferFocusStepRef.current = 2;
    setTimeout(() => {
      if (tipoMoeda === "CRYPTO" && coinSelectRef.current) {
        coinSelectRef.current.focus();
        coinSelectRef.current.click();
      } else if (tipoMoeda === "FIAT" && moedaFiatSelectRef.current) {
        moedaFiatSelectRef.current.focus();
        moedaFiatSelectRef.current.click();
      }
    }, 200);
  }, [tipoMoeda]);

  // Transfer focus step 3: After coin/moeda selected
  // CRYPTO: focus qtdCoin input | FIAT: skip to parceiro origem
  useEffect(() => {
    if (!transferFocusActiveRef.current || transferFocusStepRef.current !== 2) return;
    const hasMoedaOrCoin = (tipoMoeda === "CRYPTO" && coin) || (tipoMoeda === "FIAT" && moeda);
    if (!hasMoedaOrCoin) return;
    
    if (tipoMoeda === "CRYPTO") {
      // Focus qtd coins input
      transferFocusStepRef.current = 3;
      setTimeout(() => {
        qtdCoinInputRef.current?.focus();
      }, 200);
    } else {
      // FIAT: skip to parceiro origem (step 4)
      transferFocusStepRef.current = 4;
      setTimeout(() => {
        parceiroSelectRef.current?.open();
      }, 200);
    }
  }, [coin, moeda, tipoMoeda]);

  // Transfer focus step 4 (CRYPTO only): After user fills qtdCoin, move to parceiro origem
  // We watch for qtdCoin blur via a separate handler (see below)

  // Transfer focus step 5: After parceiro origem selected, open wallet/conta origem
  useEffect(() => {
    if (!transferFocusActiveRef.current) return;
    if (transferFocusStepRef.current !== 4 && transferFocusStepRef.current !== 3) return;
    // For CRYPTO step 3 means qtdCoin was focused, parceiro comes after blur
    // For FIAT step 4 is parceiro
    if (!origemParceiroId) return;
    
    transferFocusStepRef.current = 5;
    setTimeout(() => {
      if (tipoMoeda === "CRYPTO" && walletCryptoSelectRef.current) {
        walletCryptoSelectRef.current.focus();
        walletCryptoSelectRef.current.click();
      } else if (tipoMoeda === "FIAT" && contaBancariaSelectRef.current) {
        contaBancariaSelectRef.current.focus();
        contaBancariaSelectRef.current.click();
      }
    }, 200);
  }, [origemParceiroId, tipoMoeda]);

  // Transfer focus step 6: After wallet/conta origem selected, open parceiro destino
  useEffect(() => {
    if (!transferFocusActiveRef.current || transferFocusStepRef.current !== 5) return;
    const hasOrigemWalletOrConta = (tipoMoeda === "CRYPTO" && origemWalletId) || (tipoMoeda === "FIAT" && origemContaId);
    if (!hasOrigemWalletOrConta) return;
    
    transferFocusStepRef.current = 6;
    setTimeout(() => {
      parceiroDestinoSelectRef.current?.open();
    }, 200);
  }, [origemWalletId, origemContaId, tipoMoeda]);

  // Transfer focus step 7: After destino parceiro selected, open destino conta/wallet
  useEffect(() => {
    if (!transferFocusActiveRef.current || transferFocusStepRef.current !== 6) return;
    if (!destinoParceiroId) return;
    
    transferFocusStepRef.current = 7;
    setTimeout(() => {
      if (tipoMoeda === "CRYPTO" && destinoWalletSelectRef.current) {
        destinoWalletSelectRef.current.focus();
        destinoWalletSelectRef.current.click();
      } else if (tipoMoeda === "FIAT" && destinoContaBancariaSelectRef.current) {
        destinoContaBancariaSelectRef.current.focus();
        destinoContaBancariaSelectRef.current.click();
      }
    }, 200);
  }, [destinoParceiroId, tipoMoeda]);

  // Transfer focus step 8: After destino conta/wallet selected, focus valor input
  useEffect(() => {
    if (!transferFocusActiveRef.current || transferFocusStepRef.current !== 7) return;
    const hasDestinoConta = (tipoMoeda === "CRYPTO" && destinoWalletId) || (tipoMoeda === "FIAT" && destinoContaId);
    if (!hasDestinoConta) return;
    
    transferFocusStepRef.current = 8;
    transferFocusActiveRef.current = false; // End guided focus
    setTimeout(() => {
      valorFiatInputRef.current?.focus();
    }, 200);
  }, [destinoContaId, destinoWalletId, tipoMoeda]);

  // Handler for qtdCoin blur to advance transfer focus to parceiro
  const handleQtdCoinBlurTransferFocus = () => {
    if (transferFocusActiveRef.current && transferFocusStepRef.current === 3 && qtdCoin) {
      transferFocusStepRef.current = 4;
      setTimeout(() => {
        parceiroSelectRef.current?.open();
      }, 200);
    }
  };

  // Buscar dados da bookmaker selecionada e atualizar o array local
  useEffect(() => {
    const fetchSelectedBookmaker = async () => {
      if (!origemBookmakerId) return;
      
      // Verificar se já temos os dados
      const existing = bookmakers.find(b => b.id === origemBookmakerId);
      if (existing) return;
      
      // Buscar dados da bookmaker
      const { data } = await supabase
        .from("bookmakers")
        .select("id, nome, saldo_atual, saldo_usd, moeda")
        .eq("id", origemBookmakerId)
        .single();
      
      if (data) {
        setBookmakers(prev => {
          const filtered = prev.filter(b => b.id !== data.id);
          return [...filtered, { ...data, saldo_usd: data.saldo_usd ?? 0 }];
        });
      }
    };
    
    fetchSelectedBookmaker();
  }, [origemBookmakerId]);

  // Buscar dados da bookmaker de destino quando selecionada (DEPOSITO)
  useEffect(() => {
    const fetchSelectedDestBookmaker = async () => {
      if (!destinoBookmakerId) return;
      
      const existing = bookmakers.find(b => b.id === destinoBookmakerId);
      if (existing) return;
      
      const { data } = await supabase
        .from("bookmakers")
        .select("id, nome, saldo_atual, saldo_usd, moeda")
        .eq("id", destinoBookmakerId)
        .single();
      
      if (data) {
        setBookmakers(prev => {
          const filtered = prev.filter(b => b.id !== data.id);
          return [...filtered, { ...data, saldo_usd: data.saldo_usd ?? 0 }];
        });
      }
    };
    
    fetchSelectedDestBookmaker();
  }, [destinoBookmakerId]);

  const fetchAccountsAndWallets = async () => {
    if (!workspaceId) return;
    
    try {
      // Buscar contas bancárias via parceiros do workspace atual
      // RLS já protege, mas filtro explícito adiciona camada extra de segurança
      const { data: contas } = await supabase
        .from("contas_bancarias")
        .select(`
          id, 
          banco, 
          titular, 
          parceiro_id, 
          moeda,
          banco_id,
          parceiros!inner(workspace_id),
          bancos(taxa_deposito_tipo, taxa_deposito_valor, taxa_saque_tipo, taxa_saque_valor, taxa_moeda)
        `)
        .eq("parceiros.workspace_id", workspaceId)
        .order("banco");

      // Buscar wallets via parceiros do workspace atual
      const { data: wallets } = await supabase
        .from("wallets_crypto")
        .select(`
          id, 
          exchange, 
          endereco, 
          parceiro_id, 
          moeda,
          network,
          parceiros!inner(workspace_id)
        `)
        .eq("parceiros.workspace_id", workspaceId)
        .order("exchange");

      // Mapear para remover o campo parceiros aninhado
      setContasBancarias((contas || []).map((c: any) => ({
        id: c.id,
        banco: c.banco,
        titular: c.titular,
        parceiro_id: c.parceiro_id,
        moeda: c.moeda,
        banco_id: c.banco_id ?? null,
        bancoTaxa: c.bancos ? {
          taxa_deposito_tipo: c.bancos.taxa_deposito_tipo ?? null,
          taxa_deposito_valor: c.bancos.taxa_deposito_valor ?? null,
          taxa_saque_tipo: c.bancos.taxa_saque_tipo ?? null,
          taxa_saque_valor: c.bancos.taxa_saque_valor ?? null,
          taxa_moeda: c.bancos.taxa_moeda ?? null,
        } : null,
      })));
      
      setWalletsCrypto((wallets || []).map(w => ({
        id: w.id,
        exchange: w.exchange,
        endereco: w.endereco,
        parceiro_id: w.parceiro_id,
        moeda: w.moeda,
        network: (w as any).network ?? null,
      })));
      
      // Fetch caixa operacional partner ID
      const { data: caixaParceiro } = await supabase
        .from("parceiros")
        .select("id")
        .eq("is_caixa_operacional", true)
        .maybeSingle();
      
      if (caixaParceiro) {
        setCaixaParceiroId(caixaParceiro.id);
      }
    } catch (error) {
      console.error("Erro ao carregar contas e wallets:", error);
    }
  };

  const fetchBookmakers = async () => {
    if (!workspaceId) return;
    
    try {
      const { data } = await supabase
        .from("bookmakers")
        .select("id, nome, saldo_atual, saldo_usd, moeda")
        .eq("workspace_id", workspaceId) // Filtro explícito de workspace
        .order("nome");
      
      setBookmakers(data || []);
    } catch (error) {
      console.error("Erro ao carregar bookmakers:", error);
    }
  };

  const fetchSaldosCaixa = async () => {
    if (!workspaceId) return;
    
    // Fetch caixa parceiro ID if not yet available
    let effectiveCaixaId = caixaParceiroId;
    if (!effectiveCaixaId) {
      const { data: cp } = await supabase.from("parceiros").select("id").eq("is_caixa_operacional", true).maybeSingle();
      effectiveCaixaId = cp?.id || null;
    }
    if (!effectiveCaixaId) return;
    
    try {
      // UNIFIED SOURCE: Use v_saldo_parceiro_contas/wallets filtered by caixa parceiro
      // This ensures parity with the Caixa Operacional page
      const [contasRes, walletsRes] = await Promise.all([
        supabase.from("v_saldo_parceiro_contas").select("moeda, saldo").eq("parceiro_id", effectiveCaixaId),
        supabase.from("v_saldo_parceiro_wallets").select("coin, saldo_coin, saldo_usd").eq("parceiro_id", effectiveCaixaId),
      ]);

      // Aggregate FIAT by currency
      const fiatMap: Record<string, number> = {};
      (contasRes.data || []).forEach((row: any) => {
        const m = row.moeda || "BRL";
        fiatMap[m] = (fiatMap[m] || 0) + (row.saldo || 0);
      });
      setSaldosCaixaFiat(Object.entries(fiatMap).map(([moeda, saldo]) => ({ moeda, saldo })));

      // Aggregate CRYPTO by coin
      const cryptoMap: Record<string, { saldo_coin: number; saldo_usd: number }> = {};
      (walletsRes.data || []).forEach((row: any) => {
        const c = row.coin || "USDT";
        if (!cryptoMap[c]) cryptoMap[c] = { saldo_coin: 0, saldo_usd: 0 };
        cryptoMap[c].saldo_coin += (row.saldo_coin || 0);
        cryptoMap[c].saldo_usd += (row.saldo_usd || 0);
      });
      setSaldosCaixaCrypto(Object.entries(cryptoMap).map(([coin, vals]) => ({ coin, ...vals })));
    } catch (error) {
      console.error("Erro ao carregar saldos caixa:", error);
    }
  };

  const fetchSaldosParceiros = async () => {
    if (!workspaceId) return;
    
    try {
      // Views já filtram por workspace internamente via get_current_workspace()
      const { data: contas } = await supabase
        .from("v_saldo_parceiro_contas")
        .select("conta_id, parceiro_id, saldo, moeda");

      const { data: wallets } = await supabase
        .from("v_saldo_parceiro_wallets")
        .select("wallet_id, parceiro_id, coin, saldo_usd, saldo_coin, saldo_locked, saldo_disponivel");

      setSaldosParceirosContas(contas || []);
      setSaldosParceirosWallets(wallets || []);
    } catch (error) {
      console.error("Erro ao carregar saldos dos parceiros:", error);
    }
  };

  const fetchInvestidores = async () => {
    if (!workspaceId) return;
    
    try {
      const { data, error } = await supabase
        .from("investidores")
        .select("id, nome")
        .eq("workspace_id", workspaceId) // Filtro explícito de workspace
        .eq("status", "ativo");

      if (error) throw error;
      setInvestidores(data || []);
    } catch (error) {
      console.error("Erro ao carregar investidores:", error);
    }
  };

  const fetchSaquesPendentes = async () => {
    if (!workspaceId) return;
    
    try {
      const { data, error } = await supabase
        .from("cash_ledger")
        .select("origem_bookmaker_id, valor")
        .eq("workspace_id", workspaceId) // Filtro explícito de workspace
        .eq("tipo_transacao", "SAQUE")
        .eq("status", "PENDENTE")
        .not("origem_bookmaker_id", "is", null);

      if (error) throw error;

      // Agrupar por bookmaker_id
      const pendentesMap: Record<string, number> = {};
      (data || []).forEach((saque) => {
        if (saque.origem_bookmaker_id) {
          pendentesMap[saque.origem_bookmaker_id] = 
            (pendentesMap[saque.origem_bookmaker_id] || 0) + (saque.valor || 0);
        }
      });
      setSaquesPendentes(pendentesMap);
    } catch (error) {
      console.error("Erro ao carregar saques pendentes:", error);
    }
  };

  // Funções auxiliares para filtrar parceiros e contas/wallets disponíveis no destino
  // IMPORTANTE: Filtrar contas por moeda compatível (1 conta = 1 moeda)
  const getContasDisponiveisDestino = (parceiroId: string, moedaFiltro?: string) => {
    return contasBancarias.filter(
      (c) => c.parceiro_id === parceiroId && 
             c.id !== origemContaId &&
             (!moedaFiltro || c.moeda === moedaFiltro)
    );
  };

  const getWalletsDisponiveisDestino = (parceiroId: string) => {
    return walletsCrypto.filter(
      (w) => w.parceiro_id === parceiroId && w.moeda?.includes(coin) && w.id !== origemWalletId
    );
  };

  const getParceirosDisponiveisDestino = () => {
    // Retorna apenas parceiros que têm contas/wallets disponíveis,
    // excluindo a conta/wallet de origem E o parceiro de origem (evita transferência para si mesmo)
    const parceirosExcluidos = new Set<string>();
    if (origemParceiroId) parceirosExcluidos.add(origemParceiroId);
    // Quando a origem é o Caixa Operacional, excluir o parceiro virtual da Caixa
    if (caixaParceiroId) parceirosExcluidos.add(caixaParceiroId);

    if (tipoMoeda === "FIAT") {
      return contasBancarias
        .filter((c) => c.id !== origemContaId && !parceirosExcluidos.has(c.parceiro_id))
        .map((c) => c.parceiro_id)
        .filter((value, index, self) => self.indexOf(value) === index); // unique
    } else {
      return walletsCrypto
        .filter((w) => w.moeda?.includes(coin) && w.id !== origemWalletId && !parceirosExcluidos.has(w.parceiro_id))
        .map((w) => w.parceiro_id)
        .filter((value, index, self) => self.indexOf(value) === index); // unique
    }
  };

  const isOrigemCompleta = () => {
    if (tipoTransacao !== "TRANSFERENCIA" || fluxoTransferencia !== "PARCEIRO_PARCEIRO") {
      return false;
    }
    if (tipoMoeda === "FIAT") {
      return !!(origemParceiroId && origemContaId);
    } else {
      return !!(origemParceiroId && origemWalletId);
    }
  };

  const resetForm = () => {
    setTipoTransacao("");
    setFluxoAporte("APORTE");
    setInvestidorId("");
    setTipoMoeda("FIAT");
    setMoeda("");
    setCoin("");
    setValor("");
    setValorDisplay("");
    setQtdCoin("");
    setCotacao("");
    setDescricao("");
    setDataTransacao("");
    // REMOVIDO: valorCreditado reset - agora é tratado na Conciliação
    setOrigemTipo("");
    setOrigemParceiroId("");
    setOrigemContaId("");
    setOrigemWalletId("");
    setOrigemBookmakerId("");
    setDestinoTipo("");
    setDestinoParceiroId("");
    setDestinoContaId("");
    setDestinoWalletId("");
    setDestinoBookmakerId("");
    setFluxoTransferencia("CAIXA_PARCEIRO");
    
    // Reset refs de tracking para auto-focus
    prevCoin.current = "";
    prevDestinoParceiroId.current = "";
    prevDestinoWalletId.current = "";
    prevDestinoContaId.current = "";
    prevOrigemBookmakerId.current = "";
    
    // Reset affiliate guided focus
    affiliateFocusActiveRef.current = false;
    affiliateFocusStepRef.current = 0;
    // Reset transfer guided focus
    transferFocusActiveRef.current = false;
    transferFocusStepRef.current = 0;
  };

  const getSaldoAtual = (tipo: string, id?: string): number => {
    if (tipo === "CAIXA_OPERACIONAL") {
      if (tipoMoeda === "FIAT") {
        const saldo = saldosCaixaFiat.find(s => s.moeda === moeda);
        return saldo?.saldo || 0;
      } else {
        // CRYPTO - buscar saldo USD do coin específico
        const saldo = saldosCaixaCrypto.find(s => s.coin === coin);
        return saldo?.saldo_usd || 0;
      }
    }
    
    if (tipo === "BOOKMAKER" && id) {
      const bm = bookmakers.find(b => b.id === id);
      // Para CRYPTO, usar saldo_usd; para FIAT, usar saldo_atual
      const saldoBase = tipoMoeda === "CRYPTO" ? (bm?.saldo_usd || 0) : (bm?.saldo_atual || 0);
      // Subtrair saques pendentes para calcular saldo disponível real
      const pendenteBookmaker = saquesPendentes[id] || 0;
      return saldoBase - pendenteBookmaker;
    }
    
    if (tipo === "PARCEIRO_CONTA" && id) {
      const saldo = saldosParceirosContas.find(s => s.conta_id === id && s.moeda === moeda);
      return saldo?.saldo || 0;
    }
    
    if (tipo === "PARCEIRO_WALLET" && id) {
      const saldo = saldosParceirosWallets.find(s => s.wallet_id === id && s.coin === coin);
      // Usar saldo_disponivel (total - locked) em vez de saldo_usd (total)
      return saldo?.saldo_disponivel ?? saldo?.saldo_usd ?? 0;
    }
    
    return 0;
  };

  // Retorna o saldo bruto da bookmaker (sem descontar pendentes) para exibição
  const getSaldoBrutoBookmaker = (id: string): { brl: number; usd: number; moeda: string } => {
    const bm = bookmakers.find(b => b.id === id);
    return { 
      brl: bm?.saldo_atual || 0,
      usd: bm?.saldo_usd || 0,
      moeda: bm?.moeda || "USD"
    };
  };

  // Retorna o valor total de saques pendentes para uma bookmaker
  const getSaquesPendentesBookmaker = (id: string): number => {
    return saquesPendentes[id] || 0;
  };

  const getSaldoCoin = (tipo: string, id?: string): number => {
    if (tipo === "CAIXA_OPERACIONAL" && tipoMoeda === "CRYPTO") {
      const saldo = saldosCaixaCrypto.find(s => s.coin === coin);
      return saldo?.saldo_coin || 0;
    }
    
    if (tipo === "PARCEIRO_WALLET" && id) {
      const saldo = saldosParceirosWallets.find(s => s.wallet_id === id && s.coin === coin);
      return saldo?.saldo_coin || 0;
    }
    
    return 0;
  };

  const formatCryptoBalance = (coinQty: number, usdValue: number, coinSymbol: string): React.ReactNode => {
    return (
      <div className="space-y-0.5">
        <div className="font-mono">{coinQty.toFixed(8)} {coinSymbol}</div>
        <div className="text-xs text-muted-foreground">
          ≈ ${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
    );
  };

  // Renderiza informação da cotação e valor aproximado em BRL para auditoria
  const renderCotacaoInfo = (valorOriginal: number, moedaOriginal: string): React.ReactNode | null => {
    // Só mostra quando a moeda não é BRL e há um valor
    if (moedaOriginal === "BRL" || valorOriginal <= 0) return null;
    
    const taxa = getRate(moedaOriginal);
    const valorBRL = convertToBRL(valorOriginal, moedaOriginal);
    
    // Não mostrar se taxa for 1 (sem conversão real)
    if (taxa === 1 && moedaOriginal !== "USD") return null;
    
    const sourceLabel = source[moedaOriginal.toLowerCase() as keyof typeof source] || "fallback";
    
    return (
      <div className="mt-2 text-xs text-muted-foreground border-t border-border/30 pt-2 space-y-0.5">
        <div className="flex items-center justify-center gap-1">
          <Info className="h-3 w-3" />
          <span>
            ≈ R$ {valorBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground/70">
          Cotação: 1 {moedaOriginal} = R$ {taxa.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
          <span className="ml-1 opacity-70">({sourceLabel})</span>
        </div>
      </div>
    );
  };

  // Calcula a estimativa de valor na moeda da casa (para preview no card de destino/origem)
  const calcularEstimativaMoedaCasa = (valorOrigem: number, moedaOrigem: string, bookmakerId: string): { 
    estimativa: number; 
    moedaCasa: string; 
    precisaConversao: boolean;
    symbol: string;
  } | null => {
    const bm = bookmakers.find(b => b.id === bookmakerId);
    if (!bm) return null;
    
    const moedaCasa = bm.moeda || "USD";
    const precisaConversao = moedaOrigem !== moedaCasa;
    
    const currencySymbols: Record<string, string> = {
      BRL: "R$", USD: "$", EUR: "€", GBP: "£", 
      MXN: "$", MYR: "RM", ARS: "$", COP: "$"
    };
    const symbol = currencySymbols[moedaCasa] || moedaCasa;
    
    if (!precisaConversao) {
      return { estimativa: valorOrigem, moedaCasa, precisaConversao: false, symbol };
    }
    
    // Converter: ORIGEM → USD → DESTINO
    const taxaOrigem = getRate(moedaOrigem); // Moeda origem → BRL
    const taxaDestino = getRate(moedaCasa);  // Moeda destino → BRL
    
    // Usar USD como pivot
    const valorBRL = valorOrigem * taxaOrigem;
    const valorUSD = valorBRL / cotacaoUSD;
    const estimativa = valorUSD * (cotacaoUSD / taxaDestino);
    
    return { estimativa, moedaCasa, precisaConversao: true, symbol };
  };

  // Renderiza preview de estimativa na moeda da casa
  const renderEstimativaMoedaCasa = (valorOrigem: number, moedaOrigem: string, bookmakerId: string): React.ReactNode | null => {
    if (valorOrigem <= 0) return null;
    
    const result = calcularEstimativaMoedaCasa(valorOrigem, moedaOrigem, bookmakerId);
    if (!result || !result.precisaConversao) return null;
    
    return (
      <div className="mt-1 text-xs text-muted-foreground">
        <span className="opacity-70">≈</span>{" "}
        <span className="font-mono">
          {result.symbol} {result.estimativa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="opacity-60 ml-1">({result.moedaCasa})</span>
      </div>
    );
  };

  const getOrigemLabel = (): string => {
    if (tipoTransacao === "APORTE_FINANCEIRO") {
      if (fluxoAporte === "APORTE") {
        const investidor = investidores.find(inv => inv.id === investidorId);
        return investidor ? `Investidor: ${investidor.nome}` : "Investidor Externo";
      }
      return "Caixa Operacional";
    }
    if (tipoTransacao === "DEPOSITO") {
      // CRYPTO usa wallet, FIAT usa conta bancária
      if (tipoMoeda === "CRYPTO") {
        if (origemWalletId) {
          const wallet = walletsCrypto.find(w => w.id === origemWalletId);
          return wallet ? `${wallet.exchange}` : "Wallet Crypto";
        }
        return "Wallet Crypto";
      } else {
        if (origemContaId) {
          const conta = contasBancarias.find(c => c.id === origemContaId);
          return conta ? `${conta.banco} - ${conta.titular}` : "Conta Bancária";
        }
        return "Conta Bancária";
      }
    }
    if (tipoTransacao === "SAQUE" && origemBookmakerId) {
      const bm = bookmakers.find(b => b.id === origemBookmakerId);
      return bm?.nome || "Bookmaker";
    }
    if (tipoTransacao === "TRANSFERENCIA") {
      if (origemTipo === "CAIXA_OPERACIONAL") return "Caixa Operacional";
      if (origemTipo === "PARCEIRO_CONTA" && origemContaId) {
        const conta = contasBancarias.find(c => c.id === origemContaId);
        return conta ? `${conta.banco} - ${conta.titular}` : "Conta Bancária";
      }
      if (origemTipo === "PARCEIRO_WALLET" && origemWalletId) {
        const wallet = walletsCrypto.find(w => w.id === origemWalletId);
        return wallet ? `${wallet.exchange}` : "Wallet";
      }
    }
    return "Origem";
  };

  const getDestinoLabel = (): string => {
    if (tipoTransacao === "APORTE_FINANCEIRO") {
      if (fluxoAporte === "APORTE") {
        return "Caixa Operacional";
      }
      const investidor = investidores.find(inv => inv.id === investidorId);
      return investidor ? `Investidor: ${investidor.nome}` : "Investidor Externo";
    }
    if (tipoTransacao === "SAQUE") {
      // CRYPTO usa wallet, FIAT usa conta bancária
      if (tipoMoeda === "CRYPTO") {
        if (destinoWalletId) {
          const wallet = walletsCrypto.find(w => w.id === destinoWalletId);
          return wallet ? `${wallet.exchange}` : "Wallet Crypto";
        }
        return "Wallet Crypto";
      } else {
        if (destinoContaId) {
          const conta = contasBancarias.find(c => c.id === destinoContaId);
          return conta ? `${conta.banco} - ${conta.titular}` : "Conta Bancária";
        }
        return "Conta Bancária";
      }
    }
    if (tipoTransacao === "DEPOSITO" && destinoBookmakerId) {
      const bm = bookmakers.find(b => b.id === destinoBookmakerId);
      return bm?.nome || "Bookmaker";
    }
    if (tipoTransacao === "TRANSFERENCIA") {
      if (destinoTipo === "CAIXA_OPERACIONAL") return "Caixa Operacional";
      if (destinoTipo === "PARCEIRO_CONTA" && destinoContaId) {
        const conta = contasBancarias.find(c => c.id === destinoContaId);
        return conta ? `${conta.banco} - ${conta.titular}` : "Conta Bancária";
      }
      if (destinoTipo === "PARCEIRO_WALLET" && destinoWalletId) {
        const wallet = walletsCrypto.find(w => w.id === destinoWalletId);
        return wallet ? `${wallet.exchange}` : "Wallet";
      }
    }
    return "Destino";
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);

      // Validation
      if (!tipoTransacao) {
        toast({
          title: "Erro",
          description: "Selecione o tipo de transação",
          variant: "destructive",
        });
        return;
      }

      if (tipoTransacao === "APORTE_FINANCEIRO" && !investidorId.trim()) {
        toast({
          title: "Erro",
          description: "Selecione o investidor",
          variant: "destructive",
        });
        return;
      }

      if (!valor || parseFloat(valor) <= 0) {
        toast({
          title: "Erro",
          description: "Informe um valor válido",
          variant: "destructive",
        });
        return;
      }

      // Validação CRYPTO: moeda sempre obrigatória
      if (tipoMoeda === "CRYPTO" && !coin) {
        toast({
          title: "Erro",
          description: "Selecione a moeda crypto",
          variant: "destructive",
        });
        return;
      }
      
      // Validação CRYPTO: quantidade obrigatória EXCETO para SAQUE
      // SAQUE CRYPTO calcula qtd_coin automaticamente a partir do valor na moeda da casa
      const isSaqueCrypto = tipoTransacao === "SAQUE" && tipoMoeda === "CRYPTO";
      if (tipoMoeda === "CRYPTO" && !isSaqueCrypto && (!qtdCoin || parseFloat(qtdCoin) <= 0)) {
        toast({
          title: "Erro",
          description: "Informe a quantidade de crypto",
          variant: "destructive",
        });
        return;
      }

      // Validate origin fields
      if (origemTipo === "PARCEIRO_CONTA") {
        if (!origemParceiroId) {
          toast({
            title: "Erro",
            description: "Selecione o parceiro de origem",
            variant: "destructive",
          });
          return;
        }
        if (!origemContaId) {
          toast({
            title: "Erro",
            description: "Selecione a conta bancária de origem",
            variant: "destructive",
          });
          return;
        }
      }

      if (origemTipo === "PARCEIRO_WALLET") {
        if (!origemParceiroId) {
          toast({
            title: "Erro",
            description: "Selecione o parceiro de origem",
            variant: "destructive",
          });
          return;
        }
        if (!origemWalletId) {
          toast({
            title: "Erro",
            description: "Selecione a wallet de origem",
            variant: "destructive",
          });
          return;
        }
      }

      if (origemTipo === "BOOKMAKER" && !origemBookmakerId) {
        toast({
          title: "Erro",
          description: "Selecione a bookmaker de origem",
          variant: "destructive",
        });
        return;
      }

      // Validate destination fields
      if (destinoTipo === "PARCEIRO_CONTA") {
        if (!destinoParceiroId) {
          toast({
            title: "Erro",
            description: "Selecione o parceiro de destino",
            variant: "destructive",
          });
          return;
        }
        if (!destinoContaId) {
          toast({
            title: "Erro",
            description: "Selecione a conta bancária de destino",
            variant: "destructive",
          });
          return;
        }
      }

      if (destinoTipo === "PARCEIRO_WALLET") {
        if (!destinoParceiroId) {
          toast({
            title: "Erro",
            description: "Selecione o parceiro de destino",
            variant: "destructive",
          });
          return;
        }
        if (!destinoWalletId) {
          toast({
            title: "Erro",
            description: "Selecione a wallet de destino",
            variant: "destructive",
          });
          return;
        }
      }

      // Validar conta/wallet da empresa obrigatória quando Caixa Operacional é origem ou destino
      const caixaIsInvolved = 
        origemTipo === "CAIXA_OPERACIONAL" || 
        destinoTipo === "CAIXA_OPERACIONAL" || 
        tipoTransacao === "APORTE_FINANCEIRO";
      
      if (caixaIsInvolved && caixaParceiroId) {
        if (tipoMoeda === "FIAT" && (!caixaContaId || caixaContaId === "none")) {
          const contasEmpresa = contasBancarias.filter(c => c.parceiro_id === caixaParceiroId && c.moeda === moeda);
          if (contasEmpresa.length > 0) {
            toast({
              title: "Erro",
              description: "Selecione a conta bancária da empresa",
              variant: "destructive",
            });
            return;
          }
        }
        if (tipoMoeda === "CRYPTO" && (!caixaWalletId || caixaWalletId === "none")) {
          const walletsEmpresa = walletsCrypto.filter(w => w.parceiro_id === caixaParceiroId && w.moeda?.includes(coin));
          if (walletsEmpresa.length > 0) {
            toast({
              title: "Erro",
              description: "Selecione a wallet da empresa",
              variant: "destructive",
            });
            return;
          }
        }
      }


      // Validar transferência para mesma conta/wallet
      if (tipoTransacao === "TRANSFERENCIA") {
        const effectiveOrigemContaId = origemContaId || (origemTipo === "CAIXA_OPERACIONAL" ? caixaContaId : "");
        const effectiveDestinoContaId = destinoContaId || (destinoTipo === "CAIXA_OPERACIONAL" ? caixaContaId : "");
        const effectiveOrigemWalletId = origemWalletId || (origemTipo === "CAIXA_OPERACIONAL" ? caixaWalletId : "");
        const effectiveDestinoWalletId = destinoWalletId || (destinoTipo === "CAIXA_OPERACIONAL" ? caixaWalletId : "");

        if (effectiveOrigemContaId && effectiveDestinoContaId && effectiveOrigemContaId === effectiveDestinoContaId) {
          toast({
            title: "Erro",
            description: "Não é possível transferir para a mesma conta bancária",
            variant: "destructive",
          });
          return;
        }
        
        if (effectiveOrigemWalletId && effectiveDestinoWalletId && effectiveOrigemWalletId === effectiveDestinoWalletId) {
          toast({
            title: "Erro",
            description: "Não é possível transferir para a mesma wallet",
            variant: "destructive",
          });
          return;
        }
      }

      // Validar saldo insuficiente
      if (checkSaldoInsuficiente()) {
        toast({
          title: "Erro",
          description: "Saldo insuficiente para realizar esta transação",
          variant: "destructive",
        });
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuário não autenticado");

      // Validar workspace ativo
      if (!workspaceId) {
        toast({
          title: "Erro",
          description: "Workspace não definido. Recarregue a página.",
          variant: "destructive",
        });
        return;
      }

      // Find investor name if APORTE_FINANCEIRO
      const investidor = investidores.find(inv => inv.id === investidorId);
      
      // =========================================================================
      // REGRA DE STATUS INICIAL:
      // - SAQUE: Sempre PENDENTE (precisa confirmar recebimento na conta/wallet)
      // - DEPOSITO com conversão de moeda: PENDENTE (precisa confirmar valor creditado)
      //   → CRYPTO: origem em crypto, destino em moeda da casa
      //   → FIAT: origem em BRL/EUR, destino em casa com moeda diferente (MXN, USD, etc)
      // - Outros: CONFIRMADO imediatamente
      // =========================================================================
      
      // Calcular se há conversão de moeda ANTES de definir status
      const moedaOrigemTemp = tipoMoeda === "CRYPTO" ? coin : moeda;
      let moedaDestinoTemp = tipoMoeda === "FIAT" ? moeda : "USD";
      if (tipoTransacao === "DEPOSITO" && destinoBookmakerId) {
        const destBm = bookmakers.find(b => b.id === destinoBookmakerId);
        moedaDestinoTemp = destBm?.moeda || moedaOrigemTemp;
      }
      const temConversaoMoeda = moedaOrigemTemp !== moedaDestinoTemp;
      
      const statusInicial = 
        tipoTransacao === "SAQUE" ? "PENDENTE" :
        (tipoTransacao === "DEPOSITO" && temConversaoMoeda) ? "PENDENTE" :
        "CONFIRMADO";

      // =========================================================================
      // DETERMINAÇÃO DE MOEDAS ORIGEM/DESTINO
      // - DEPÓSITO: Origem = moeda de transporte (BRL/USDT), Destino = moeda da CASA
      // - SAQUE: Origem = moeda da CASA, Destino = moeda de recebimento (BRL/USDT)
      // =========================================================================
      let moedaOrigem = tipoMoeda === "CRYPTO" ? coin : moeda;
      let moedaDestino = tipoMoeda === "FIAT" ? moeda : "USD";
      let destinoBookmakerMoeda = "";
      
      if (tipoTransacao === "DEPOSITO" && destinoBookmakerId) {
        // DEPÓSITO: origem = moeda de transporte, destino = moeda da casa
        const destBm = bookmakers.find(b => b.id === destinoBookmakerId);
        destinoBookmakerMoeda = destBm?.moeda || moedaDestino;
        moedaDestino = destinoBookmakerMoeda;
      } else if (tipoTransacao === "SAQUE" && origemBookmakerId) {
        // SAQUE: origem = moeda da CASA, destino = moeda de recebimento (BRL ou crypto)
        const origBm = bookmakers.find(b => b.id === origemBookmakerId);
        const moedaCasa = origBm?.moeda || moedaOrigem;
        moedaOrigem = moedaCasa; // A origem é a moeda NATIVA da casa!
        moedaDestino = tipoMoeda === "CRYPTO" ? coin : moeda; // Destino é onde vai receber
        destinoBookmakerMoeda = moedaCasa;
      }

      // Determinar se há conversão de moeda
      const precisaConversao = moedaOrigem !== moedaDestino;
      
      // =========================================================================
      // ARQUITETURA MULTI-MOEDA (3 CAMADAS)
      // 1. ORIGEM: O que foi enviado (ex: 1000 USDT)
      // 2. EXECUÇÃO: O que entrou na casa (ex: 17,320 MXN) - CANÔNICO para saldo
      // 3. REFERÊNCIA: Valor em USD para KPIs globais (imutável/snapshot)
      // =========================================================================
      
      const valorOrigem = parseFloat(valor);
      const now = new Date().toISOString();
      
      // Calcular cotações para USD (snapshot no momento da transação)
      // cotacaoUSD = 1 USD = X BRL, então para converter MOEDA→USD precisamos da taxa inversa
      let cotacaoOrigemUsd = 1.0; // Default para USD/USDT/USDC
      let cotacaoDestinoUsd = 1.0;
      let valorDestinoCalculado = valorOrigem;
      let valorUsdReferencia = valorOrigem; // Para crypto, valor já está em USD
      
      // Calcular cotação da moeda de origem para USD
      if (tipoMoeda === "CRYPTO") {
        // Crypto: calcular valor em USD a partir da quantidade de coins × preço
        const cryptoPrice = cryptoPrices[coin] || 1;
        cotacaoOrigemUsd = cryptoPrice; // 1 BTC = 89000 USD
        // Para crypto, valor_usd = qtd_coin × preço da coin (NÃO valorOrigem que pode estar em BRL/EUR)
        const qtdCoinParsed = parseFloat(qtdCoin) || 0;
        valorUsdReferencia = qtdCoinParsed > 0 ? qtdCoinParsed * cryptoPrice : valorOrigem;
      } else {
        // FIAT: converter para USD usando getRate() (fonte única de verdade para TODAS as moedas)
        // getRate() retorna a taxa MOEDA→BRL, então MOEDA→USD = getRate(MOEDA) / getRate("USD")
        const taxaBrlOrigem = getRate(moedaOrigem); // X BRL por 1 unidade da moeda
        cotacaoOrigemUsd = taxaBrlOrigem / cotacaoUSD; // Converte para USD
        valorUsdReferencia = valorOrigem * cotacaoOrigemUsd;
      }
      
      // Calcular cotação da moeda de destino (casa) para USD
      // Usando getRate() como fonte única de verdade para TODAS as moedas
      const taxaBrlDestino = getRate(destinoBookmakerMoeda);
      cotacaoDestinoUsd = taxaBrlDestino / cotacaoUSD;
      
      // Calcular valor de destino (na moeda da casa)
      // Agora SEMPRE usa estimativa - o valor real será informado na Conciliação
      if (precisaConversao) {
        // Calcular estimativa: ORIGEM → USD → DESTINO
        valorDestinoCalculado = valorUsdReferencia / cotacaoDestinoUsd;
      } else {
        valorDestinoCalculado = valorOrigem;
      }
      
      // Status: transações com conversão começam como PENDENTE (serão conciliadas depois)

      const transactionData: any = {
        user_id: userData.user.id,
        workspace_id: workspaceId,
        tipo_transacao: tipoTransacao,
        tipo_moeda: tipoMoeda,
        moeda: moedaDestino, // Moeda canônica = moeda da casa
        valor: valorDestinoCalculado, // Valor canônico = valor na moeda da casa
        descricao,
        status: statusInicial,
        investidor_id: tipoTransacao === "APORTE_FINANCEIRO" ? investidorId : null,
        nome_investidor: tipoTransacao === "APORTE_FINANCEIRO" && investidor ? investidor.nome : null,
        // DATA RETROATIVA: Permite registrar transações em datas passadas
        data_transacao: dataTransacao || getTodayCivilDate(),
        
        // CAMADA ORIGEM (Transporte)
        moeda_origem: moedaOrigem,
        valor_origem: valorOrigem,
        cotacao_origem_usd: cotacaoOrigemUsd,
        
        // CAMADA EXECUÇÃO (Casa) - CANÔNICO
        moeda_destino: moedaDestino,
        valor_destino: valorDestinoCalculado,
        cotacao_destino_usd: cotacaoDestinoUsd,
        
        // CAMADA REFERÊNCIA (KPI) - IMUTÁVEL
        valor_usd_referencia: valorUsdReferencia,
        cotacao_snapshot_at: now,
        
        // Status de conversão (ESTIMADO para transações com conversão pendente)
        status_valor: precisaConversao ? "ESTIMADO" : "CONFIRMADO",
      };

      // =========================================================================
      // SAQUE FIAT: Corrigir valor_destino para moeda de DESTINO (BRL)
      // Modelo: Sacamos €102 → Esperamos R$ 6.320 → Recebemos R$ X.XXX
      // =========================================================================
      // =========================================================================
      // SAQUE FIAT: Modelo Multi-Moeda Correto
      // Origem: Casa (EUR) → Destino: Conta Bancária (BRL)
      // Cotação: EUR/BRL para auditoria
      // =========================================================================
      if (tipoTransacao === "SAQUE" && origemBookmakerId && tipoMoeda === "FIAT") {
        const bm = bookmakers.find(b => b.id === origemBookmakerId);
        const moedaCasa = bm?.moeda || moeda;
        
        // Buscar moeda REAL da conta bancária de destino
        const contaDestino = contasBancarias.find(c => c.id === destinoContaId);
        const moedaContaDestino = contaDestino?.moeda || moeda;
        
        console.log("[SAQUE FIAT] Debug conversão:", {
          origemBookmakerId,
          destinoContaId,
          moedaCasa,
          moedaContaDestino,
          valorOrigem,
          contaDestinoEncontrada: !!contaDestino,
        });
        
        // Valor de ORIGEM = valor na moeda da CASA (débito)
        transactionData.moeda_origem = moedaCasa;
        transactionData.valor_origem = valorOrigem;
        
        // Valor de DESTINO = estimativa na moeda da CONTA de destino (crédito esperado)
        transactionData.moeda_destino = moedaContaDestino;
        
        if (moedaCasa !== moedaContaDestino) {
          // Calcular estimativa: Casa → Destino
          const taxaCasa = getRate(moedaCasa);     // Ex: EUR → 6.21 (BRL por EUR)
          const taxaDestino = getRate(moedaContaDestino); // Ex: BRL → 1 (BRL por BRL)
          
          console.log("[SAQUE FIAT] Taxas obtidas:", {
            taxaCasa,      // EUR/BRL = 6.21
            taxaDestino,   // BRL/BRL = 1
          });
          
          // Conversão genérica: Casa → BRL (pivot) → Destino
          // getRate(X) retorna "quantos BRL por 1 unidade de X"
          // Então: valorOrigem * taxaCasa = valor em BRL; valor em BRL / taxaDestino = valor na moeda destino
          const valorBRLFromCasa = valorOrigem * taxaCasa;
          const valorDestinoEstimado = valorBRLFromCasa / taxaDestino;
          
          // Cotação direta: Casa → Destino (para auditoria)
          // Ex: EUR → BRL = 6.21 / 1 = 6.21
          const cotacaoDireta = taxaCasa / taxaDestino;
          
          console.log("[SAQUE FIAT] Cálculo final:", {
            valorBRLFromCasa,
            valorDestinoEstimado,
            cotacaoDireta,
          });
          
          transactionData.valor_destino = valorDestinoEstimado;
          transactionData.cotacao = cotacaoDireta; // CAMPO CORRETO NO BANCO
          transactionData.cotacao_implicita = cotacaoDireta;
        } else {
          // Mesma moeda - sem conversão
          transactionData.valor_destino = valorOrigem;
          transactionData.cotacao = 1.0;
          transactionData.cotacao_implicita = 1.0;
        }
        
        // Moeda canônica para ledger = moeda da CASA (para trigger de débito)
        transactionData.moeda = moedaCasa;
        transactionData.valor = valorOrigem;
      }

      // Add crypto-specific fields
      if (tipoMoeda === "CRYPTO") {
        transactionData.coin = coin;
        
        // SAQUE CRYPTO: calcular estimativa de coins baseado no valor da casa
        if (tipoTransacao === "SAQUE" && origemBookmakerId) {
          // Valor está na moeda da casa, calcular estimativa de coins
          const bm = bookmakers.find(b => b.id === origemBookmakerId);
          const moedaCasaSaque = bm?.moeda || "USD";
          let valorEmUSD = valorOrigem;
          
          // Converter valor da casa para USD
          if (moedaCasaSaque !== "USD") {
            const taxaCasa = getRate(moedaCasaSaque);
            const valorBRL = valorOrigem * taxaCasa;
            valorEmUSD = valorBRL / cotacaoUSD;
          }
          
          // Calcular estimativa de coins
          const cotacaoCoin = cryptoPrices[coin] || 1;
          const qtdEstimada = valorEmUSD / cotacaoCoin;
          
          transactionData.qtd_coin = qtdEstimada;
          transactionData.valor_usd = valorEmUSD;
          transactionData.cotacao = cotacaoCoin;
          transactionData.cotacao_implicita = cotacaoCoin;
          
          // Registrar moeda de origem (moeda da casa)
          transactionData.moeda_origem = moedaCasaSaque;
          transactionData.valor_origem = valorOrigem;
        } else {
          // Outros fluxos CRYPTO (DEPOSITO, TRANSFERENCIA)
          transactionData.qtd_coin = parseFloat(qtdCoin);
          transactionData.valor_usd = valorUsdReferencia;
          if (cotacao) {
            transactionData.cotacao = parseFloat(cotacao);
            transactionData.cotacao_implicita = parseFloat(cotacao);
          }
        }
      }

      // Set origem/destino based on transaction type and flow
      if (tipoTransacao === "APORTE_FINANCEIRO") {
        if (fluxoAporte === "APORTE") {
          // Aporte: Investidor → Caixa
          transactionData.origem_tipo = "INVESTIDOR";
          transactionData.destino_tipo = "CAIXA_OPERACIONAL";
          // Wire optional company account as physical destination
          if (caixaContaId && caixaContaId !== "none") {
            transactionData.destino_conta_bancaria_id = caixaContaId;
            transactionData.destino_parceiro_id = caixaParceiroId;
          }
          if (caixaWalletId && caixaWalletId !== "none") {
            transactionData.destino_wallet_id = caixaWalletId;
            transactionData.destino_parceiro_id = caixaParceiroId;
          }
        } else {
          // Liquidação: Caixa → Investidor
          transactionData.origem_tipo = "CAIXA_OPERACIONAL";
          transactionData.destino_tipo = "INVESTIDOR";
          // Wire optional company account as physical origin
          if (caixaContaId && caixaContaId !== "none") {
            transactionData.origem_conta_bancaria_id = caixaContaId;
            transactionData.origem_parceiro_id = caixaParceiroId;
          }
          if (caixaWalletId && caixaWalletId !== "none") {
            transactionData.origem_wallet_id = caixaWalletId;
            transactionData.origem_parceiro_id = caixaParceiroId;
          }
        }
      } else {
        // Add origin fields for other types
        if (origemTipo) {
          transactionData.origem_tipo = origemTipo;
          if (origemTipo === "PARCEIRO_CONTA") {
            transactionData.origem_conta_bancaria_id = origemContaId;
            transactionData.origem_parceiro_id = origemParceiroId;
          } else if (origemTipo === "PARCEIRO_WALLET") {
            transactionData.origem_wallet_id = origemWalletId;
            transactionData.origem_parceiro_id = origemParceiroId;
          } else if (origemTipo === "BOOKMAKER") {
            transactionData.origem_bookmaker_id = origemBookmakerId;
          } else if (origemTipo === "CAIXA_OPERACIONAL") {
            // Wire optional company account for CAIXA origin
            if (caixaContaId && caixaContaId !== "none") {
              transactionData.origem_conta_bancaria_id = caixaContaId;
              transactionData.origem_parceiro_id = caixaParceiroId;
            }
            if (caixaWalletId && caixaWalletId !== "none") {
              transactionData.origem_wallet_id = caixaWalletId;
              transactionData.origem_parceiro_id = caixaParceiroId;
            }
          }
        }

        // Add destination fields for other types
        if (destinoTipo) {
          transactionData.destino_tipo = destinoTipo;
          if (destinoTipo === "PARCEIRO_CONTA") {
            transactionData.destino_conta_bancaria_id = destinoContaId;
            transactionData.destino_parceiro_id = destinoParceiroId;
          } else if (destinoTipo === "PARCEIRO_WALLET") {
            transactionData.destino_wallet_id = destinoWalletId;
            transactionData.destino_parceiro_id = destinoParceiroId;
          } else if (destinoTipo === "BOOKMAKER") {
            transactionData.destino_bookmaker_id = destinoBookmakerId;
          } else if (destinoTipo === "CAIXA_OPERACIONAL") {
            // Wire optional company account for CAIXA destination
            if (caixaContaId && caixaContaId !== "none") {
              transactionData.destino_conta_bancaria_id = caixaContaId;
              transactionData.destino_parceiro_id = caixaParceiroId;
            }
            if (caixaWalletId && caixaWalletId !== "none") {
              transactionData.destino_wallet_id = caixaWalletId;
              transactionData.destino_parceiro_id = caixaParceiroId;
            }
          }
        }
      }
      // =========================================================================
      // DINHEIRO EM TRÂNSITO: O lock de saldo é feito AUTOMATICAMENTE pelo
      // trigger tr_cash_ledger_lock_pending (AFTER INSERT) no banco de dados.
      // IMPORTANTE: NÃO fazer lock manual aqui para evitar duplicação!
      // REGRA DE TRANSIT_STATUS:
      // - PENDING: Transações que saem para blockchain externa (depósito em bookmaker, saque externo)
      // - CONFIRMED: Transferências internas WALLET→WALLET (instantâneas, sem blockchain)
      // =========================================================================
       // Resolve effective wallet IDs: caixaWalletId is used for CAIXA_OPERACIONAL origin/destination
       const effectiveOrigemWalletId = origemWalletId || (origemTipo === "CAIXA_OPERACIONAL" && caixaWalletId && caixaWalletId !== "none" ? caixaWalletId : "");
       const effectiveDestinoWalletId = destinoWalletId || (destinoTipo === "CAIXA_OPERACIONAL" && caixaWalletId && caixaWalletId !== "none" ? caixaWalletId : "");
       const isTransacaoCryptoDeWallet = tipoMoeda === "CRYPTO" && (effectiveOrigemWalletId || effectiveDestinoWalletId);
       const isWalletToWalletTransfer = effectiveOrigemWalletId && effectiveDestinoWalletId;
      
      if (isTransacaoCryptoDeWallet) {
        // Transferências WALLET→WALLET são instantâneas (confirmadas imediatamente)
        // Transações para fora (bookmaker, saque) precisam de confirmação externa
        if (isWalletToWalletTransfer) {
          transactionData.transit_status = "CONFIRMED";
          console.log("[CRYPTO TRANSIT] Transferência WALLET→WALLET: CONFIRMED imediatamente", {
            origem: effectiveOrigemWalletId,
            destino: effectiveDestinoWalletId,
          });
         } else if (effectiveOrigemWalletId) {
           // Saída de wallet para blockchain externa (WALLET → BOOKMAKER) - precisa de confirmação
          transactionData.transit_status = "PENDING";
           console.log("[CRYPTO TRANSIT] Saída de wallet para blockchain externa: PENDING", {
            walletId: effectiveOrigemWalletId,
            valorQueSeraTravado: valorUsdReferencia,
          });
         } else if (effectiveDestinoWalletId && tipoTransacao === "SAQUE") {
           // SAQUE BOOKMAKER → WALLET: Aguarda confirmação de recebimento
           // A wallet NÃO deve ser creditada até o usuário confirmar na conciliação
           transactionData.transit_status = "PENDING";
           console.log("[CRYPTO TRANSIT] Saque BOOKMAKER→WALLET: PENDING até confirmação", {
             origemBookmaker: origemBookmakerId,
             destinoWallet: effectiveDestinoWalletId,
             valorEstimado: valorUsdReferencia,
           });
         } else if (effectiveDestinoWalletId && !effectiveOrigemWalletId && origemTipo === "CAIXA_OPERACIONAL") {
           // CAIXA → WALLET: Aporte interno, instantâneo - não passa por blockchain
           transactionData.transit_status = "CONFIRMED";
           console.log("[CRYPTO TRANSIT] CAIXA→WALLET: CONFIRMED (aporte interno)", {
             destinoWallet: effectiveDestinoWalletId,
           });
         } else {
           // Outros casos crypto com wallet envolvida - conservador = PENDING
           transactionData.transit_status = "PENDING";
           console.log("[CRYPTO TRANSIT] Transação crypto genérica com wallet: PENDING", {
             effectiveOrigemWalletId,
             effectiveDestinoWalletId,
           });
        }
      }

      // =========================================================================
      // TAXA BANCÁRIA: Verificar se a conta bancária selecionada tem taxa configurada
      // Se sim, exibir AlertDialog e interromper o submit para confirmação
      // =========================================================================
      // Determina se o banco está recebendo dinheiro (depósito na perspectiva do banco)
      // Casos onde o banco RECEBE:
      //   1. DEPOSITO (Parceiro/Conta → Bookmaker): conta bancária é a origem — o banco envia, mas cobra "taxa de saque"
      //   2. SAQUE de Bookmaker → Banco (origemTipo=BOOKMAKER, destinoTipo=PARCEIRO_CONTA): banco RECEBE → taxa de depósito
      // Casos onde o banco ENVIA:
      //   (futuros fluxos de saída do banco)
      const contaComTaxa = (() => {
        // DEPOSITO (Parceiro→Bookmaker): conta bancária é a origem → taxa de saque do banco
        if (tipoTransacao === "DEPOSITO" && origemContaId && tipoMoeda === "FIAT") {
          return contasBancarias.find(c => c.id === origemContaId);
        }
        // SAQUE (Bookmaker→Banco): destino é conta bancária — o banco RECEBE → taxa de depósito/recebimento
        // origemTipo=BOOKMAKER identifica este fluxo específico
        if (tipoTransacao === "SAQUE" && destinoContaId && tipoMoeda === "FIAT") {
          return contasBancarias.find(c => c.id === destinoContaId);
        }
        return undefined;
      })();

      // tipoOp define qual configuração de taxa do banco aplicar:
      // - DEPOSITO normal: banco envia → usa taxa_saque do banco
      // - SAQUE Bookmaker→Banco: banco recebe → usa taxa_deposito do banco
      const tipoOp = tipoTransacao === "DEPOSITO" ? "saque" :
        // SAQUE com origem em bookmaker → banco está recebendo → taxa de depósito
        (tipoTransacao === "SAQUE" && origemTipo === "BOOKMAKER") ? "deposito" : "saque";

      const taxaTipo = tipoOp === "deposito"
        ? contaComTaxa?.bancoTaxa?.taxa_deposito_tipo
        : contaComTaxa?.bancoTaxa?.taxa_saque_tipo;
      const taxaValor = tipoOp === "deposito"
        ? contaComTaxa?.bancoTaxa?.taxa_deposito_valor
        : contaComTaxa?.bancoTaxa?.taxa_saque_valor;

      if (contaComTaxa && taxaTipo && taxaValor != null) {
        const valorTransacao = parseFloat(valor);
        const taxaMoedaConfig = contaComTaxa.bancoTaxa?.taxa_moeda ?? contaComTaxa.moeda ?? "BRL";
        const valorCalculado = taxaTipo === "percentual"
          ? (valorTransacao * taxaValor) / 100
          : taxaValor;

        // Salvar dados pendentes e exibir alerta
        setPendingTransactionData({ transactionData, isTransacaoCryptoDeWallet, temConversaoMoeda });
        setTaxaBancariaInfo({
          nomeBanco: contaComTaxa.banco,
          tipo: taxaTipo,
          valor: taxaValor,
          moeda: taxaMoedaConfig,
          valorCalculado,
          tipoTransacao: tipoOp,
        });
        setShowTaxaBancariaAlert(true);
        setLoading(false);
        return;
      }

      const { data: insertedData, error } = await supabase
        .from("cash_ledger")
        .insert([transactionData])
        .select("id")
        .single();

      if (error) {
        // NOTA: Se o INSERT falhou, o trigger NÃO executou, então não há lock para reverter
        console.error("[CRYPTO TRANSIT] Erro ao inserir ledger:", error);
        throw error;
      }

      // Log de sucesso - o trigger já travou o saldo automaticamente
      if (isTransacaoCryptoDeWallet && insertedData?.id) {
        console.log("[CRYPTO TRANSIT] Transação registrada com sucesso, lock aplicado via trigger:", {
          ledger_id: insertedData.id,
          wallet_id: origemWalletId,
          valor_travado: valorUsdReferencia,
        });
      }

      // =========================================================================
      // NOTA: Atualização de saldo do bookmaker é feita via TRIGGER no banco
      // O trigger tr_cash_ledger_update_bookmaker_balance_v2 usa valor_destino
      // (na moeda da casa) para atualizar saldo_atual automaticamente.
      // 
      // NÃO fazer atualização manual aqui para evitar duplicidade!
      // =========================================================================
      
      // NOTA: Transferências também são tratadas pelo trigger automaticamente.
      // O trigger usa valor_origem para débito e valor_destino para crédito.

      // Se for SAQUE, atualizar status do bookmaker para indicar saque em processamento
      // O saldo será atualizado apenas quando o saque for CONFIRMADO
      if (tipoTransacao === "SAQUE" && origemBookmakerId) {
        const { error: updateBookmakerError } = await supabase
          .from("bookmakers")
          .update({ status: "SAQUE_PENDENTE" })
          .eq("id", origemBookmakerId);
        
        if (updateBookmakerError) {
          console.error("Erro ao atualizar status do bookmaker:", updateBookmakerError);
        }
      }

      const mensagemSucesso = tipoTransacao === "SAQUE" 
        ? "Saque solicitado! Aguardando confirmação de recebimento."
        : isTransacaoCryptoDeWallet
          ? "Transação crypto registrada! Saldo travado até confirmação na aba Transações em Trânsito."
          : (tipoTransacao === "DEPOSITO" && temConversaoMoeda)
            ? "Depósito registrado! Aguardando confirmação do valor creditado na aba Conciliação."
            : "Transação registrada com sucesso";

      toast({
        title: "Sucesso",
        description: mensagemSucesso,
      });

      resetForm();
      
      // Disparar evento para atualizar UI imediatamente
      dispatchCaixaDataChanged();
      
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Erro ao registrar transação:", error);
      toast({
        title: "Erro ao registrar transação",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // =========================================================================
  // CONFIRMAR TRANSAÇÃO COM TAXA BANCÁRIA
  // Chamado pelo AlertDialog quando o usuário confirma ciente da taxa
  // Executa o insert da transação principal + lançamento automático da taxa
  // =========================================================================
  const handleConfirmComTaxa = async (registrarTaxa: boolean) => {
    setShowTaxaBancariaAlert(false);
    if (!pendingTransactionData || !taxaBancariaInfo || !workspaceId) return;

    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuário não autenticado");

      const { transactionData, isTransacaoCryptoDeWallet, temConversaoMoeda } = pendingTransactionData;

      // 1. Inserir transação principal
      const { data: insertedData, error } = await supabase
        .from("cash_ledger")
        .insert([transactionData])
        .select("id")
        .single();

      if (error) throw error;

      // 2. Se o usuário confirmou que a taxa foi cobrada, registrar lançamento automático
      if (registrarTaxa) {
        // Determina de qual lado da transação vem a conta bancária cobrada:
        // - "saque" (banco enviou): conta está na ORIGEM da transação (DEPOSITO normal)
        // - "deposito" (banco recebeu): conta está no DESTINO da transação (SAQUE Bookmaker→Banco)
        const contaNoDestino = taxaBancariaInfo.tipoTransacao === "deposito";
        const taxaData: any = {
          user_id: userData.user.id,
          workspace_id: workspaceId,
          tipo_transacao: "AJUSTE_MANUAL",
          tipo_moeda: "FIAT",
          moeda: taxaBancariaInfo.moeda,
          valor: taxaBancariaInfo.valorCalculado,
          descricao: `Taxa bancária — ${taxaBancariaInfo.nomeBanco} (${taxaBancariaInfo.tipo === "percentual" ? `${taxaBancariaInfo.valor}%` : `${taxaBancariaInfo.moeda} ${taxaBancariaInfo.valor} fixo`} ${contaNoDestino ? "no recebimento" : "no envio"})`,
          status: "CONFIRMADO",
          ajuste_direcao: "SAIDA",
          ajuste_motivo: "taxa_bancaria",
          data_transacao: transactionData.data_transacao,
          data_confirmacao: transactionData.data_transacao,
          impacta_caixa_operacional: false,
          referencia_transacao_id: insertedData?.id ?? null,
          // Sempre debitado da conta bancária envolvida
          origem_tipo: contaNoDestino ? transactionData.destino_tipo : transactionData.origem_tipo,
          origem_conta_bancaria_id: contaNoDestino
            ? transactionData.destino_conta_bancaria_id
            : transactionData.origem_conta_bancaria_id,
          origem_parceiro_id: contaNoDestino
            ? transactionData.destino_parceiro_id
            : transactionData.origem_parceiro_id,
          moeda_origem: taxaBancariaInfo.moeda,
          valor_origem: taxaBancariaInfo.valorCalculado,
        };

        console.log("[TAXA BANCÁRIA] Payload para insert:", JSON.stringify(taxaData, null, 2));

        const { error: taxaError } = await supabase
          .from("cash_ledger")
          .insert([taxaData]);

        if (taxaError) {
          console.error("[TAXA BANCÁRIA] Erro completo:", JSON.stringify(taxaError, null, 2));
          console.error("[TAXA BANCÁRIA] Payload enviado:", JSON.stringify(taxaData, null, 2));
          toast({
            title: "Transação registrada, mas erro na taxa",
            description: `Erro: ${taxaError.message || taxaError.code || "Falha desconhecida"}. Registre manualmente.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Transação + taxa bancária registradas",
            description: `Lançamento de ${taxaBancariaInfo.moeda} ${taxaBancariaInfo.valorCalculado.toFixed(2)} (taxa ${taxaBancariaInfo.nomeBanco}) registrado automaticamente.`,
          });
        }
      } else {
        // Usuário confirmou que NÃO houve cobrança de taxa
        const mensagemSucesso = tipoTransacao === "SAQUE"
          ? "Saque solicitado! Aguardando confirmação de recebimento."
          : (tipoTransacao === "DEPOSITO" && temConversaoMoeda)
            ? "Depósito registrado! Aguardando confirmação do valor creditado na aba Conciliação."
            : "Transação registrada com sucesso";

        toast({ title: "Sucesso", description: mensagemSucesso });
      }

      // Se for SAQUE, atualizar status do bookmaker
      if (tipoTransacao === "SAQUE" && origemBookmakerId) {
        await supabase
          .from("bookmakers")
          .update({ status: "SAQUE_PENDENTE" })
          .eq("id", origemBookmakerId);
      }

      setPendingTransactionData(null);
      setTaxaBancariaInfo(null);
      resetForm();
      dispatchCaixaDataChanged();
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Erro ao registrar transação com taxa:", error);
      toast({ title: "Erro ao registrar transação", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Helper: renders REQUIRED company bank/wallet selector under "Caixa Operacional"
  const renderCaixaAccountSelector = () => {
    if (!caixaParceiroId) return null;
    
    const contasEmpresa = contasBancarias.filter(c => c.parceiro_id === caixaParceiroId);
    const walletsEmpresa = walletsCrypto.filter(w => w.parceiro_id === caixaParceiroId);
    
    if (contasEmpresa.length === 0 && walletsEmpresa.length === 0) {
      return (
        <div className="text-[11px] text-destructive text-center mt-1">
          ⚠ Cadastre uma conta/wallet da empresa antes de registrar transações
        </div>
      );
    }

    if (tipoMoeda === "FIAT") {
      const contasCompativeis = contasEmpresa.filter(c => c.moeda === moeda);
      if (contasCompativeis.length === 0) return (
        <div className="text-[11px] text-destructive text-center mt-1">
          ⚠ Nenhuma conta da empresa na moeda {moeda}
        </div>
      );
      
      // Auto-select if only 1 compatible account
      if (contasCompativeis.length === 1 && (!caixaContaId || caixaContaId === "none")) {
        setTimeout(() => setCaixaContaId(contasCompativeis[0].id), 0);
      }
      
      return (
        <div className="space-y-1.5 mt-2">
          <Label className="text-[11px] text-muted-foreground">Conta da Empresa *</Label>
          <Select value={caixaContaId} onValueChange={setCaixaContaId}>
            <SelectTrigger className={`h-8 text-xs ${!caixaContaId || caixaContaId === "none" ? "border-destructive" : ""}`}>
              <SelectValue placeholder="Selecionar conta..." />
            </SelectTrigger>
            <SelectContent>
              {contasCompativeis.map(conta => (
                <SelectItem key={conta.id} value={conta.id}>
                  {conta.banco} - {conta.titular}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (tipoMoeda === "CRYPTO") {
      const walletsCompativeis = walletsEmpresa.filter(w => w.moeda?.includes(coin));
      if (walletsCompativeis.length === 0) return (
        <div className="text-[11px] text-destructive text-center mt-1">
          ⚠ Nenhuma wallet da empresa compatível com {coin}
        </div>
      );
      
      // Auto-select if only 1 compatible wallet
      if (walletsCompativeis.length === 1 && (!caixaWalletId || caixaWalletId === "none")) {
        setTimeout(() => setCaixaWalletId(walletsCompativeis[0].id), 0);
      }
      
      return (
        <div className="space-y-1.5 mt-2">
          <Label className="text-[11px] text-muted-foreground">Wallet da Empresa *</Label>
          <Select value={caixaWalletId} onValueChange={setCaixaWalletId}>
            <SelectTrigger className={`h-8 text-xs ${!caixaWalletId || caixaWalletId === "none" ? "border-destructive" : ""}`}>
              <SelectValue placeholder="Selecionar wallet..." />
            </SelectTrigger>
            <SelectContent>
              {walletsCompativeis.map(wallet => {
                const walletName = wallet.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET';
                const shortAddr = wallet.endereco ? `${wallet.endereco.slice(0, 5)}...${wallet.endereco.slice(-4)}` : '';
                return (
                  <SelectItem key={wallet.id} value={wallet.id}>
                    {walletName} - {shortAddr}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      );
    }

    return null;
  };

  const renderOrigemFields = () => {
    if (tipoTransacao === "APORTE_FINANCEIRO") {
      const investidor = investidores.find(inv => inv.id === investidorId);
      return (
        <div className="text-center">
          <div className="text-sm text-muted-foreground italic">
            {fluxoAporte === "APORTE" 
              ? (investidor ? `Investidor: ${investidor.nome}` : "Investidor Externo")
              : "Caixa Operacional"}
          </div>
          {fluxoAporte === "LIQUIDACAO" && renderCaixaAccountSelector()}
        </div>
      );
    }

    if (tipoTransacao === "DEPOSITO") {
      // DEPOSITO: From Parceiro (bank account for FIAT, wallet for CRYPTO) → Bookmaker
      return (
        <>
          <div className="space-y-2">
            <Label>Parceiro</Label>
            <ParceiroSelect
              ref={parceiroSelectRef}
              value={origemParceiroId}
              onValueChange={(value) => {
                setOrigemParceiroId(value);
                setOrigemContaId("");
                setOrigemWalletId("");
              }}
              showSaldo={true}
              tipoMoeda={tipoMoeda as "FIAT" | "CRYPTO"}
              moeda={moeda}
              coin={coin}
              saldosContas={saldosParceirosContas}
              saldosWallets={saldosParceirosWallets}
            />
          </div>
          {origemParceiroId && tipoMoeda === "FIAT" && (
            <div className="space-y-2">
              <Label>Conta Bancária</Label>
              <Select 
                value={origemContaId} 
                onValueChange={(value) => {
                  setOrigemContaId(value);
                }}
              >
                <SelectTrigger ref={contaBancariaSelectRef}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {contasBancarias
                    .filter((c) => {
                      // Filtrar apenas contas do parceiro selecionado
                      if (c.parceiro_id !== origemParceiroId) return false;
                      // Filtrar apenas contas com moeda compatível
                      if (c.moeda !== moeda) return false;
                      
                      // Filtrar apenas contas com saldo disponível
                      const saldo = saldosParceirosContas.find(
                        s => s.conta_id === c.id && s.moeda === moeda
                      );
                      return saldo && saldo.saldo > 0;
                    })
                    .map((conta) => {
                      const saldo = saldosParceirosContas.find(
                        s => s.conta_id === conta.id && s.moeda === moeda
                      );
                      return (
                        <SelectItem key={conta.id} value={conta.id}>
                          {conta.banco} ({conta.moeda}) - Saldo: {formatCurrency(saldo?.saldo || 0)}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
          )}
          {origemParceiroId && tipoMoeda === "FIAT" && contasBancarias.filter((c) => {
            if (c.parceiro_id !== origemParceiroId) return false;
            const saldo = saldosParceirosContas.find(
              s => s.conta_id === c.id && s.moeda === moeda
            );
            return saldo && saldo.saldo > 0;
          }).length === 0 && (
            <Alert variant="destructive" className="border-warning/50 bg-warning/10">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                Este parceiro não possui contas bancárias com saldo disponível em {moeda}.
              </AlertDescription>
            </Alert>
          )}
          {origemParceiroId && tipoMoeda === "CRYPTO" && (
            <div className="space-y-2">
              <Label>Wallet Crypto</Label>
              <Select 
                value={origemWalletId} 
                onValueChange={(value) => {
                  setOrigemWalletId(value);
                }}
              >
                <SelectTrigger ref={walletCryptoSelectRef}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {walletsCrypto
                    .filter((w) => {
                      // Filtrar apenas wallets do parceiro selecionado
                      if (w.parceiro_id !== origemParceiroId) return false;
                      
                      // Filtrar apenas wallets com saldo DISPONÍVEL para a moeda selecionada
                      // Usa saldo_disponivel que já desconta locked (dinheiro em trânsito)
                      const saldo = saldosParceirosWallets.find(
                        s => s.wallet_id === w.id && s.coin === coin
                      );
                      return saldo && (saldo.saldo_disponivel ?? saldo.saldo_usd) > 0;
                    })
                    .map((wallet) => {
                      const saldo = saldosParceirosWallets.find(
                        s => s.wallet_id === wallet.id && s.coin === coin
                      );
                      const walletName = wallet.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET';
                      const shortenedAddress = wallet.endereco 
                        ? `${wallet.endereco.slice(0, 5)}....${wallet.endereco.slice(-5)}`
                        : '';
                      const saldoDisponivel = saldo?.saldo_disponivel ?? saldo?.saldo_usd ?? 0;
                      const temLocked = (saldo?.saldo_locked ?? 0) > 0;
                      return (
                        <SelectItem key={wallet.id} value={wallet.id}>
                          <span className="font-mono">
                            {walletName} - {shortenedAddress} - Disp: {formatCurrency(saldoDisponivel)}
                            {temLocked && <span className="text-warning ml-1">(🔒)</span>}
                          </span>
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
          )}
          {origemParceiroId && tipoMoeda === "CRYPTO" && !coin && (
            <Alert className="border-blue-500/50 bg-blue-500/10">
              <Info className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-blue-500">
                Selecione primeiro a moeda.
              </AlertDescription>
            </Alert>
          )}
          {origemParceiroId && tipoMoeda === "CRYPTO" && coin && (() => {
            // Verificar se o parceiro tem wallet que suporta a moeda
            const walletsDoParceiroComMoeda = walletsCrypto.filter(
              (w) => w.parceiro_id === origemParceiroId && w.moeda?.includes(coin)
            );
            const temWalletComMoeda = walletsDoParceiroComMoeda.length > 0;
            
            // Verificar se alguma wallet tem saldo DISPONÍVEL (não em trânsito)
            const walletsComSaldo = walletsDoParceiroComMoeda.filter((w) => {
              const saldo = saldosParceirosWallets.find(
                s => s.wallet_id === w.id && s.coin === coin
              );
              return saldo && (saldo.saldo_disponivel ?? saldo.saldo_usd) > 0;
            });
            const temSaldo = walletsComSaldo.length > 0;

            if (temSaldo) return null;

            if (!temWalletComMoeda) {
              // Cenário 2: não existe wallet para essa moeda
              return (
                <Alert variant="destructive" className="border-warning/50 bg-warning/10">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <AlertDescription className="text-warning">
                    Este parceiro não possui uma wallet {coin} cadastrada. Cadastre uma wallet para continuar.{' '}
                    <button
                      onClick={() => {
                        setAlertParceiroId(origemParceiroId);
                        setAlertTipo("CRYPTO");
                        setShowNoWalletAlert(true);
                      }}
                      className="underline font-medium"
                    >
                      Cadastrar agora
                    </button>
                  </AlertDescription>
                </Alert>
              );
            } else {
              // Cenário 1: existe wallet, mas sem saldo
              return (
                <Alert className="border-blue-500/50 bg-blue-500/10">
                  <Info className="h-4 w-4 text-blue-500" />
                  <AlertDescription className="text-blue-500">
                    Este parceiro possui uma wallet {coin}, porém sem saldo disponível. 
                    Deposite ou transfira {coin} para esta carteira para realizar a transação.
                  </AlertDescription>
                </Alert>
              );
            }
          })()}
        </>
      );
    }

    if (tipoTransacao === "SAQUE") {
      // SAQUE FIAT: destino = conta bancária, origem = bookmaker COM SALDO (qualquer moeda)
      // Importante: O método de saque (BRL/Pix) é independente da moeda operacional da casa!
      // Uma casa USD pode sacar via Pix (converte USD→BRL internamente)
      if (tipoMoeda === "FIAT") {
        const isDestinoCompleta = destinoParceiroId && destinoContaId;
        
        return (
          <>
            {!isDestinoCompleta && (
              <Alert className="border-blue-500/50 bg-blue-500/10">
                <AlertTriangle className="h-4 w-4 text-blue-500" />
                <AlertDescription className="text-blue-500">
                  Selecione primeiro o parceiro e a conta bancária de destino
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label>Bookmaker (com saldo disponível)</Label>
              <BookmakerSelect
                key={`saque-fiat-${workspaceId}-${destinoParceiroId}`}
                ref={bookmakerSelectRef}
                value={origemBookmakerId}
                onValueChange={setOrigemBookmakerId}
                disabled={!isDestinoCompleta}
                modoSaque={true}
                workspaceId={workspaceId || undefined}
                parceiroId={destinoParceiroId} // CRÍTICO: Só casas deste parceiro!
                // Saque filtra por parceiro mas NÃO por moeda - conversão interna é permitida
              />
            </div>
          </>
        );
      }
      
      // SAQUE CRYPTO: destino = wallet crypto, origem = bookmaker com saldo
      // Casas de qualquer moeda podem sacar via crypto (conversão interna)
      const isDestinoCompletaCrypto = destinoParceiroId && destinoWalletId;
      
      return (
        <>
          {!isDestinoCompletaCrypto && (
            <Alert className="border-blue-500/50 bg-blue-500/10">
              <AlertTriangle className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-blue-500">
                Selecione primeiro o parceiro e a wallet crypto de destino
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label>Bookmaker (com saldo disponível)</Label>
            <BookmakerSelect
              key={`saque-crypto-${workspaceId}-${destinoParceiroId}`}
              ref={bookmakerSelectRef}
              value={origemBookmakerId}
              onValueChange={setOrigemBookmakerId}
              disabled={!isDestinoCompletaCrypto}
              modoSaque={true}
              workspaceId={workspaceId || undefined}
              parceiroId={destinoParceiroId} // CRÍTICO: Só casas deste parceiro!
              // Saque filtra por parceiro mas NÃO por moeda - conversão interna é permitida
            />
          </div>
        </>
      );
    }

    if (tipoTransacao === "TRANSFERENCIA") {
      if (fluxoTransferencia === "CAIXA_PARCEIRO") {
        return (
          <div className="text-center">
            <div className="text-sm text-muted-foreground italic">
              Caixa Operacional
            </div>
            {renderCaixaAccountSelector()}
          </div>
        );
      }
      
      // PARCEIRO → CAIXA flow - Mesma UI de seleção de parceiros com saldo
      if (fluxoTransferencia === "PARCEIRO_CAIXA") {
        if (tipoMoeda === "FIAT") {
          // Get parceiros com saldo disponível na moeda selecionada
          const parceirosComSaldo = saldosParceirosContas
            .filter(s => s.moeda === moeda && s.saldo > 0)
            .map(s => s.parceiro_id)
            .filter((value, index, self) => self.indexOf(value) === index);

          return (
            <>
              <div className="space-y-2">
                <Label>Parceiro (com saldo em {moeda})</Label>
                <ParceiroSelect
                  value={origemParceiroId}
                  onValueChange={(value) => {
                    setOrigemParceiroId(value);
                    setOrigemContaId("");
                  }}
                  onlyParceiros={parceirosComSaldo}
                  showSaldo={true}
                  tipoMoeda="FIAT"
                  moeda={moeda}
                  saldosContas={saldosParceirosContas}
                />
              </div>
              {origemParceiroId && (
                <div className="space-y-2">
                  <Label>Conta Bancária</Label>
                  <Select 
                    value={origemContaId} 
                    onValueChange={(value) => {
                      setOrigemContaId(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {contasBancarias
                        .filter((c) => {
                          if (c.parceiro_id !== origemParceiroId) return false;
                          if (c.moeda !== moeda) return false;
                          const saldo = saldosParceirosContas.find(
                            s => s.conta_id === c.id && s.moeda === moeda
                          );
                          return saldo && saldo.saldo > 0;
                        })
                        .map((conta) => {
                          const saldo = saldosParceirosContas.find(
                            s => s.conta_id === conta.id && s.moeda === moeda
                          );
                          return (
                            <SelectItem key={conta.id} value={conta.id}>
                              {conta.banco} ({conta.moeda}) - Saldo: {formatCurrency(saldo?.saldo || 0)}
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {origemParceiroId && contasBancarias.filter((c) => {
                if (c.parceiro_id !== origemParceiroId) return false;
                const saldo = saldosParceirosContas.find(
                  s => s.conta_id === c.id && s.moeda === moeda
                );
                return saldo && saldo.saldo > 0;
              }).length === 0 && (
                <Alert variant="destructive" className="border-warning/50 bg-warning/10">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <AlertDescription className="text-warning">
                    Este parceiro não possui contas bancárias com saldo em {moeda}.{' '}
                    <button
                      onClick={() => {
                        setAlertParceiroId(origemParceiroId);
                        setShowNoBankAlert(true);
                      }}
                      className="underline font-medium"
                    >
                      Cadastrar agora
                    </button>
                  </AlertDescription>
                </Alert>
              )}
            </>
          );
        } else {
          // CRYPTO - Filtrar parceiros com saldo DISPONÍVEL no coin selecionado
          const parceirosComSaldo = saldosParceirosWallets
            .filter(s => s.coin === coin && (s.saldo_disponivel ?? s.saldo_usd) > 0)
            .map(s => s.parceiro_id)
            .filter((value, index, self) => self.indexOf(value) === index);

          return (
            <>
              <div className="space-y-2">
                <Label>Parceiro (com saldo em {coin})</Label>
                <ParceiroSelect
                  value={origemParceiroId}
                  onValueChange={(value) => {
                    setOrigemParceiroId(value);
                    setOrigemWalletId("");
                  }}
                  onlyParceiros={parceirosComSaldo}
                  showSaldo={true}
                  tipoMoeda="CRYPTO"
                  coin={coin}
                  saldosWallets={saldosParceirosWallets}
                />
              </div>
              {origemParceiroId && (
                <div className="space-y-2">
                  <Label>Wallet Crypto</Label>
                  <Select 
                    value={origemWalletId} 
                    onValueChange={(value) => {
                      setOrigemWalletId(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {walletsCrypto
                        .filter((w) => {
                          if (w.parceiro_id !== origemParceiroId || !w.moeda?.includes(coin)) return false;
                          const saldo = saldosParceirosWallets.find(
                            s => s.wallet_id === w.id && s.coin === coin
                          );
                          return saldo && (saldo.saldo_disponivel ?? saldo.saldo_usd) > 0;
                        })
                        .map((wallet) => {
                          const saldo = saldosParceirosWallets.find(
                            s => s.wallet_id === wallet.id && s.coin === coin
                          );
                          const walletName = wallet.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET';
                          const shortenedAddress = wallet.endereco 
                            ? `${wallet.endereco.slice(0, 5)}....${wallet.endereco.slice(-5)}`
                            : '';
                          const saldoDisponivel = saldo?.saldo_disponivel ?? saldo?.saldo_usd ?? 0;
                          const temLocked = (saldo?.saldo_locked ?? 0) > 0;
                          return (
                            <SelectItem key={wallet.id} value={wallet.id}>
                              <span className="font-mono">
                                {walletName} - {shortenedAddress} - Disp: {formatCurrency(saldoDisponivel)}
                                {temLocked && <span className="text-warning ml-1">(🔒)</span>}
                              </span>
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {origemParceiroId && coin && (() => {
                const walletsDoParceiroComMoeda = walletsCrypto.filter(
                  (w) => w.parceiro_id === origemParceiroId && w.moeda?.includes(coin)
                );
                const temWalletComMoeda = walletsDoParceiroComMoeda.length > 0;
                const walletsComSaldo = walletsDoParceiroComMoeda.filter((w) => {
                  const saldo = saldosParceirosWallets.find(
                    s => s.wallet_id === w.id && s.coin === coin
                  );
                  return saldo && (saldo.saldo_disponivel ?? saldo.saldo_usd) > 0;
                });
                const temSaldo = walletsComSaldo.length > 0;

                if (temSaldo) return null;

                if (!temWalletComMoeda) {
                  return (
                    <Alert variant="destructive" className="border-warning/50 bg-warning/10">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      <AlertDescription className="text-warning">
                        Este parceiro não possui uma wallet {coin} cadastrada.{' '}
                        <button
                          onClick={() => {
                            setAlertParceiroId(origemParceiroId);
                            setShowNoWalletAlert(true);
                          }}
                          className="underline font-medium"
                        >
                          Cadastrar agora
                        </button>
                      </AlertDescription>
                    </Alert>
                  );
                } else {
                  return (
                    <Alert className="border-blue-500/50 bg-blue-500/10">
                      <Info className="h-4 w-4 text-blue-500" />
                      <AlertDescription className="text-blue-500">
                        Este parceiro possui uma wallet {coin}, porém sem saldo disponível.
                      </AlertDescription>
                    </Alert>
                  );
                }
              })()}
            </>
          );
        }
      }
      
      // PARCEIRO → PARCEIRO flow - Filtrar parceiros com saldo na moeda
      if (tipoMoeda === "FIAT") {
        // Get parceiros com saldo disponível na moeda selecionada
        const parceirosComSaldo = saldosParceirosContas
          .filter(s => s.moeda === moeda && s.saldo > 0)
          .map(s => s.parceiro_id)
          .filter((value, index, self) => self.indexOf(value) === index); // unique

        return (
          <>
            <div className="space-y-2">
              <Label>Parceiro (com saldo em {moeda})</Label>
              <ParceiroSelect
                ref={parceiroSelectRef}
                value={origemParceiroId}
                onValueChange={(value) => {
                  setOrigemParceiroId(value);
                  setOrigemContaId("");
                }}
                onlyParceiros={parceirosComSaldo}
                showSaldo={true}
                tipoMoeda="FIAT"
                moeda={moeda}
                saldosContas={saldosParceirosContas}
              />
            </div>
            {origemParceiroId && (
              <div className="space-y-2">
                <Label>Conta Bancária</Label>
                <Select 
                  value={origemContaId} 
                  onValueChange={(value) => {
                    setOrigemContaId(value);
                  }}
                >
                  <SelectTrigger ref={contaBancariaSelectRef}>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {contasBancarias
                      .filter((c) => {
                        if (c.parceiro_id !== origemParceiroId) return false;
                        // Filtrar apenas contas com moeda compatível
                        if (c.moeda !== moeda) return false;
                        // Filtrar apenas contas com saldo
                        const saldo = saldosParceirosContas.find(
                          s => s.conta_id === c.id && s.moeda === moeda
                        );
                        return saldo && saldo.saldo > 0;
                      })
                      .map((conta) => {
                        const saldo = saldosParceirosContas.find(
                          s => s.conta_id === conta.id && s.moeda === moeda
                        );
                        return (
                          <SelectItem key={conta.id} value={conta.id}>
                            {conta.banco} ({conta.moeda}) - Saldo: {formatCurrency(saldo?.saldo || 0)}
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>
            )}
            {origemParceiroId && contasBancarias.filter((c) => {
              if (c.parceiro_id !== origemParceiroId) return false;
              const saldo = saldosParceirosContas.find(
                s => s.conta_id === c.id && s.moeda === moeda
              );
              return saldo && saldo.saldo > 0;
            }).length === 0 && (
              <Alert variant="destructive" className="border-warning/50 bg-warning/10">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-warning">
                  Este parceiro não possui contas bancárias com saldo em {moeda}.{' '}
                  <button
                    onClick={() => {
                      setAlertParceiroId(origemParceiroId);
                      setShowNoBankAlert(true);
                    }}
                    className="underline font-medium"
                  >
                    Cadastrar agora
                  </button>
                </AlertDescription>
              </Alert>
            )}
          </>
        );
      } else {
        // CRYPTO - Filtrar parceiros com saldo DISPONÍVEL no coin selecionado
        const parceirosComSaldo = saldosParceirosWallets
          .filter(s => s.coin === coin && (s.saldo_disponivel ?? s.saldo_usd) > 0)
          .map(s => s.parceiro_id)
          .filter((value, index, self) => self.indexOf(value) === index); // unique

        return (
          <>
            <div className="space-y-2">
              <Label>Parceiro (com saldo em {coin})</Label>
              <ParceiroSelect
                ref={parceiroSelectRef}
                value={origemParceiroId}
                onValueChange={(value) => {
                  setOrigemParceiroId(value);
                  setOrigemWalletId("");
                }}
                onlyParceiros={parceirosComSaldo}
                showSaldo={true}
                tipoMoeda="CRYPTO"
                coin={coin}
                saldosWallets={saldosParceirosWallets}
              />
            </div>
            {origemParceiroId && (
              <div className="space-y-2">
                <Label>Wallet Crypto</Label>
                <Select 
                  value={origemWalletId} 
                  onValueChange={(value) => {
                    setOrigemWalletId(value);
                  }}
                >
                  <SelectTrigger ref={walletCryptoSelectRef}>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {walletsCrypto
                      .filter((w) => {
                        if (w.parceiro_id !== origemParceiroId || !w.moeda?.includes(coin)) return false;
                        // Filtrar apenas wallets com saldo DISPONÍVEL
                        const saldo = saldosParceirosWallets.find(
                          s => s.wallet_id === w.id && s.coin === coin
                        );
                        return saldo && (saldo.saldo_disponivel ?? saldo.saldo_usd) > 0;
                      })
                      .map((wallet) => {
                        const saldo = saldosParceirosWallets.find(
                          s => s.wallet_id === wallet.id && s.coin === coin
                        );
                        const walletName = wallet.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET';
                        const shortenedAddress = wallet.endereco 
                          ? `${wallet.endereco.slice(0, 5)}....${wallet.endereco.slice(-5)}`
                          : '';
                        const saldoDisponivel = saldo?.saldo_disponivel ?? saldo?.saldo_usd ?? 0;
                        const temLocked = (saldo?.saldo_locked ?? 0) > 0;
                        return (
                          <SelectItem key={wallet.id} value={wallet.id}>
                            <span className="font-mono">
                              {walletName} - {shortenedAddress} - Disp: {formatCurrency(saldoDisponivel)}
                              {temLocked && <span className="text-warning ml-1">(🔒)</span>}
                            </span>
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>
            )}
            {origemParceiroId && coin && (() => {
              // Verificar se o parceiro tem wallet que suporta a moeda
              const walletsDoParceiroComMoeda = walletsCrypto.filter(
                (w) => w.parceiro_id === origemParceiroId && w.moeda?.includes(coin)
              );
              const temWalletComMoeda = walletsDoParceiroComMoeda.length > 0;
              
              // Verificar se alguma wallet tem saldo DISPONÍVEL
              const walletsComSaldo = walletsDoParceiroComMoeda.filter((w) => {
                const saldo = saldosParceirosWallets.find(
                  s => s.wallet_id === w.id && s.coin === coin
                );
                return saldo && (saldo.saldo_disponivel ?? saldo.saldo_usd) > 0;
              });
              const temSaldo = walletsComSaldo.length > 0;

              if (temSaldo) return null;

              if (!temWalletComMoeda) {
                // Cenário 2: não existe wallet para essa moeda
                return (
                  <Alert variant="destructive" className="border-warning/50 bg-warning/10">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <AlertDescription className="text-warning">
                      Este parceiro não possui uma wallet {coin} cadastrada. Cadastre uma wallet para continuar.{' '}
                      <button
                        onClick={() => {
                          setAlertParceiroId(origemParceiroId);
                          setShowNoWalletAlert(true);
                        }}
                        className="underline font-medium"
                      >
                        Cadastrar agora
                      </button>
                    </AlertDescription>
                  </Alert>
                );
              } else {
                // Cenário 1: existe wallet, mas sem saldo
                return (
                  <Alert className="border-blue-500/50 bg-blue-500/10">
                    <Info className="h-4 w-4 text-blue-500" />
                    <AlertDescription className="text-blue-500">
                      Este parceiro possui uma wallet {coin}, porém sem saldo disponível. 
                      Deposite ou transfira {coin} para esta carteira para realizar a transação.
                    </AlertDescription>
                  </Alert>
                );
              }
            })()}
          </>
        );
      }
    }

    return null;
  };

  const renderDestinoFields = () => {
    if (tipoTransacao === "APORTE_FINANCEIRO") {
      const investidor = investidores.find(inv => inv.id === investidorId);
      return (
        <div className="text-center">
          <div className="text-sm text-muted-foreground italic">
            {fluxoAporte === "APORTE" 
              ? "Caixa Operacional"
              : (investidor ? `Investidor: ${investidor.nome}` : "Investidor Externo")}
          </div>
          {fluxoAporte === "APORTE" && renderCaixaAccountSelector()}
        </div>
      );
    }

    if (tipoTransacao === "SAQUE") {
      // SAQUE FIAT: Parceiro + Conta Bancária
      if (tipoMoeda === "FIAT") {
        return (
          <>
            <div className="space-y-2">
              <Label>Parceiro</Label>
              <ParceiroSelect
                ref={parceiroSelectRef}
                value={destinoParceiroId}
                onValueChange={(value) => {
                  setDestinoParceiroId(value);
                  setDestinoContaId("");
                }}
                showSaldo={true}
                tipoMoeda="FIAT"
                moeda={moeda}
                saldosContas={saldosParceirosContas}
              />
            </div>
            {destinoParceiroId && (
              <div className="space-y-2">
                <Label>Conta Bancária</Label>
                <Select 
                  value={destinoContaId} 
                  onValueChange={(value) => {
                    setDestinoContaId(value);
                  }}
                >
                  <SelectTrigger ref={contaBancariaSelectRef}>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {contasBancarias
                      .filter((c) => c.parceiro_id === destinoParceiroId && c.moeda === moeda)
                      .map((conta) => (
                        <SelectItem key={conta.id} value={conta.id}>
                          {conta.banco} ({conta.moeda})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {destinoParceiroId && contasBancarias.filter((c) => c.parceiro_id === destinoParceiroId && c.moeda === moeda).length === 0 && (
              <Alert variant="destructive" className="border-warning/50 bg-warning/10">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-warning">
                  Este parceiro não possui contas bancárias em {moeda}.{' '}
                  <button
                    onClick={() => {
                      setAlertParceiroId(destinoParceiroId);
                      setShowNoBankAlert(true);
                    }}
                    className="underline font-medium"
                  >
                    Cadastrar agora
                  </button>
                </AlertDescription>
              </Alert>
            )}
          </>
        );
      }
      
      // SAQUE CRYPTO: Parceiro + Wallet Crypto
      // Importante: a moeda (coin) já deve estar selecionada antes
      const moedasCryptoDisponiveis = getMoedasDisponiveis().crypto;
      const temMoedaCryptoDisponivel = moedasCryptoDisponiveis.length > 0;
      
      if (!temMoedaCryptoDisponivel) {
        return (
          <Alert variant="destructive" className="border-warning/50 bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-warning">
              Nenhuma moeda crypto disponível para saque. Verifique se existem bookmakers com saldo USD e wallets crypto cadastradas.
            </AlertDescription>
          </Alert>
        );
      }
      
      if (!coin) {
        return (
          <Alert className="border-blue-500/50 bg-blue-500/10">
            <Info className="h-4 w-4 text-blue-500" />
            <AlertDescription className="text-blue-500">
              Selecione primeiro a moeda crypto para continuar.
            </AlertDescription>
          </Alert>
        );
      }
      
      // Parceiros que têm wallets que suportam a moeda selecionada
      const parceirosComWalletMoeda = [...new Set(
        walletsCrypto
          .filter(w => w.moeda?.includes(coin))
          .map(w => w.parceiro_id)
      )];
      
      return (
        <>
          <div className="space-y-2">
            <Label>Parceiro (com wallet {coin})</Label>
            <ParceiroSelect
              ref={parceiroSelectRef}
              value={destinoParceiroId}
              onValueChange={(value) => {
                setDestinoParceiroId(value);
                setDestinoWalletId("");
              }}
              onlyParceiros={parceirosComWalletMoeda}
              showSaldo={true}
              tipoMoeda="CRYPTO"
              coin={coin}
              saldosWallets={saldosParceirosWallets}
            />
          </div>
          {parceirosComWalletMoeda.length === 0 && (
            <Alert variant="destructive" className="border-warning/50 bg-warning/10">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                Nenhum parceiro possui wallet {coin} cadastrada. Cadastre uma wallet para continuar.
              </AlertDescription>
            </Alert>
          )}
          {destinoParceiroId && (
            <div className="space-y-2">
              <Label>Wallet Crypto</Label>
              <Select 
                value={destinoWalletId} 
                onValueChange={(value) => {
                  setDestinoWalletId(value);
                }}
              >
                <SelectTrigger ref={walletCryptoSelectRef}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {walletsCrypto
                    .filter((w) => w.parceiro_id === destinoParceiroId && w.moeda?.includes(coin))
                    .map((wallet) => {
                      const walletName = wallet.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET';
                      const shortenedAddress = wallet.endereco 
                        ? `${wallet.endereco.slice(0, 5)}....${wallet.endereco.slice(-5)}`
                        : '';
                      return (
                        <SelectItem key={wallet.id} value={wallet.id}>
                          <span className="font-mono">{walletName} - {shortenedAddress}</span>
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
          )}
          {destinoParceiroId && walletsCrypto.filter((w) => w.parceiro_id === destinoParceiroId && w.moeda?.includes(coin)).length === 0 && (
            <Alert variant="destructive" className="border-warning/50 bg-warning/10">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                Este parceiro não possui wallet {coin} cadastrada.{' '}
                <button
                  onClick={() => {
                    setAlertParceiroId(destinoParceiroId);
                    setAlertTipo("CRYPTO");
                    setShowNoWalletAlert(true);
                  }}
                  className="underline font-medium"
                >
                  Cadastrar agora
                </button>
              </AlertDescription>
            </Alert>
          )}
        </>
      );
    }

    if (tipoTransacao === "DEPOSITO") {
      // Check if origem is complete - depends on currency type
      const isOrigemCompleta = tipoMoeda === "CRYPTO" 
        ? (origemParceiroId && origemWalletId)
        : (origemParceiroId && origemContaId);
      
      const origemLabel = tipoMoeda === "CRYPTO" ? "wallet crypto" : "conta bancária";
      
      return (
        <>
          {!isOrigemCompleta && (
            <Alert className="border-blue-500/50 bg-blue-500/10">
              <AlertTriangle className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-blue-500">
                Selecione primeiro o parceiro e a {origemLabel} de origem
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label>Bookmaker</Label>
            {/* 
              IMPORTANTE: Não filtrar por moeda no DEPÓSITO!
              O operador pode enviar BRL (via Pix) para uma casa EUR/MXN.
              A conversão é feita pela casa - o sistema registra moeda_origem e moeda_destino.
            */}
            <BookmakerSelect
              ref={bookmakerSelectRef}
              value={destinoBookmakerId}
              onValueChange={setDestinoBookmakerId}
              disabled={!isOrigemCompleta}
              parceiroId={origemParceiroId}
            />
          </div>
        </>
      );
    }

    if (tipoTransacao === "TRANSFERENCIA") {
      if (fluxoTransferencia === "CAIXA_PARCEIRO") {
        const parceirosDisponiveis = getParceirosDisponiveisDestino();

        // CAIXA → PARCEIRO flow
        if (tipoMoeda === "FIAT") {
          return (
            <>
              <div className="space-y-2">
                <Label>Parceiro</Label>
              <ParceiroSelect
                  ref={parceiroDestinoSelectRef}
                  value={destinoParceiroId}
                  onValueChange={(value) => {
                    setDestinoParceiroId(value);
                    setDestinoContaId("");
                    // Auto-focus: parceiro → conta bancária
                    setTimeout(() => {
                      destinoContaBancariaSelectRef.current?.focus();
                      destinoContaBancariaSelectRef.current?.click();
                    }, 180);
                  }}
                  onlyParceiros={parceirosDisponiveis}
                  showSaldo={true}
                  tipoMoeda="FIAT"
                  moeda={moeda}
                  saldosContas={saldosParceirosContas}
                />
              </div>
              {destinoParceiroId && (
                <div className="space-y-2">
                  <Label>Conta Bancária</Label>
                  <Select 
                    value={destinoContaId} 
                    onValueChange={(value) => {
                      setDestinoContaId(value);
                      // Auto-focus: conta bancária → valor
                      setTimeout(() => {
                        valorFiatInputRef.current?.focus();
                      }, 180);
                    }}
                  >
                    <SelectTrigger ref={destinoContaBancariaSelectRef}>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {getContasDisponiveisDestino(destinoParceiroId, moeda)
                        .map((conta) => (
                          <SelectItem key={conta.id} value={conta.id}>
                            {conta.banco} ({conta.moeda})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {destinoParceiroId && getContasDisponiveisDestino(destinoParceiroId).length === 0 && (
                <Alert variant="destructive" className="border-warning/50 bg-warning/10">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <AlertDescription className="text-warning">
                    Este parceiro não possui contas bancárias válidas para este destino.{' '}
                    <button
                      onClick={() => {
                        setAlertParceiroId(destinoParceiroId);
                        setShowNoBankAlert(true);
                      }}
                      className="underline font-medium"
                    >
                      Cadastrar agora
                    </button>
                  </AlertDescription>
                </Alert>
              )}
            </>
          );
        } else {
          // CRYPTO
          return (
            <>
              <div className="space-y-2">
                <Label>Parceiro</Label>
                <ParceiroSelect
                  value={destinoParceiroId}
                  onValueChange={(value) => {
                    setDestinoParceiroId(value);
                    setDestinoWalletId("");
                  }}
                  onlyParceiros={parceirosDisponiveis}
                  showSaldo={true}
                  tipoMoeda="CRYPTO"
                  coin={coin}
                  saldosWallets={saldosParceirosWallets}
                />
              </div>
              {destinoParceiroId && (
                <div className="space-y-2">
                  <Label>Wallet Crypto</Label>
                  <Select 
                    value={destinoWalletId} 
                    onValueChange={(value) => {
                      setDestinoWalletId(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                  <SelectContent>
                    {getWalletsDisponiveisDestino(destinoParceiroId)
                      .map((wallet) => {
                        const walletName = wallet.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET';
                        const shortenedAddress = wallet.endereco 
                          ? `${wallet.endereco.slice(0, 5)}....${wallet.endereco.slice(-5)}`
                          : '';
                        return (
                          <SelectItem key={wallet.id} value={wallet.id}>
                            <span className="font-mono">{walletName} - {shortenedAddress}</span>
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                  </Select>
                </div>
              )}
              {destinoParceiroId && getWalletsDisponiveisDestino(destinoParceiroId).length === 0 && (
                <Alert variant="destructive" className="border-warning/50 bg-warning/10">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <AlertDescription className="text-warning">
                    Este parceiro não possui wallets válidas para {coin}.{' '}
                    <button
                      onClick={() => {
                        setAlertParceiroId(destinoParceiroId);
                        setShowNoWalletAlert(true);
                      }}
                      className="underline font-medium"
                    >
                      Cadastrar agora
                    </button>
                  </AlertDescription>
                </Alert>
              )}
            </>
          );
        }
      }

      // PARCEIRO → CAIXA OPERACIONAL flow (destino = caixa)
      if (fluxoTransferencia === "PARCEIRO_CAIXA") {
        return (
          <div className="text-center">
            <div className="text-sm text-muted-foreground italic">
              Caixa Operacional
            </div>
            {renderCaixaAccountSelector()}
          </div>
        );
      }

      // PARCEIRO → PARCEIRO flow (destino)
      const parceirosDisponiveis = getParceirosDisponiveisDestino();
      const origemEstaCompleta = isOrigemCompleta();
      
      if (tipoMoeda === "FIAT") {
        return (
          <>
            <div className="space-y-2">
              <Label>Parceiro</Label>
              <ParceiroSelect
                ref={parceiroDestinoSelectRef}
                value={destinoParceiroId}
                onValueChange={(value) => {
                  setDestinoParceiroId(value);
                  setDestinoContaId("");
                  if (tipoTransacao === "TRANSFERENCIA" && fluxoTransferencia === "PARCEIRO_PARCEIRO" && tipoMoeda === "FIAT") {
                    setTimeout(() => {
                      destinoContaBancariaSelectRef.current?.focus();
                      destinoContaBancariaSelectRef.current?.click();
                    }, 180);
                  }
                }}
                disabled={!origemEstaCompleta}
                onlyParceiros={parceirosDisponiveis}
                showSaldo={true}
                tipoMoeda="FIAT"
                moeda={moeda}
                saldosContas={saldosParceirosContas}
              />
            </div>
            {destinoParceiroId && (
              <div className="space-y-2">
                <Label>Conta Bancária</Label>
                <Select 
                  value={destinoContaId} 
                  onValueChange={(value) => {
                    setDestinoContaId(value);
                    if (tipoTransacao === "TRANSFERENCIA" && fluxoTransferencia === "PARCEIRO_PARCEIRO" && tipoMoeda === "FIAT") {
                      setTimeout(() => {
                        valorFiatInputRef.current?.focus();
                      }, 180);
                    }
                  }}
                  disabled={!origemEstaCompleta}
                >
                  <SelectTrigger ref={destinoContaBancariaSelectRef}>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {getContasDisponiveisDestino(destinoParceiroId, moeda).map((conta) => (
                      <SelectItem key={conta.id} value={conta.id}>
                        {conta.banco} ({conta.moeda})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {destinoParceiroId && getContasDisponiveisDestino(destinoParceiroId).length === 0 && (
              <Alert variant="destructive" className="border-warning/50 bg-warning/10">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-warning">
                  Este parceiro não possui outras contas bancárias disponíveis.{' '}
                  <button
                    onClick={() => {
                      setAlertParceiroId(destinoParceiroId);
                      setShowNoBankAlert(true);
                    }}
                    className="underline font-medium"
                  >
                    Cadastrar agora
                  </button>
                </AlertDescription>
              </Alert>
            )}
            {!origemEstaCompleta && (
              <Alert className="border-muted bg-muted/10">
                <AlertDescription className="text-muted-foreground text-sm">
                  Selecione o parceiro e a conta de origem primeiro
                </AlertDescription>
              </Alert>
            )}
          </>
        );
      } else {
        // CRYPTO
        return (
          <>
            <div className="space-y-2">
              <Label>Parceiro</Label>
              <ParceiroSelect
                ref={parceiroDestinoSelectRef}
                value={destinoParceiroId}
                onValueChange={(value) => {
                  setDestinoParceiroId(value);
                  setDestinoWalletId("");
                  if (tipoTransacao === "TRANSFERENCIA" && fluxoTransferencia === "PARCEIRO_PARCEIRO" && tipoMoeda === "CRYPTO") {
                    setTimeout(() => {
                      destinoWalletSelectRef.current?.focus();
                      destinoWalletSelectRef.current?.click();
                    }, 180);
                  }
                }}
                disabled={!origemEstaCompleta}
                onlyParceiros={parceirosDisponiveis}
                showSaldo={true}
                tipoMoeda="CRYPTO"
                coin={coin}
                saldosWallets={saldosParceirosWallets}
              />
            </div>
            {destinoParceiroId && (
              <div className="space-y-2">
                <Label>Wallet Crypto</Label>
                <Select 
                  value={destinoWalletId} 
                  onValueChange={(value) => {
                    setDestinoWalletId(value);
                    if (tipoTransacao === "TRANSFERENCIA" && fluxoTransferencia === "PARCEIRO_PARCEIRO" && tipoMoeda === "CRYPTO") {
                      setTimeout(() => {
                        valorFiatInputRef.current?.focus();
                      }, 180);
                    }
                  }}
                  disabled={!origemEstaCompleta}
                >
                  <SelectTrigger ref={destinoWalletSelectRef}>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {getWalletsDisponiveisDestino(destinoParceiroId).map((wallet) => {
                      const walletName = wallet.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET';
                      const shortenedAddress = wallet.endereco 
                        ? `${wallet.endereco.slice(0, 5)}....${wallet.endereco.slice(-5)}`
                        : '';
                      return (
                        <SelectItem key={wallet.id} value={wallet.id}>
                          <span className="font-mono">{walletName} - {shortenedAddress}</span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
            {destinoParceiroId && getWalletsDisponiveisDestino(destinoParceiroId).length === 0 && (
              <Alert variant="destructive" className="border-warning/50 bg-warning/10">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-warning">
                  Este parceiro não possui outras wallets disponíveis para {coin}.{' '}
                  <button
                    onClick={() => {
                      setAlertParceiroId(destinoParceiroId);
                      setShowNoWalletAlert(true);
                    }}
                    className="underline font-medium"
                  >
                    Cadastrar agora
                  </button>
                </AlertDescription>
              </Alert>
            )}
            {!origemEstaCompleta && (
              <Alert className="border-muted bg-muted/10">
                <AlertDescription className="text-muted-foreground text-sm">
                  Selecione o parceiro e a wallet de origem primeiro
                </AlertDescription>
              </Alert>
            )}
          </>
        );
      }
    }

    return null;
  };

  const calculateNewBalance = (tipo: string, isOrigem: boolean): number | null => {
    const valorNumerico = parseFloat(valor) || 0;
    if (valorNumerico === 0) return null;

    if (tipo === "CAIXA_OPERACIONAL") {
      const saldoAtual = getSaldoAtual(tipo);
      if (isOrigem) {
        return saldoAtual - valorNumerico;
      } else {
        return saldoAtual + valorNumerico;
      }
    }

    if (tipo === "BOOKMAKER") {
      const bmId = isOrigem ? origemBookmakerId : destinoBookmakerId;
      if (!bmId) return null;
      const saldoAtual = getSaldoAtual(tipo, bmId);
      if (isOrigem) {
        return saldoAtual - valorNumerico;
      } else {
        return saldoAtual + valorNumerico;
      }
    }

    return null;
  };

  const checkSaldoInsuficiente = (): boolean => {
    const valorNumerico = parseFloat(valor) || 0;
    const qtdCoinNumerico = parseFloat(qtdCoin) || 0;
    if (valorNumerico === 0 && qtdCoinNumerico === 0) return false;

    // ============================================================================
    // REGRA CRÍTICA MULTI-MOEDA:
    // 1. Para SAQUE: o valor digitado é SEMPRE na moeda da casa (bookmaker.moeda)
    //    A comparação deve usar saldo_atual (moeda nativa), NUNCA saldo_usd convertido
    // 2. Para CRYPTO: comparar quantidade de moedas (saldo_coin vs qtdCoin)
    // 3. Conversões são apenas estimativas de destino, não afetam validação de saldo
    // ============================================================================

    // Check APORTE_FINANCEIRO flow (LIQUIDAÇÃO = saída do caixa)
    if (tipoTransacao === "APORTE_FINANCEIRO" && fluxoAporte === "LIQUIDACAO") {
      if (tipoMoeda === "CRYPTO") {
        const saldoCoinAtual = getSaldoCoin("CAIXA_OPERACIONAL");
        return saldoCoinAtual < qtdCoinNumerico;
      }
      const saldoAtual = getSaldoAtual("CAIXA_OPERACIONAL");
      return saldoAtual < valorNumerico;
    }

    // Check SAQUE (bookmaker → parceiro)
    // CORREÇÃO CRÍTICA: O valor digitado está na MOEDA DA CASA (EUR, USD, BRL, etc.)
    // Deve-se comparar contra saldo_atual que também está na moeda da casa
    if (tipoTransacao === "SAQUE" && origemBookmakerId) {
      const bm = bookmakers.find(b => b.id === origemBookmakerId);
      if (!bm) return false;
      
      // saldo_atual é o saldo canônico NA MOEDA OPERACIONAL DA CASA
      // valorNumerico é o valor digitado NA MOEDA DA CASA (label mostra a moeda)
      const saldoNativo = bm.saldo_atual || 0;
      
      // Subtrair saques pendentes (também registrados na moeda da casa)
      const pendenteBookmaker = saquesPendentes[origemBookmakerId] || 0;
      const saldoDisponivel = saldoNativo - pendenteBookmaker;
      
      // Comparação direta: moeda da casa vs moeda da casa
      return saldoDisponivel < valorNumerico;
    }

    // Check DEPOSITO - FIAT usa conta bancária, CRYPTO usa wallet
    if (tipoTransacao === "DEPOSITO") {
      if (tipoMoeda === "CRYPTO" && origemWalletId) {
        // CRYPTO: comparar quantidade de moedas
        const saldoCoinAtual = getSaldoCoin("PARCEIRO_WALLET", origemWalletId);
        return saldoCoinAtual < qtdCoinNumerico;
      }
      if (tipoMoeda === "FIAT" && origemContaId) {
        const saldoAtual = getSaldoAtual("PARCEIRO_CONTA", origemContaId);
        return saldoAtual < valorNumerico;
      }
    }

    // Check TRANSFERENCIA from CAIXA_OPERACIONAL
    if (tipoTransacao === "TRANSFERENCIA" && origemTipo === "CAIXA_OPERACIONAL") {
      if (tipoMoeda === "CRYPTO") {
        // CRYPTO: comparar quantidade de moedas diretamente
        const saldoCoinAtual = getSaldoCoin("CAIXA_OPERACIONAL");
        return saldoCoinAtual < qtdCoinNumerico;
      }
      // FIAT: comparar valor na moeda
      const saldoAtual = getSaldoAtual("CAIXA_OPERACIONAL");
      return saldoAtual < valorNumerico;
    }

    // Check TRANSFERENCIA from PARCEIRO_CONTA
    if (tipoTransacao === "TRANSFERENCIA" && origemTipo === "PARCEIRO_CONTA" && origemContaId) {
      const saldoAtual = getSaldoAtual("PARCEIRO_CONTA", origemContaId);
      return saldoAtual < valorNumerico;
    }

    // Check TRANSFERENCIA from PARCEIRO_WALLET
    if (tipoTransacao === "TRANSFERENCIA" && origemTipo === "PARCEIRO_WALLET" && origemWalletId) {
      if (tipoMoeda === "CRYPTO") {
        // CRYPTO: comparar quantidade de moedas
        const saldoCoinAtual = getSaldoCoin("PARCEIRO_WALLET", origemWalletId);
        return saldoCoinAtual < qtdCoinNumerico;
      }
      const saldoAtual = getSaldoAtual("PARCEIRO_WALLET", origemWalletId);
      return saldoAtual < valorNumerico;
    }

    return false;
  };

  const saldoInsuficiente = checkSaldoInsuficiente();

  // Suporta todas as 8 moedas FIAT + USD para crypto
  const formatCurrency = (value: number, forceCurrency?: string) => {
    let currencyCode = forceCurrency || (tipoMoeda === "CRYPTO" ? "USD" : (moeda || "USD"));
    
    // Tratar USDT como USD para formatação
    if (currencyCode === "USDT") currencyCode = "USD";
    
    try {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: currencyCode,
      }).format(value);
    } catch {
      // Fallback para moedas não suportadas
      const symbols: Record<string, string> = { 
        BRL: "R$", USD: "$", EUR: "€", GBP: "£", 
        MXN: "$", MYR: "RM", ARS: "$", COP: "$" 
      };
      return `${symbols[currencyCode] || currencyCode} ${value.toFixed(2)}`;
    }
  };

  // FUNÇÃO REMOVIDA: formatBookmakerBalance duplicava lógica
  // Usar apenas formatBookmakerFullBalance que respeita moeda operacional única

  // Formatar exibição do saldo da bookmaker - ÚNICA MOEDA OPERACIONAL
  // Uma bookmaker opera em UMA moeda (definida em bookmakers.moeda)
  // saldo_atual é o saldo canônico na moeda operacional da casa
  const formatBookmakerFullBalance = (bookmarkerId: string): React.ReactNode => {
    const bm = bookmakers.find(b => b.id === bookmarkerId);
    if (!bm) return formatCurrency(0, "USD");
    
    const moedaCasa = bm.moeda || "USD";
    const saldoOperacional = bm.saldo_atual || 0;
    
    // Formatação uniforme para TODAS as moedas - sem tratamento especial
    return formatCurrency(saldoOperacional, moedaCasa as string);
  };

  // Função para determinar moedas disponíveis baseado no tipo de transação
  const getMoedasDisponiveis = () => {
    // APORTE (Investidor → Caixa): apenas moedas com contas/wallets cadastradas no Caixa Operacional
    if (tipoTransacao === "APORTE_FINANCEIRO" && fluxoAporte === "APORTE") {
      const moedasContasCaixa = caixaParceiroId
        ? [...new Set(contasBancarias.filter(c => c.parceiro_id === caixaParceiroId).map(c => c.moeda))]
        : [];
      const moedasWalletsCaixa = caixaParceiroId
        ? [...new Set(walletsCrypto.filter(w => w.parceiro_id === caixaParceiroId).flatMap(w => w.moeda || []))]
        : [];
      return {
        fiat: moedasContasCaixa.length > 0
          ? MOEDAS_FIAT.filter(m => moedasContasCaixa.includes(m.value))
          : MOEDAS_FIAT,
        crypto: moedasWalletsCaixa.length > 0
          ? MOEDAS_CRYPTO.filter(m => moedasWalletsCaixa.includes(m.value))
          : MOEDAS_CRYPTO
      };
    }
    
    // LIQUIDAÇÃO (Caixa → Investidor): apenas moedas com saldo no caixa
    if (tipoTransacao === "APORTE_FINANCEIRO" && fluxoAporte === "LIQUIDACAO") {
      return {
        fiat: saldosCaixaFiat.filter(s => s.saldo > 0).map(s => {
          const moedaInfo = MOEDAS_FIAT.find(m => m.value === s.moeda);
          return { value: s.moeda, label: moedaInfo?.label || s.moeda, saldo: s.saldo };
        }),
        crypto: saldosCaixaCrypto.filter(s => s.saldo_coin > 0).map(s => ({
          value: s.coin,
          label: MOEDAS_CRYPTO.find(m => m.value === s.coin)?.label || s.coin,
          saldo: s.saldo_usd,
          saldoCoin: s.saldo_coin
        }))
      };
    }
    
    // DEPÓSITO (Parceiro → Bookmaker): moedas disponíveis nos parceiros OU no caixa operacional
    if (tipoTransacao === "DEPOSITO") {
      // Moedas FIAT: combinar caixa operacional + contas de parceiros
      const moedasFiatCaixa = saldosCaixaFiat
        .filter(s => s.saldo > 0)
        .map(s => s.moeda);
      const moedasFiatParceiros = saldosParceirosContas
        .filter(s => s.saldo > 0)
        .map(s => s.moeda);
      const moedasFiatDisponiveis = [...new Set([...moedasFiatCaixa, ...moedasFiatParceiros])];
      
      // Moedas CRYPTO: combinar caixa operacional + wallets de parceiros
      const moedasCryptoCaixa = saldosCaixaCrypto
        .filter(s => s.saldo_coin > 0)
        .map(s => s.coin);
      const moedasCryptoParceiros = saldosParceirosWallets
        .filter(s => s.saldo_coin > 0)
        .map(s => s.coin);
      const moedasCryptoDisponiveis = [...new Set([...moedasCryptoCaixa, ...moedasCryptoParceiros])];
      
      return {
        fiat: MOEDAS_FIAT.filter(m => moedasFiatDisponiveis.includes(m.value)),
        crypto: MOEDAS_CRYPTO.filter(m => moedasCryptoDisponiveis.includes(m.value))
      };
    }
    
    // SAQUE (Bookmaker → Parceiro): moedas derivadas do saldo disponível
    if (tipoTransacao === "SAQUE") {
      // FIAT: moedas das bookmakers com saldo em BRL/moeda base
      const moedasFiatBookmakers = [...new Set(
        bookmakers
          .filter(b => b.saldo_atual > 0)
          .map(b => b.moeda)
      )];
      
      // CRYPTO: mostrar TODAS as moedas crypto quando há bookmakers com saldo em USD
      // Verifica tanto saldo_atual de casas USD quanto saldo_usd legado
      const temBookmakerComSaldoUsd = bookmakers.some(b => 
        (b.moeda === 'USD' && b.saldo_atual > 0) || b.saldo_usd > 0
      );
      
      return {
        fiat: MOEDAS_FIAT.filter(m => moedasFiatBookmakers.includes(m.value)),
        crypto: temBookmakerComSaldoUsd ? MOEDAS_CRYPTO : []
      };
    }
    
    // TRANSFERÊNCIA: depende do fluxo
    if (tipoTransacao === "TRANSFERENCIA") {
      if (fluxoTransferencia === "CAIXA_PARCEIRO") {
        // Caixa → Parceiro: moedas disponíveis no caixa
        return {
          fiat: saldosCaixaFiat.filter(s => s.saldo > 0).map(s => {
            const moedaInfo = MOEDAS_FIAT.find(m => m.value === s.moeda);
            return { value: s.moeda, label: moedaInfo?.label || s.moeda, saldo: s.saldo };
          }),
          crypto: saldosCaixaCrypto.filter(s => s.saldo_coin > 0).map(s => ({
            value: s.coin,
            label: MOEDAS_CRYPTO.find(m => m.value === s.coin)?.label || s.coin,
            saldo: s.saldo_usd
          }))
        };
      } else if (fluxoTransferencia === "PARCEIRO_CAIXA") {
        // Parceiro → Caixa Operacional: moedas disponíveis nos parceiros
        const moedasFiatParceiros = [...new Set(
          saldosParceirosContas
            .filter(s => s.saldo > 0)
            .map(s => s.moeda)
        )];
        
        const moedasCryptoParceiros = [...new Set(
          saldosParceirosWallets
            .filter(s => s.saldo_coin > 0)
            .map(s => s.coin)
        )];
        
        return {
          fiat: MOEDAS_FIAT.filter(m => moedasFiatParceiros.includes(m.value)),
          crypto: MOEDAS_CRYPTO.filter(m => moedasCryptoParceiros.includes(m.value))
        };
      } else {
        // Parceiro → Parceiro: moedas disponíveis nos parceiros
        const moedasFiatParceiros = [...new Set(
          saldosParceirosContas
            .filter(s => s.saldo > 0)
            .map(s => s.moeda)
        )];
        
        const moedasCryptoParceiros = [...new Set(
          saldosParceirosWallets
            .filter(s => s.saldo_coin > 0)
            .map(s => s.coin)
        )];
        
        return {
          fiat: MOEDAS_FIAT.filter(m => moedasFiatParceiros.includes(m.value)),
          crypto: MOEDAS_CRYPTO.filter(m => moedasCryptoParceiros.includes(m.value))
        };
      }
    }
    
    // Fallback: moedas disponíveis no caixa (origem)
    return {
      fiat: saldosCaixaFiat.filter(s => s.saldo > 0).map(s => {
        const moedaInfo = MOEDAS_FIAT.find(m => m.value === s.moeda);
        return { value: s.moeda, label: moedaInfo?.label || s.moeda, saldo: s.saldo };
      }),
      crypto: saldosCaixaCrypto.filter(s => s.saldo_coin > 0).map(s => ({
        value: s.coin,
        label: MOEDAS_CRYPTO.find(m => m.value === s.coin)?.label || s.coin,
        saldo: s.saldo_usd
      }))
    };
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Transação</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Tipo de Transação */}
          <div className="space-y-2">
            <Label>Tipo de Transação</Label>
            <Select value={tipoTransacao} onValueChange={setTipoTransacao}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo de transação" />
              </SelectTrigger>
              <SelectContent>
                {(!allowedTipoTransacao || allowedTipoTransacao.includes("TRANSFERENCIA")) && (
                  <SelectItem value="TRANSFERENCIA">TRANSFERÊNCIA</SelectItem>
                )}
                {(!allowedTipoTransacao || allowedTipoTransacao.includes("DEPOSITO")) && (
                  <SelectItem value="DEPOSITO">DEPÓSITO</SelectItem>
                )}
                {(!allowedTipoTransacao || allowedTipoTransacao.includes("SAQUE")) && (
                  <SelectItem value="SAQUE">SAQUE</SelectItem>
                )}
                {(!allowedTipoTransacao || allowedTipoTransacao.includes("APORTE_FINANCEIRO")) && (
                  <SelectItem value="APORTE_FINANCEIRO">APORTE & LIQUIDAÇÃO</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Aporte Flow Toggle */}
          {tipoTransacao === "APORTE_FINANCEIRO" && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={fluxoAporte === "APORTE" ? "default" : "outline"}
                size="sm"
                onClick={() => setFluxoAporte("APORTE")}
                className="flex-1"
              >
                Investidor → Caixa
              </Button>
              <Button
                type="button"
                variant={fluxoAporte === "LIQUIDACAO" ? "default" : "outline"}
                size="sm"
                onClick={() => setFluxoAporte("LIQUIDACAO")}
                className="flex-1"
              >
                Caixa → Investidor
              </Button>
            </div>
          )}

          {/* Transfer Flow Toggle */}
          {tipoTransacao === "TRANSFERENCIA" && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={fluxoTransferencia === "CAIXA_PARCEIRO" ? "default" : "outline"}
                size="sm"
                onClick={() => setFluxoTransferencia("CAIXA_PARCEIRO")}
                className="flex-1"
              >
                Caixa → Parceiro
              </Button>
              <Button
                type="button"
                variant={fluxoTransferencia === "PARCEIRO_CAIXA" ? "default" : "outline"}
                size="sm"
                onClick={() => setFluxoTransferencia("PARCEIRO_CAIXA")}
                className="flex-1"
              >
                Parceiro → Caixa
              </Button>
              <Button
                type="button"
                variant={fluxoTransferencia === "PARCEIRO_PARCEIRO" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFluxoTransferencia("PARCEIRO_PARCEIRO");
                  // Garantir foco no seletor de moeda ao entrar no fluxo (primeira abertura em FIAT)
                  setTimeout(() => {
                    if (tipoMoeda === "FIAT") {
                      moedaFiatSelectRef.current?.focus();
                      moedaFiatSelectRef.current?.click();
                    } else {
                      coinSelectRef.current?.focus();
                      coinSelectRef.current?.click();
                    }
                  }, 260);
                }}
                className="flex-1"
              >
                Parceiro → Parceiro
              </Button>
            </div>
          )}

          {/* Investidor - Centralizado */}
          {tipoTransacao === "APORTE_FINANCEIRO" && (
            <div className="flex justify-center">
              <div className="w-[40%] space-y-2">
                <Label htmlFor="investidor" className="text-center block">Investidor</Label>
                <InvestidorSelect
                  value={investidorId}
                  onValueChange={setInvestidorId}
                />
              </div>
            </div>
          )}

          {/* Tipo de Moeda, Moeda e Valor - Compactados */}
          {tipoTransacao && tipoMoeda === "FIAT" && (
            <>
            <div className="grid grid-cols-[200px_1fr_1fr] gap-3">
              <div className="space-y-2">
                <Label className="text-center block">Tipo de Moeda</Label>
                <Select value={tipoMoeda} onValueChange={setTipoMoeda}>
                  <SelectTrigger ref={tipoMoedaSelectRef}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIAT">FIAT</SelectItem>
                    <SelectItem value="CRYPTO">CRYPTO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-center block">Moeda</Label>
                <Select value={moeda} onValueChange={setMoeda}>
                  <SelectTrigger ref={moedaFiatSelectRef}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getMoedasDisponiveis().fiat.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.value} - {m.label}
                        {tipoTransacao === "APORTE_FINANCEIRO" && fluxoAporte === "LIQUIDACAO" && 'saldo' in m && typeof m.saldo === 'number' && (
                          <span className="text-xs text-muted-foreground ml-2">
                            (Saldo: {formatCurrency(m.saldo)})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                {/* SAQUE FIAT: Valor na moeda da casa (fonte de verdade do débito) */}
                {tipoTransacao === "SAQUE" && origemBookmakerId ? (
                  <>
                    <Label className="text-center block">
                      Valor a debitar ({(() => {
                        const bm = bookmakers.find(b => b.id === origemBookmakerId);
                        return bm?.moeda || moeda;
                      })()})
                    </Label>
                    <Input
                      ref={valorFiatInputRef}
                      type="text"
                      value={valorDisplay}
                      onChange={handleValorChange}
                      placeholder="0,00"
                    />
                  </>
                ) : (
                  <>
                    <Label className="text-center block">Valor em {moeda}</Label>
                    <Input
                      ref={valorFiatInputRef}
                      type="text"
                      value={valorDisplay}
                      onChange={handleValorChange}
                      placeholder="0,00"
                    />
                  </>
                )}
              </div>
            </div>
            
            {/* Painel de Estimativa de Conversão para Saque Multi-Moeda */}
            {tipoTransacao === "SAQUE" && origemBookmakerId && (() => {
              const valorNum = parseFloat(valor) || 0;
              const bm = bookmakers.find(b => b.id === origemBookmakerId);
              const moedaCasa = bm?.moeda || "USD";
              const moedaDestino = moeda; // Moeda da conta de destino
              const precisaConversao = moedaCasa !== moedaDestino;
              
              if (!precisaConversao || valorNum <= 0) return null;
              
              // Calcular estimativa genérica: Casa → BRL (pivot) → Destino
              const taxaCasa = getRate(moedaCasa);     // BRL por 1 unidade moeda casa
              const taxaDestino = getRate(moedaDestino); // BRL por 1 unidade moeda destino
              
              // Conversão: valorOrigem * taxaCasa = BRL; BRL / taxaDestino = destino
              const valorBRLFromCasa = valorNum * taxaCasa;
              const valorDestinoEstimado = valorBRLFromCasa / taxaDestino;
              
              const currencySymbols: Record<string, string> = {
                BRL: "R$", USD: "$", EUR: "€", GBP: "£", 
                MXN: "$", MYR: "RM", ARS: "$", COP: "$"
              };
              const symbolCasa = currencySymbols[moedaCasa] || moedaCasa;
              const symbolDestino = currencySymbols[moedaDestino] || moedaDestino;
              
              return (
                <Alert className="border-primary/30 bg-primary/5">
                  <Info className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-primary">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Débito na casa:</span>
                        <span className="font-semibold">{symbolCasa} {valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm opacity-80">
                        <span>Cotação {moedaCasa}/{moedaDestino}:</span>
                        <span className="font-mono">{(taxaCasa / taxaDestino).toFixed(4)} <span className="text-[10px] opacity-60">({isUsingFallback ? "fallback" : "oficial"})</span></span>
                      </div>
                      <div className="flex items-center justify-between border-t border-primary/20 pt-1 mt-1">
                        <span className="font-medium">Valor estimado a receber:</span>
                        <span className="font-semibold text-green-400">{symbolDestino} {valorDestinoEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground text-center mt-1">
                        O valor final será confirmado na Conciliação
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              );
            })()}
            </>
          )}

          {/* Crypto fields - Compactados */}
          {tipoTransacao && tipoMoeda === "CRYPTO" && (
            <>
              <div className="grid grid-cols-[200px_1fr_1fr] gap-3">
                <div className="space-y-2">
                  <Label className="text-center block">Tipo de Moeda</Label>
                  <Select value={tipoMoeda} onValueChange={setTipoMoeda}>
                    <SelectTrigger ref={tipoMoedaSelectRef}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIAT">FIAT</SelectItem>
                      <SelectItem value="CRYPTO">CRYPTO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-center block">Moeda Crypto</Label>
                  <Select value={coin} onValueChange={setCoin}>
                    <SelectTrigger ref={coinSelectRef}>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {getMoedasDisponiveis().crypto.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                          {tipoTransacao === "APORTE_FINANCEIRO" && fluxoAporte === "LIQUIDACAO" && 'saldo' in m && typeof m.saldo === 'number' && (
                            <span className="text-xs text-muted-foreground ml-2">
                              {'saldoCoin' in m && typeof m.saldoCoin === 'number' 
                                ? `(${m.saldoCoin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} ${m.value} ≈ ${formatCurrency(m.saldo)})`
                                : `(Saldo: ${formatCurrency(m.saldo)})`
                              }
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* SAQUE CRYPTO: Valor na moeda da casa (inverted flow) */}
                {tipoTransacao === "SAQUE" && origemBookmakerId ? (
                  <div className="space-y-2">
                    <Label className="text-center block">
                      Valor a debitar ({(() => {
                        const bm = bookmakers.find(b => b.id === origemBookmakerId);
                        return bm?.moeda || "USD";
                      })()})
                    </Label>
                    <Input
                      ref={valorFiatInputRef}
                      type="text"
                      value={valorDisplay}
                      onChange={handleValorChange}
                      placeholder="0,00"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-center block">Valor em USD (calculado)</Label>
                    <Input
                      type="text"
                      value={valorDisplay}
                      onChange={handleValorChange}
                      placeholder="0,00"
                      readOnly={tipoTransacao !== "SAQUE"}
                      disabled={tipoTransacao !== "SAQUE"}
                      className={tipoTransacao !== "SAQUE" ? "bg-muted/50" : ""}
                    />
                  </div>
                )}
              </div>
              
              {/* SAQUE CRYPTO: Mostrar estimativa de coins a receber */}
              {tipoTransacao === "SAQUE" && origemBookmakerId && parseFloat(String(valor)) > 0 && (
                <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Estimativa de {coin} a receber:</span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-semibold text-cyan-400">
                        {(() => {
                          const valorNum = parseFloat(String(valor)) || 0;
                          const bm = bookmakers.find(b => b.id === origemBookmakerId);
                          const moedaCasa = bm?.moeda || "USD";
                          
                          // Converter valor da casa para USD
                          let valorEmUSD = valorNum;
                          if (moedaCasa !== "USD") {
                            const taxaCasa = getRate(moedaCasa);
                            const valorBRL = valorNum * taxaCasa;
                            valorEmUSD = valorBRL / cotacaoUSD;
                          }
                          
                          // Converter USD para coins usando cotação do coin
                          const cotacaoCoin = cryptoPrices[coin] || 1;
                          const qtdEstimada = valorEmUSD / cotacaoCoin;
                          
                          return `~${qtdEstimada.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${coin}`;
                        })()}
                      </span>
                      <div className="text-[10px] text-muted-foreground">
                        Cotação: {(cryptoPrices[coin] || 1).toFixed(4)} USD/{coin}
                        <span className="ml-1 opacity-60">({isUsingFallback ? "fallback" : "oficial"})</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Outros fluxos CRYPTO: Quantidade de coins */}
              {tipoTransacao !== "SAQUE" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-center block">Quantidade de Coins</Label>
                    <Input
                      ref={qtdCoinInputRef}
                      type="number"
                      step="0.00000001"
                      value={qtdCoin}
                      onChange={(e) => setQtdCoin(e.target.value)}
                      onBlur={handleQtdCoinBlurTransferFocus}
                      placeholder="0.00000000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-center block">Cotação USD (calculada)</Label>
                    <Input
                      type="number"
                      step="0.00000001"
                      value={cotacao}
                      readOnly
                      disabled
                      placeholder="0.00"
                      className="bg-muted/50"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Alerta de Saldo Insuficiente */}
          {saldoInsuficiente && (
            <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-center">
                Saldo insuficiente! O saldo disponível é menor que o valor da transação.
              </AlertDescription>
            </Alert>
          )}

          {/* Only show Tipo selector when no transaction type selected yet */}
          {tipoTransacao && !tipoMoeda && (
            <div className="space-y-2">
              <Label>Tipo de Moeda</Label>
              <Select value={tipoMoeda} onValueChange={setTipoMoeda}>
                <SelectTrigger ref={tipoMoedaSelectRef}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIAT">FIAT</SelectItem>
                  <SelectItem value="CRYPTO">CRYPTO</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Origem e Destino */}
          {tipoTransacao && (
            <>
              <div className="pt-4">
                <h3 className="text-sm font-medium mb-4 text-center uppercase">Fluxo da Transação</h3>
                <div className="grid grid-cols-2 gap-4">
                  {/* Destino - aparece primeiro no SAQUE */}
                  {tipoTransacao === "SAQUE" ? (
                    <>
                      <div className="space-y-4 pr-4 border-r border-border/50">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-medium text-muted-foreground uppercase">
                            Destino
                          </h4>
                        </div>
                        <Card className="bg-card/30 border-border/50">
                          <CardContent className="pt-6 text-center">
                            <div className="text-sm font-medium uppercase">{getDestinoLabel()}</div>
                            {/* FIAT: Conta Bancária */}
                            {tipoMoeda === "FIAT" && destinoContaId && (
                              <div className="mt-3 space-y-1">
                                {parseFloat(String(valor)) > 0 ? (
                                  <>
                                    <div className="mt-2 flex items-center justify-center gap-2">
                                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                                      <span className="text-sm font-semibold text-foreground">
                                        {formatCurrency(getSaldoAtual("PARCEIRO_CONTA", destinoContaId) + parseFloat(String(valor)))}
                                      </span>
                                    </div>
                                    {renderCotacaoInfo(parseFloat(String(valor)), moeda)}
                                  </>
                                ) : (
                                  <div className="text-xs text-muted-foreground mt-2">
                                    Saldo atual: {formatCurrency(getSaldoAtual("PARCEIRO_CONTA", destinoContaId))}
                                  </div>
                                )}
                              </div>
                            )}
                            {/* CRYPTO: Wallet Crypto */}
                            {tipoMoeda === "CRYPTO" && destinoWalletId && (
                              <div className="mt-3 space-y-1">
                                {parseFloat(String(valor)) > 0 ? (
                                  <div className="mt-2 flex items-center justify-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                                    <span className="text-sm font-semibold text-cyan-400">
                                      {formatCurrency(getSaldoAtual("PARCEIRO_WALLET", destinoWalletId) + parseFloat(String(valor)), "USD")}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-xs text-muted-foreground text-cyan-400 mt-2">
                                    Saldo atual: {formatCurrency(getSaldoAtual("PARCEIRO_WALLET", destinoWalletId), "USD")}
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                        {renderDestinoFields()}
                      </div>

                      <div className="space-y-4 pl-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-medium text-muted-foreground uppercase">
                            Origem
                          </h4>
                        </div>
                        <Card className="bg-card/30 border-border/50">
                          <CardContent className="pt-6 text-center">
                            <div className="text-sm font-medium uppercase">{getOrigemLabel()}</div>
                            {origemBookmakerId && (
                              <div className="mt-3 space-y-1">
                                {getSaquesPendentesBookmaker(origemBookmakerId) > 0 && (
                                  <div className="text-xs text-yellow-500 flex items-center justify-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    <span>
                                      {/* Pendente na moeda da casa */}
                                      Pendente: {(() => {
                                        const bm = bookmakers.find(b => b.id === origemBookmakerId);
                                        const moedaCasa = bm?.moeda || "BRL";
                                        return formatCurrency(getSaquesPendentesBookmaker(origemBookmakerId), moedaCasa);
                                      })()}
                                    </span>
                                  </div>
                                )}
                                {parseFloat(String(valor)) > 0 ? (
                                  <>
                                    {/* 
                                      CORREÇÃO MULTI-MOEDA:
                                      O valor digitado agora está na MOEDA DA CASA (EUR, USD, BRL, etc.)
                                      Não precisa de conversão para mostrar débito - é direto!
                                      O saldo restante = saldo_atual - valorDigitado (ambos na moeda da casa)
                                    */}
                                    {(() => {
                                      const valorNum = parseFloat(String(valor));
                                      const bm = bookmakers.find(b => b.id === origemBookmakerId);
                                      const moedaCasa = bm?.moeda || "BRL";
                                      const saldoAtual = bm?.saldo_atual || 0;
                                      const pendentes = saquesPendentes[origemBookmakerId] || 0;
                                      const saldoRestante = saldoAtual - pendentes - valorNum;
                                      
                                      const currencySymbols: Record<string, string> = {
                                        BRL: "R$", USD: "$", EUR: "€", GBP: "£", 
                                        MXN: "$", MYR: "RM", ARS: "$", COP: "$"
                                      };
                                      const symbol = currencySymbols[moedaCasa] || moedaCasa;
                                      
                                      // Exibir débito direto e saldo restante (ambos na moeda da casa)
                                      return (
                                        <div className="flex flex-col items-center gap-1">
                                          <div className="flex items-center gap-2">
                                            <TrendingDown className="h-4 w-4 text-destructive" />
                                            <span className="text-sm font-semibold text-destructive">
                                              -{symbol} {valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                          </div>
                                          <div className="text-[10px] text-muted-foreground">
                                            Saldo restante: {symbol} {saldoRestante.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </>
                                ) : (
                                  <div className="text-xs text-muted-foreground">
                                    {/* Mostrar ambos os saldos se existirem */}
                                    {formatBookmakerFullBalance(origemBookmakerId)}
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                        {renderOrigemFields()}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Origem - ordem normal para outros tipos */}
                      <div className="space-y-4 pr-4 border-r border-border/50">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-medium text-muted-foreground uppercase">
                            Origem
                          </h4>
                        </div>
                        <Card className="bg-card/30 border-border/50">
                          <CardContent className="pt-6 text-center">
                            <div className="text-sm font-medium uppercase">{getOrigemLabel()}</div>
                            {(origemTipo === "CAIXA_OPERACIONAL" || 
                              (tipoTransacao === "APORTE_FINANCEIRO" && fluxoAporte === "LIQUIDACAO") ||
                              (tipoTransacao === "TRANSFERENCIA" && origemTipo === "CAIXA_OPERACIONAL")) && parseFloat(String(valor)) > 0 && (
                              <>
                                <div className="mt-2 flex items-center justify-center gap-2">
                                  <TrendingDown className="h-4 w-4 text-destructive" />
                                  <span className="text-sm font-semibold text-foreground">
                                    {tipoMoeda === "CRYPTO" ? (
                                      (() => {
                                        const novaQtdCoin = getSaldoCoin("CAIXA_OPERACIONAL") - parseFloat(String(qtdCoin || 0));
                                        const cotacaoAtual = parseFloat(cotacao) || (cryptoPrices[coin] || 1);
                                        const novoUsdCalculado = novaQtdCoin * cotacaoAtual;
                                        return formatCryptoBalance(novaQtdCoin, novoUsdCalculado, coin);
                                      })()
                                    ) : (
                                      formatCurrency(getSaldoAtual("CAIXA_OPERACIONAL") - parseFloat(String(valor)))
                                    )}
                                  </span>
                                </div>
                                {tipoMoeda === "FIAT" && renderCotacaoInfo(parseFloat(String(valor)), moeda)}
                              </>
                            )}
                            {(origemTipo === "CAIXA_OPERACIONAL" || 
                              (tipoTransacao === "APORTE_FINANCEIRO" && fluxoAporte === "LIQUIDACAO") ||
                              (tipoTransacao === "TRANSFERENCIA" && origemTipo === "CAIXA_OPERACIONAL")) && (!valor || parseFloat(String(valor)) === 0) && (
                              <div className="text-xs text-muted-foreground mt-2">
                                Saldo disponível: {tipoMoeda === "CRYPTO" ? (
                                  formatCryptoBalance(
                                    getSaldoCoin("CAIXA_OPERACIONAL"),
                                    getSaldoAtual("CAIXA_OPERACIONAL"),
                                    coin
                                  )
                                ) : (
                                  formatCurrency(getSaldoAtual("CAIXA_OPERACIONAL"))
                                )}
                              </div>
                            )}
                            {/* DEPOSITO FIAT - Mostrar saldo da conta bancária */}
                            {tipoTransacao === "DEPOSITO" && tipoMoeda === "FIAT" && origemContaId && (
                              <div className="mt-3 space-y-1">
                                {parseFloat(String(valor)) > 0 ? (
                                  <>
                                    <div className="mt-2 flex items-center justify-center gap-2">
                                      <TrendingDown className="h-4 w-4 text-destructive" />
                                      <span className="text-sm font-semibold text-foreground">
                                        {formatCurrency(getSaldoAtual("PARCEIRO_CONTA", origemContaId) - parseFloat(String(valor)))}
                                      </span>
                                    </div>
                                    {renderCotacaoInfo(parseFloat(String(valor)), moeda)}
                                  </>
                                ) : (
                                  <div className="text-xs text-muted-foreground mt-2">
                                    Saldo atual: {formatCurrency(getSaldoAtual("PARCEIRO_CONTA", origemContaId))}
                                  </div>
                                )}
                              </div>
                            )}
                            {tipoTransacao === "DEPOSITO" && tipoMoeda === "CRYPTO" && origemWalletId && (
                              <div className="mt-3 space-y-1">
                                {parseFloat(String(valor)) > 0 ? (
                                  <div className="mt-2 flex items-center justify-center gap-2">
                                    <TrendingDown className="h-4 w-4 text-destructive" />
                                    <span className="text-sm font-semibold text-foreground">
                                      {(() => {
                                        const novaQtdCoin = getSaldoCoin("PARCEIRO_WALLET", origemWalletId) - parseFloat(String(qtdCoin || 0));
                                        const cotacaoAtual = parseFloat(cotacao) || (cryptoPrices[coin] || 1);
                                        const novoUsdCalculado = novaQtdCoin * cotacaoAtual;
                                        return formatCryptoBalance(novaQtdCoin, novoUsdCalculado, coin);
                                      })()}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-xs text-muted-foreground mt-2">
                                    Saldo disponível: {formatCryptoBalance(
                                      getSaldoCoin("PARCEIRO_WALLET", origemWalletId),
                                      getSaldoAtual("PARCEIRO_WALLET", origemWalletId),
                                      coin
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Transferência Parceiro → Parceiro OU Parceiro → Caixa - Mostrar saldo SEMPRE */}
                            {tipoTransacao === "TRANSFERENCIA" && 
                             (fluxoTransferencia === "PARCEIRO_PARCEIRO" || fluxoTransferencia === "PARCEIRO_CAIXA") && 
                             (origemTipo === "PARCEIRO_CONTA" || origemTipo === "PARCEIRO_WALLET") && 
                             (origemContaId || origemWalletId) && (
                              <div className="mt-3 space-y-1">
                                {parseFloat(String(valor)) > 0 ? (
                                  <>
                                    <div className="mt-2 flex items-center justify-center gap-2">
                                      <TrendingDown className="h-4 w-4 text-destructive" />
                                      <span className="text-sm font-semibold text-foreground">
                                        {tipoMoeda === "CRYPTO" && origemTipo === "PARCEIRO_WALLET" ? (
                                          (() => {
                                            const novaQtdCoin = getSaldoCoin(origemTipo, origemWalletId) - parseFloat(String(qtdCoin || 0));
                                            const cotacaoAtual = parseFloat(cotacao) || (cryptoPrices[coin] || 1);
                                            const novoUsdCalculado = novaQtdCoin * cotacaoAtual;
                                            return formatCryptoBalance(novaQtdCoin, novoUsdCalculado, coin);
                                          })()
                                        ) : (
                                          formatCurrency(getSaldoAtual(origemTipo, origemContaId || origemWalletId) - parseFloat(String(valor)))
                                        )}
                                      </span>
                                    </div>
                                    {tipoMoeda === "FIAT" && renderCotacaoInfo(parseFloat(String(valor)), moeda)}
                                  </>
                                ) : (
                                  <div className="text-xs text-muted-foreground mt-2">
                                    Saldo disponível: {tipoMoeda === "CRYPTO" && origemTipo === "PARCEIRO_WALLET" ? (
                                      formatCryptoBalance(
                                        getSaldoCoin(origemTipo, origemWalletId),
                                        getSaldoAtual(origemTipo, origemWalletId),
                                        coin
                                      )
                                    ) : (
                                      formatCurrency(getSaldoAtual(origemTipo, origemContaId || origemWalletId))
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                        {renderOrigemFields()}
                      </div>

                      {/* Destino */}
                      <div className="space-y-4 pl-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-medium text-muted-foreground uppercase">
                            Destino
                          </h4>
                        </div>
                        <Card className="bg-card/30 border-border/50">
                          <CardContent className="pt-6 text-center">
                            <div className="text-sm font-medium uppercase">{getDestinoLabel()}</div>
                            {(destinoTipo === "CAIXA_OPERACIONAL" || 
                              (tipoTransacao === "APORTE_FINANCEIRO" && fluxoAporte === "APORTE")) && parseFloat(String(valor)) > 0 && (
                              <>
                                <div className="mt-2 flex items-center justify-center gap-2">
                                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                                  <span className="text-sm font-semibold text-foreground">
                                    {tipoMoeda === "CRYPTO" ? (
                                      (() => {
                                        const novaQtdCoin = getSaldoCoin("CAIXA_OPERACIONAL") + parseFloat(String(qtdCoin || 0));
                                        const cotacaoAtual = parseFloat(cotacao) || (cryptoPrices[coin] || 1);
                                        const novoUsdCalculado = novaQtdCoin * cotacaoAtual;
                                        return formatCryptoBalance(novaQtdCoin, novoUsdCalculado, coin);
                                      })()
                                    ) : (
                                      formatCurrency(getSaldoAtual("CAIXA_OPERACIONAL") + parseFloat(String(valor)))
                                    )}
                                  </span>
                                </div>
                                {tipoMoeda === "FIAT" && renderCotacaoInfo(parseFloat(String(valor)), moeda)}
                              </>
                            )}
                            {(destinoTipo === "CAIXA_OPERACIONAL" || 
                              (tipoTransacao === "APORTE_FINANCEIRO" && fluxoAporte === "APORTE")) && (!valor || parseFloat(String(valor)) === 0) && (
                              <div className="text-xs text-muted-foreground mt-2">
                                Saldo atual: {tipoMoeda === "CRYPTO" ? (
                                  formatCryptoBalance(
                                    getSaldoCoin("CAIXA_OPERACIONAL"),
                                    getSaldoAtual("CAIXA_OPERACIONAL"),
                                    coin
                                  )
                                ) : (
                                  formatCurrency(getSaldoAtual("CAIXA_OPERACIONAL"))
                                )}
                              </div>
                            )}
                            {tipoTransacao === "DEPOSITO" && destinoBookmakerId && (
                              <div className="mt-3 space-y-1">
                                {parseFloat(String(valor)) > 0 ? (
                                  <>
                                    {/* Estimativa na moeda da casa (quando há conversão) */}
                                    {(() => {
                                      const valorNum = parseFloat(String(valor));
                                      const moedaOrigem = tipoMoeda === "CRYPTO" ? "USD" : moeda;
                                      const result = calcularEstimativaMoedaCasa(valorNum, moedaOrigem, destinoBookmakerId);
                                      
                                      if (result && result.precisaConversao) {
                                        return (
                                          <div className="flex flex-col items-center gap-1">
                                            <div className="flex items-center gap-2">
                                              <TrendingUp className="h-4 w-4 text-emerald-500" />
                                              <span className="text-sm font-semibold text-emerald-400">
                                                {result.symbol} {result.estimativa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                              </span>
                                            </div>
                                            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                              <span>≈ estimativa em {result.moedaCasa}</span>
                                              <span className="text-[8px] opacity-60">({isUsingFallback ? "fallback" : "oficial"})</span>
                                            </div>
                                          </div>
                                        );
                                      }
                                      
                                      // Sem conversão - mostra o valor direto na moeda da casa
                                      const bmDest = bookmakers.find(b => b.id === destinoBookmakerId);
                                      const moedaCasaDest = bmDest?.moeda || "USD";
                                      
                                      return (
                                        <div className="mt-2 flex items-center justify-center gap-2">
                                          <TrendingUp className="h-4 w-4 text-emerald-500" />
                                          <span className="text-sm font-semibold text-foreground">
                                            {formatCurrency(getSaldoAtual("BOOKMAKER", destinoBookmakerId) + valorNum, moedaCasaDest)}
                                          </span>
                                        </div>
                                      );
                                    })()}
                                  </>
                                ) : (
                                  <div className="text-xs text-muted-foreground mt-2">
                                    {formatBookmakerFullBalance(destinoBookmakerId)}
                                  </div>
                                )}
                              </div>
                            )}
                            {tipoTransacao === "SAQUE" && destinoContaId && parseFloat(String(valor)) > 0 && (
                              <div className="mt-2 flex items-center justify-center gap-2">
                                <TrendingUp className="h-4 w-4 text-emerald-500" />
                                <span className="text-sm font-semibold text-foreground">
                                  {formatCurrency(getSaldoAtual("PARCEIRO_CONTA", destinoContaId) + parseFloat(String(valor)))}
                                </span>
                              </div>
                            )}
                            {/* Transferência Caixa → Parceiro DESTINO - Mostrar saldo SEMPRE */}
                            {tipoTransacao === "TRANSFERENCIA" && fluxoTransferencia === "CAIXA_PARCEIRO" && 
                             (destinoTipo === "PARCEIRO_CONTA" || destinoTipo === "PARCEIRO_WALLET") && 
                             (destinoContaId || destinoWalletId) && (
                              <div className="mt-3 space-y-1">
                                {parseFloat(String(valor)) > 0 ? (
                                  <div className="mt-2 flex items-center justify-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                                    <span className="text-sm font-semibold text-foreground">
                                      {tipoMoeda === "CRYPTO" && destinoTipo === "PARCEIRO_WALLET" ? (
                                        (() => {
                                          const novaQtdCoin = getSaldoCoin(destinoTipo, destinoWalletId) + parseFloat(String(qtdCoin || 0));
                                          const cotacaoAtual = parseFloat(cotacao) || (cryptoPrices[coin] || 1);
                                          const novoUsdCalculado = novaQtdCoin * cotacaoAtual;
                                          return formatCryptoBalance(novaQtdCoin, novoUsdCalculado, coin);
                                        })()
                                      ) : (
                                        formatCurrency(getSaldoAtual(destinoTipo, destinoContaId || destinoWalletId) + parseFloat(String(valor)))
                                      )}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-xs text-muted-foreground mt-2">
                                    Saldo atual: {tipoMoeda === "CRYPTO" && destinoTipo === "PARCEIRO_WALLET" ? (
                                      formatCryptoBalance(
                                        getSaldoCoin(destinoTipo, destinoWalletId),
                                        getSaldoAtual(destinoTipo, destinoWalletId),
                                        coin
                                      )
                                    ) : (
                                      formatCurrency(getSaldoAtual(destinoTipo, destinoContaId || destinoWalletId))
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Transferência Parceiro → Parceiro DESTINO - Mostrar saldo SEMPRE */}
                            {tipoTransacao === "TRANSFERENCIA" && fluxoTransferencia === "PARCEIRO_PARCEIRO" && 
                             (destinoTipo === "PARCEIRO_CONTA" || destinoTipo === "PARCEIRO_WALLET") && 
                             (destinoContaId || destinoWalletId) && (
                              <div className="mt-3 space-y-1">
                                {parseFloat(String(valor)) > 0 ? (
                                  <div className="mt-2 flex items-center justify-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                                    <span className="text-sm font-semibold text-foreground">
                                      {tipoMoeda === "CRYPTO" && destinoTipo === "PARCEIRO_WALLET" ? (
                                        (() => {
                                          const novaQtdCoin = getSaldoCoin(destinoTipo, destinoWalletId) + parseFloat(String(qtdCoin || 0));
                                          const cotacaoAtual = parseFloat(cotacao) || (cryptoPrices[coin] || 1);
                                          const novoUsdCalculado = novaQtdCoin * cotacaoAtual;
                                          return formatCryptoBalance(novaQtdCoin, novoUsdCalculado, coin);
                                        })()
                                      ) : (
                                        formatCurrency(getSaldoAtual(destinoTipo, destinoContaId || destinoWalletId) + parseFloat(String(valor)))
                                      )}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-xs text-muted-foreground mt-2">
                                    Saldo atual: {tipoMoeda === "CRYPTO" && destinoTipo === "PARCEIRO_WALLET" ? (
                                      formatCryptoBalance(
                                        getSaldoCoin(destinoTipo, destinoWalletId),
                                        getSaldoAtual(destinoTipo, destinoWalletId),
                                        coin
                                      )
                                    ) : (
                                      formatCurrency(getSaldoAtual(destinoTipo, destinoContaId || destinoWalletId))
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                        {renderDestinoFields()}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Data da Transação (retroativa) */}
          {tipoTransacao && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Data da Transação
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Permite registrar transações retroativas. Ex: saque solicitado em 18/01 mas registrado hoje.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="max-w-[220px]">
                <DatePicker
                  value={dataTransacao}
                  onChange={(date) => setDataTransacao(date)}
                  placeholder="Hoje (padrão)"
                  fromYear={2020}
                  toYear={new Date().getFullYear()}
                  maxDate={new Date()}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Deixe em branco para usar a data de hoje
              </p>
            </div>
          )}

          {/* Descrição */}
          {tipoTransacao && (
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Observações sobre a transação"
                rows={3}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || saldoInsuficiente}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar Transação
          </Button>
        </div>

        {/* AlertDialog for missing bank account */}
        <AlertDialog open={showNoBankAlert} onOpenChange={setShowNoBankAlert}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Nenhuma conta bancária cadastrada</AlertDialogTitle>
              <AlertDialogDescription>
                Este parceiro não possui contas bancárias cadastradas. Deseja cadastrar uma nova conta agora?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={async () => {
                setShowNoBankAlert(false);
                
                // Buscar dados do parceiro com contas e wallets
                const { data: parceiroData } = await supabase
                  .from("parceiros")
                  .select("*, contas_bancarias(*), wallets_crypto(*)")
                  .eq("id", alertParceiroId)
                  .single();
                
                if (parceiroData) {
                  setParceiroToEdit(parceiroData);
                  setParceiroDialogInitialTab("bancos");
                  setParceiroDialogOpen(true);
                }
              }}>
                Cadastrar Conta
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* AlertDialog for missing wallet */}
        <AlertDialog open={showNoWalletAlert} onOpenChange={setShowNoWalletAlert}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Nenhuma wallet cadastrada</AlertDialogTitle>
              <AlertDialogDescription>
                Este parceiro não possui wallets cadastradas com a moeda {coin} selecionada. Deseja cadastrar uma nova wallet agora?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={async () => {
                setShowNoWalletAlert(false);
                
                // Buscar dados do parceiro com contas e wallets
                const { data: parceiroData } = await supabase
                  .from("parceiros")
                  .select("*, contas_bancarias(*), wallets_crypto(*)")
                  .eq("id", alertParceiroId)
                  .single();
                
                if (parceiroData) {
                  setParceiroToEdit(parceiroData);
                  setParceiroDialogInitialTab("crypto");
                  setParceiroDialogOpen(true);
                }
              }}>
                Cadastrar Wallet
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* AlertDialog para taxa bancária */}
        <AlertDialog open={showTaxaBancariaAlert} onOpenChange={(open) => {
          if (!open) {
            setShowTaxaBancariaAlert(false);
            setPendingTransactionData(null);
            setTaxaBancariaInfo(null);
          }
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Taxa bancária detectada</AlertDialogTitle>
              <AlertDialogDescription>
                {taxaBancariaInfo && (
                  <span className="space-y-3 flex flex-col">
                    <span>
                      O banco <strong>{taxaBancariaInfo.nomeBanco}</strong> cobra uma taxa{" "}
                      {taxaBancariaInfo.tipoTransacao === "deposito" ? "ao receber (depósito)" : "ao enviar (saque)"}:
                    </span>
                    <span className="rounded-md border border-border bg-muted/50 p-3 text-sm space-y-1 flex flex-col mt-2">
                      <span className="flex justify-between">
                        <span className="text-muted-foreground">Tipo:</span>
                        <span className="font-medium">
                          {taxaBancariaInfo.tipo === "percentual"
                            ? `${taxaBancariaInfo.valor}% sobre o valor`
                            : `${taxaBancariaInfo.moeda} ${taxaBancariaInfo.valor} fixo`}
                        </span>
                      </span>
                      <span className="flex justify-between">
                        <span className="text-muted-foreground">Valor da taxa nesta transação:</span>
                        <span className="font-bold text-foreground">
                          {taxaBancariaInfo.moeda} {taxaBancariaInfo.valorCalculado.toFixed(2)}
                        </span>
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs mt-2">
                      Esta taxa foi cobrada nesta transação?
                    </span>
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel onClick={() => {
                setShowTaxaBancariaAlert(false);
                setPendingTransactionData(null);
                setTaxaBancariaInfo(null);
              }}>
                Cancelar transação
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-muted text-foreground hover:bg-muted/80 border border-border"
                onClick={() => handleConfirmComTaxa(false)}
              >
                Não foi cobrada
              </AlertDialogAction>
              <AlertDialogAction onClick={() => handleConfirmComTaxa(true)}>
                Sim, foi cobrada — registrar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ParceiroDialog for editing partner */}
        <ParceiroDialog
          open={parceiroDialogOpen}
          onClose={() => {
            setParceiroDialogOpen(false);
            setParceiroToEdit(null);
            // Refresh accounts/wallets after editing
            fetchAccountsAndWallets();
          }}
          parceiro={parceiroToEdit}
          viewMode={false}
          initialTab={parceiroDialogInitialTab}
        />
      </DialogContent>
    </Dialog>
  );
}