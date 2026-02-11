import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  BookmakerFinanceiro, 
  ParceiroFinanceiroConsolidado, 
  SaldosPorMoeda 
} from "./useParceiroFinanceiroConsolidado";
import { FIAT_CURRENCIES } from "@/types/currency";

// ============== CONSTANTS ==============

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes for Resumo only
const MAX_CACHED_PARTNERS = 30;

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
  if (tx.tipo_moeda === "CRYPTO") {
    return "USD";
  }
  return tx.moeda || "BRL";
}

// ============== TYPES ==============

export type TabKey = "resumo" | "movimentacoes" | "bookmakers";

interface ResumoCacheEntry {
  data: ParceiroFinanceiroConsolidado;
  timestamp: number;
}

// ============== LRU CACHE ==============

class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// ============== CACHE GLOBAL (singleton) ==============
// O cache é criado fora do hook para persistir entre navegações de página

const globalResumoCache = new LRUCache<string, ResumoCacheEntry>(MAX_CACHED_PARTNERS);

// ============== HOOK ==============

export function useParceiroFinanceiroCache() {
  
  // Current state
  const [currentParceiroId, setCurrentParceiroId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("resumo");
  
  // Ref to track current partner ID (avoids stale closure)
  const currentParceiroIdRef = useRef<string | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    currentParceiroIdRef.current = currentParceiroId;
  }, [currentParceiroId]);
  
  // Resumo state
  const [resumoData, setResumoData] = useState<ParceiroFinanceiroConsolidado | null>(null);
  const [resumoLoading, setResumoLoading] = useState(false);
  const [resumoError, setResumoError] = useState<string | null>(null);
  
  // Prevent skeleton flash after first successful load
  const loadedOnceRef = useRef(false);

  // ============== HELPERS ==============

  const isCacheValid = (entry: ResumoCacheEntry | undefined): boolean => {
    if (!entry) return false;
    return Date.now() - entry.timestamp < CACHE_TTL;
  };

  // ============== FETCH RESUMO ==============

  const fetchResumoData = async (parceiroId: string): Promise<ParceiroFinanceiroConsolidado> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado");

    const { data: parceiroData, error: parceiroError } = await supabase
      .from("parceiros")
      .select("id, nome")
      .eq("id", parceiroId)
      .single();

    if (parceiroError) throw parceiroError;

    const { data: bookmakers, error: bookmakersError } = await supabase
      .from("bookmakers")
      .select(`
        id, nome, moeda, saldo_atual, status, projeto_id, bookmaker_catalogo_id,
        login_username, login_password_encrypted
      `)
      .eq("parceiro_id", parceiroId);

    if (bookmakersError) throw bookmakersError;

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
    let depositosMap = new Map<string, SaldosPorMoeda>();
    let saquesMap = new Map<string, SaldosPorMoeda>();

    if (bookmakerIds.length > 0) {
      const { data: depositos } = await supabase
        .from("cash_ledger")
        .select("destino_bookmaker_id, valor, valor_destino, valor_usd, tipo_moeda, moeda, moeda_destino")
        .in("destino_bookmaker_id", bookmakerIds)
        .eq("tipo_transacao", "DEPOSITO")
        .eq("status", "CONFIRMADO");

      depositos?.forEach((d) => {
        if (d.destino_bookmaker_id) {
          const current = depositosMap.get(d.destino_bookmaker_id) || createEmptySaldos();
          
          let moedaExec: string;
          if (d.moeda_destino) {
            moedaExec = d.moeda_destino;
          } else {
            moedaExec = getMoedaExecucao(d);
          }
          
          const valorExec = Number(d.valor_destino) || Number(d.valor) || 0;
          current[moedaExec] = (current[moedaExec] || 0) + valorExec;
          depositosMap.set(d.destino_bookmaker_id, current);
        }
      });

      const { data: saques } = await supabase
        .from("cash_ledger")
        .select("origem_bookmaker_id, valor, valor_origem, valor_usd, tipo_moeda, moeda, moeda_origem")
        .in("origem_bookmaker_id", bookmakerIds)
        .eq("tipo_transacao", "SAQUE")
        .eq("status", "CONFIRMADO");

      saques?.forEach((s) => {
        if (s.origem_bookmaker_id) {
          const current = saquesMap.get(s.origem_bookmaker_id) || createEmptySaldos();
          
          let moedaExec: string;
          if (s.moeda_origem) {
            moedaExec = s.moeda_origem;
          } else {
            moedaExec = getMoedaExecucao(s);
          }
          
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
      resultado_total: number;
      qtd_apostas: number;
    }>();

    if (bookmakerIds.length > 0) {
      const { data: resultadosOperacionais } = await supabase
        .from("v_bookmaker_resultado_operacional")
        .select("bookmaker_id, resultado_apostas, resultado_giros, resultado_cashback, resultado_operacional_total, qtd_apostas")
        .in("bookmaker_id", bookmakerIds);

      resultadosOperacionais?.forEach((r) => {
        resultadoOperacionalMap.set(r.bookmaker_id, {
          resultado_apostas: Number(r.resultado_apostas) || 0,
          resultado_giros: Number(r.resultado_giros) || 0,
          resultado_cashback: Number(r.resultado_cashback) || 0,
          resultado_total: Number(r.resultado_operacional_total) || 0,
          qtd_apostas: Number(r.qtd_apostas) || 0,
        });
      });
    }

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

    return {
      parceiro_id: parceiroId,
      parceiro_nome: parceiroData.nome,
      depositado_por_moeda: totalDepositadoPorMoeda,
      sacado_por_moeda: totalSacadoPorMoeda,
      saldo_por_moeda: totalSaldoPorMoeda,
      resultado_por_moeda: totalResultadoPorMoeda,
      moedas_utilizadas: moedasUtilizadas,
      qtd_apostas_total: qtdApostasTotal,
      bookmakers: bookmakersFinanceiro.sort((a, b) => b.lucro_prejuizo - a.lucro_prejuizo),
    };
  };

  // ============== LOAD RESUMO (with cache) ==============

  const loadResumo = useCallback(async (parceiroId: string, forceRefresh = false) => {
    // Check global cache first
    if (!forceRefresh) {
      const cached = globalResumoCache.get(parceiroId);
      if (isCacheValid(cached)) {
        setResumoData(cached!.data);
        setResumoLoading(false);
        setResumoError(null);
        return;
      }
    }

    // Only show loading skeleton on first ever load
    if (!loadedOnceRef.current) {
      setResumoLoading(true);
    }
    setResumoError(null);

    try {
      const data = await fetchResumoData(parceiroId);
      
      // Update global cache
      globalResumoCache.set(parceiroId, {
        data,
        timestamp: Date.now(),
      });
      
      // Use ref to check current partner (avoids stale closure)
      if (parceiroId === currentParceiroIdRef.current) {
        setResumoData(data);
      }
      loadedOnceRef.current = true;
    } catch (error: any) {
      console.error("Erro ao carregar resumo:", error);
      setResumoError(error.message || "Erro ao carregar dados");
    } finally {
      setResumoLoading(false);
    }
  }, []); // No dependencies - uses ref instead

  // ============== PUBLIC API ==============

  const selectParceiro = useCallback((parceiroId: string | null) => {
    // Update ref immediately for consistency
    currentParceiroIdRef.current = parceiroId;
    setCurrentParceiroId(parceiroId);
    setActiveTab("resumo");
    
    if (!parceiroId) {
      setResumoData(null);
      setResumoLoading(false);
      setResumoError(null);
      return;
    }

    // Load resumo (will use cache if available)
    loadResumo(parceiroId);
  }, [loadResumo]);

  const changeTab = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    // Movimentações and Bookmakers load their own data - no action needed here
  }, []);

  const invalidateCache = useCallback((parceiroId: string) => {
    globalResumoCache.delete(parceiroId);
    
    // If current partner, reload (use ref for current value)
    if (currentParceiroIdRef.current === parceiroId) {
      loadResumo(parceiroId, true);
    }
  }, [loadResumo]);

  const invalidateAllCache = useCallback(() => {
    globalResumoCache.clear();
    
    const currentId = currentParceiroIdRef.current;
    if (currentId) {
      loadResumo(currentId, true);
    }
  }, [loadResumo]);

  const refreshCurrent = useCallback(() => {
    const currentId = currentParceiroIdRef.current;
    if (!currentId) return;
    loadResumo(currentId, true);
  }, [loadResumo]);

  return {
    // State
    currentParceiroId,
    activeTab,
    
    // Resumo data + states
    resumoData,
    resumoLoading,
    resumoError,
    
    // Actions
    selectParceiro,
    changeTab,
    invalidateCache,
    invalidateAllCache,
    refreshCurrent,
  };
}
