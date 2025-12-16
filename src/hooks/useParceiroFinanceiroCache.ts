import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookmakerFinanceiro, ParceiroFinanceiroConsolidado } from "./useParceiroFinanceiroConsolidado";

// ============== TYPES ==============

export interface Transacao {
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

export interface MovimentacoesData {
  transacoes: Transacao[];
  bookmakerNames: Map<string, string>;
  parceiroNames: Map<string, string>;
  contasBancarias: Array<{ id: string; banco: string; titular: string; parceiro_id: string }>;
  walletsCrypto: Array<{ id: string; exchange: string; endereco: string; parceiro_id: string }>;
}

export interface BookmakerVinculado {
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

export interface BookmakerCatalogo {
  id: string;
  nome: string;
  logo_url: string | null;
  status: string;
}

export interface BookmakersData {
  vinculados: BookmakerVinculado[];
  disponiveis: BookmakerCatalogo[];
}

type TabType = "resumo" | "movimentacoes" | "bookmakers";

interface TabCacheEntry<T> {
  data: T;
  timestamp: number;
  isStale: boolean;
}

interface PartnerCache {
  resumo?: TabCacheEntry<ParceiroFinanceiroConsolidado>;
  movimentacoes?: TabCacheEntry<MovimentacoesData>;
  bookmakers?: TabCacheEntry<BookmakersData>;
}

interface InFlightRequest {
  promise: Promise<any>;
  abortController?: AbortController;
}

// ============== CONSTANTS ==============

const CACHE_TTL_RESUMO = 5 * 60 * 1000; // 5 min for resumo (less dynamic)
const CACHE_TTL_MOVIMENTACOES = 2 * 60 * 1000; // 2 min for movimentacoes
const CACHE_TTL_BOOKMAKERS = 2 * 60 * 1000; // 2 min for bookmakers
const STALE_TTL = 30 * 1000; // 30s before showing stale indicator

// ============== HOOK ==============

export function useParceiroFinanceiroCache() {
  const cacheRef = useRef<Map<string, PartnerCache>>(new Map());
  const inFlightRef = useRef<Map<string, InFlightRequest>>(new Map());
  
  // Current state
  const [currentParceiroId, setCurrentParceiroId] = useState<string | null>(null);
  const [resumoData, setResumoData] = useState<ParceiroFinanceiroConsolidado | null>(null);
  const [movimentacoesData, setMovimentacoesData] = useState<MovimentacoesData | null>(null);
  const [bookmakersData, setBookmakersData] = useState<BookmakersData | null>(null);
  
  const [resumoLoading, setResumoLoading] = useState(false);
  const [movimentacoesLoading, setMovimentacoesLoading] = useState(false);
  const [bookmakersLoading, setBookmakersLoading] = useState(false);
  
  const [resumoError, setResumoError] = useState<string | null>(null);
  const [movimentacoesError, setMovimentacoesError] = useState<string | null>(null);
  const [bookmakersError, setBookmakersError] = useState<string | null>(null);

  const [isRevalidating, setIsRevalidating] = useState<Record<TabType, boolean>>({
    resumo: false,
    movimentacoes: false,
    bookmakers: false,
  });

  // ============== CACHE HELPERS ==============

  const getTTL = (tab: TabType): number => {
    switch (tab) {
      case "resumo": return CACHE_TTL_RESUMO;
      case "movimentacoes": return CACHE_TTL_MOVIMENTACOES;
      case "bookmakers": return CACHE_TTL_BOOKMAKERS;
    }
  };

  const isCacheValid = useCallback((entry: TabCacheEntry<any> | undefined, tab: TabType): boolean => {
    if (!entry) return false;
    return Date.now() - entry.timestamp < getTTL(tab);
  }, []);

  const isCacheStale = useCallback((entry: TabCacheEntry<any> | undefined): boolean => {
    if (!entry) return true;
    return Date.now() - entry.timestamp > STALE_TTL;
  }, []);

  const getInFlightKey = (parceiroId: string, tab: TabType) => `${parceiroId}:${tab}`;

  // ============== FETCH FUNCTIONS ==============

  const fetchResumoData = useCallback(async (parceiroId: string): Promise<ParceiroFinanceiroConsolidado | null> => {
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
  }, []);

  const fetchMovimentacoesData = useCallback(async (parceiroId: string): Promise<MovimentacoesData> => {
    const { data: contasDoParceiroData } = await supabase
      .from("contas_bancarias")
      .select("id")
      .eq("parceiro_id", parceiroId);

    const { data: walletsDoParceiroData } = await supabase
      .from("wallets_crypto")
      .select("id")
      .eq("parceiro_id", parceiroId);

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

    const bookmakerNames = new Map<string, string>();
    if (bookmakerIds.size > 0) {
      const { data: bookmakersData } = await supabase
        .from("bookmakers")
        .select("id, nome")
        .in("id", Array.from(bookmakerIds));
      bookmakersData?.forEach((b) => bookmakerNames.set(b.id, b.nome));
    }

    const parceiroNames = new Map<string, string>();
    if (parceiroIds.size > 0) {
      const { data: parceirosData } = await supabase
        .from("parceiros")
        .select("id, nome")
        .in("id", Array.from(parceiroIds));
      parceirosData?.forEach((p) => parceiroNames.set(p.id, p.nome));
    }

    let contasBancarias: Array<{ id: string; banco: string; titular: string; parceiro_id: string }> = [];
    if (contaIdsSet.size > 0) {
      const { data: contasData } = await supabase
        .from("contas_bancarias")
        .select("id, banco, titular, parceiro_id")
        .in("id", Array.from(contaIdsSet));
      contasBancarias = contasData || [];
    }

    let walletsCrypto: Array<{ id: string; exchange: string; endereco: string; parceiro_id: string }> = [];
    if (walletIdsSet.size > 0) {
      const { data: walletsData } = await supabase
        .from("wallets_crypto")
        .select("id, exchange, endereco, parceiro_id")
        .in("id", Array.from(walletIdsSet));
      walletsCrypto = walletsData || [];
    }

    return {
      transacoes: transacoesData || [],
      bookmakerNames,
      parceiroNames,
      contasBancarias,
      walletsCrypto,
    };
  }, []);

  const fetchBookmakersData = useCallback(async (parceiroId: string): Promise<BookmakersData> => {
    const { data: vinculadosData, error: vinculadosError } = await supabase
      .from("bookmakers")
      .select("id, nome, saldo_atual, status, moeda, login_username, login_password_encrypted, bookmaker_catalogo_id")
      .eq("parceiro_id", parceiroId);

    if (vinculadosError) throw vinculadosError;

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
  }, []);

  // ============== CORE CACHE LOGIC ==============

  const loadTabData = useCallback(async (
    parceiroId: string,
    tab: TabType,
    forceRefresh = false
  ) => {
    const inFlightKey = getInFlightKey(parceiroId, tab);
    
    // Check for in-flight request (deduplication)
    const existing = inFlightRef.current.get(inFlightKey);
    if (existing && !forceRefresh) {
      return existing.promise;
    }

    // Get cache entry
    const partnerCache = cacheRef.current.get(parceiroId) || {};
    const cacheEntry = partnerCache[tab];

    // If cache is valid and not forcing refresh, return cached data
    if (!forceRefresh && isCacheValid(cacheEntry, tab)) {
      // Set data immediately from cache
      if (tab === "resumo" && cacheEntry) {
        setResumoData(cacheEntry.data as ParceiroFinanceiroConsolidado);
      } else if (tab === "movimentacoes" && cacheEntry) {
        setMovimentacoesData(cacheEntry.data as MovimentacoesData);
      } else if (tab === "bookmakers" && cacheEntry) {
        setBookmakersData(cacheEntry.data as BookmakersData);
      }

      // Stale-while-revalidate: if stale, trigger background refresh
      if (isCacheStale(cacheEntry)) {
        setIsRevalidating(prev => ({ ...prev, [tab]: true }));
        loadTabData(parceiroId, tab, true).finally(() => {
          setIsRevalidating(prev => ({ ...prev, [tab]: false }));
        });
      }
      return;
    }

    // If we have stale cache, show it immediately while fetching
    if (cacheEntry?.data) {
      if (tab === "resumo") setResumoData(cacheEntry.data as ParceiroFinanceiroConsolidado);
      else if (tab === "movimentacoes") setMovimentacoesData(cacheEntry.data as MovimentacoesData);
      else if (tab === "bookmakers") setBookmakersData(cacheEntry.data as BookmakersData);
    }

    // Set loading state only if no cached data
    if (!cacheEntry?.data) {
      if (tab === "resumo") setResumoLoading(true);
      else if (tab === "movimentacoes") setMovimentacoesLoading(true);
      else if (tab === "bookmakers") setBookmakersLoading(true);
    }

    // Create fetch promise
    const fetchPromise = (async () => {
      try {
        let data: any;
        
        if (tab === "resumo") {
          data = await fetchResumoData(parceiroId);
        } else if (tab === "movimentacoes") {
          data = await fetchMovimentacoesData(parceiroId);
        } else if (tab === "bookmakers") {
          data = await fetchBookmakersData(parceiroId);
        }

        // Note: removed race condition guard that was causing issues
        // The stale closure meant currentParceiroId was often wrong

        // Update cache
        const updatedPartnerCache = cacheRef.current.get(parceiroId) || {};
        updatedPartnerCache[tab] = {
          data,
          timestamp: Date.now(),
          isStale: false,
        };
        cacheRef.current.set(parceiroId, updatedPartnerCache);

        // Update state
        if (tab === "resumo") {
          setResumoData(data);
          setResumoError(null);
        } else if (tab === "movimentacoes") {
          setMovimentacoesData(data);
          setMovimentacoesError(null);
        } else if (tab === "bookmakers") {
          setBookmakersData(data);
          setBookmakersError(null);
        }

        return data;
      } catch (err: any) {
        console.error(`Erro ao carregar ${tab}:`, err);
        if (tab === "resumo") setResumoError(err.message);
        else if (tab === "movimentacoes") setMovimentacoesError(err.message);
        else if (tab === "bookmakers") setBookmakersError(err.message);
      } finally {
        inFlightRef.current.delete(inFlightKey);
        if (tab === "resumo") setResumoLoading(false);
        else if (tab === "movimentacoes") setMovimentacoesLoading(false);
        else if (tab === "bookmakers") setBookmakersLoading(false);
      }
    })();

    // Store in-flight request
    inFlightRef.current.set(inFlightKey, { promise: fetchPromise });

    return fetchPromise;
  }, [currentParceiroId, isCacheValid, isCacheStale, fetchResumoData, fetchMovimentacoesData, fetchBookmakersData]);

  // ============== PUBLIC API ==============

  const selectParceiro = useCallback(async (parceiroId: string | null) => {
    // Cancel any pending requests for previous partner
    if (currentParceiroId && currentParceiroId !== parceiroId) {
      ["resumo", "movimentacoes", "bookmakers"].forEach(tab => {
        const key = getInFlightKey(currentParceiroId, tab as TabType);
        inFlightRef.current.delete(key);
      });
    }

    setCurrentParceiroId(parceiroId);

    if (!parceiroId) {
      setResumoData(null);
      setMovimentacoesData(null);
      setBookmakersData(null);
      setResumoError(null);
      setMovimentacoesError(null);
      setBookmakersError(null);
      return;
    }

    // Load resumo immediately with forceRefresh to bypass stale closure check
    await loadTabData(parceiroId, "resumo", true);
  }, [currentParceiroId, loadTabData]);

  const loadTab = useCallback((tab: TabType) => {
    if (!currentParceiroId) return;
    loadTabData(currentParceiroId, tab);
  }, [currentParceiroId, loadTabData]);

  const invalidateTab = useCallback((parceiroId: string, tab: TabType) => {
    const partnerCache = cacheRef.current.get(parceiroId);
    if (partnerCache) {
      delete partnerCache[tab];
      cacheRef.current.set(parceiroId, partnerCache);
    }
    
    // Reload if it's the current partner
    if (currentParceiroId === parceiroId) {
      loadTabData(parceiroId, tab, true);
    }
  }, [currentParceiroId, loadTabData]);

  const invalidateCache = useCallback((parceiroId: string) => {
    cacheRef.current.delete(parceiroId);
    
    if (currentParceiroId === parceiroId) {
      loadTabData(parceiroId, "resumo", true);
    }
  }, [currentParceiroId, loadTabData]);

  const invalidateAllCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  const refreshTab = useCallback(async (tab: TabType) => {
    if (!currentParceiroId) return;
    
    // Remove from cache
    const partnerCache = cacheRef.current.get(currentParceiroId);
    if (partnerCache) {
      delete partnerCache[tab];
    }
    
    await loadTabData(currentParceiroId, tab, true);
  }, [currentParceiroId, loadTabData]);

  const refreshCurrent = useCallback(async () => {
    if (!currentParceiroId) return;
    
    // Clear all cache for current partner
    cacheRef.current.delete(currentParceiroId);
    
    // Reload resumo
    await loadTabData(currentParceiroId, "resumo", true);
  }, [currentParceiroId, loadTabData]);

  return {
    // Current data
    resumoData,
    movimentacoesData,
    bookmakersData,
    
    // Loading states
    resumoLoading,
    movimentacoesLoading,
    bookmakersLoading,
    
    // Error states
    resumoError,
    movimentacoesError,
    bookmakersError,
    
    // Revalidation states
    isRevalidating,
    
    // Actions
    selectParceiro,
    loadTab,
    invalidateTab,
    invalidateCache,
    invalidateAllCache,
    refreshTab,
    refreshCurrent,
    
    // Current partner ID
    currentParceiroId,
  };
}
