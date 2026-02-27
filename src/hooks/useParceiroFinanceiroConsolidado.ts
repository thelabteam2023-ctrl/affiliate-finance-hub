import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SupportedCurrency, FIAT_CURRENCIES } from "@/types/currency";

// Tipo para saldos dinâmicos por moeda
export type SaldosPorMoeda = Record<string, number>;

// Lista de moedas FIAT suportadas
const SUPPORTED_FIAT: string[] = FIAT_CURRENCIES.map(c => c.value);

// Helper para criar objeto de saldos vazio
function createEmptySaldos(): SaldosPorMoeda {
  const saldos: SaldosPorMoeda = {};
  SUPPORTED_FIAT.forEach(moeda => {
    saldos[moeda] = 0;
  });
  return saldos;
}

// Helper para identificar moeda de execução a partir de transação
function getMoedaExecucao(tx: { tipo_moeda?: string; moeda?: string; coin?: string }): string {
  // CRYPTO sempre conta como USD (stablecoins ou valor_usd)
  if (tx.tipo_moeda === "CRYPTO") {
    return "USD";
  }
  // FIAT usa o campo moeda
  return tx.moeda || "BRL";
}

export interface BookmakerFinanceiro {
  bookmaker_id: string;
  bookmaker_nome: string;
  instance_identifier: string | null;
  logo_url: string | null;
  moeda: string; // Moeda nativa da casa
  // Valores na moeda NATIVA da casa
  total_depositado: number;
  total_sacado: number;
  lucro_prejuizo: number; // AGORA: resultado operacional puro (apostas + giros + cashback)
  saldo_atual: number;
  // Breakdown multi-moeda (para casos onde há transações em moedas diferentes)
  depositado_por_moeda: SaldosPorMoeda;
  sacado_por_moeda: SaldosPorMoeda;
  saldo_por_moeda: SaldosPorMoeda;
  resultado_por_moeda: SaldosPorMoeda;
  // Resultado operacional detalhado
  resultado_apostas: number;
  resultado_giros: number;
  resultado_cashback: number;
  resultado_bonus: number;
  qtd_apostas: number;
  status: string;
  projetos: string[];
  has_credentials: boolean;
  login_username: string | null;
  login_password_encrypted: string | null;
}

export interface ParceiroFinanceiroConsolidado {
  parceiro_id: string;
  parceiro_nome: string;
  // Totais por moeda nativa (chave = código da moeda)
  depositado_por_moeda: SaldosPorMoeda;
  sacado_por_moeda: SaldosPorMoeda;
  saldo_por_moeda: SaldosPorMoeda;
  resultado_por_moeda: SaldosPorMoeda; // AGORA: resultado operacional puro
  // Moedas que o parceiro utiliza (para UI)
  moedas_utilizadas: string[];
  qtd_apostas_total: number;
  bookmakers: BookmakerFinanceiro[];
}

