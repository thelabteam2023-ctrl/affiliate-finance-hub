import { useState, useEffect, useMemo } from "react";
import { getTodayCivilDate } from "@/utils/dateUtils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { dispatchCaixaDataChanged } from "@/hooks/useInvalidateCaixaData";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useExchangeRates } from "@/contexts/ExchangeRatesContext";
import { FIAT_CURRENCIES, CRYPTO_CURRENCIES, getCurrencySymbol } from "@/types/currency";
import { getFirstLastName } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Scale, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { WalletSearchSelect, type WalletCoinBalance } from "./WalletSearchSelect";
import { ContaBancariaSearchSelect, type ContaBancariaOption } from "./ContaBancariaSearchSelect";
import { BookmakerSearchSelect } from "./BookmakerSearchSelect";

interface ReconciliacaoDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type TipoEntidade = "CAIXA_OPERACIONAL" | "BOOKMAKER" | "CONTA_BANCARIA" | "WALLET";
type SubTipoCaixa = "FIAT" | "CRYPTO" | "";

interface Bookmaker {
  id: string;
  nome: string;
  saldo_atual: number;
  moeda: string;
  parceiro_id: string | null;
  parceiro_nome?: string;
  reconciled_at?: string | null;
}

interface ContaBancaria {
  id: string;
  banco: string;
  titular: string;
  parceiro_id: string;
  parceiro_nome: string;
  moeda: string;
  saldo: number | null;
  reconciled_at?: string | null;
}

interface WalletCrypto {
  id: string;
  label?: string | null;
  exchange: string;
  endereco: string;
  parceiro_id: string;
  parceiro_nome?: string;
  moeda: string[];
  reconciled_at?: string | null;
}

