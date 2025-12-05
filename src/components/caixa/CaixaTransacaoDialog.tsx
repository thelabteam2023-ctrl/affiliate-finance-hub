import { useState, useEffect } from "react";
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
import ParceiroSelect from "@/components/parceiros/ParceiroSelect";
import ParceiroDialog from "@/components/parceiros/ParceiroDialog";
import BookmakerSelect from "@/components/bookmakers/BookmakerSelect";
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

  // Aplicar defaults quando dialog abre
  useEffect(() => {
    if (open) {
      resetForm();
      // Aplicar defaults após reset
      if (defaultTipoTransacao) {
        setTipoTransacao(defaultTipoTransacao);
      }
      if (defaultOrigemBookmakerId) {
        setOrigemBookmakerId(defaultOrigemBookmakerId);
      }
    }
  }, [open, defaultTipoTransacao, defaultOrigemBookmakerId]);

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

  // Data for selects
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [walletsCrypto, setWalletsCrypto] = useState<WalletCrypto[]>([]);
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [saldosCaixaFiat, setSaldosCaixaFiat] = useState<SaldoCaixaFiat[]>([]);
  const [saldosCaixaCrypto, setSaldosCaixaCrypto] = useState<SaldoCaixaCrypto[]>([]);
  const [saldosParceirosContas, setSaldosParceirosContas] = useState<SaldoParceiroContas[]>([]);
  const [saldosParceirosWallets, setSaldosParceirosWallets] = useState<SaldoParceiroWallets[]>([]);
  const [investidores, setInvestidores] = useState<Array<{ id: string; nome: string }>>([]);
  
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
    }
  }, [open]);

  useEffect(() => {
    // Reset origin/destination when transaction type changes
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
    setFluxoAporte("APORTE");
    setInvestidorId("");

    // Set defaults based on transaction type
    if (tipoTransacao === "APORTE_FINANCEIRO") {
      // Will be set by fluxoAporte toggle
    } else if (tipoTransacao === "DEPOSITO") {
      setOrigemTipo("PARCEIRO_CONTA");
      setDestinoTipo("BOOKMAKER");
      setTipoMoeda("FIAT"); // DEPOSITO only supports FIAT
    } else if (tipoTransacao === "SAQUE") {
      setOrigemTipo("BOOKMAKER");
      setDestinoTipo("PARCEIRO_CONTA");
      setTipoMoeda("FIAT"); // SAQUE only supports FIAT
    } else if (tipoTransacao === "TRANSFERENCIA") {
      setOrigemTipo("CAIXA_OPERACIONAL");
      setDestinoTipo("PARCEIRO_CONTA");
    }
  }, [tipoTransacao]);
  
  useEffect(() => {
    // Update origem/destino based on transfer flow and currency type
    if (tipoTransacao === "TRANSFERENCIA") {
      if (fluxoTransferencia === "CAIXA_PARCEIRO") {
        setOrigemTipo("CAIXA_OPERACIONAL");
        if (tipoMoeda === "FIAT") {
          setDestinoTipo("PARCEIRO_CONTA");
        } else {
          setDestinoTipo("PARCEIRO_WALLET");
        }
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

  // Limpar ORIGEM quando DESTINO mudar (somente para SAQUE)
  useEffect(() => {
    if (tipoTransacao === "SAQUE") {
      setOrigemBookmakerId("");
    }
  }, [destinoParceiroId, destinoContaId, tipoTransacao]);

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
        .select("id, nome, saldo_atual, moeda")
        .eq("id", origemBookmakerId)
        .single();
      
      if (data) {
        setBookmakers(prev => {
          const filtered = prev.filter(b => b.id !== data.id);
          return [...filtered, data];
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
        .select("id, nome, saldo_atual, moeda")
        .eq("id", destinoBookmakerId)
        .single();
      
      if (data) {
        setBookmakers(prev => {
          const filtered = prev.filter(b => b.id !== data.id);
          return [...filtered, data];
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
        .select("id, nome, saldo_atual, moeda")
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("investidores")
        .select("id, nome")
        .eq("user_id", user.id)
        .eq("status", "ativo");

      if (error) throw error;
      setInvestidores(data || []);
    } catch (error) {
      console.error("Erro ao carregar investidores:", error);
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
      return bm?.saldo_atual || 0;
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
      if (origemContaId) {
        const conta = contasBancarias.find(c => c.id === origemContaId);
        return conta ? `${conta.banco} - ${conta.titular}` : "Conta Bancária";
      }
      return "Conta Bancária";
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
      if (destinoContaId) {
        const conta = contasBancarias.find(c => c.id === destinoContaId);
        return conta ? `${conta.banco} - ${conta.titular}` : "Conta Bancária";
      }
      return "Conta Bancária";
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

      // Find investor name if APORTE_FINANCEIRO
      const investidor = investidores.find(inv => inv.id === investidorId);
      
      const transactionData: any = {
        user_id: userData.user.id,
        tipo_transacao: tipoTransacao,
        tipo_moeda: tipoMoeda,
        moeda: tipoMoeda === "FIAT" ? moeda : "USD",
        valor: parseFloat(valor),
        descricao,
        status: "CONFIRMADO",
        investidor_id: tipoTransacao === "APORTE_FINANCEIRO" ? investidorId : null,
        nome_investidor: tipoTransacao === "APORTE_FINANCEIRO" && investidor ? investidor.nome : null,
      };

      // Add crypto-specific fields
      if (tipoMoeda === "CRYPTO") {
        transactionData.coin = coin;
        transactionData.qtd_coin = parseFloat(qtdCoin);
        transactionData.valor_usd = parseFloat(valor);
        if (cotacao) {
          transactionData.cotacao = parseFloat(cotacao);
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

      toast({
        title: "Sucesso",
        description: "Transação registrada com sucesso",
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
      // DEPOSITO: Always from Parceiro (bank account) → Bookmaker
      return (
        <>
          <div className="space-y-2">
            <Label>Parceiro</Label>
            <ParceiroSelect
              value={origemParceiroId}
              onValueChange={(value) => {
                setOrigemParceiroId(value);
                setOrigemContaId("");
              }}
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
                Este parceiro não possui contas bancárias com saldo disponível em {moeda}.
              </AlertDescription>
            </Alert>
          )}
        </>
      );
    }

    if (tipoTransacao === "SAQUE") {
      // Check if destino is complete
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
            <Label>Bookmaker</Label>
            <BookmakerSelect
              value={origemBookmakerId}
              onValueChange={setOrigemBookmakerId}
              disabled={!isDestinoCompleta}
              parceiroId={destinoParceiroId}
              somenteComSaldo={true}
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
            {origemParceiroId && walletsCrypto.filter((w) => {
              if (w.parceiro_id !== origemParceiroId || !w.moeda?.includes(coin)) return false;
              const saldo = saldosParceirosWallets.find(
                s => s.wallet_id === w.id && s.coin === coin
              );
              return saldo && saldo.saldo_usd > 0;
            }).length === 0 && (
              <Alert variant="destructive" className="border-warning/50 bg-warning/10">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-warning">
                  Este parceiro não possui wallets com saldo em {coin}.{' '}
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
            )}
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
    }

    if (tipoTransacao === "DEPOSITO") {
      // Check if origem is complete
      const isOrigemCompleta = origemParceiroId && origemContaId;
      
      return (
        <>
          {!isOrigemCompleta && (
            <Alert className="border-blue-500/50 bg-blue-500/10">
              <AlertTriangle className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-blue-500">
                Selecione primeiro o parceiro e a conta bancária de origem
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label>Bookmaker</Label>
            <BookmakerSelect
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
    if (valorNumerico === 0) return false;

    // Check APORTE_FINANCEIRO flow
    if (tipoTransacao === "APORTE_FINANCEIRO" && fluxoAporte === "LIQUIDACAO") {
      const saldoAtual = getSaldoAtual("CAIXA_OPERACIONAL");
      return saldoAtual < valorNumerico;
    }

    // Check SAQUE
    if (tipoTransacao === "SAQUE" && origemBookmakerId) {
      const saldoAtual = getSaldoAtual("BOOKMAKER", origemBookmakerId);
      return saldoAtual < valorNumerico;
    }

    // Check DEPOSITO
    if (tipoTransacao === "DEPOSITO" && origemContaId) {
      const saldoAtual = getSaldoAtual("PARCEIRO_CONTA", origemContaId);
      return saldoAtual < valorNumerico;
    }

    // Check TRANSFERENCIA from CAIXA_OPERACIONAL
    if (tipoTransacao === "TRANSFERENCIA" && origemTipo === "CAIXA_OPERACIONAL") {
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
      const saldoAtual = getSaldoAtual("PARCEIRO_WALLET", origemWalletId);
      return saldoAtual < valorNumerico;
    }

    return false;
  };

  const saldoInsuficiente = checkSaldoInsuficiente();

  const formatCurrency = (value: number) => {
    const currencyCode = tipoMoeda === "CRYPTO" ? "USD" : (moeda || "BRL");
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currencyCode,
    }).format(value);
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
    
    // Outras transações: mantém comportamento atual (moedas disponíveis na origem)
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
                <SelectItem value="APORTE_FINANCEIRO">APORTE & LIQUIDAÇÃO</SelectItem>
                <SelectItem value="TRANSFERENCIA">TRANSFERÊNCIA</SelectItem>
                <SelectItem value="DEPOSITO">DEPÓSITO</SelectItem>
                <SelectItem value="SAQUE">SAQUE</SelectItem>
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
                  <SelectTrigger>
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
                    <SelectTrigger>
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
                            {destinoContaId && (
                              <div className="mt-3 space-y-1">
                                {parseFloat(String(valor)) > 0 ? (
                                  <>
                                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                                      <span className="line-through opacity-70">
                                        {formatCurrency(getSaldoAtual("PARCEIRO_CONTA", destinoContaId))}
                                      </span>
                                    </div>
                                    <div className="text-sm font-semibold text-foreground">
                                      +{formatCurrency(parseFloat(String(valor)))}
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-sm font-semibold text-foreground">
                                    {formatCurrency(getSaldoAtual("PARCEIRO_CONTA", destinoContaId))}
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
                                {parseFloat(String(valor)) > 0 ? (
                                  <>
                                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                      <TrendingDown className="h-4 w-4 text-destructive" />
                                      <span className="line-through opacity-70">
                                        {formatCurrency(getSaldoAtual("BOOKMAKER", origemBookmakerId))}
                                      </span>
                                    </div>
                                    <div className="text-sm font-semibold text-foreground">
                                      -{formatCurrency(parseFloat(String(valor)))}
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-sm font-semibold text-foreground">
                                    {formatCurrency(getSaldoAtual("BOOKMAKER", origemBookmakerId))}
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
                              <div className="mt-3 space-y-1">
                                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                  <TrendingDown className="h-4 w-4 text-destructive" />
                                  {tipoMoeda === "CRYPTO" ? (
                                    <span className="line-through opacity-70">
                                      {formatCryptoBalance(
                                        getSaldoCoin("CAIXA_OPERACIONAL"),
                                        getSaldoAtual("CAIXA_OPERACIONAL"),
                                        coin
                                      )}
                                    </span>
                                  ) : (
                                    <span className="line-through opacity-70">
                                      {formatCurrency(getSaldoAtual("CAIXA_OPERACIONAL"))}
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm font-semibold text-foreground">
                                  {tipoMoeda === "CRYPTO" ? (
                                    formatCryptoBalance(
                                      getSaldoCoin("CAIXA_OPERACIONAL") - parseFloat(String(qtdCoin || 0)),
                                      getSaldoAtual("CAIXA_OPERACIONAL") - parseFloat(String(valor)),
                                      coin
                                    )
                                  ) : (
                                    formatCurrency(getSaldoAtual("CAIXA_OPERACIONAL") - parseFloat(String(valor)))
                                  )}
                                </div>
                              </div>
                            )}
                            {(origemTipo === "CAIXA_OPERACIONAL" || 
                              (tipoTransacao === "APORTE_FINANCEIRO" && fluxoAporte === "LIQUIDACAO") ||
                              (tipoTransacao === "TRANSFERENCIA" && origemTipo === "CAIXA_OPERACIONAL")) && parseFloat(String(valor)) === 0 && (
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
                            {tipoTransacao === "DEPOSITO" && origemContaId && parseFloat(String(valor)) > 0 && (
                              <div className="mt-3 space-y-1">
                                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                  <TrendingDown className="h-4 w-4 text-destructive" />
                                  <span className="line-through opacity-70">
                                    {formatCurrency(getSaldoAtual("PARCEIRO_CONTA", origemContaId))}
                                  </span>
                                </div>
                                <div className="text-sm font-semibold text-foreground">
                                  {formatCurrency(getSaldoAtual("PARCEIRO_CONTA", origemContaId) - parseFloat(String(valor)))}
                                </div>
                              </div>
                            )}
                            {/* Transferência Parceiro → Parceiro - Mostrar saldo SEMPRE */}
                            {tipoTransacao === "TRANSFERENCIA" && fluxoTransferencia === "PARCEIRO_PARCEIRO" && 
                             (origemTipo === "PARCEIRO_CONTA" || origemTipo === "PARCEIRO_WALLET") && 
                             (origemContaId || origemWalletId) && (
                              <div className="mt-3 space-y-1">
                                {parseFloat(String(valor)) > 0 ? (
                                  <>
                                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                      <TrendingDown className="h-4 w-4 text-destructive" />
                                      {tipoMoeda === "CRYPTO" && origemTipo === "PARCEIRO_WALLET" ? (
                                        <span className="line-through opacity-70">
                                          {formatCryptoBalance(
                                            getSaldoCoin(origemTipo, origemWalletId),
                                            getSaldoAtual(origemTipo, origemWalletId),
                                            coin
                                          )}
                                        </span>
                                      ) : (
                                        <span className="line-through opacity-70">
                                          {formatCurrency(getSaldoAtual(origemTipo, origemContaId || origemWalletId))}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-sm font-semibold text-foreground">
                                      {tipoMoeda === "CRYPTO" && origemTipo === "PARCEIRO_WALLET" ? (
                                        formatCryptoBalance(
                                          getSaldoCoin(origemTipo, origemWalletId) - parseFloat(String(qtdCoin || 0)),
                                          getSaldoAtual(origemTipo, origemWalletId) - parseFloat(String(valor)),
                                          coin
                                        )
                                      ) : (
                                        formatCurrency(getSaldoAtual(origemTipo, origemContaId || origemWalletId) - parseFloat(String(valor)))
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-xs text-muted-foreground">
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
                              <div className="mt-3 space-y-1">
                                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                                  {tipoMoeda === "CRYPTO" ? (
                                    <span className="line-through opacity-70">
                                      {formatCryptoBalance(
                                        getSaldoCoin("CAIXA_OPERACIONAL"),
                                        getSaldoAtual("CAIXA_OPERACIONAL"),
                                        coin
                                      )}
                                    </span>
                                  ) : (
                                    <span className="line-through opacity-70">
                                      {formatCurrency(getSaldoAtual("CAIXA_OPERACIONAL"))}
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm font-semibold text-foreground">
                                  {tipoMoeda === "CRYPTO" ? (
                                    formatCryptoBalance(
                                      getSaldoCoin("CAIXA_OPERACIONAL") + parseFloat(String(qtdCoin || 0)),
                                      getSaldoAtual("CAIXA_OPERACIONAL") + parseFloat(String(valor)),
                                      coin
                                    )
                                  ) : (
                                    formatCurrency(getSaldoAtual("CAIXA_OPERACIONAL") + parseFloat(String(valor)))
                                  )}
                                </div>
                              </div>
                            )}
                            {(destinoTipo === "CAIXA_OPERACIONAL" || 
                              (tipoTransacao === "APORTE_FINANCEIRO" && fluxoAporte === "APORTE")) && parseFloat(String(valor)) === 0 && (
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
                            {tipoTransacao === "DEPOSITO" && destinoBookmakerId && parseFloat(String(valor)) > 0 && (
                              <div className="mt-3 space-y-1">
                                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                                  <span className="line-through opacity-70">
                                    {formatCurrency(getSaldoAtual("BOOKMAKER", destinoBookmakerId))}
                                  </span>
                                </div>
                                <div className="text-sm font-semibold text-foreground">
                                  {formatCurrency(getSaldoAtual("BOOKMAKER", destinoBookmakerId) + parseFloat(String(valor)))}
                                </div>
                              </div>
                            )}
                            {tipoTransacao === "SAQUE" && destinoContaId && parseFloat(String(valor)) > 0 && (
                              <div className="mt-3 space-y-1">
                                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                                  <span className="line-through opacity-70">
                                    {formatCurrency(getSaldoAtual("PARCEIRO_CONTA", destinoContaId))}
                                  </span>
                                </div>
                                <div className="text-sm font-semibold text-foreground">
                                  {formatCurrency(getSaldoAtual("PARCEIRO_CONTA", destinoContaId) + parseFloat(String(valor)))}
                                </div>
                              </div>
                            )}
                            {/* Transferência Caixa → Parceiro DESTINO - Mostrar saldo SEMPRE */}
                            {tipoTransacao === "TRANSFERENCIA" && fluxoTransferencia === "CAIXA_PARCEIRO" && 
                             (destinoTipo === "PARCEIRO_CONTA" || destinoTipo === "PARCEIRO_WALLET") && 
                             (destinoContaId || destinoWalletId) && (
                              <div className="mt-3 space-y-1">
                                {parseFloat(String(valor)) > 0 ? (
                                  <>
                                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                                      {tipoMoeda === "CRYPTO" && destinoTipo === "PARCEIRO_WALLET" ? (
                                        <span className="line-through opacity-70">
                                          {formatCryptoBalance(
                                            getSaldoCoin(destinoTipo, destinoWalletId),
                                            getSaldoAtual(destinoTipo, destinoWalletId),
                                            coin
                                          )}
                                        </span>
                                      ) : (
                                        <span className="line-through opacity-70">
                                          {formatCurrency(getSaldoAtual(destinoTipo, destinoContaId || destinoWalletId))}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-sm font-semibold text-foreground">
                                      {tipoMoeda === "CRYPTO" && destinoTipo === "PARCEIRO_WALLET" ? (
                                        formatCryptoBalance(
                                          getSaldoCoin(destinoTipo, destinoWalletId) + parseFloat(String(qtdCoin || 0)),
                                          getSaldoAtual(destinoTipo, destinoWalletId) + parseFloat(String(valor)),
                                          coin
                                        )
                                      ) : (
                                        formatCurrency(getSaldoAtual(destinoTipo, destinoContaId || destinoWalletId) + parseFloat(String(valor)))
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-xs text-muted-foreground">
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
                                  <>
                                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                                      {tipoMoeda === "CRYPTO" && destinoTipo === "PARCEIRO_WALLET" ? (
                                        <span className="line-through opacity-70">
                                          {formatCryptoBalance(
                                            getSaldoCoin(destinoTipo, destinoWalletId),
                                            getSaldoAtual(destinoTipo, destinoWalletId),
                                            coin
                                          )}
                                        </span>
                                      ) : (
                                        <span className="line-through opacity-70">
                                          {formatCurrency(getSaldoAtual(destinoTipo, destinoContaId || destinoWalletId))}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-sm font-semibold text-foreground">
                                      {tipoMoeda === "CRYPTO" && destinoTipo === "PARCEIRO_WALLET" ? (
                                        formatCryptoBalance(
                                          getSaldoCoin(destinoTipo, destinoWalletId) + parseFloat(String(qtdCoin || 0)),
                                          getSaldoAtual(destinoTipo, destinoWalletId) + parseFloat(String(valor)),
                                          coin
                                        )
                                      ) : (
                                        formatCurrency(getSaldoAtual(destinoTipo, destinoContaId || destinoWalletId) + parseFloat(String(valor)))
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-xs text-muted-foreground">
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
                
                // Buscar dados do parceiro
                const { data: parceiroData } = await supabase
                  .from("parceiros")
                  .select("*")
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
                
                // Buscar dados do parceiro
                const { data: parceiroData } = await supabase
                  .from("parceiros")
                  .select("*")
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