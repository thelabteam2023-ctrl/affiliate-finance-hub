import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookmakerFinanceiro, ParceiroFinanceiroConsolidado } from "./useParceiroFinanceiroConsolidado";

// ============== CONSTANTS ==============

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes for Resumo only
const MAX_CACHED_PARTNERS = 30;

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

// ============== HOOK ==============

export function useParceiroFinanceiroCache() {
  // Cache ONLY for Resumo
  const resumoCacheRef = useRef(new LRUCache<string, ResumoCacheEntry>(MAX_CACHED_PARTNERS));
  
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
        id, nome, saldo_atual, status, projeto_id, bookmaker_catalogo_id,
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
    let depositosMap = new Map<string, number>();
    let saquesMap = new Map<string, number>();

    if (bookmakerIds.length > 0) {
      const { data: depositos } = await supabase
        .from("cash_ledger")
        .select("destino_bookmaker_id, valor")
        .in("destino_bookmaker_id", bookmakerIds)
        .eq("tipo_transacao", "DEPOSITO")
        .eq("status", "CONFIRMADO");

      depositos?.forEach((d) => {
        if (d.destino_bookmaker_id) {
          const current = depositosMap.get(d.destino_bookmaker_id) || 0;
          depositosMap.set(d.destino_bookmaker_id, current + Number(d.valor));
        }
      });

      const { data: saques } = await supabase
        .from("cash_ledger")
        .select("origem_bookmaker_id, valor")
        .in("origem_bookmaker_id", bookmakerIds)
        .eq("tipo_transacao", "SAQUE")
        .eq("status", "CONFIRMADO");

      saques?.forEach((s) => {
        if (s.origem_bookmaker_id) {
          const current = saquesMap.get(s.origem_bookmaker_id) || 0;
          saquesMap.set(s.origem_bookmaker_id, current + Number(s.valor));
        }
      });
    }

    let apostasMap = new Map<string, number>();
    if (bookmakerIds.length > 0) {
      const { data: apostasSimples } = await supabase
        .from("apostas")
        .select("bookmaker_id")
        .in("bookmaker_id", bookmakerIds);

      apostasSimples?.forEach((a) => {
        const current = apostasMap.get(a.bookmaker_id) || 0;
        apostasMap.set(a.bookmaker_id, current + 1);
      });

      const { data: apostasMultiplas } = await supabase
        .from("apostas_multiplas")
        .select("bookmaker_id")
        .in("bookmaker_id", bookmakerIds);

      apostasMultiplas?.forEach((a) => {
        const current = apostasMap.get(a.bookmaker_id) || 0;
        apostasMap.set(a.bookmaker_id, current + 1);
      });
    }

    const bookmakersFinanceiro: BookmakerFinanceiro[] = (bookmakers || []).map(bm => {
      const depositado = depositosMap.get(bm.id) || 0;
      const sacado = saquesMap.get(bm.id) || 0;
      const saldoAtual = Number(bm.saldo_atual) || 0;
      const lucro = sacado + saldoAtual - depositado;

      return {
        bookmaker_id: bm.id,
        bookmaker_nome: bm.nome,
        logo_url: bm.bookmaker_catalogo_id ? logosMap.get(bm.bookmaker_catalogo_id) || null : null,
        total_depositado: depositado,
        total_sacado: sacado,
        lucro_prejuizo: lucro,
        qtd_apostas: apostasMap.get(bm.id) || 0,
        saldo_atual: saldoAtual,
        status: bm.status,
        projetos: bm.projeto_id ? [bm.projeto_id] : [],
        has_credentials: !!(bm.login_username && bm.login_username.trim()),
        login_username: bm.login_username || null,
        login_password_encrypted: bm.login_password_encrypted || null,
      };
    });

    const totalDepositado = bookmakersFinanceiro.reduce((sum, b) => sum + b.total_depositado, 0);
    const totalSacado = bookmakersFinanceiro.reduce((sum, b) => sum + b.total_sacado, 0);
    const lucroTotal = bookmakersFinanceiro.reduce((sum, b) => sum + b.lucro_prejuizo, 0);
    const qtdApostasTotal = bookmakersFinanceiro.reduce((sum, b) => sum + b.qtd_apostas, 0);

    return {
      parceiro_id: parceiroId,
      parceiro_nome: parceiroData.nome,
      total_depositado: totalDepositado,
      total_sacado: totalSacado,
      lucro_prejuizo: lucroTotal,
      qtd_apostas_total: qtdApostasTotal,
      bookmakers: bookmakersFinanceiro.sort((a, b) => b.lucro_prejuizo - a.lucro_prejuizo),
    };
  };

  // ============== LOAD RESUMO (with cache) ==============

  const loadResumo = useCallback(async (parceiroId: string, forceRefresh = false) => {
    // Check cache first
    if (!forceRefresh) {
      const cached = resumoCacheRef.current.get(parceiroId);
      if (isCacheValid(cached)) {
        setResumoData(cached!.data);
        setResumoLoading(false);
        setResumoError(null);
        return;
      }
    }

    setResumoLoading(true);
    setResumoError(null);

    try {
      const data = await fetchResumoData(parceiroId);
      
      // Update cache
      resumoCacheRef.current.set(parceiroId, {
        data,
        timestamp: Date.now(),
      });
      
      // Use ref to check current partner (avoids stale closure)
      if (parceiroId === currentParceiroIdRef.current) {
        setResumoData(data);
      }
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
    resumoCacheRef.current.delete(parceiroId);
    
    // If current partner, reload (use ref for current value)
    if (currentParceiroIdRef.current === parceiroId) {
      loadResumo(parceiroId, true);
    }
  }, [loadResumo]);

  const invalidateAllCache = useCallback(() => {
    resumoCacheRef.current.clear();
    
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
