import { useState, useCallback, useRef, useMemo } from "react";

/**
 * ARQUITETURA: Cache para abas de parceiro (Movimentações e Bookmakers)
 * 
 * Este hook implementa um cache LRU por parceiro para evitar refetch desnecessário
 * ao alternar entre abas. Os dados são mantidos em memória e só recarregados quando:
 * - O parceiro selecionado muda
 * - O usuário solicita explicitamente um refresh
 * - O cache expira (TTL)
 * - Ocorre uma mutação (onDataChange)
 */

// Configuração do cache
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const MAX_CACHED_PARTNERS = 10; // Máximo de parceiros em cache simultâneo

// ============================================================================
// TIPOS - Movimentações
// ============================================================================

export interface Transacao {
  id: string;
  tipo_transacao: string;
  valor: number;
  moeda: string;
  tipo_moeda: string;
  valor_usd: number | null;
  coin: string | null; // Ativo crypto (USDT, ETH, BTC, etc.)
  qtd_coin: number | null; // Quantidade do ativo
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
  ajuste_direcao: string | null;
  ajuste_motivo: string | null;
}

export interface ContaBancaria {
  id: string;
  banco: string;
  titular: string;
  parceiro_id: string;
}

export interface WalletCrypto {
  id: string;
  exchange: string;
  endereco: string;
  network?: string;
  parceiro_id: string;
}

export interface MovimentacoesData {
  transacoes: Transacao[];
  bookmakerNames: Map<string, string>;
  parceiroNames: Map<string, string>;
  contasBancarias: ContaBancaria[];
  walletsCrypto: WalletCrypto[];
}

// ============================================================================
// TIPOS - Bookmakers
// ============================================================================

export interface BookmakerVinculado {
  id: string;
  nome: string;
  saldo_atual: number;
  status: string;
  moeda: string;
  login_username: string;
  login_password_encrypted: string;
  bookmaker_catalogo_id: string | null;
  instance_identifier: string | null;
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

// ============================================================================
// CACHE LRU GENÉRICO
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize: number, ttl: number) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: K): V | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Verificar TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    // Move para o final (mais recente)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    return entry.data;
  }

  set(key: K, value: V): void {
    // Remover se já existe (para atualizar posição)
    this.cache.delete(key);
    
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, { data: value, timestamp: Date.now() });
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// ============================================================================
// CACHES GLOBAIS (singletons que persistem entre navegações de página)
// ============================================================================

const globalMovimentacoesCache = new LRUCache<string, MovimentacoesData>(MAX_CACHED_PARTNERS, CACHE_TTL);
const globalBookmakersCache = new LRUCache<string, BookmakersData>(MAX_CACHED_PARTNERS, CACHE_TTL);

// ============================================================================
// HOOK: useParceiroMovimentacoesCache
// ============================================================================

interface UseMovimentacoesCacheReturn {
  data: MovimentacoesData | null;
  loading: boolean;
  error: string | null;
  fetchData: () => Promise<void>;
  invalidate: () => void;
}

export function useParceiroMovimentacoesCache(parceiroId: string): UseMovimentacoesCacheReturn {
  const [data, setData] = useState<MovimentacoesData | null>(() => {
    // Inicializa do cache global se disponível
    if (parceiroId) {
      return globalMovimentacoesCache.get(parceiroId);
    }
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track last fetched ID para evitar fetch duplicado
  const lastFetchedIdRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!parceiroId) return;
    
    // Evitar fetch duplicado
    if (isFetchingRef.current) return;
    
    // Verificar cache global primeiro (se não for refresh forçado)
    if (!forceRefresh) {
      const cached = globalMovimentacoesCache.get(parceiroId);
      if (cached) {
        setData(cached);
        setLoading(false);
        setError(null);
        lastFetchedIdRef.current = parceiroId;
        return;
      }
    }
    
    // Evitar refetch se já buscamos esse parceiro e não é refresh forçado
    if (!forceRefresh && lastFetchedIdRef.current === parceiroId && data) {
      return;
    }
    
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const { supabase } = await import("@/integrations/supabase/client");
      
      const { data: contasDoParceiroData } = await supabase
        .from("contas_bancarias")
        .select("id")
        .eq("parceiro_id", parceiroId);

      const { data: walletsDoParceiroData } = await supabase
        .from("wallets_crypto")
        .select("id")
        .eq("parceiro_id", parceiroId);

      const contasIds = contasDoParceiroData?.map((c) => c.id) || [];
      const walletsIds = walletsDoParceiroData?.map((w) => w.id) || [];

      const orConditions = [`origem_parceiro_id.eq.${parceiroId}`, `destino_parceiro_id.eq.${parceiroId}`];

      if (contasIds.length > 0) {
        orConditions.push(`origem_conta_bancaria_id.in.(${contasIds.join(",")})`);
        orConditions.push(`destino_conta_bancaria_id.in.(${contasIds.join(",")})`);
      }

      if (walletsIds.length > 0) {
        orConditions.push(`origem_wallet_id.in.(${walletsIds.join(",")})`);
        orConditions.push(`destino_wallet_id.in.(${walletsIds.join(",")})`);
      }

      const { data: transacoesData, error: transacoesError } = await supabase
        .from("cash_ledger")
        .select("*")
        .or(orConditions.join(","))
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

      const bmNames = new Map<string, string>();
      if (bookmakerIds.size > 0) {
        const { data: bookmakersData } = await supabase
          .from("bookmakers")
          .select("id, nome")
          .in("id", Array.from(bookmakerIds));
        bookmakersData?.forEach((b) => bmNames.set(b.id, b.nome));
      }

      const pNames = new Map<string, string>();
      if (parceiroIds.size > 0) {
        const { data: parceirosData } = await supabase
          .from("parceiros")
          .select("id, nome")
          .in("id", Array.from(parceiroIds));
        parceirosData?.forEach((p) => pNames.set(p.id, p.nome));
      }

      let contasBancariasResult: ContaBancaria[] = [];
      if (contaIdsSet.size > 0) {
        const { data: contasData } = await supabase
          .from("contas_bancarias")
          .select("id, banco, titular, parceiro_id")
          .in("id", Array.from(contaIdsSet));
        contasBancariasResult = contasData || [];
      }

      let walletsCryptoResult: WalletCrypto[] = [];
      if (walletIdsSet.size > 0) {
        const { data: walletsData } = await supabase
          .from("wallets_crypto")
          .select("id, exchange, endereco, network, parceiro_id")
          .in("id", Array.from(walletIdsSet));
        walletsCryptoResult = walletsData || [];
      }

      const newData: MovimentacoesData = {
        transacoes: transacoesData || [],
        bookmakerNames: bmNames,
        parceiroNames: pNames,
        contasBancarias: contasBancariasResult,
        walletsCrypto: walletsCryptoResult,
      };

      // Salvar no cache global
      globalMovimentacoesCache.set(parceiroId, newData);
      lastFetchedIdRef.current = parceiroId;
      
      setData(newData);
    } catch (err: any) {
      console.error("Erro ao carregar movimentações:", err);
      setError(err.message || "Erro ao carregar dados");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [parceiroId]);

  const invalidate = useCallback(() => {
    if (parceiroId) {
      globalMovimentacoesCache.delete(parceiroId);
      lastFetchedIdRef.current = null;
    }
  }, [parceiroId]);

  return { data, loading, error, fetchData: () => fetchData(false), invalidate };
}

