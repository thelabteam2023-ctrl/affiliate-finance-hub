import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
import { Loader2, ArrowLeftRight, AlertTriangle, TrendingDown, TrendingUp, Info } from "lucide-react";

// Constantes de moedas disponíveis
const MOEDAS_FIAT = [
  { value: "BRL", label: "Real Brasileiro" },
  { value: "USD", label: "Dólar Americano" },
  { value: "EUR", label: "Euro" },
  { value: "GBP", label: "Libra Esterlina" },
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
  defaultDestinoParceiroId?: string;
  defaultTipoMoeda?: "FIAT" | "CRYPTO";
  defaultMoeda?: string;
  defaultCoin?: string;
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
  parceiro_id: string;
  moeda: string[] | null;
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
}

export function CaixaTransacaoDialog({
  open,
  onClose,
  onSuccess,
  defaultTipoTransacao,
  defaultOrigemBookmakerId,
  defaultDestinoParceiroId,
  defaultTipoMoeda,
  defaultMoeda,
  defaultCoin,
}: CaixaTransacaoDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Form state
  const [tipoTransacao, setTipoTransacao] = useState<string>("");
  const [fluxoAporte, setFluxoAporte] = useState<"APORTE" | "LIQUIDACAO">("APORTE");
  const [investidorId, setInvestidorId] = useState<string>("");
  const [tipoMoeda, setTipoMoeda] = useState<string>("FIAT");
  const [moeda, setMoeda] = useState<string>("BRL");
  const [coin, setCoin] = useState<string>("");
  const [valor, setValor] = useState<string>("");
  const [valorDisplay, setValorDisplay] = useState<string>("");
  const [qtdCoin, setQtdCoin] = useState<string>("");
  const [cotacao, setCotacao] = useState<string>("");
  const [descricao, setDescricao] = useState<string>("");

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

  // Track previous values to detect changes (origemParceiroId and origemWalletId tracked after their declarations)
  const prevTipoMoeda = useRef<string>(tipoMoeda);
  const prevMoeda = useRef<string>(moeda);
  const prevValor = useRef<string>(valor);
  const prevQtdCoin = useRef<string>(qtdCoin);
  const prevOrigemContaId = useRef<string>("");
  
  // Flag para evitar re-execução de efeitos durante reset
  const isResettingContext = useRef<boolean>(false);

  // Aplicar defaults quando dialog abre
  useEffect(() => {
    if (open) {
      resetForm();
      // Aplicar defaults após reset (com delay para garantir que o estado foi limpo)
      setTimeout(() => {
        if (defaultTipoTransacao) {
          setTipoTransacao(defaultTipoTransacao);
        }
        if (defaultOrigemBookmakerId) {
          setOrigemBookmakerId(defaultOrigemBookmakerId);
        }
        if (defaultDestinoParceiroId) {
          setDestinoParceiroId(defaultDestinoParceiroId);
        }
        // Aplicar tipo de moeda e moeda/coin
        if (defaultTipoMoeda) {
          setTipoMoeda(defaultTipoMoeda);
          prevTipoMoeda.current = defaultTipoMoeda;
        }
        if (defaultMoeda) {
          setMoeda(defaultMoeda);
          prevMoeda.current = defaultMoeda;
        }
        if (defaultCoin) {
          setCoin(defaultCoin);
        }
      }, 50);
    }
  }, [open, defaultTipoTransacao, defaultOrigemBookmakerId, defaultDestinoParceiroId, defaultTipoMoeda, defaultMoeda, defaultCoin]);

  // ============================================================================
  // FUNÇÃO CENTRALIZADA: Reset de contexto de transação
  // Qualquer mudança em tipoMoeda/moeda/coin deve chamar esta função
  // ============================================================================
  const resetContextoDependente = (resetMoedaCoin: boolean = true, resetValores: boolean = true) => {
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
      setMoeda("BRL");
    }
    
    // Reset ORIGEM (parceiro, conta, wallet, bookmaker)
    setOrigemParceiroId("");
    setOrigemContaId("");
    setOrigemWalletId("");
    setOrigemBookmakerId("");
    
    // Reset DESTINO (parceiro, conta, wallet, bookmaker)
    setDestinoParceiroId("");
    setDestinoContaId("");
    setDestinoWalletId("");
    setDestinoBookmakerId("");
    
    // Reset descrição
    setDescricao("");
    
    // Reset TODOS os refs de tracking (evitar auto-focus indevido)
    prevCoin.current = "";
    prevDestinoParceiroId.current = "";
    prevDestinoWalletId.current = "";
    prevDestinoContaId.current = "";
    prevOrigemBookmakerId.current = "";
    prevOrigemParceiroId.current = "";
    prevOrigemContaId.current = "";
    prevOrigemWalletId.current = "";
    prevDestinoBookmakerId.current = "";
    prevMoeda.current = resetMoedaCoin ? "BRL" : moeda;
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
    
    // 🔒 RESET TOTAL - Invalidar todo o fluxo dependente
    resetContextoDependente(true, true);
    
    // Auto-focus baseado no novo contexto
    setTimeout(() => {
      if (tipoMoeda === "CRYPTO") {
        // DEPÓSITO CRYPTO: abre CoinSelect
        // SAQUE CRYPTO: será tratado em useEffect separado (depende de bookmakers)
        if (tipoTransacao !== "SAQUE") {
          coinSelectRef.current?.focus();
          coinSelectRef.current?.click();
        }
      } else {
        // FIAT: abre MoedaSelect
        moedaFiatSelectRef.current?.focus();
        moedaFiatSelectRef.current?.click();
      }
    }, 100);
    
    prevTipoMoeda.current = tipoMoeda;
  }, [tipoMoeda, tipoTransacao]);

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
    
    // Resetar parceiros (para forçar re-seleção de wallet compatível)
    setOrigemParceiroId("");
    setDestinoParceiroId("");
    
    // Refs
    prevOrigemWalletId.current = "";
    prevDestinoWalletId.current = "";
    prevOrigemParceiroId.current = "";
    prevDestinoParceiroId.current = "";
    
    prevCoin.current = coin;
    
    // Auto-focus para próximo passo (se não estiver no fluxo de SAQUE CRYPTO que já tem bookmaker)
    if (tipoTransacao === "DEPOSITO" && coin && parceiroSelectRef.current) {
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
    
    // Resetar bookmaker (saldo pode não ser compatível)
    setOrigemBookmakerId("");
    setDestinoBookmakerId("");
    
    // Refs
    prevOrigemContaId.current = "";
    prevDestinoContaId.current = "";
    prevOrigemBookmakerId.current = "";
    prevDestinoBookmakerId.current = "";
    
    prevMoeda.current = moeda;
    
    // Resetar bookmaker de origem (contexto de moeda mudou)
    setOrigemBookmakerId("");
    prevOrigemBookmakerId.current = "";
    
    // Auto-focus para próximo passo
    if ((tipoTransacao === "DEPOSITO" || tipoTransacao === "SAQUE") && moeda && parceiroSelectRef.current) {
      setTimeout(() => {
        parceiroSelectRef.current?.open();
      }, 100);
    }
  }, [moeda, tipoMoeda, tipoTransacao]);

  // Auto-focus para outros tipos (não DEPÓSITO): quando moeda é selecionada, foca no Valor
  useEffect(() => {
    if (tipoTransacao !== "DEPOSITO" && tipoMoeda === "FIAT" && moeda && valorFiatInputRef.current) {
      // Não aplicar auto-focus automático para outros tipos de transação
    }
  }, [moeda, tipoMoeda, tipoTransacao]);

  // Auto-focus FIAT: quando valor é preenchido (>0), abre o select Parceiro (apenas para tipos != DEPÓSITO)
  useEffect(() => {
    const valorNum = parseFloat(valor);
    const prevValorNum = parseFloat(prevValor.current || "0");
    if (tipoTransacao !== "DEPOSITO" && tipoMoeda === "FIAT" && valorNum > 0 && prevValorNum === 0 && parceiroSelectRef.current) {
      setTimeout(() => {
        parceiroSelectRef.current?.open();
      }, 150);
    }
    prevValor.current = valor;
  }, [valor, tipoMoeda, tipoTransacao]);

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
  
  // Transfer flow type for TRANSFERENCIA
  const [fluxoTransferencia, setFluxoTransferencia] = useState<"CAIXA_PARCEIRO" | "PARCEIRO_PARCEIRO">("CAIXA_PARCEIRO");
  
  // Alert dialogs state
  const [showNoBankAlert, setShowNoBankAlert] = useState(false);
  const [showNoWalletAlert, setShowNoWalletAlert] = useState(false);
  const [alertParceiroId, setAlertParceiroId] = useState<string>("");
  const [alertTipo, setAlertTipo] = useState<"FIAT" | "CRYPTO">("FIAT");
  
  // ParceiroDialog state
  const [parceiroDialogOpen, setParceiroDialogOpen] = useState(false);
  const [parceiroToEdit, setParceiroToEdit] = useState<any>(null);
  const [parceiroDialogInitialTab, setParceiroDialogInitialTab] = useState<"dados" | "bancos" | "crypto">("bancos");

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
    setMoeda("BRL");
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
    prevMoeda.current = "BRL";
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
      setTipoMoeda("FIAT");
    } else if (tipoTransacao === "TRANSFERENCIA") {
      setOrigemTipo("CAIXA_OPERACIONAL");
      setDestinoTipo("PARCEIRO_CONTA");
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
      } else {
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
  useEffect(() => {
    if (tipoTransacao === "TRANSFERENCIA" && fluxoTransferencia === "PARCEIRO_PARCEIRO") {
      setDestinoParceiroId("");
      setDestinoContaId("");
      setDestinoWalletId("");
    }
    if (tipoTransacao === "DEPOSITO") {
      setDestinoBookmakerId("");
    }
  }, [origemParceiroId, origemContaId, origemWalletId, tipoTransacao, fluxoTransferencia]);

  // Limpar ORIGEM quando DESTINO mudar (somente para SAQUE FIAT)
  // SAQUE CRYPTO usa fluxo invertido: bookmaker é selecionada primeiro
  useEffect(() => {
    if (tipoTransacao === "SAQUE" && tipoMoeda === "FIAT") {
      setOrigemBookmakerId("");
    }
  }, [destinoParceiroId, destinoContaId, tipoTransacao, tipoMoeda]);

  // ====== AUTO-FOCUS CHAIN FOR DEPOSIT FLOW ======
  
  // Auto-focus FIAT: quando parceiro é selecionado, abre o select Conta Bancária
  // Também auto-seleciona se houver apenas uma conta disponível
  useEffect(() => {
    if (tipoMoeda === "FIAT" && origemParceiroId && origemParceiroId !== prevOrigemParceiroId.current) {
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
    prevOrigemParceiroId.current = origemParceiroId;
  }, [origemParceiroId, tipoMoeda, contasBancarias, saldosParceirosContas, moeda]);

  // Auto-focus FIAT DEPÓSITO: quando conta bancária é selecionada, abre o select Bookmaker
  useEffect(() => {
    if (tipoTransacao === "DEPOSITO" && tipoMoeda === "FIAT" && origemContaId && origemContaId !== prevOrigemContaId.current && bookmakerSelectRef.current) {
      setTimeout(() => {
        bookmakerSelectRef.current?.open();
      }, 150);
    }
    prevOrigemContaId.current = origemContaId;
  }, [origemContaId, tipoMoeda, tipoTransacao]);

  // ====== AUTO-FOCUS CHAIN FOR SAQUE (WITHDRAWAL) FLOW ======
  
  // SAQUE: quando parceiro é selecionado, abre o select Conta Bancária (DESTINO)
  // Também auto-seleciona se houver apenas uma conta disponível
  useEffect(() => {
    if (tipoTransacao !== "SAQUE" || tipoMoeda !== "FIAT") return;
    if (!destinoParceiroId || destinoParceiroId === prevDestinoParceiroId.current) return;
    
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
    
    if (bookmakerSelectRef.current) {
      setTimeout(() => {
        bookmakerSelectRef.current?.open();
      }, 150);
    }
    
    prevDestinoContaId.current = destinoContaId;
  }, [destinoContaId, tipoTransacao, tipoMoeda]);

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
  useEffect(() => {
    if (tipoTransacao !== "SAQUE" || tipoMoeda !== "CRYPTO") return;
    if (!destinoWalletId || destinoWalletId === prevDestinoWalletId.current) return;
    
    // Abrir BookmakerSelect para selecionar a origem
    if (bookmakerSelectRef.current) {
      setTimeout(() => {
        bookmakerSelectRef.current?.open();
      }, 150);
    }
    
    prevDestinoWalletId.current = destinoWalletId;
  }, [destinoWalletId, tipoTransacao, tipoMoeda]);

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
    try {
      const { data: contas } = await supabase
        .from("contas_bancarias")
        .select("id, banco, titular, parceiro_id")
        .order("banco");

      const { data: wallets } = await supabase
        .from("wallets_crypto")
        .select("id, exchange, endereco, parceiro_id, moeda")
        .order("exchange");

      setContasBancarias(contas || []);
      setWalletsCrypto(wallets || []);
    } catch (error) {
      console.error("Erro ao carregar contas e wallets:", error);
    }
  };

  const fetchBookmakers = async () => {
    try {
      const { data } = await supabase
        .from("bookmakers")
        .select("id, nome, saldo_atual, saldo_usd, moeda")
        .order("nome");
      
      setBookmakers(data || []);
    } catch (error) {
      console.error("Erro ao carregar bookmakers:", error);
    }
  };

  const fetchSaldosCaixa = async () => {
    try {
      const { data: fiat } = await supabase
        .from("v_saldo_caixa_fiat")
        .select("moeda, saldo");

      const { data: crypto } = await supabase
        .from("v_saldo_caixa_crypto")
        .select("coin, saldo_usd, saldo_coin");

      setSaldosCaixaFiat(fiat || []);
      setSaldosCaixaCrypto(crypto || []);
    } catch (error) {
      console.error("Erro ao carregar saldos caixa:", error);
    }
  };

  const fetchSaldosParceiros = async () => {
    try {
      const { data: contas } = await supabase
        .from("v_saldo_parceiro_contas")
        .select("conta_id, parceiro_id, saldo, moeda");

      const { data: wallets } = await supabase
        .from("v_saldo_parceiro_wallets")
        .select("wallet_id, parceiro_id, coin, saldo_usd, saldo_coin");

      setSaldosParceirosContas(contas || []);
      setSaldosParceirosWallets(wallets || []);
    } catch (error) {
      console.error("Erro ao carregar saldos dos parceiros:", error);
    }
  };

  const fetchInvestidores = async () => {
    try {
      // RLS policies handle workspace isolation
      const { data, error } = await supabase
        .from("investidores")
        .select("id, nome")
        .eq("status", "ativo");

      if (error) throw error;
      setInvestidores(data || []);
    } catch (error) {
      console.error("Erro ao carregar investidores:", error);
    }
  };

  const fetchSaquesPendentes = async () => {
    try {
      const { data, error } = await supabase
        .from("cash_ledger")
        .select("origem_bookmaker_id, valor")
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
  const getContasDisponiveisDestino = (parceiroId: string) => {
    return contasBancarias.filter(
      (c) => c.parceiro_id === parceiroId && c.id !== origemContaId
    );
  };

  const getWalletsDisponiveisDestino = (parceiroId: string) => {
    return walletsCrypto.filter(
      (w) => w.parceiro_id === parceiroId && w.moeda?.includes(coin) && w.id !== origemWalletId
    );
  };

  const getParceirosDisponiveisDestino = () => {
    // Retorna apenas parceiros que têm contas/wallets disponíveis (excluindo a selecionada na origem)
    if (tipoMoeda === "FIAT") {
      return contasBancarias
        .filter((c) => c.id !== origemContaId)
        .map((c) => c.parceiro_id)
        .filter((value, index, self) => self.indexOf(value) === index); // unique
    } else {
      return walletsCrypto
        .filter((w) => w.moeda?.includes(coin) && w.id !== origemWalletId)
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
    setMoeda("BRL");
    setCoin("");
    setValor("");
    setValorDisplay("");
    setQtdCoin("");
    setCotacao("");
    setDescricao("");
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
      return saldo?.saldo_usd || 0;
    }
    
    return 0;
  };

  // Retorna o saldo bruto da bookmaker (sem descontar pendentes) para exibição
  const getSaldoBrutoBookmaker = (id: string): { brl: number; usd: number; moeda: string } => {
    const bm = bookmakers.find(b => b.id === id);
    return { 
      brl: bm?.saldo_atual || 0,
      usd: bm?.saldo_usd || 0,
      moeda: bm?.moeda || "BRL"
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

      if (tipoMoeda === "CRYPTO" && (!coin || !qtdCoin || parseFloat(qtdCoin) <= 0)) {
        toast({
          title: "Erro",
          description: "Informe a moeda crypto e quantidade",
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

      if (destinoTipo === "BOOKMAKER" && !destinoBookmakerId) {
        toast({
          title: "Erro",
          description: "Selecione a bookmaker de destino",
          variant: "destructive",
        });
        return;
      }

      // Validar transferência para mesma conta/wallet
      if (tipoTransacao === "TRANSFERENCIA" && fluxoTransferencia === "PARCEIRO_PARCEIRO") {
        if (origemTipo === "PARCEIRO_CONTA" && destinoTipo === "PARCEIRO_CONTA" && origemContaId === destinoContaId) {
          toast({
            title: "Erro",
            description: "Não é possível transferir de uma conta bancária para ela mesma",
            variant: "destructive",
          });
          return;
        }
        
        if (origemTipo === "PARCEIRO_WALLET" && destinoTipo === "PARCEIRO_WALLET" && origemWalletId === destinoWalletId) {
          toast({
            title: "Erro",
            description: "Não é possível transferir de uma wallet para ela mesma",
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

      // Buscar workspace do usuário
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", userData.user.id)
        .limit(1)
        .maybeSingle();

      const workspaceId = workspaceMember?.workspace_id || null;

      // Find investor name if APORTE_FINANCEIRO
      const investidor = investidores.find(inv => inv.id === investidorId);
      
      // SAQUE e DEPOSITO crypto iniciam como PENDENTE para conciliação
      // Outros tipos iniciam como CONFIRMADO
      const statusInicial = 
        tipoTransacao === "SAQUE" ? "PENDENTE" :
        (tipoTransacao === "DEPOSITO" && tipoMoeda === "CRYPTO") ? "PENDENTE" :
        "CONFIRMADO";

      // Determinar moeda de destino baseado no bookmaker de destino (para DEPOSITO)
      let moedaDestino = tipoMoeda === "FIAT" ? moeda : "USD";
      let destinoBookmakerMoeda = "BRL";
      if (tipoTransacao === "DEPOSITO" && destinoBookmakerId) {
        const destBm = bookmakers.find(b => b.id === destinoBookmakerId);
        destinoBookmakerMoeda = destBm?.moeda || "BRL";
        moedaDestino = destinoBookmakerMoeda;
      }

      // Determinar se há conversão de moeda
      const moedaOrigem = tipoMoeda === "CRYPTO" ? coin : moeda;
      const precisaConversao = moedaOrigem !== moedaDestino;

      const transactionData: any = {
        user_id: userData.user.id,
        workspace_id: workspaceId,
        tipo_transacao: tipoTransacao,
        tipo_moeda: tipoMoeda,
        moeda: moedaDestino,
        valor: parseFloat(valor),
        descricao,
        status: statusInicial,
        investidor_id: tipoTransacao === "APORTE_FINANCEIRO" ? investidorId : null,
        nome_investidor: tipoTransacao === "APORTE_FINANCEIRO" && investidor ? investidor.nome : null,
        // Campos de conversão
        moeda_origem: moedaOrigem,
        valor_origem: parseFloat(valor),
        moeda_destino: moedaDestino,
        valor_destino: parseFloat(valor), // Inicialmente igual, pode ser ajustado depois
        status_valor: precisaConversao ? "ESTIMADO" : "CONFIRMADO",
      };

      // Add crypto-specific fields
      if (tipoMoeda === "CRYPTO") {
        transactionData.coin = coin;
        transactionData.qtd_coin = parseFloat(qtdCoin);
        transactionData.valor_usd = parseFloat(valor);
        if (cotacao) {
          transactionData.cotacao = parseFloat(cotacao);
          // Para crypto, calcular cotação implícita
          transactionData.cotacao_implicita = parseFloat(cotacao);
        }
      }

      // Set origem/destino based on transaction type and flow
      if (tipoTransacao === "APORTE_FINANCEIRO") {
        if (fluxoAporte === "APORTE") {
          // Aporte: Investidor → Caixa
          transactionData.origem_tipo = "INVESTIDOR";
          transactionData.destino_tipo = "CAIXA_OPERACIONAL";
        } else {
          // Liquidação: Caixa → Investidor
          transactionData.origem_tipo = "CAIXA_OPERACIONAL";
          transactionData.destino_tipo = "INVESTIDOR";
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
          }
        }
      }

      const { error } = await supabase.from("cash_ledger").insert([transactionData]);

      if (error) throw error;

      // ATUALIZAR SALDO DO BOOKMAKER quando a transação envolve bookmaker
      const valorNumerico = parseFloat(valor);
      
      // DEPÓSITO: aumentar saldo do bookmaker de destino
      if (tipoTransacao === "DEPOSITO" && destinoBookmakerId) {
        const destBk = bookmakers.find(b => b.id === destinoBookmakerId);
        if (destBk) {
          // Determinar qual campo atualizar baseado na moeda
          const moedaBk = destBk.moeda || "BRL";
          const campoSaldo = moedaBk === "USD" ? "saldo_usd" : "saldo_atual";
          const novoSaldo = (moedaBk === "USD" ? destBk.saldo_usd : destBk.saldo_atual) + valorNumerico;
          
          const { error: updateBkError } = await supabase
            .from("bookmakers")
            .update({ 
              [campoSaldo]: novoSaldo,
              updated_at: new Date().toISOString()
            })
            .eq("id", destinoBookmakerId);
          
          if (updateBkError) {
            console.error("Erro ao atualizar saldo do bookmaker de destino:", updateBkError);
          }
        }
      }
      
      // TRANSFERÊNCIA BOOKMAKER → outro destino: decrementar saldo do bookmaker de origem
      if (tipoTransacao === "TRANSFERENCIA" && origemBookmakerId) {
        const origBk = bookmakers.find(b => b.id === origemBookmakerId);
        if (origBk) {
          const moedaBk = origBk.moeda || "BRL";
          const campoSaldo = moedaBk === "USD" ? "saldo_usd" : "saldo_atual";
          const novoSaldo = Math.max(0, (moedaBk === "USD" ? origBk.saldo_usd : origBk.saldo_atual) - valorNumerico);
          
          const { error: updateBkError } = await supabase
            .from("bookmakers")
            .update({ 
              [campoSaldo]: novoSaldo,
              updated_at: new Date().toISOString()
            })
            .eq("id", origemBookmakerId);
          
          if (updateBkError) {
            console.error("Erro ao atualizar saldo do bookmaker de origem:", updateBkError);
          }
        }
      }
      
      // TRANSFERÊNCIA → BOOKMAKER destino: incrementar saldo
      if (tipoTransacao === "TRANSFERENCIA" && destinoBookmakerId) {
        const destBk = bookmakers.find(b => b.id === destinoBookmakerId);
        if (destBk) {
          const moedaBk = destBk.moeda || "BRL";
          const campoSaldo = moedaBk === "USD" ? "saldo_usd" : "saldo_atual";
          const novoSaldo = (moedaBk === "USD" ? destBk.saldo_usd : destBk.saldo_atual) + valorNumerico;
          
          const { error: updateBkError } = await supabase
            .from("bookmakers")
            .update({ 
              [campoSaldo]: novoSaldo,
              updated_at: new Date().toISOString()
            })
            .eq("id", destinoBookmakerId);
          
          if (updateBkError) {
            console.error("Erro ao atualizar saldo do bookmaker de destino:", updateBkError);
          }
        }
      }

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

      toast({
        title: "Sucesso",
        description: tipoTransacao === "SAQUE" 
          ? "Saque solicitado! Aguardando confirmação de recebimento."
          : "Transação registrada com sucesso",
      });

      resetForm();
      onSuccess();
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

  const renderOrigemFields = () => {
    if (tipoTransacao === "APORTE_FINANCEIRO") {
      const investidor = investidores.find(inv => inv.id === investidorId);
      return (
        <div className="text-sm text-muted-foreground italic text-center">
          {fluxoAporte === "APORTE" 
            ? (investidor ? `Investidor: ${investidor.nome}` : "Investidor Externo")
            : "Caixa Operacional"}
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
                          {conta.banco} - Saldo: {formatCurrency(saldo?.saldo || 0)}
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
                      
                      // Filtrar apenas wallets com saldo disponível para a moeda selecionada
                      // A existência do saldo na view indica que a wallet suporta a moeda
                      const saldo = saldosParceirosWallets.find(
                        s => s.wallet_id === w.id && s.coin === coin
                      );
                      return saldo && saldo.saldo_usd > 0;
                    })
                    .map((wallet) => {
                      const saldo = saldosParceirosWallets.find(
                        s => s.wallet_id === wallet.id && s.coin === coin
                      );
                      const walletName = wallet.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET';
                      const shortenedAddress = wallet.endereco 
                        ? `${wallet.endereco.slice(0, 5)}....${wallet.endereco.slice(-5)}`
                        : '';
                      return (
                        <SelectItem key={wallet.id} value={wallet.id}>
                          <span className="font-mono">{walletName} - {shortenedAddress} - Saldo: {formatCurrency(saldo?.saldo_usd || 0)}</span>
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
            
            // Verificar se alguma wallet tem saldo
            const walletsComSaldo = walletsDoParceiroComMoeda.filter((w) => {
              const saldo = saldosParceirosWallets.find(
                s => s.wallet_id === w.id && s.coin === coin
              );
              return saldo && saldo.saldo_usd > 0;
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
      // SAQUE FIAT: destino = conta bancária, origem = bookmaker com saldo_atual
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
              <Label>Bookmaker (com saldo {moeda})</Label>
              <BookmakerSelect
                key={`saque-fiat-${destinoParceiroId}-${moeda}`}
                ref={bookmakerSelectRef}
                value={origemBookmakerId}
                onValueChange={setOrigemBookmakerId}
                disabled={!isDestinoCompleta}
                parceiroId={destinoParceiroId}
                somenteComSaldoFiat={true}
                moedaOperacional={moeda}
              />
            </div>
          </>
        );
      }
      
      // SAQUE CRYPTO: destino = wallet crypto, origem = bookmaker com saldo_usd
      const isDestinoCompletaCrypto = destinoParceiroId && destinoWalletId;
      
      // Verificar se há bookmakers com saldo USD disponível
      const bookmakersComSaldoUsd = bookmakers.filter(b => b.saldo_usd > 0);
      
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
          {bookmakersComSaldoUsd.length === 0 && (
            <Alert variant="destructive" className="border-warning/50 bg-warning/10">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                Nenhuma bookmaker com saldo USD disponível para saque crypto.
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label>Bookmaker (com saldo USD)</Label>
            <BookmakerSelect
              key={`saque-crypto-${destinoParceiroId}`}
              ref={bookmakerSelectRef}
              value={origemBookmakerId}
              onValueChange={setOrigemBookmakerId}
              disabled={!isDestinoCompletaCrypto}
              parceiroId={destinoParceiroId}
              somenteComSaldo={true}
              somenteComSaldoUsd={true}
            />
          </div>
        </>
      );
    }

    if (tipoTransacao === "TRANSFERENCIA") {
      if (fluxoTransferencia === "CAIXA_PARCEIRO") {
        return (
          <div className="text-sm text-muted-foreground italic text-center">
            Caixa Operacional
          </div>
        );
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
                            {conta.banco} - Saldo: {formatCurrency(saldo?.saldo || 0)}
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
        // CRYPTO - Filtrar parceiros com saldo no coin selecionado
        const parceirosComSaldo = saldosParceirosWallets
          .filter(s => s.coin === coin && s.saldo_usd > 0)
          .map(s => s.parceiro_id)
          .filter((value, index, self) => self.indexOf(value) === index); // unique

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
                        // Filtrar apenas wallets com saldo
                        const saldo = saldosParceirosWallets.find(
                          s => s.wallet_id === w.id && s.coin === coin
                        );
                        return saldo && saldo.saldo_usd > 0;
                      })
                      .map((wallet) => {
                        const saldo = saldosParceirosWallets.find(
                          s => s.wallet_id === wallet.id && s.coin === coin
                        );
                        const walletName = wallet.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET';
                        const shortenedAddress = wallet.endereco 
                          ? `${wallet.endereco.slice(0, 5)}....${wallet.endereco.slice(-5)}`
                          : '';
                        return (
                          <SelectItem key={wallet.id} value={wallet.id}>
                            <span className="font-mono">{walletName} - {shortenedAddress} - Saldo: {formatCurrency(saldo?.saldo_usd || 0)}</span>
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
              
              // Verificar se alguma wallet tem saldo
              const walletsComSaldo = walletsDoParceiroComMoeda.filter((w) => {
                const saldo = saldosParceirosWallets.find(
                  s => s.wallet_id === w.id && s.coin === coin
                );
                return saldo && saldo.saldo_usd > 0;
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
        <div className="text-sm text-muted-foreground italic text-center">
          {fluxoAporte === "APORTE" 
            ? "Caixa Operacional"
            : (investidor ? `Investidor: ${investidor.nome}` : "Investidor Externo")}
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
                      .filter((c) => c.parceiro_id === destinoParceiroId)
                      .map((conta) => (
                        <SelectItem key={conta.id} value={conta.id}>
                          {conta.banco}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {destinoParceiroId && contasBancarias.filter((c) => c.parceiro_id === destinoParceiroId).length === 0 && (
              <Alert variant="destructive" className="border-warning/50 bg-warning/10">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-warning">
                  Este parceiro não possui contas bancárias cadastradas.{' '}
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
            <BookmakerSelect
              ref={bookmakerSelectRef}
              value={destinoBookmakerId}
              onValueChange={setDestinoBookmakerId}
              disabled={!isOrigemCompleta}
              parceiroId={origemParceiroId}
              moedaOperacional={tipoMoeda === "CRYPTO" ? "USD" : moeda}
            />
          </div>
        </>
      );
    }

    if (tipoTransacao === "TRANSFERENCIA") {
      if (fluxoTransferencia === "CAIXA_PARCEIRO") {
        // CAIXA → PARCEIRO flow
        if (tipoMoeda === "FIAT") {
          return (
            <>
              <div className="space-y-2">
                <Label>Parceiro</Label>
                <ParceiroSelect
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
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {contasBancarias
                        .filter((c) => c.parceiro_id === destinoParceiroId)
                        .map((conta) => (
                          <SelectItem key={conta.id} value={conta.id}>
                            {conta.banco}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {destinoParceiroId && contasBancarias.filter((c) => c.parceiro_id === destinoParceiroId).length === 0 && (
                <Alert variant="destructive" className="border-warning/50 bg-warning/10">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <AlertDescription className="text-warning">
                    Este parceiro não possui contas bancárias cadastradas.{' '}
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
                    Este parceiro não possui wallets cadastradas para {coin}.{' '}
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

      // PARCEIRO → PARCEIRO flow (destino)
      const parceirosDisponiveis = getParceirosDisponiveisDestino();
      const origemEstaCompleta = isOrigemCompleta();
      
      if (tipoMoeda === "FIAT") {
        return (
          <>
            <div className="space-y-2">
              <Label>Parceiro</Label>
              <ParceiroSelect
                value={destinoParceiroId}
                onValueChange={(value) => {
                  setDestinoParceiroId(value);
                  setDestinoContaId("");
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
                  }}
                  disabled={!origemEstaCompleta}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {getContasDisponiveisDestino(destinoParceiroId).map((conta) => (
                      <SelectItem key={conta.id} value={conta.id}>
                        {conta.banco}
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
                value={destinoParceiroId}
                onValueChange={(value) => {
                  setDestinoParceiroId(value);
                  setDestinoWalletId("");
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
                  }}
                  disabled={!origemEstaCompleta}
                >
                  <SelectTrigger>
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
    // REGRA CRÍTICA: Para CRYPTO, comparar QUANTIDADE DE MOEDAS (saldo_coin vs qtdCoin)
    // NUNCA comparar valores convertidos em USD/BRL que variam com a cotação
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
    if (tipoTransacao === "SAQUE" && origemBookmakerId) {
      // Para SAQUE, usamos saldo_usd vs valor_usd pois bookmakers operam em USD
      const saldoAtual = getSaldoAtual("BOOKMAKER", origemBookmakerId);
      return saldoAtual < valorNumerico;
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

  const formatCurrency = (value: number, forceCurrency?: "BRL" | "USD") => {
    const currencyCode = forceCurrency || (tipoMoeda === "CRYPTO" ? "USD" : (moeda || "BRL"));
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currencyCode,
    }).format(value);
  };

  // Formatar saldo de bookmaker com ambas moedas se existirem
  const formatBookmakerBalance = (bookmarkerId: string): React.ReactNode => {
    const saldos = getSaldoBrutoBookmaker(bookmarkerId);
    const pendente = getSaquesPendentesBookmaker(bookmarkerId);
    const hasBrl = saldos.brl > 0;
    const hasUsd = saldos.usd > 0;
    
    // Se CRYPTO, mostrar apenas USD
    if (tipoMoeda === "CRYPTO") {
      const disponivel = saldos.usd - pendente;
      return formatCurrency(disponivel, "USD");
    }
    
    // Se FIAT, mostrar apenas BRL
    const disponivel = saldos.brl - pendente;
    return formatCurrency(disponivel, "BRL");
  };

  // Formatar exibição completa dos saldos da bookmaker (BRL + USD)
  const formatBookmakerFullBalance = (bookmarkerId: string): React.ReactNode => {
    const saldos = getSaldoBrutoBookmaker(bookmarkerId);
    const hasBrl = saldos.brl > 0;
    const hasUsd = saldos.usd > 0;
    const isUsdMoeda = saldos.moeda === "USD" || saldos.moeda === "USDT";
    
    if (hasBrl && hasUsd) {
      return (
        <div className="flex flex-col items-center gap-0.5">
          <span>{formatCurrency(saldos.brl, "BRL")}</span>
          <span className="text-cyan-400">{formatCurrency(saldos.usd, "USD")}</span>
        </div>
      );
    }
    if (hasUsd) {
      return <span className="text-cyan-400">{formatCurrency(saldos.usd, "USD")}</span>;
    }
    if (hasBrl) {
      return formatCurrency(saldos.brl, "BRL");
    }
    // Quando ambos são zero, usar a moeda da bookmaker
    if (isUsdMoeda) {
      return <span className="text-cyan-400">{formatCurrency(0, "USD")}</span>;
    }
    return formatCurrency(0, "BRL");
  };

  // Função para determinar moedas disponíveis baseado no tipo de transação
  const getMoedasDisponiveis = () => {
    // APORTE (Investidor → Caixa): todas as moedas
    if (tipoTransacao === "APORTE_FINANCEIRO" && fluxoAporte === "APORTE") {
      return {
        fiat: MOEDAS_FIAT,
        crypto: MOEDAS_CRYPTO
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
          saldo: s.saldo_usd
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
      
      // CRYPTO: mostrar TODAS as moedas crypto quando há bookmakers com saldo USD
      // Isso permite depositar em uma moeda (ex: USDT) e sacar em outra (ex: BTC)
      const temBookmakerComSaldoUsd = bookmakers.some(b => b.saldo_usd > 0);
      
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
                <SelectItem value="TRANSFERENCIA">TRANSFERÊNCIA</SelectItem>
                <SelectItem value="DEPOSITO">DEPÓSITO</SelectItem>
                <SelectItem value="SAQUE">SAQUE</SelectItem>
                <SelectItem value="APORTE_FINANCEIRO">APORTE & LIQUIDAÇÃO</SelectItem>
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
                variant={fluxoTransferencia === "PARCEIRO_PARCEIRO" ? "default" : "outline"}
                size="sm"
                onClick={() => setFluxoTransferencia("PARCEIRO_PARCEIRO")}
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
            <div className="grid grid-cols-[200px_1fr_1fr] gap-3">
              <div className="space-y-2">
                <Label className="text-center block">Tipo de Moeda</Label>
                <Select value={tipoMoeda} onValueChange={setTipoMoeda}>
                  <SelectTrigger>
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
                <Label className="text-center block">Valor em {moeda}</Label>
                <Input
                  ref={valorFiatInputRef}
                  type="text"
                  value={valorDisplay}
                  onChange={handleValorChange}
                  placeholder="0,00"
                />
              </div>
            </div>
          )}

          {/* Crypto fields - Compactados */}
          {tipoTransacao && tipoMoeda === "CRYPTO" && (
            <>
              <div className="grid grid-cols-[200px_1fr_1fr] gap-3">
                <div className="space-y-2">
                  <Label className="text-center block">Tipo de Moeda</Label>
                  <Select value={tipoMoeda} onValueChange={setTipoMoeda}>
                    <SelectTrigger>
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
                              (Saldo: {formatCurrency(m.saldo)})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-center block">Valor em USD (calculado)</Label>
                  <Input
                    type="text"
                    value={valorDisplay}
                    onChange={handleValorChange}
                    placeholder="0,00"
                    readOnly
                    disabled
                    className="bg-muted/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-center block">Quantidade de Coins</Label>
                  <Input
                    ref={qtdCoinInputRef}
                    type="number"
                    step="0.00000001"
                    value={qtdCoin}
                    onChange={(e) => setQtdCoin(e.target.value)}
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
                <SelectTrigger>
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
                                  <div className="mt-2 flex items-center justify-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                                    <span className="text-sm font-semibold text-foreground">
                                      {formatCurrency(getSaldoAtual("PARCEIRO_CONTA", destinoContaId) + parseFloat(String(valor)))}
                                    </span>
                                  </div>
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
                                      Pendente: {formatCurrency(getSaquesPendentesBookmaker(origemBookmakerId), tipoMoeda === "CRYPTO" ? "USD" : "BRL")}
                                    </span>
                                  </div>
                                )}
                                {parseFloat(String(valor)) > 0 ? (
                                  <div className="mt-2 flex items-center justify-center gap-2">
                                    <TrendingDown className="h-4 w-4 text-destructive" />
                                    <span className={`text-sm font-semibold ${tipoMoeda === "CRYPTO" ? "text-cyan-400" : "text-foreground"}`}>
                                      {tipoMoeda === "CRYPTO"
                                        ? formatCurrency(getSaldoAtual("BOOKMAKER", origemBookmakerId) - parseFloat(String(valor)), "USD")
                                        : formatCurrency(getSaldoAtual("BOOKMAKER", origemBookmakerId) - parseFloat(String(valor)), "BRL")}
                                    </span>
                                  </div>
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
                                  <div className="mt-2 flex items-center justify-center gap-2">
                                    <TrendingDown className="h-4 w-4 text-destructive" />
                                    <span className="text-sm font-semibold text-foreground">
                                      {formatCurrency(getSaldoAtual("PARCEIRO_CONTA", origemContaId) - parseFloat(String(valor)))}
                                    </span>
                                  </div>
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
                            {/* Transferência Parceiro → Parceiro - Mostrar saldo SEMPRE */}
                            {tipoTransacao === "TRANSFERENCIA" && fluxoTransferencia === "PARCEIRO_PARCEIRO" && 
                             (origemTipo === "PARCEIRO_CONTA" || origemTipo === "PARCEIRO_WALLET") && 
                             (origemContaId || origemWalletId) && (
                              <div className="mt-3 space-y-1">
                                {parseFloat(String(valor)) > 0 ? (
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
                                  <div className="mt-2 flex items-center justify-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                                    <span className={`text-sm font-semibold ${tipoMoeda === "CRYPTO" ? "text-cyan-400" : "text-foreground"}`}>
                                      {tipoMoeda === "CRYPTO" 
                                        ? formatCurrency(getSaldoAtual("BOOKMAKER", destinoBookmakerId) + parseFloat(String(valor)), "USD")
                                        : formatCurrency(getSaldoAtual("BOOKMAKER", destinoBookmakerId) + parseFloat(String(valor)), "BRL")
                                      }
                                    </span>
                                  </div>
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