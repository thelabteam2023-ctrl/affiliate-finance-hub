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
import { Wallet, Building2, Bitcoin, Loader2 } from "lucide-react";
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
  saldoDisponivel: number;
}

interface OrigemPagamentoSelectProps {
  value: OrigemPagamentoData;
  onChange: (data: OrigemPagamentoData) => void;
  valorPagamento: number;
  disabled?: boolean;
}

export function OrigemPagamentoSelect({
  value,
  onChange,
  valorPagamento,
  disabled = false,
}: OrigemPagamentoSelectProps) {
  const { cotacaoUSD } = useCotacoes();
  const [loading, setLoading] = useState(true);
  
  // Data
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [walletsCrypto, setWalletsCrypto] = useState<WalletCrypto[]>([]);
  const [saldosCaixaFiat, setSaldosCaixaFiat] = useState<SaldoCaixaFiat[]>([]);
  const [saldosCaixaCrypto, setSaldosCaixaCrypto] = useState<SaldoCaixaCrypto[]>([]);
  const [saldosParceirosContas, setSaldosParceirosContas] = useState<SaldoParceiroContas[]>([]);
  const [saldosParceirosWallets, setSaldosParceirosWallets] = useState<SaldoParceiroWallets[]>([]);

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
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate Caixa Operacional balance
  const getSaldoCaixaOperacional = () => {
    if (value.tipoMoeda === "FIAT") {
      const saldo = saldosCaixaFiat.find(s => s.moeda === value.moeda);
      return saldo?.saldo || 0;
    } else {
      const totalUSD = saldosCaixaCrypto.reduce((acc, s) => acc + (s.saldo_usd || 0), 0);
      return totalUSD * cotacaoUSD;
    }
  };

  // Get partner account balance
  const getSaldoContaParceiro = (contaId: string) => {
    const saldo = saldosParceirosContas.find(s => s.conta_id === contaId);
    return saldo?.saldo || 0;
  };

  // Get partner wallet balance in USD
  const getSaldoWalletParceiro = (walletId: string) => {
    const saldo = saldosParceirosWallets.find(s => s.wallet_id === walletId);
    return saldo?.saldo_usd || 0;
  };

  // Filter accounts by selected partner
  const contasParceiroSelecionado = contasBancarias.filter(
    c => c.parceiro_id === value.origemParceiroId
  );

  // Filter wallets by selected partner
  const walletsParceiroSelecionado = walletsCrypto.filter(
    w => w.parceiro_id === value.origemParceiroId
  );

  // Handle origem type change
  const handleOrigemTipoChange = (tipo: "CAIXA_OPERACIONAL" | "PARCEIRO_CONTA" | "PARCEIRO_WALLET") => {
    const newData: OrigemPagamentoData = {
      ...value,
      origemTipo: tipo,
      origemParceiroId: undefined,
      origemContaBancariaId: undefined,
      origemWalletId: undefined,
      saldoDisponivel: tipo === "CAIXA_OPERACIONAL" ? getSaldoCaixaOperacional() : 0,
    };

    if (tipo === "PARCEIRO_WALLET") {
      newData.tipoMoeda = "CRYPTO";
      newData.moeda = "USD";
    } else if (tipo === "PARCEIRO_CONTA") {
      newData.tipoMoeda = "FIAT";
      newData.moeda = "BRL";
    }

    onChange(newData);
  };

  // Handle partner selection
  const handleParceiroChange = (parceiroId: string) => {
    onChange({
      ...value,
      origemParceiroId: parceiroId,
      origemContaBancariaId: undefined,
      origemWalletId: undefined,
      saldoDisponivel: 0,
    });
  };

  // Handle account selection
  const handleContaChange = (contaId: string) => {
    const saldo = getSaldoContaParceiro(contaId);
    onChange({
      ...value,
      origemContaBancariaId: contaId,
      saldoDisponivel: saldo,
    });
  };

  // Handle wallet selection
  const handleWalletChange = (walletId: string) => {
    const saldoUSD = getSaldoWalletParceiro(walletId);
    const wallet = walletsCrypto.find(w => w.id === walletId);
    onChange({
      ...value,
      origemWalletId: walletId,
      saldoDisponivel: saldoUSD * cotacaoUSD,
      coin: wallet?.moeda?.[0] || "USDT",
      cotacao: cotacaoUSD,
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

  const saldoCaixaOperacional = getSaldoCaixaOperacional();
  const saldoInsuficiente = value.saldoDisponivel < valorPagamento && value.origemTipo !== "CAIXA_OPERACIONAL" 
    ? value.saldoDisponivel < valorPagamento 
    : saldoCaixaOperacional < valorPagamento && value.origemTipo === "CAIXA_OPERACIONAL";

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
              <span className={`text-sm font-medium ${saldoCaixaOperacional < valorPagamento && value.origemTipo === "CAIXA_OPERACIONAL" ? "text-destructive" : "text-muted-foreground"}`}>
                {formatCurrency(saldoCaixaOperacional)}
              </span>
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

      {/* Partner selection for PARCEIRO_CONTA or PARCEIRO_WALLET */}
      {(value.origemTipo === "PARCEIRO_CONTA" || value.origemTipo === "PARCEIRO_WALLET") && (
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
                {parceiros.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Account selection for FIAT */}
          {value.origemTipo === "PARCEIRO_CONTA" && value.origemParceiroId && (
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
                            <span className={`text-xs ${saldo < valorPagamento ? "text-destructive" : "text-muted-foreground"}`}>
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

          {/* Wallet selection for CRYPTO */}
          {value.origemTipo === "PARCEIRO_WALLET" && value.origemParceiroId && (
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
                      const saldoUSD = getSaldoWalletParceiro(w.id);
                      return (
                        <SelectItem key={w.id} value={w.id}>
                          <div className="flex items-center justify-between w-full gap-4">
                            <span>{w.exchange} - {w.endereco.slice(0, 8)}...</span>
                            <span className={`text-xs ${saldoUSD * cotacaoUSD < valorPagamento ? "text-destructive" : "text-muted-foreground"}`}>
                              {formatUSD(saldoUSD)}
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

          {/* Show selected balance */}
          {value.saldoDisponivel > 0 && (
            <div className={`p-2 rounded-md text-sm ${
              saldoInsuficiente 
                ? "bg-destructive/10 text-destructive" 
                : "bg-muted/50 text-muted-foreground"
            }`}>
              Saldo disponível: {value.tipoMoeda === "CRYPTO" 
                ? formatUSD(value.saldoDisponivel / cotacaoUSD) + ` (≈ ${formatCurrency(value.saldoDisponivel)})`
                : formatCurrency(value.saldoDisponivel)
              }
              {saldoInsuficiente && " - Saldo insuficiente!"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
