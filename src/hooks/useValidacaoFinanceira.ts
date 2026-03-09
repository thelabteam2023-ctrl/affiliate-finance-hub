import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCotacoes } from "./useCotacoes";

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

export interface ValidacaoResult {
  valido: boolean;
  saldoDisponivel: number;
  mensagem?: string;
}

export interface OrigemValidacao {
  origemTipo: "CAIXA_OPERACIONAL" | "PARCEIRO_CONTA" | "PARCEIRO_WALLET";
  tipoMoeda: "FIAT" | "CRYPTO";
  moeda?: string;
  coin?: string;
  origemContaBancariaId?: string;
  origemWalletId?: string;
}

export function useValidacaoFinanceira() {
  const { cotacaoUSD } = useCotacoes();
  const [loading, setLoading] = useState(true);
  const [saldosCaixaFiat, setSaldosCaixaFiat] = useState<SaldoCaixaFiat[]>([]);
  const [saldosCaixaCrypto, setSaldosCaixaCrypto] = useState<SaldoCaixaCrypto[]>([]);
  const [saldosParceirosContas, setSaldosParceirosContas] = useState<SaldoParceiroContas[]>([]);
  const [saldosParceirosWallets, setSaldosParceirosWallets] = useState<SaldoParceiroWallets[]>([]);

  const fetchSaldos = useCallback(async () => {
    setLoading(true);
    try {
      // STEP 1: Identify Caixa Operacional partner
      const { data: caixaParceiro } = await supabase
        .from("parceiros")
        .select("id")
        .eq("is_caixa_operacional", true)
        .maybeSingle();
      const caixaParceiroId = caixaParceiro?.id || null;

      // UNIFIED SOURCE: Use v_saldo_parceiro_contas/wallets for ALL balances
      const [
        allContasRes,
        allWalletsRes,
      ] = await Promise.all([
        supabase.from("v_saldo_parceiro_contas").select("conta_id, parceiro_id, saldo, moeda"),
        supabase.from("v_saldo_parceiro_wallets").select("wallet_id, parceiro_id, coin, saldo_usd, saldo_coin"),
      ]);

      const allContas = allContasRes.data || [];
      const allWallets = allWalletsRes.data || [];

      // Caixa FIAT = contas do parceiro caixa operacional, agrupadas por moeda
      const caixaFiatMap: Record<string, number> = {};
      allContas.forEach((row: any) => {
        if (caixaParceiroId && row.parceiro_id === caixaParceiroId) {
          const m = row.moeda || "BRL";
          caixaFiatMap[m] = (caixaFiatMap[m] || 0) + (row.saldo || 0);
        }
      });
      setSaldosCaixaFiat(Object.entries(caixaFiatMap).map(([moeda, saldo]) => ({ moeda, saldo })));

      // Caixa CRYPTO = wallets do parceiro caixa operacional, agrupadas por coin
      const caixaCryptoMap: Record<string, { saldo_coin: number; saldo_usd: number }> = {};
      allWallets.forEach((row: any) => {
        if (caixaParceiroId && row.parceiro_id === caixaParceiroId) {
          const c = row.coin || "USDT";
          if (!caixaCryptoMap[c]) caixaCryptoMap[c] = { saldo_coin: 0, saldo_usd: 0 };
          caixaCryptoMap[c].saldo_coin += (row.saldo_coin || 0);
          caixaCryptoMap[c].saldo_usd += (row.saldo_usd || 0);
        }
      });
      setSaldosCaixaCrypto(Object.entries(caixaCryptoMap).map(([coin, vals]) => ({ coin, ...vals })));

      // Parceiros = EXCLUINDO caixa operacional
      setSaldosParceirosContas(allContas.filter((row: any) => !caixaParceiroId || row.parceiro_id !== caixaParceiroId));
      setSaldosParceirosWallets(allWallets.filter((row: any) => !caixaParceiroId || row.parceiro_id !== caixaParceiroId));
    } catch (error) {
      console.error("Erro ao carregar saldos para validação:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSaldos();
  }, [fetchSaldos]);

  // Obter saldo do Caixa Operacional FIAT (por moeda)
  const getSaldoCaixaFiat = useCallback((moeda: string = "BRL"): number => {
    const saldo = saldosCaixaFiat.find(s => s.moeda === moeda);
    return saldo?.saldo || 0;
  }, [saldosCaixaFiat]);

  // Obter saldo do Caixa Operacional CRYPTO (por moeda específica)
  const getSaldoCaixaCrypto = useCallback((coin?: string): { saldoCoin: number; saldoUSD: number; saldoBRL: number } => {
    if (coin) {
      const saldo = saldosCaixaCrypto.find(s => s.coin === coin);
      const saldoUSD = saldo?.saldo_usd || 0;
      const saldoCoin = saldo?.saldo_coin || 0;
      return {
        saldoCoin,
        saldoUSD,
        saldoBRL: saldoUSD * cotacaoUSD,
      };
    }
    // Total de todas as moedas
    const totalUSD = saldosCaixaCrypto.reduce((acc, s) => acc + (s.saldo_usd || 0), 0);
    const totalCoin = saldosCaixaCrypto.reduce((acc, s) => acc + (s.saldo_coin || 0), 0);
    return {
      saldoCoin: totalCoin,
      saldoUSD: totalUSD,
      saldoBRL: totalUSD * cotacaoUSD,
    };
  }, [saldosCaixaCrypto, cotacaoUSD]);

  // Obter todas as moedas crypto disponíveis no caixa
  const getMoedasCryptoDisponiveis = useCallback((): { coin: string; saldoCoin: number; saldoUSD: number }[] => {
    return saldosCaixaCrypto.map(s => ({
      coin: s.coin,
      saldoCoin: s.saldo_coin,
      saldoUSD: s.saldo_usd,
    }));
  }, [saldosCaixaCrypto]);

  // Obter saldo de conta de parceiro
  const getSaldoContaParceiro = useCallback((contaId: string): number => {
    const saldo = saldosParceirosContas.find(s => s.conta_id === contaId);
    return saldo?.saldo || 0;
  }, [saldosParceirosContas]);

  // Obter saldo de wallet de parceiro (por moeda)
  const getSaldoWalletParceiro = useCallback((walletId: string): { coin: string; saldoCoin: number; saldoUSD: number; saldoBRL: number } => {
    const saldo = saldosParceirosWallets.find(s => s.wallet_id === walletId);
    const saldoUSD = saldo?.saldo_usd || 0;
    return {
      coin: saldo?.coin || "USDT",
      saldoCoin: saldo?.saldo_coin || 0,
      saldoUSD,
      saldoBRL: saldoUSD * cotacaoUSD,
    };
  }, [saldosParceirosWallets, cotacaoUSD]);

  // 🔒 VALIDAÇÃO CENTRAL DE SALDO - REGRA GLOBAL DE DÉBITO
  const validarSaldo = useCallback((
    origem: OrigemValidacao,
    valorBRL: number // Valor sempre em BRL para comparação uniforme
  ): ValidacaoResult => {
    if (valorBRL <= 0) {
      return { valido: true, saldoDisponivel: 0 };
    }

    let saldoDisponivel = 0;

    switch (origem.origemTipo) {
      case "CAIXA_OPERACIONAL":
        if (origem.tipoMoeda === "FIAT") {
          saldoDisponivel = getSaldoCaixaFiat(origem.moeda || "BRL");
        } else {
          const cryptoSaldo = getSaldoCaixaCrypto(origem.coin);
          saldoDisponivel = cryptoSaldo.saldoBRL;
        }
        break;

      case "PARCEIRO_CONTA":
        if (origem.origemContaBancariaId) {
          saldoDisponivel = getSaldoContaParceiro(origem.origemContaBancariaId);
        }
        break;

      case "PARCEIRO_WALLET":
        if (origem.origemWalletId) {
          const walletSaldo = getSaldoWalletParceiro(origem.origemWalletId);
          saldoDisponivel = walletSaldo.saldoBRL;
        }
        break;
    }

    const valido = saldoDisponivel >= valorBRL;
    
    return {
      valido,
      saldoDisponivel,
      mensagem: valido 
        ? undefined 
        : `Saldo insuficiente. Disponível: R$ ${saldoDisponivel.toFixed(2)} | Necessário: R$ ${valorBRL.toFixed(2)}`,
    };
  }, [getSaldoCaixaFiat, getSaldoCaixaCrypto, getSaldoContaParceiro, getSaldoWalletParceiro]);

  return {
    loading,
    refetch: fetchSaldos,
    
    // Getters de saldo
    getSaldoCaixaFiat,
    getSaldoCaixaCrypto,
    getSaldoContaParceiro,
    getSaldoWalletParceiro,
    getMoedasCryptoDisponiveis,
    
    // Raw data
    saldosCaixaFiat,
    saldosCaixaCrypto,
    saldosParceirosContas,
    saldosParceirosWallets,
    
    // Validação central
    validarSaldo,
    
    // Cotações
    cotacaoUSD,
  };
}
