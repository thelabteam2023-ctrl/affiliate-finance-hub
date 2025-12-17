import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookmakerFinanceiro, ParceiroFinanceiroConsolidado } from "./useParceiroFinanceiroConsolidado";

// ============== CONSTANTS ==============

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHED_PARTNERS = 30; // LRU limit
const REVALIDATE_STALE = true; // Enable stale-while-revalidate

// ============== TYPES ==============

type TabKey = "resumo" | "movimentacoes" | "bookmakers";

interface Transacao {
  id: string;
  tipo_transacao: string;
  valor: number;
  moeda: string;
  data_transacao: string;
  status: string;
  descricao: string | null;
  origem_bookmaker_id: string | null;
  destino_bookmaker_id: string | null;
  origem_tipo: string | null;
  destino_tipo: string | null;
  origem_parceiro_id: string | null;
  destino_parceiro_id: string | null;
  origem_conta_bancaria_id: string | null;
  destino_conta_bancaria_id: string | null;
  origem_wallet_id: string | null;
  destino_wallet_id: string | null;
  nome_investidor: string | null;
}

interface MovimentacoesData {
  transacoes: Transacao[];
  bookmakerNames: Map<string, string>;
  parceiroNames: Map<string, string>;
  contasBancarias: Array<{ id: string; banco: string; titular: string; parceiro_id: string }>;
  walletsCrypto: Array<{ id: string; exchange: string; endereco: string; parceiro_id: string }>;
}

interface BookmakerVinculado {
  id: string;
  nome: string;
  saldo_atual: number;
  status: string;
  moeda: string;
  login_username: string;
  login_password_encrypted: string;
  bookmaker_catalogo_id: string | null;
  logo_url?: string;
}

interface BookmakerCatalogo {
  id: string;
  nome: string;
  logo_url: string | null;
  status: string;
}

interface BookmakersData {
  vinculados: BookmakerVinculado[];
  disponiveis: BookmakerCatalogo[];
}

interface TabCacheEntry<T> {
  data: T;
  timestamp: number;
  status: "fresh" | "stale" | "revalidating";
}

interface PartnerCache {
  resumo?: TabCacheEntry<ParceiroFinanceiroConsolidado>;
  movimentacoes?: TabCacheEntry<MovimentacoesData>;
  bookmakers?: TabCacheEntry<BookmakersData>;
  lastAccessed: number;
}

interface TabState {
  loading: boolean;
  error: string | null;
  isRevalidating: boolean;
}

// ============== LRU CACHE CLASS ==============

class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest (first) entry
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

  has(key: K): boolean {
    return this.cache.has(key);
  }
}

// ============== HOOK ==============