export function useParceiroFinanceiroConsolidado(parceiroId: string | null) {
  const [data, setData] = useState<ParceiroFinanceiroConsolidado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!parceiroId) {
      setData(null);
      return;
    }

    fetchData();
  }, [parceiroId]);

  const fetchData = async () => {
    if (!parceiroId) return;
    
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Buscar dados do parceiro
      const { data: parceiroData, error: parceiroError } = await supabase
        .from("parceiros")
        .select("id, nome")
        .eq("id", parceiroId)
        .single();

      if (parceiroError) throw parceiroError;

      // Buscar todos os bookmakers do parceiro
      const { data: bookmakers, error: bookmakersError } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          moeda,
          saldo_atual,
          status,
          projeto_id,
          bookmaker_catalogo_id,
          login_username,
          login_password_encrypted,
          instance_identifier
        `)
        .eq("parceiro_id", parceiroId);

      if (bookmakersError) throw bookmakersError;

      // Buscar logos do catálogo
      const catalogoIds = [...new Set((bookmakers || [])
        .map(b => b.bookmaker_catalogo_id)
        .filter(Boolean))];
      
      let logosMap = new Map<string, string>();
      if (catalogoIds.length > 0) {
        const { data: catalogoData } = await supabase
          .from("bookmakers_catalogo")
          .select("id, logo_url")
          .in("id", catalogoIds as string[]);

        catalogoData?.forEach((c) => {
          if (c.logo_url) logosMap.set(c.id, c.logo_url);
        });
      }

      const bookmakerIds = (bookmakers || []).map(b => b.id);

      // Maps para acumular valores por bookmaker e moeda
      let depositosMap = new Map<string, SaldosPorMoeda>();
      let saquesMap = new Map<string, SaldosPorMoeda>();

      if (bookmakerIds.length > 0) {
        // Depósitos (destino é o bookmaker)
        const { data: depositos } = await supabase
          .from("cash_ledger")
          .select("destino_bookmaker_id, valor, valor_destino, valor_usd, tipo_moeda, moeda, moeda_destino")
          .in("destino_bookmaker_id", bookmakerIds)
          .eq("tipo_transacao", "DEPOSITO")
          .eq("status", "CONFIRMADO");

        depositos?.forEach((d) => {
          if (d.destino_bookmaker_id) {
            const current = depositosMap.get(d.destino_bookmaker_id) || createEmptySaldos();
            
            // Usar moeda_destino se disponível (3-layer model), senão derivar
            let moedaExec: string;
            if (d.moeda_destino) {
              moedaExec = d.moeda_destino;
            } else {
              moedaExec = getMoedaExecucao(d);
            }
            
            // Usar valor_destino se disponível (3-layer), senão valor
            const valorExec = Number(d.valor_destino) || Number(d.valor) || 0;
            
            current[moedaExec] = (current[moedaExec] || 0) + valorExec;
            depositosMap.set(d.destino_bookmaker_id, current);
          }
        });

        // Saques (origem é o bookmaker)
        const { data: saques } = await supabase
          .from("cash_ledger")
          .select("origem_bookmaker_id, valor, valor_origem, valor_usd, tipo_moeda, moeda, moeda_origem")
          .in("origem_bookmaker_id", bookmakerIds)
          .eq("tipo_transacao", "SAQUE")
          .eq("status", "CONFIRMADO");

        saques?.forEach((s) => {
          if (s.origem_bookmaker_id) {
            const current = saquesMap.get(s.origem_bookmaker_id) || createEmptySaldos();
            
            // Usar moeda_origem se disponível (3-layer model), senão derivar
            let moedaExec: string;
            if (s.moeda_origem) {
              moedaExec = s.moeda_origem;
            } else {
              moedaExec = getMoedaExecucao(s);
            }
            
            // Usar valor_origem se disponível (3-layer), senão valor
            const valorExec = Number(s.valor_origem) || Number(s.valor) || 0;
            
            current[moedaExec] = (current[moedaExec] || 0) + valorExec;
            saquesMap.set(s.origem_bookmaker_id, current);
          }
        });
      }

      // =====================================================================
      // NOVO: Buscar RESULTADO OPERACIONAL PURO da view
      // Inclui APENAS: apostas + giros + cashback
      // Exclui: depósitos, saques, FX, ajustes
      // =====================================================================
      let resultadoOperacionalMap = new Map<string, {
        resultado_apostas: number;
        resultado_giros: number;
        resultado_cashback: number;
        resultado_bonus: number;
        resultado_total: number;
        qtd_apostas: number;
      }>();

      if (bookmakerIds.length > 0) {
        const { data: resultadosOperacionais } = await supabase
          .from("v_bookmaker_resultado_operacional")
          .select("bookmaker_id, resultado_apostas, resultado_giros, resultado_cashback, resultado_bonus, resultado_operacional_total, qtd_apostas")
          .in("bookmaker_id", bookmakerIds);

        resultadosOperacionais?.forEach((r) => {
          resultadoOperacionalMap.set(r.bookmaker_id, {
            resultado_apostas: Number(r.resultado_apostas) || 0,
            resultado_giros: Number(r.resultado_giros) || 0,
            resultado_cashback: Number(r.resultado_cashback) || 0,
            resultado_bonus: Number(r.resultado_bonus) || 0,
            resultado_total: Number(r.resultado_operacional_total) || 0,
            qtd_apostas: Number(r.qtd_apostas) || 0,
          });
        });
      }

      // Montar dados por bookmaker
      const bookmakersFinanceiro: BookmakerFinanceiro[] = (bookmakers || []).map(bm => {
        const depositadoPorMoeda = depositosMap.get(bm.id) || createEmptySaldos();
        const sacadoPorMoeda = saquesMap.get(bm.id) || createEmptySaldos();
        const moedaNativa = bm.moeda || "BRL";
        const saldoAtual = Number(bm.saldo_atual) || 0;
        
        // Saldo por moeda (saldo_atual é sempre na moeda nativa)
        const saldoPorMoeda = createEmptySaldos();
        saldoPorMoeda[moedaNativa] = saldoAtual;
        
        // =====================================================================
        // NOVO: Usar resultado operacional PURO (apostas + giros + cashback)
        // NÃO usa mais a fórmula "Sacado + Saldo - Depositado" que incluía FX
        // =====================================================================
        const resultadoOp = resultadoOperacionalMap.get(bm.id) || {
          resultado_apostas: 0,
          resultado_giros: 0,
          resultado_cashback: 0,
          resultado_bonus: 0,
          resultado_total: 0,
          qtd_apostas: 0,
        };
        
        // Resultado por moeda baseado no resultado operacional
        const resultadoPorMoeda = createEmptySaldos();
        resultadoPorMoeda[moedaNativa] = resultadoOp.resultado_total;
        
        // Valores consolidados na moeda nativa para exibição principal
        const totalDepositado = depositadoPorMoeda[moedaNativa] || 0;
        const totalSacado = sacadoPorMoeda[moedaNativa] || 0;
        
        // lucro_prejuizo = resultado operacional (PURO)
        const lucroPrejuizo = resultadoOp.resultado_total;

        return {
          bookmaker_id: bm.id,
          bookmaker_nome: bm.nome,
          instance_identifier: bm.instance_identifier || null,
          moeda: moedaNativa,
          logo_url: bm.bookmaker_catalogo_id ? logosMap.get(bm.bookmaker_catalogo_id) || null : null,
          total_depositado: totalDepositado,
          total_sacado: totalSacado,
          lucro_prejuizo: lucroPrejuizo,
          saldo_atual: saldoAtual,
          depositado_por_moeda: depositadoPorMoeda,
          sacado_por_moeda: sacadoPorMoeda,
          saldo_por_moeda: saldoPorMoeda,
          resultado_por_moeda: resultadoPorMoeda,
          resultado_apostas: resultadoOp.resultado_apostas,
          resultado_giros: resultadoOp.resultado_giros,
          resultado_cashback: resultadoOp.resultado_cashback,
          resultado_bonus: resultadoOp.resultado_bonus,
          qtd_apostas: resultadoOp.qtd_apostas,
          status: bm.status,
          projetos: bm.projeto_id ? [bm.projeto_id] : [],
          has_credentials: !!(bm.login_username && bm.login_username.trim()),
          login_username: bm.login_username || null,
          login_password_encrypted: bm.login_password_encrypted || null,
        };
      });

      // Calcular totais consolidados por moeda
      const totalDepositadoPorMoeda = createEmptySaldos();
      const totalSacadoPorMoeda = createEmptySaldos();
      const totalSaldoPorMoeda = createEmptySaldos();
      const totalResultadoPorMoeda = createEmptySaldos();
      
      bookmakersFinanceiro.forEach(b => {
        SUPPORTED_FIAT.forEach(moeda => {
          totalDepositadoPorMoeda[moeda] += b.depositado_por_moeda[moeda] || 0;
          totalSacadoPorMoeda[moeda] += b.sacado_por_moeda[moeda] || 0;
          totalSaldoPorMoeda[moeda] += b.saldo_por_moeda[moeda] || 0;
          totalResultadoPorMoeda[moeda] += b.resultado_por_moeda[moeda] || 0;
        });
      });
      
      // Identificar moedas utilizadas (com valor não-zero)
      const moedasUtilizadas = SUPPORTED_FIAT.filter(moeda => 
        totalDepositadoPorMoeda[moeda] !== 0 ||
        totalSacadoPorMoeda[moeda] !== 0 ||
        totalSaldoPorMoeda[moeda] !== 0 ||
        totalResultadoPorMoeda[moeda] !== 0
      );
      
      const qtdApostasTotal = bookmakersFinanceiro.reduce((sum, b) => sum + b.qtd_apostas, 0);

      setData({
        parceiro_id: parceiroId,
        parceiro_nome: parceiroData.nome,
        depositado_por_moeda: totalDepositadoPorMoeda,
        sacado_por_moeda: totalSacadoPorMoeda,
        saldo_por_moeda: totalSaldoPorMoeda,
        resultado_por_moeda: totalResultadoPorMoeda,
        moedas_utilizadas: moedasUtilizadas,
        qtd_apostas_total: qtdApostasTotal,
        bookmakers: bookmakersFinanceiro.sort((a, b) => b.lucro_prejuizo - a.lucro_prejuizo),
      });
    } catch (err: any) {
      console.error("Erro ao carregar dados financeiros:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, error, refresh: fetchData };
}

// Helper para converter SaldosPorMoeda em CurrencyEntry[] para NativeCurrencyKpi
export function saldosToEntries(saldos: SaldosPorMoeda): Array<{ currency: string; value: number }> {
  return Object.entries(saldos)
    .filter(([_, value]) => value !== 0)
    .map(([currency, value]) => ({ currency, value }));
}