// ============================================================================
// HOOK: useParceiroBookmakersCache
// ============================================================================

interface UseBookmakersCacheReturn {
  data: BookmakersData | null;
  loading: boolean;
  error: string | null;
  fetchData: () => Promise<void>;
  invalidate: () => void;
}

export function useParceiroBookmakersCache(parceiroId: string): UseBookmakersCacheReturn {
  const [data, setData] = useState<BookmakersData | null>(() => {
    // Inicializa do cache global se disponível
    if (parceiroId) {
      return globalBookmakersCache.get(parceiroId);
    }
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const lastFetchedIdRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!parceiroId) return;
    
    if (isFetchingRef.current) return;
    
    // Verificar cache global primeiro
    if (!forceRefresh) {
      const cached = globalBookmakersCache.get(parceiroId);
      if (cached) {
        setData(cached);
        setLoading(false);
        setError(null);
        lastFetchedIdRef.current = parceiroId;
        return;
      }
    }
    
    if (!forceRefresh && lastFetchedIdRef.current === parceiroId && data) {
      return;
    }
    
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const { supabase } = await import("@/integrations/supabase/client");
      
      const { data: vinculadosData, error: vinculadosError } = await supabase
        .from("bookmakers")
        .select("id, nome, saldo_atual, status, moeda, login_username, login_password_encrypted, bookmaker_catalogo_id, instance_identifier")
        .eq("parceiro_id", parceiroId);

      if (vinculadosError) throw vinculadosError;

      const catalogoIds = vinculadosData?.filter((b) => b.bookmaker_catalogo_id).map((b) => b.bookmaker_catalogo_id as string) || [];

      const logosMap = new Map<string, string>();
      if (catalogoIds.length > 0) {
        const { data: catalogoData } = await supabase.from("bookmakers_catalogo").select("id, logo_url").in("id", catalogoIds);
        catalogoData?.forEach((c) => { if (c.logo_url) logosMap.set(c.id, c.logo_url); });
      }

      const vinculadosComLogo = vinculadosData?.map((b) => ({
        ...b,
        logo_url: b.bookmaker_catalogo_id ? logosMap.get(b.bookmaker_catalogo_id) : undefined,
      })) || [];

      const { data: catalogoData, error: catalogoError } = await supabase
        .from("bookmakers_catalogo")
        .select("id, nome, logo_url, status")
        .order("nome");
        
      if (catalogoError) throw catalogoError;

      const newData: BookmakersData = {
        vinculados: vinculadosComLogo,
        disponiveis: catalogoData || [],
      };

      globalBookmakersCache.set(parceiroId, newData);
      lastFetchedIdRef.current = parceiroId;
      
      setData(newData);
    } catch (err: any) {
      console.error("Erro ao carregar bookmakers:", err);
      setError(err.message || "Erro ao carregar dados");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [parceiroId]);

  const invalidate = useCallback(() => {
    if (parceiroId) {
      globalBookmakersCache.delete(parceiroId);
      lastFetchedIdRef.current = null;
    }
  }, [parceiroId]);

  return { data, loading, error, fetchData: () => fetchData(false), invalidate };
}

// ============================================================================
// FUNÇÕES AUXILIARES DE CACHE GLOBAL
// ============================================================================

export function getGlobalMovimentacoesCache(): LRUCache<string, MovimentacoesData> {
  return globalMovimentacoesCache;
}

export function getGlobalBookmakersCache(): LRUCache<string, BookmakersData> {
  return globalBookmakersCache;
}

export function clearAllParceiroTabsCaches(): void {
  globalMovimentacoesCache.clear();
  globalBookmakersCache.clear();
}