export function useParceiroFinanceiroCache() {
  // Cache store using LRU
  const cacheRef = useRef(new LRUCache<string, PartnerCache>(MAX_CACHED_PARTNERS));
  
  // Active requests tracking for deduplication
  const activeRequestsRef = useRef<Map<string, Promise<any>>>(new Map());
  
  // Abort controllers for race condition prevention
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  
  // Current state
  const [currentParceiroId, setCurrentParceiroId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("resumo");
  
  // Per-tab states
  const [tabStates, setTabStates] = useState<Record<TabKey, TabState>>({
    resumo: { loading: false, error: null, isRevalidating: false },
    movimentacoes: { loading: false, error: null, isRevalidating: false },
    bookmakers: { loading: false, error: null, isRevalidating: false },
  });
  
  // Current data
  const [resumoData, setResumoData] = useState<ParceiroFinanceiroConsolidado | null>(null);
  const [movimentacoesData, setMovimentacoesData] = useState<MovimentacoesData | null>(null);
  const [bookmakersData, setBookmakersData] = useState<BookmakersData | null>(null);

  // ============== HELPERS ==============

  const getCacheKey = (parceiroId: string, tab: TabKey): string => {
    return `${parceiroId}|${tab}`;
  };

  const isCacheValid = (entry: TabCacheEntry<any> | undefined): boolean => {
    if (!entry) return false;
    return Date.now() - entry.timestamp < CACHE_TTL;
  };

  const isCacheStale = (entry: TabCacheEntry<any> | undefined): boolean => {
    if (!entry) return true;
    return Date.now() - entry.timestamp >= CACHE_TTL;
  };

  const updateTabState = useCallback((tab: TabKey, updates: Partial<TabState>) => {
    setTabStates(prev => ({
      ...prev,
      [tab]: { ...prev[tab], ...updates }
    }));
  }, []);

  const cancelPendingRequests = useCallback((parceiroId: string) => {
    // Cancel all tabs for this partner
    (["resumo", "movimentacoes", "bookmakers"] as TabKey[]).forEach(tab => {
      const key = getCacheKey(parceiroId, tab);
      const controller = abortControllersRef.current.get(key);
      if (controller) {
        controller.abort();
        abortControllersRef.current.delete(key);
      }
    });
  }, []);

  // ============== FETCH FUNCTIONS ==============

  const fetchResumoData = async (parceiroId: string, signal?: AbortSignal): Promise<ParceiroFinanceiroConsolidado> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado");

    const { data: parceiroData, error: parceiroError } = await supabase
      .from("parceiros")
      .select("id, nome")
      .eq("id", parceiroId)
      .single();

    if (parceiroError) throw parceiroError;
    if (signal?.aborted) throw new Error("Aborted");

    const { data: bookmakers, error: bookmakersError } = await supabase
      .from("bookmakers")
      .select(`
        id, nome, saldo_atual, status, projeto_id, bookmaker_catalogo_id,
        login_username, login_password_encrypted
      `)
      .eq("parceiro_id", parceiroId);

    if (bookmakersError) throw bookmakersError;
    if (signal?.aborted) throw new Error("Aborted");

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

    if (signal?.aborted) throw new Error("Aborted");

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

    if (signal?.aborted) throw new Error("Aborted");

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

  const fetchMovimentacoesData = async (parceiroId: string, signal?: AbortSignal): Promise<MovimentacoesData> => {
    const { data: contasDoParceiroData } = await supabase
      .from("contas_bancarias")
      .select("id")
      .eq("parceiro_id", parceiroId);

    const { data: walletsDoParceiroData } = await supabase
      .from("wallets_crypto")
      .select("id")
      .eq("parceiro_id", parceiroId);

    if (signal?.aborted) throw new Error("Aborted");

    const contasIds = contasDoParceiroData?.map(c => c.id) || [];
    const walletsIds = walletsDoParceiroData?.map(w => w.id) || [];

    let orConditions = [
      `origem_parceiro_id.eq.${parceiroId}`,
      `destino_parceiro_id.eq.${parceiroId}`
    ];

    if (contasIds.length > 0) {
      orConditions.push(`origem_conta_bancaria_id.in.(${contasIds.join(',')})`);
      orConditions.push(`destino_conta_bancaria_id.in.(${contasIds.join(',')})`);
    }

    if (walletsIds.length > 0) {
      orConditions.push(`origem_wallet_id.in.(${walletsIds.join(',')})`);
      orConditions.push(`destino_wallet_id.in.(${walletsIds.join(',')})`);
    }

    const { data: transacoesData, error: transacoesError } = await supabase
      .from("cash_ledger")
      .select("*")
      .or(orConditions.join(','))
      .order("data_transacao", { ascending: false });

    if (transacoesError) throw transacoesError;
    if (signal?.aborted) throw new Error("Aborted");

    const bookmakerIds = new Set<string>();
    const parceiroIds = new Set<string>();
    const contaIdsSet = new Set<string>();
    const walletIdsSet = new Set<string>();
    
    transacoesData?.forEach((t) => {
      if (t.origem_bookmaker_id) bookmakerIds.add(t.origem_bookmaker_id);
      if (t.destino_bookmaker_id) bookmakerIds.add(t.destino_bookmaker_id);
      if (t.origem_parceiro_id) parceiroIds.add(t.origem_parceiro_id);
      if (t.destino_parceiro_id) parceiroIds.add(t.destino_parceiro_id);
      if (t.origem_conta_bancaria_id) contaIdsSet.add(t.origem_conta_bancaria_id);
      if (t.destino_conta_bancaria_id) contaIdsSet.add(t.destino_conta_bancaria_id);
      if (t.origem_wallet_id) walletIdsSet.add(t.origem_wallet_id);
      if (t.destino_wallet_id) walletIdsSet.add(t.destino_wallet_id);
    });

    const bmNames = new Map<string, string>();
    if (bookmakerIds.size > 0) {
      const { data: bookmakersData } = await supabase
        .from("bookmakers")
        .select("id, nome")
        .in("id", Array.from(bookmakerIds));
      bookmakersData?.forEach((b) => bmNames.set(b.id, b.nome));
    }

    if (signal?.aborted) throw new Error("Aborted");

    const pNames = new Map<string, string>();
    if (parceiroIds.size > 0) {
      const { data: parceirosData } = await supabase
        .from("parceiros")
        .select("id, nome")
        .in("id", Array.from(parceiroIds));
      parceirosData?.forEach((p) => pNames.set(p.id, p.nome));
    }

    let contasBancariasResult: Array<{ id: string; banco: string; titular: string; parceiro_id: string }> = [];
    if (contaIdsSet.size > 0) {
      const { data: contasData } = await supabase
        .from("contas_bancarias")
        .select("id, banco, titular, parceiro_id")
        .in("id", Array.from(contaIdsSet));
      contasBancariasResult = contasData || [];
    }

    let walletsCryptoResult: Array<{ id: string; exchange: string; endereco: string; parceiro_id: string }> = [];
    if (walletIdsSet.size > 0) {
      const { data: walletsData } = await supabase
        .from("wallets_crypto")
        .select("id, exchange, endereco, parceiro_id")
        .in("id", Array.from(walletIdsSet));
      walletsCryptoResult = walletsData || [];
    }

    return {
      transacoes: transacoesData || [],
      bookmakerNames: bmNames,
      parceiroNames: pNames,
      contasBancarias: contasBancariasResult,
      walletsCrypto: walletsCryptoResult,
    };
  };

  const fetchBookmakersData = async (parceiroId: string, signal?: AbortSignal): Promise<BookmakersData> => {
    const { data: vinculadosData, error: vinculadosError } = await supabase
      .from("bookmakers")
      .select("id, nome, saldo_atual, status, moeda, login_username, login_password_encrypted, bookmaker_catalogo_id")
      .eq("parceiro_id", parceiroId);

    if (vinculadosError) throw vinculadosError;
    if (signal?.aborted) throw new Error("Aborted");

    const catalogoIds = vinculadosData
      ?.filter(b => b.bookmaker_catalogo_id)
      .map(b => b.bookmaker_catalogo_id as string) || [];

    let logosMap = new Map<string, string>();
    if (catalogoIds.length > 0) {
      const { data: catalogoData } = await supabase
        .from("bookmakers_catalogo")
        .select("id, logo_url")
        .in("id", catalogoIds);
      catalogoData?.forEach((c) => {
        if (c.logo_url) logosMap.set(c.id, c.logo_url);
      });
    }

    if (signal?.aborted) throw new Error("Aborted");

    const vinculadosComLogo = vinculadosData?.map(b => ({
      ...b,
      logo_url: b.bookmaker_catalogo_id ? logosMap.get(b.bookmaker_catalogo_id) : undefined,
    })) || [];

    const { data: catalogoData, error: catalogoError } = await supabase
      .from("bookmakers_catalogo")
      .select("id, nome, logo_url, status")
      .eq("status", "REGULAMENTADA");

    if (catalogoError) throw catalogoError;

    const vinculadosCatalogoIds = new Set(
      vinculadosData?.map(b => b.bookmaker_catalogo_id).filter(Boolean) || []
    );

    const disponiveis = catalogoData?.filter(
      c => !vinculadosCatalogoIds.has(c.id)
    ) || [];

    return {
      vinculados: vinculadosComLogo,
      disponiveis,
    };
  };

  // ============== CORE LOAD FUNCTION ==============

  const loadTabData = useCallback(async <T>(
    parceiroId: string,
    tab: TabKey,
    fetchFn: (parceiroId: string, signal?: AbortSignal) => Promise<T>,
    setData: (data: T | null) => void,
    forceRefresh = false
  ) => {
    const cacheKey = getCacheKey(parceiroId, tab);
    const partnerCache = cacheRef.current.get(parceiroId);
    const tabCache = partnerCache?.[tab] as TabCacheEntry<T> | undefined;

    // Check for valid cache
    if (!forceRefresh && isCacheValid(tabCache)) {
      setData(tabCache!.data);
      return;
    }

    // Show stale data immediately while revalidating
    if (tabCache?.data && REVALIDATE_STALE) {
      setData(tabCache.data);
      if (!forceRefresh && !isCacheStale(tabCache)) {
        return; // Cache is still valid, no need to refresh
      }
      updateTabState(tab, { isRevalidating: true });
    } else {
      updateTabState(tab, { loading: true });
    }

    // Check for existing request (deduplication)
    const existingRequest = activeRequestsRef.current.get(cacheKey);
    if (existingRequest) {
      try {
        const data = await existingRequest;
        setData(data);
        return;
      } catch {
        // Request failed, continue with new request
      }
    }

    // Cancel previous request for this key
    const existingController = abortControllersRef.current.get(cacheKey);
    if (existingController) {
      existingController.abort();
    }

    // Create new abort controller
    const controller = new AbortController();
    abortControllersRef.current.set(cacheKey, controller);

    // Create and track request
    const request = fetchFn(parceiroId, controller.signal);
    activeRequestsRef.current.set(cacheKey, request);

    try {
      const data = await request;
      
      // Update cache
      const existingPartnerCache = cacheRef.current.get(parceiroId) || { lastAccessed: Date.now() };
      existingPartnerCache[tab] = {
        data,
        timestamp: Date.now(),
        status: "fresh",
      } as any;
      existingPartnerCache.lastAccessed = Date.now();
      cacheRef.current.set(parceiroId, existingPartnerCache);
      
      // Update state if this is still the current partner
      if (currentParceiroId === parceiroId) {
        setData(data);
      }
      
      updateTabState(tab, { loading: false, error: null, isRevalidating: false });
    } catch (error: any) {
      if (error.message === "Aborted") {
        // Request was cancelled, do nothing
        return;
      }
      console.error(`Erro ao carregar ${tab}:`, error);
      updateTabState(tab, { loading: false, error: error.message || "Erro ao carregar dados", isRevalidating: false });
    } finally {
      activeRequestsRef.current.delete(cacheKey);
      abortControllersRef.current.delete(cacheKey);
    }
  }, [currentParceiroId, updateTabState]);

  // ============== PUBLIC API ==============

  const loadResumo = useCallback((parceiroId: string, force = false) => {
    loadTabData(parceiroId, "resumo", fetchResumoData, setResumoData, force);
  }, [loadTabData]);

  const loadMovimentacoes = useCallback((parceiroId: string, force = false) => {
    loadTabData(parceiroId, "movimentacoes", fetchMovimentacoesData, setMovimentacoesData, force);
  }, [loadTabData]);

  const loadBookmakers = useCallback((parceiroId: string, force = false) => {
    loadTabData(parceiroId, "bookmakers", fetchBookmakersData, setBookmakersData, force);
  }, [loadTabData]);

  const selectParceiro = useCallback((parceiroId: string | null) => {
    if (currentParceiroId && currentParceiroId !== parceiroId) {
      cancelPendingRequests(currentParceiroId);
    }

    setCurrentParceiroId(parceiroId);
    setResumoData(null);
    setMovimentacoesData(null);
    setBookmakersData(null);
    
    setTabStates({
      resumo: { loading: false, error: null, isRevalidating: false },
      movimentacoes: { loading: false, error: null, isRevalidating: false },
      bookmakers: { loading: false, error: null, isRevalidating: false },
    });

    if (!parceiroId) return;

    if (activeTab === "resumo") loadResumo(parceiroId);
    else if (activeTab === "movimentacoes") loadMovimentacoes(parceiroId);
    else loadBookmakers(parceiroId);
  }, [currentParceiroId, activeTab, cancelPendingRequests, loadResumo, loadMovimentacoes, loadBookmakers]);

  const changeTab = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    
    if (!currentParceiroId) return;
    if (tab === "resumo") loadResumo(currentParceiroId);
    else if (tab === "movimentacoes") loadMovimentacoes(currentParceiroId);
    else loadBookmakers(currentParceiroId);
  }, [currentParceiroId, loadResumo, loadMovimentacoes, loadBookmakers]);

  const invalidateCache = useCallback((parceiroId: string, tabs?: TabKey[]) => {
    const partnerCache = cacheRef.current.get(parceiroId);
    if (partnerCache) {
      if (tabs) {
        tabs.forEach(tab => delete partnerCache[tab]);
      } else {
        delete partnerCache.resumo;
        delete partnerCache.movimentacoes;
        delete partnerCache.bookmakers;
      }
      cacheRef.current.set(parceiroId, partnerCache);
    }
    
    if (currentParceiroId === parceiroId) {
      if (activeTab === "resumo") loadResumo(parceiroId, true);
      else if (activeTab === "movimentacoes") loadMovimentacoes(parceiroId, true);
      else loadBookmakers(parceiroId, true);
    }
  }, [currentParceiroId, activeTab, loadResumo, loadMovimentacoes, loadBookmakers]);

  const invalidateAllCache = useCallback(() => {
    cacheRef.current.clear();
    if (currentParceiroId) {
      if (activeTab === "resumo") loadResumo(currentParceiroId, true);
      else if (activeTab === "movimentacoes") loadMovimentacoes(currentParceiroId, true);
      else loadBookmakers(currentParceiroId, true);
    }
  }, [currentParceiroId, activeTab, loadResumo, loadMovimentacoes, loadBookmakers]);

  const refreshCurrent = useCallback(() => {
    if (!currentParceiroId) return;
    invalidateCache(currentParceiroId, [activeTab]);
  }, [currentParceiroId, activeTab, invalidateCache]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel all pending requests
      abortControllersRef.current.forEach(controller => controller.abort());
      abortControllersRef.current.clear();
      activeRequestsRef.current.clear();
    };
  }, []);

  return {
    // State
    currentParceiroId,
    activeTab,
    
    // Data
    resumoData,
    movimentacoesData,
    bookmakersData,
    
    // Tab states
    resumoLoading: tabStates.resumo.loading,
    resumoError: tabStates.resumo.error,
    resumoIsRevalidating: tabStates.resumo.isRevalidating,
    
    movimentacoesLoading: tabStates.movimentacoes.loading,
    movimentacoesError: tabStates.movimentacoes.error,
    movimentacoesIsRevalidating: tabStates.movimentacoes.isRevalidating,
    
    bookmakersLoading: tabStates.bookmakers.loading,
    bookmakersError: tabStates.bookmakers.error,
    bookmakersIsRevalidating: tabStates.bookmakers.isRevalidating,
    
    // Actions
    selectParceiro,
    changeTab,
    invalidateTab,
    invalidateCache,
    invalidateAllCache,
    refreshCurrent,
    prefetchTab,
  };
}

// Export types for components
export type { TabKey, MovimentacoesData, BookmakersData, BookmakerVinculado, BookmakerCatalogo, Transacao };