export function ReconciliacaoDialog({
  open,
  onClose,
  onSuccess,
}: ReconciliacaoDialogProps) {
  const { toast } = useToast();
  const { isOwnerOrAdmin, isSystemOwner } = usePermissions();
  const { workspaceId } = useWorkspace();
  const { getRate, lastUpdate } = useExchangeRates();

  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);

  const [tipoEntidade, setTipoEntidade] = useState<TipoEntidade>("BOOKMAKER");
  const [subTipoCaixa, setSubTipoCaixa] = useState<SubTipoCaixa>("");
  const [entidadeId, setEntidadeId] = useState<string>("");
  const [contaId, setContaId] = useState<string>("");
  const [walletId, setWalletId] = useState<string>("");
  const [moeda, setMoeda] = useState<string>("BRL");
  const [saldoReal, setSaldoReal] = useState<string>("");
  const [saldoRealDisplay, setSaldoRealDisplay] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("Reconciliação Desenvolvimento");

  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [wallets, setWallets] = useState<WalletCrypto[]>([]);
  const [saldosContas, setSaldosContas] = useState<Record<string, number>>({});
  const [saldosWallets, setSaldosWallets] = useState<Record<string, Record<string, number>>>({});
  const [saldosWalletsList, setSaldosWalletsList] = useState<WalletCoinBalance[]>([]);
  const [caixaParceiroId, setCaixaParceiroId] = useState<string | null>(null);

  const canAccess = isOwnerOrAdmin || isSystemOwner;

  // Contas/Wallets filtradas para o Caixa Operacional
  const contasCaixa = useMemo(() => {
    if (!caixaParceiroId) return [];
    return contas.filter(c => c.parceiro_id === caixaParceiroId);
  }, [contas, caixaParceiroId]);

  const walletsCaixa = useMemo(() => {
    if (!caixaParceiroId) return [];
    return wallets.filter(w => w.parceiro_id === caixaParceiroId);
  }, [wallets, caixaParceiroId]);

  // ID efetivo da entidade selecionada
  const effectiveId = useMemo(() => {
    if (tipoEntidade === "CAIXA_OPERACIONAL") {
      if (subTipoCaixa === "FIAT") return contaId;
      if (subTipoCaixa === "CRYPTO") return walletId;
      return "";
    }
    if (tipoEntidade === "BOOKMAKER") return entidadeId;
    if (tipoEntidade === "CONTA_BANCARIA") return entidadeId;
    if (tipoEntidade === "WALLET") return entidadeId;
    return "";
  }, [tipoEntidade, subTipoCaixa, entidadeId, contaId, walletId]);

  // Saldo atual do sistema
  const saldoSistema = useMemo(() => {
    if (tipoEntidade === "BOOKMAKER" && entidadeId) {
      const bk = bookmakers.find(b => b.id === entidadeId);
      return bk?.saldo_atual ?? 0;
    }
    if (tipoEntidade === "CONTA_BANCARIA" && entidadeId) {
      return saldosContas[entidadeId] ?? 0;
    }
    if (tipoEntidade === "WALLET" && entidadeId && moeda) {
      return saldosWallets[entidadeId]?.[moeda] ?? 0;
    }
    if (tipoEntidade === "CAIXA_OPERACIONAL") {
      if (subTipoCaixa === "FIAT" && contaId) {
        return saldosContas[contaId] ?? 0;
      }
      if (subTipoCaixa === "CRYPTO" && walletId && moeda) {
        return saldosWallets[walletId]?.[moeda] ?? 0;
      }
    }
    return 0;
  }, [tipoEntidade, entidadeId, moeda, subTipoCaixa, contaId, walletId, bookmakers, saldosContas, saldosWallets]);

  // Diferença calculada
  const diferenca = useMemo(() => {
    const real = parseFloat(saldoReal) || 0;
    return real - saldoSistema;
  }, [saldoReal, saldoSistema]);

  // Moedas disponíveis
  const moedasDisponiveis = useMemo(() => {
    if (tipoEntidade === "BOOKMAKER" && entidadeId) {
      const bk = bookmakers.find(b => b.id === entidadeId);
      if (bk) {
        const info = [...FIAT_CURRENCIES, ...CRYPTO_CURRENCIES].find(c => c.value === bk.moeda);
        return [{ value: bk.moeda, label: info ? `${bk.moeda} - ${info.label}` : bk.moeda, symbol: getCurrencySymbol(bk.moeda) }];
      }
    }
    if (tipoEntidade === "CONTA_BANCARIA" && entidadeId) {
      const conta = contas.find(c => c.id === entidadeId);
      if (conta) {
        const info = FIAT_CURRENCIES.find(c => c.value === conta.moeda);
        return [{ value: conta.moeda, label: info ? `${conta.moeda} - ${info.label}` : conta.moeda, symbol: getCurrencySymbol(conta.moeda) }];
      }
    }
    if (tipoEntidade === "WALLET" && entidadeId) {
      const wallet = wallets.find(w => w.id === entidadeId);
      if (wallet) {
        return wallet.moeda.map(m => {
          const info = CRYPTO_CURRENCIES.find(c => c.value === m);
          return { value: m, label: info ? `${m} - ${info.label}` : m, symbol: getCurrencySymbol(m) };
        });
      }
    }
    if (tipoEntidade === "CAIXA_OPERACIONAL") {
      if (subTipoCaixa === "FIAT" && contaId) {
        const conta = contas.find(c => c.id === contaId);
        if (conta) {
          const info = FIAT_CURRENCIES.find(c => c.value === conta.moeda);
          return [{ value: conta.moeda, label: info ? `${conta.moeda} - ${info.label}` : conta.moeda, symbol: getCurrencySymbol(conta.moeda) }];
        }
      }
      if (subTipoCaixa === "CRYPTO" && walletId) {
        const wallet = wallets.find(w => w.id === walletId);
        if (wallet && wallet.moeda.length > 0) {
          return wallet.moeda.map(m => {
            const info = CRYPTO_CURRENCIES.find(c => c.value === m);
            return { value: m, label: info ? `${m} - ${info.label}` : m, symbol: getCurrencySymbol(m) };
          });
        }
      }
      return FIAT_CURRENCIES.map(c => ({ value: c.value, label: `${c.value} - ${c.label}`, symbol: c.symbol }));
    }
    return [{ value: "BRL", label: "BRL - Real Brasileiro", symbol: "R$" }];
  }, [tipoEntidade, entidadeId, subTipoCaixa, contaId, walletId, bookmakers, contas, wallets]);

  useEffect(() => {
    if (moedasDisponiveis.length === 1 && moeda !== moedasDisponiveis[0].value) {
      setMoeda(moedasDisponiveis[0].value);
    } else if (!moedasDisponiveis.find(m => m.value === moeda)) {
      setMoeda(moedasDisponiveis[0].value);
    }
  }, [moedasDisponiveis, moeda]);

  useEffect(() => {
    if (open) fetchData();
  }, [open]);

  useEffect(() => {
    setEntidadeId("");
    setContaId("");
    setWalletId("");
    setSubTipoCaixa("");
    setSaldoReal("");
    setSaldoRealDisplay("");
    setMoeda("BRL");
  }, [tipoEntidade]);

  useEffect(() => {
    setSaldoReal("");
    setSaldoRealDisplay("");
  }, [entidadeId, contaId, walletId]);

  const fetchData = async () => {
    setFetchingData(true);
    try {
      const [bookmakersRes, contasRes, walletsRes, saldosContasRes, saldosWalletsRes, caixaParceiroRes] = await Promise.all([
        supabase.from("bookmakers").select(`id, nome, saldo_atual, moeda, parceiro_id, reconciled_at, parceiros!inner(nome, status)`).in("status", ["ativo", "limitada"]).eq("parceiros.status", "ativo").order("nome"),
        supabase.from("contas_bancarias").select(`id, banco, titular, parceiro_id, moeda, reconciled_at, parceiros!inner(nome, status)`).eq("parceiros.status", "ativo").order("banco"),
        supabase.from("wallets_crypto").select(`id, label, exchange, endereco, parceiro_id, moeda, reconciled_at, parceiros!inner(nome, status)`).eq("parceiros.status", "ativo").order("exchange"),
        supabase.from("v_saldo_parceiro_contas").select("conta_id, saldo"),
        supabase.from("v_saldo_parceiro_wallets").select("wallet_id, coin, saldo_coin, saldo_usd"),
        supabase.from("parceiros").select("id").eq("is_caixa_operacional", true).maybeSingle(),
      ]);

      const saldosMap: Record<string, number> = {};
      (saldosContasRes.data || []).forEach((s: any) => {
        saldosMap[s.conta_id] = s.saldo || 0;
      });
      setSaldosContas(saldosMap);

      setCaixaParceiroId(caixaParceiroRes.data?.id ?? null);

      setBookmakers((bookmakersRes.data || []).map((bk: any) => ({
        id: bk.id, nome: bk.nome, saldo_atual: bk.saldo_atual || 0,
        moeda: bk.moeda || "BRL", parceiro_id: bk.parceiro_id,
        parceiro_nome: bk.parceiros?.nome, reconciled_at: bk.reconciled_at,
      })));

      setContas((contasRes.data || []).map((c: any) => ({
        id: c.id, banco: c.banco, titular: c.titular,
        parceiro_id: c.parceiro_id, parceiro_nome: c.parceiros?.nome || "",
        moeda: c.moeda || "BRL", saldo: saldosMap[c.id] ?? null,
        reconciled_at: c.reconciled_at,
      })));

      setWallets((walletsRes.data || []).map((w: any) => ({
        id: w.id, label: w.label, exchange: w.exchange, endereco: w.endereco,
        parceiro_id: w.parceiro_id, parceiro_nome: w.parceiros?.nome,
        moeda: Array.isArray(w.moeda) ? w.moeda : ["USDT"],
        reconciled_at: w.reconciled_at,
      })));

      const walletsMap: Record<string, Record<string, number>> = {};
      const walletsList: WalletCoinBalance[] = [];
      (saldosWalletsRes.data || []).forEach((s: any) => {
        if (!walletsMap[s.wallet_id]) walletsMap[s.wallet_id] = {};
        walletsMap[s.wallet_id][s.coin] = s.saldo_coin || 0;
        walletsList.push({
          wallet_id: s.wallet_id, coin: s.coin,
          saldo_coin: s.saldo_coin || 0, saldo_usd: s.saldo_usd || 0,
        });
      });
      setSaldosWallets(walletsMap);
      setSaldosWalletsList(walletsList);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setFetchingData(false);
    }
  };

  const isCryptoMoedaSelected = CRYPTO_CURRENCIES.some(c => c.value === moeda);

  const formatCurrencyInput = (value: string, isCrypto: boolean): string => {
    if (isCrypto) {
      // For crypto, allow free-form decimal input with up to 8 decimals
      const cleaned = value.replace(/[^\d,]/g, "");
      return cleaned;
    }
    const numericValue = value.replace(/[^\d]/g, "");
    if (!numericValue) return "";
    const numberValue = parseInt(numericValue, 10) / 100;
    return numberValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleSaldoRealChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isCryptoMoedaSelected) {
      // Crypto: allow direct decimal input (e.g., "0,00004700")
      const raw = e.target.value.replace(/[^\d,]/g, "");
      setSaldoRealDisplay(raw);
      const numericValue = raw.replace(",", ".");
      setSaldoReal(numericValue);
    } else {
      const formatted = formatCurrencyInput(e.target.value, false);
      setSaldoRealDisplay(formatted);
      const numericValue = formatted.replace(/\./g, "").replace(",", ".");
      setSaldoReal(numericValue);
    }
  };

  const getEntidadeNome = (): string => {
    if (tipoEntidade === "CAIXA_OPERACIONAL") {
      if (subTipoCaixa === "FIAT" && contaId) {
        const conta = contas.find(c => c.id === contaId);
        return conta ? `Caixa – ${conta.banco} (${getFirstLastName(conta.titular)})` : "Caixa Operacional";
      }
      if (subTipoCaixa === "CRYPTO" && walletId) {
        const wallet = wallets.find(w => w.id === walletId);
        return wallet ? `Caixa – ${wallet.label || wallet.exchange} (${wallet.endereco.slice(0, 8)}...)` : "Caixa Operacional";
      }
      return `Caixa Operacional (${moeda})`;
    }
    if (tipoEntidade === "BOOKMAKER") {
      const bk = bookmakers.find(b => b.id === entidadeId);
      return bk ? `${bk.nome}${bk.parceiro_nome ? ` (${bk.parceiro_nome})` : ""}` : "";
    }
    if (tipoEntidade === "CONTA_BANCARIA") {
      const conta = contas.find(c => c.id === entidadeId);
      return conta ? `${conta.banco} - ${conta.titular}` : "";
    }
    if (tipoEntidade === "WALLET") {
      const wallet = wallets.find(w => w.id === entidadeId);
      return wallet ? `${wallet.label || wallet.exchange} - ${wallet.endereco.slice(0, 10)}...` : "";
    }
    return "";
  };

  const entidadeSelecionada = useMemo(() => {
    if (tipoEntidade === "BOOKMAKER") return !!entidadeId;
    if (tipoEntidade === "CONTA_BANCARIA") return !!entidadeId;
    if (tipoEntidade === "WALLET") return !!entidadeId;
    if (tipoEntidade === "CAIXA_OPERACIONAL") {
      if (subTipoCaixa === "FIAT") return !!contaId;
      if (subTipoCaixa === "CRYPTO") return !!walletId;
      return false;
    }
    return false;
  }, [tipoEntidade, entidadeId, subTipoCaixa, contaId, walletId]);

  const minDiferenca = isCryptoMoedaSelected ? 0.00000001 : 0.01;

  const canSubmit = (): boolean => {
    if (!entidadeSelecionada) return false;
    if (!saldoReal) return false;
    if (Math.abs(diferenca) < minDiferenca) return false;
    if (!motivo.trim()) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!canSubmit()) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      if (!workspaceId) throw new Error("Workspace não encontrado");

      const isCryptoMoeda = CRYPTO_CURRENCIES.some(c => c.value === moeda);
      const precision = isCryptoMoeda ? 8 : 2;
      const factor = Math.pow(10, precision);
      const valorAjuste = Math.round(Math.abs(diferenca) * factor) / factor;
      const direcao = diferenca > 0 ? "ENTRADA" : "SAIDA";
      const isCrypto = CRYPTO_CURRENCIES.some(c => c.value === moeda);
      const cotacaoSnapshot = moeda !== "BRL" ? getRate(moeda) : null;
      const cotacaoSnapshotAt = moeda !== "BRL" ? new Date().toISOString() : null;
      const valorBrlRef = moeda !== "BRL" ? valorAjuste * (getRate(moeda) || 1) : null;

      const isCaixaWallet = tipoEntidade === "CAIXA_OPERACIONAL" && subTipoCaixa === "CRYPTO";
      const isDirectWallet = tipoEntidade === "WALLET";

      const transactionData: Record<string, any> = {
        user_id: user.id,
        workspace_id: workspaceId,
        tipo_transacao: "AJUSTE_RECONCILIACAO",
        tipo_moeda: isCrypto ? "CRYPTO" : "FIAT",
        moeda,
        valor: valorAjuste,
        valor_usd: moeda === "USD" || moeda === "USDT" || moeda === "USDC" ? valorAjuste : (cotacaoSnapshot ? valorAjuste / cotacaoSnapshot : null),
        descricao: `[RECONCILIAÇÃO ${direcao}] ${motivo} | Saldo sistema: ${saldoSistema.toFixed(2)} → Saldo real: ${(parseFloat(saldoReal) || 0).toFixed(2)} | Diferença: ${diferenca.toFixed(2)}`,
        status: "CONFIRMADO",
        transit_status: "CONFIRMED",
        data_transacao: getTodayCivilDate(),
        impacta_caixa_operacional: tipoEntidade === "CAIXA_OPERACIONAL",
        ajuste_motivo: motivo.trim(),
        ajuste_direcao: direcao,
        cotacao: cotacaoSnapshot,
        cotacao_snapshot_at: cotacaoSnapshotAt,
        valor_usd_referencia: valorBrlRef,
        ...((isDirectWallet || isCaixaWallet) && isCrypto ? { coin: moeda, qtd_coin: valorAjuste } : {}),
        auditoria_metadata: {
          tipo_reconciliacao: "RECONCILIACAO_DESENVOLVIMENTO",
          saldo_sistema_anterior: saldoSistema,
          saldo_real_informado: parseFloat(saldoReal) || 0,
          diferenca,
          entidade_tipo: tipoEntidade,
          entidade_id: effectiveId,
          entidade_nome: getEntidadeNome(),
          moeda,
          registrado_em: new Date().toISOString(),
          user_agent: navigator.userAgent,
        },
      };

      // Definir origem/destino baseado na direção
      if (direcao === "ENTRADA") {
        switch (tipoEntidade) {
          case "CAIXA_OPERACIONAL":
            transactionData.origem_tipo = "AJUSTE";
            transactionData.destino_tipo = "CAIXA_OPERACIONAL";
            if (subTipoCaixa === "FIAT" && contaId) {
              transactionData.destino_conta_bancaria_id = contaId;
              transactionData.moeda_destino = moeda;
              transactionData.valor_destino = valorAjuste;
            }
            if (subTipoCaixa === "CRYPTO" && walletId) {
              transactionData.destino_wallet_id = walletId;
              transactionData.moeda_destino = moeda;
              transactionData.valor_destino = valorAjuste;
            }
            break;
          case "BOOKMAKER":
            transactionData.destino_tipo = "BOOKMAKER";
            transactionData.destino_bookmaker_id = entidadeId;
            transactionData.valor_destino = valorAjuste;
            transactionData.moeda_destino = moeda;
            break;
          case "CONTA_BANCARIA":
            transactionData.destino_tipo = "PARCEIRO_CONTA";
            transactionData.destino_conta_bancaria_id = entidadeId;
            transactionData.valor_destino = valorAjuste;
            transactionData.moeda_destino = moeda;
            break;
          case "WALLET":
            transactionData.destino_tipo = "PARCEIRO_WALLET";
            transactionData.destino_wallet_id = entidadeId;
            transactionData.valor_destino = valorAjuste;
            transactionData.moeda_destino = moeda;
            break;
        }
      } else {
        switch (tipoEntidade) {
          case "CAIXA_OPERACIONAL":
            transactionData.origem_tipo = "CAIXA_OPERACIONAL";
            transactionData.destino_tipo = "AJUSTE";
            if (subTipoCaixa === "FIAT" && contaId) {
              transactionData.origem_conta_bancaria_id = contaId;
              transactionData.moeda_origem = moeda;
              transactionData.valor_origem = valorAjuste;
            }
            if (subTipoCaixa === "CRYPTO" && walletId) {
              transactionData.origem_wallet_id = walletId;
              transactionData.moeda_origem = moeda;
              transactionData.valor_origem = valorAjuste;
            }
            break;
          case "BOOKMAKER":
            transactionData.origem_tipo = "BOOKMAKER";
            transactionData.origem_bookmaker_id = entidadeId;
            transactionData.valor_origem = valorAjuste;
            transactionData.moeda_origem = moeda;
            break;
          case "CONTA_BANCARIA":
            transactionData.origem_tipo = "PARCEIRO_CONTA";
            transactionData.origem_conta_bancaria_id = entidadeId;
            transactionData.valor_origem = valorAjuste;
            transactionData.moeda_origem = moeda;
            break;
          case "WALLET":
            transactionData.origem_tipo = "PARCEIRO_WALLET";
            transactionData.origem_wallet_id = entidadeId;
            transactionData.valor_origem = valorAjuste;
            transactionData.moeda_origem = moeda;
            break;
        }
      }

      const { error } = await supabase.from("cash_ledger").insert([transactionData] as any);
      if (error) throw error;

      // Update reconciled_at on the target entity
      const now = new Date().toISOString();
      try {
        if (tipoEntidade === "BOOKMAKER" && entidadeId) {
          await supabase.from("bookmakers").update({ reconciled_at: now } as any).eq("id", entidadeId);
        } else if (tipoEntidade === "CONTA_BANCARIA" && entidadeId) {
          await supabase.from("contas_bancarias").update({ reconciled_at: now } as any).eq("id", entidadeId);
        } else if (tipoEntidade === "WALLET" && entidadeId) {
          await supabase.from("wallets_crypto").update({ reconciled_at: now } as any).eq("id", entidadeId);
        } else if (tipoEntidade === "CAIXA_OPERACIONAL") {
          if (subTipoCaixa === "FIAT" && contaId) {
            await supabase.from("contas_bancarias").update({ reconciled_at: now } as any).eq("id", contaId);
          } else if (subTipoCaixa === "CRYPTO" && walletId) {
            await supabase.from("wallets_crypto").update({ reconciled_at: now } as any).eq("id", walletId);
          }
        }
      } catch (reconciledErr) {
        console.warn("[Reconciliação] Falha ao atualizar reconciled_at:", reconciledErr);
      }

      toast({
        title: "Reconciliação registrada",
        description: `Ajuste de ${getCurrencySymbol(moeda)} ${valorAjuste.toFixed(isCryptoMoedaSelected ? 8 : 2)} (${direcao === "ENTRADA" ? "+" : "-"}) em ${getEntidadeNome()} registrado com sucesso.`,
      });

      // Mantém o modal aberto para novos lançamentos, limpando apenas os campos de valor
      setSaldoReal("");
      setSaldoRealDisplay("");
      
      // Recarrega os dados para atualizar o "Saldo no Sistema" e permitir nova reconciliação
      await fetchData();
      
      dispatchCaixaDataChanged();
      onSuccess();
    } catch (error: any) {
      console.error("Erro ao registrar reconciliação:", error);
      toast({
        title: "Erro ao registrar reconciliação",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTipoEntidade("BOOKMAKER");
    setSubTipoCaixa("");
    setEntidadeId("");
    setContaId("");
    setWalletId("");
    setMoeda("BRL");
    setSaldoReal("");
    setSaldoRealDisplay("");
    setMotivo("Reconciliação Desenvolvimento");
    onClose();
  };

  if (!canAccess) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader><DialogTitle>Acesso Negado</DialogTitle></DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Apenas administradores podem realizar reconciliações.</AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>
    );
  }

  const currencySymbol = getCurrencySymbol(moeda);
  const entidadeReconciledAt = (() => {
    if (tipoEntidade === "BOOKMAKER") return bookmakers.find(b => b.id === entidadeId)?.reconciled_at;
    if (tipoEntidade === "CONTA_BANCARIA") return contas.find(c => c.id === entidadeId)?.reconciled_at;
    if (tipoEntidade === "WALLET") return wallets.find(w => w.id === entidadeId)?.reconciled_at;
    if (tipoEntidade === "CAIXA_OPERACIONAL") {
      if (subTipoCaixa === "FIAT") return contas.find(c => c.id === contaId)?.reconciled_at;
      if (subTipoCaixa === "CRYPTO") return wallets.find(w => w.id === walletId)?.reconciled_at;
    }
    return null;
  })();

  // Show moeda selector for wallets with multiple currencies
  const showMoedaSelector = (() => {
    if (tipoEntidade === "WALLET" && entidadeId) return moedasDisponiveis.length > 1;
    if (tipoEntidade === "CAIXA_OPERACIONAL" && subTipoCaixa === "CRYPTO" && walletId) return moedasDisponiveis.length > 1;
    return false;
  })();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            Reconciliação de Saldo
          </DialogTitle>
          <DialogDescription>
            Informe o saldo real observado. O sistema calculará a diferença e criará um lançamento auditável.
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-primary/30 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-xs text-muted-foreground">
            Este lançamento é do tipo <strong>AJUSTE_RECONCILIACAO</strong>, distinto de ajustes operacionais comuns.
            Será rastreável em auditorias e relatórios separadamente.
          </AlertDescription>
        </Alert>

        {fetchingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tipo de entidade */}
            <div className="space-y-2">
              <Label>Tipo de Entidade</Label>
              <Select value={tipoEntidade} onValueChange={(v) => setTipoEntidade(v as TipoEntidade)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAIXA_OPERACIONAL">Caixa Operacional</SelectItem>
                  <SelectItem value="BOOKMAKER">Bookmaker</SelectItem>
                  <SelectItem value="CONTA_BANCARIA">Conta Bancária</SelectItem>
                  <SelectItem value="WALLET">Wallet Crypto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sub-seleção Caixa Operacional */}
            {tipoEntidade === "CAIXA_OPERACIONAL" && (
              <div className="space-y-2">
                <Label>Vincular a</Label>
                <Select value={subTipoCaixa || ""} onValueChange={(v) => {
                  setSubTipoCaixa(v as SubTipoCaixa);
                  setContaId("");
                  setWalletId("");
                  setSaldoReal("");
                  setSaldoRealDisplay("");
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo de ativo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIAT">Conta Bancária</SelectItem>
                    <SelectItem value="CRYPTO">Wallet Crypto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Sub-seleção Caixa: Conta Bancária */}
            {tipoEntidade === "CAIXA_OPERACIONAL" && subTipoCaixa === "FIAT" && (
              <div className="space-y-2">
                <Label>Conta Bancária</Label>
                <ContaBancariaSearchSelect
                  contas={contasCaixa}
                  value={contaId}
                  onValueChange={(v) => { setContaId(v); setSaldoReal(""); setSaldoRealDisplay(""); }}
                  placeholder="Selecione a conta"
                />
              </div>
            )}

            {/* Sub-seleção Caixa: Wallet Crypto */}
            {tipoEntidade === "CAIXA_OPERACIONAL" && subTipoCaixa === "CRYPTO" && (
              <div className="space-y-2">
                <Label>Wallet Crypto</Label>
                <WalletSearchSelect
                  wallets={walletsCaixa}
                  value={walletId}
                  onValueChange={(v) => { setWalletId(v); setSaldoReal(""); setSaldoRealDisplay(""); }}
                  placeholder="Selecione a wallet"
                  saldos={saldosWalletsList}
                  usdToBrlRate={getRate("USD")}
                />
              </div>
            )}

            {/* Seleção: Bookmaker */}
            {tipoEntidade === "BOOKMAKER" && (
              <div className="space-y-2">
                <Label>Bookmaker</Label>
                <BookmakerSearchSelect
                  bookmakers={bookmakers}
                  value={entidadeId}
                  onValueChange={setEntidadeId}
                  placeholder="Selecione o bookmaker"
                />
              </div>
            )}

            {/* Seleção: Conta Bancária */}
            {tipoEntidade === "CONTA_BANCARIA" && (
              <div className="space-y-2">
                <Label>Conta Bancária</Label>
                <ContaBancariaSearchSelect
                  contas={contas}
                  value={entidadeId}
                  onValueChange={setEntidadeId}
                  placeholder="Selecione a conta"
                />
              </div>
            )}

            {/* Seleção: Wallet */}
            {tipoEntidade === "WALLET" && (
              <div className="space-y-2">
                <Label>Wallet</Label>
                <WalletSearchSelect
                  wallets={wallets}
                  value={entidadeId}
                  onValueChange={setEntidadeId}
                  placeholder="Selecione a wallet"
                  saldos={saldosWalletsList}
                  usdToBrlRate={getRate("USD")}
                />
              </div>
            )}

            {/* Moeda (para wallets com múltiplas) */}
            {showMoedaSelector && (
              <div className="space-y-2">
                <Label>Moeda</Label>
                <Select value={moeda} onValueChange={setMoeda}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {moedasDisponiveis.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Saldo atual do sistema */}
            {entidadeSelecionada && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Saldo no Sistema</span>
                  <span className="font-mono font-semibold">
                    {currencySymbol} {saldoSistema.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: isCryptoMoedaSelected ? 8 : 2 })}
                  </span>
                </div>
                {entidadeReconciledAt && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">
                      Última reconciliação: {new Date(entidadeReconciledAt).toLocaleDateString("pt-BR")}
                    </Badge>
                  </div>
                )}
              </div>
            )}

            {/* Saldo Real Observado */}
            <div className="space-y-2">
              <Label>Saldo Real Observado *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {currencySymbol}
                </span>
                <Input
                  value={saldoRealDisplay}
                  onChange={handleSaldoRealChange}
                  placeholder="0,00"
                  className="pl-10"
                />
              </div>
            </div>

            {/* Diferença calculada */}
            {saldoReal && entidadeSelecionada && (
              <div className={`rounded-lg border p-3 ${
                Math.abs(diferenca) < minDiferenca
                  ? "border-muted bg-muted/20"
                  : diferenca > 0
                    ? "border-primary/30 bg-primary/5"
                    : "border-destructive/30 bg-destructive/5"
              }`}>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Diferença Calculada</span>
                  <div className="flex items-center gap-2">
                    {Math.abs(diferenca) < minDiferenca ? (
                      <Minus className="h-4 w-4 text-muted-foreground" />
                    ) : diferenca > 0 ? (
                      <TrendingUp className="h-4 w-4 text-primary" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-destructive" />
                    )}
                    <span className={`font-mono font-bold ${
                      Math.abs(diferenca) < minDiferenca ? "text-muted-foreground" : diferenca > 0 ? "text-primary" : "text-destructive"
                    }`}>
                      {diferenca > 0 ? "+" : ""}{currencySymbol} {diferenca.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: isCryptoMoedaSelected ? 8 : 2 })}
                    </span>
                  </div>
                </div>
                {Math.abs(diferenca) >= minDiferenca && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Será criado um lançamento de <strong>{diferenca > 0 ? "ENTRADA" : "SAÍDA"}</strong> de{" "}
                    <strong>{currencySymbol} {Math.abs(diferenca).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: isCryptoMoedaSelected ? 8 : 2 })}</strong>
                  </p>
                )}
                {Math.abs(diferenca) < minDiferenca && (
                  <p className="text-xs text-muted-foreground mt-1">Saldo já está correto. Nenhum ajuste necessário.</p>
                )}
              </div>
            )}

            {/* Motivo */}
            <div className="space-y-2">
              <Label>Justificativa *</Label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Descreva o motivo da reconciliação..."
                rows={2}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={loading || !canSubmit()}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar Reconciliação
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
