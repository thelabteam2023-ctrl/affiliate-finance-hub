import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { BookmakerFinanceiro, ParceiroFinanceiroConsolidado } from "./useParceiroFinanceiroConsolidado";

// ============== CONSTANTS ==============

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHED_PARTNERS = 30;
const TABS_PER_PARTNER = 3;
const MAX_CACHE_ENTRIES = MAX_CACHED_PARTNERS * TABS_PER_PARTNER;
const REVALIDATE_STALE = true; // stale-while-revalidate

// ============== TYPES ==============

export type TabKey = "resumo" | "movimentacoes" | "bookmakers";

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

type CacheStatus = "idle" | "loading" | "success" | "error";

type CacheEntry<T> = {
  status: CacheStatus;
  data?: T;
  error?: string | null;
  updatedAt?: number;
  requestId: number;
  controller?: AbortController;
  inFlightPromise?: Promise<T>;
};

// ============== LRU CACHE ==============

class LRUCache<K, V> {
  private cache = new Map<K, V>();

  constructor(private maxSize: number) {}

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
      const firstKey = this.cache.keys().next().value as K | undefined;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  keys(): K[] {
    return Array.from(this.cache.keys());
  }
}

// ============== HELPERS ==============

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${k}:${stableStringify(obj[k])}`).join(",")}}`;
}

function isFresh(updatedAt: number | undefined): boolean {
  if (!updatedAt) return false;
  return Date.now() - updatedAt < CACHE_TTL;
}

function makeKey(parceiroId: string, tab: TabKey, paramsHash: string): string {
  // Contract: key = partnerId|tab|paramsHash (stable)
  return `${parceiroId}|${tab}|${paramsHash}`;
}

function defaultEntry<T>(): CacheEntry<T> {
  return {
    status: "idle",
    requestId: 0,
    data: undefined,
    error: null,
    updatedAt: undefined,
    controller: undefined,
    inFlightPromise: undefined,
  };
}

// ============== HOOK ==============

export function useParceiroFinanceiroCache() {
  const cacheRef = useRef(new LRUCache<string, CacheEntry<any>>(MAX_CACHE_ENTRIES));
  const keysByPartnerRef = useRef<Map<string, Set<string>>>(new Map());

  // Force re-render when cache entries change
  const [, bump] = useState(0);
  const bumpRender = useCallback(() => bump((x) => x + 1), []);

  const [currentParceiroId, setCurrentParceiroId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("resumo");

  const getParamsHash = useCallback((params?: Record<string, unknown>) => {
    return params ? stableStringify(params) : "";
  }, []);

  const getEntry = useCallback(<T,>(key: string): CacheEntry<T> => {
    const existing = cacheRef.current.get(key);
    if (existing) return existing as CacheEntry<T>;
    const created = defaultEntry<T>();
    cacheRef.current.set(key, created);
    return created;
  }, []);

  const trackKeyForPartner = useCallback((parceiroId: string, key: string) => {
    const set = keysByPartnerRef.current.get(parceiroId) || new Set<string>();
    set.add(key);
    keysByPartnerRef.current.set(parceiroId, set);
  }, []);

  const cancelKey = useCallback((key: string) => {
    const entry = cacheRef.current.get(key) as CacheEntry<any> | undefined;
    if (entry?.controller) {
      entry.controller.abort();
    }
  }, []);

  const cancelPartner = useCallback(
    (parceiroId: string) => {
      const keys = keysByPartnerRef.current.get(parceiroId);
      if (!keys) return;
      keys.forEach((k) => cancelKey(k));
    },
    [cancelKey]
  );

  // ============== FETCH FUNCTIONS ==============

  const fetchResumoData = useCallback(async (parceiroId: string, signal?: AbortSignal): Promise<ParceiroFinanceiroConsolidado> => {
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

    const catalogoIds = [...new Set((bookmakers || []).map((b) => b.bookmaker_catalogo_id).filter(Boolean))];

    const logosMap = new Map<string, string>();
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

    const bookmakerIds = (bookmakers || []).map((b) => b.id);
    const depositosMap = new Map<string, number>();
    const saquesMap = new Map<string, number>();

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

    const apostasMap = new Map<string, number>();
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

    const bookmakersFinanceiro: BookmakerFinanceiro[] = (bookmakers || []).map((bm) => {
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

  const fetchMovimentacoesData = useCallback(async (parceiroId: string, signal?: AbortSignal): Promise<MovimentacoesData> => {
    const { data: contasDoParceiroData } = await supabase
      .from("contas_bancarias")
      .select("id")
      .eq("parceiro_id", parceiroId);

    const { data: walletsDoParceiroData } = await supabase
      .from("wallets_crypto")
      .select("id")
      .eq("parceiro_id", parceiroId);

    if (signal?.aborted) throw new Error("Aborted");

    const contasIds = contasDoParceiroData?.map((c) => c.id) || [];
    const walletsIds = walletsDoParceiroData?.map((w) => w.id) || [];

    const orConditions: string[] = [`origem_parceiro_id.eq.${parceiroId}`, `destino_parceiro_id.eq.${parceiroId}`];

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
  }, []);

  const fetchBookmakersData = useCallback(async (parceiroId: string, signal?: AbortSignal): Promise<BookmakersData> => {
    const { data: vinculadosData, error: vinculadosError } = await supabase
      .from("bookmakers")
      .select("id, nome, saldo_atual, status, moeda, login_username, login_password_encrypted, bookmaker_catalogo_id")
      .eq("parceiro_id", parceiroId);

    if (vinculadosError) throw vinculadosError;
    if (signal?.aborted) throw new Error("Aborted");

    const catalogoIds =
      vinculadosData?.filter((b) => b.bookmaker_catalogo_id).map((b) => b.bookmaker_catalogo_id as string) || [];

    const logosMap = new Map<string, string>();
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

    const vinculadosComLogo =
      vinculadosData?.map((b) => ({
        ...b,
        logo_url: b.bookmaker_catalogo_id ? logosMap.get(b.bookmaker_catalogo_id) : undefined,
      })) || [];

    const { data: catalogoData, error: catalogoError } = await supabase
      .from("bookmakers_catalogo")
      .select("id, nome, logo_url, status")
      .eq("status", "REGULAMENTADA");

    if (catalogoError) throw catalogoError;

    const vinculadosCatalogoIds = new Set(vinculadosData?.map((b) => b.bookmaker_catalogo_id).filter(Boolean) || []);

    const disponiveis = catalogoData?.filter((c) => !vinculadosCatalogoIds.has(c.id)) || [];

    return {
      vinculados: vinculadosComLogo,
      disponiveis,
    };
  }, []);

  // ============== CORE LOAD (per key) ==============

  const load = useCallback(
    async <T,>(
      parceiroId: string,
      tab: TabKey,
      fetchFn: (parceiroId: string, signal?: AbortSignal) => Promise<T>,
      options?: { force?: boolean; params?: Record<string, unknown> }
    ): Promise<T> => {
      const force = options?.force === true;
      const paramsHash = getParamsHash(options?.params);
      const key = makeKey(parceiroId, tab, paramsHash);

      trackKeyForPartner(parceiroId, key);

      const entry = getEntry<T>(key);

      // Cache-first
      if (!force && entry.status === "success" && isFresh(entry.updatedAt)) {
        if (entry.data === undefined) {
          // Never allow "success" without data
          entry.status = "error";
          entry.error = "Cache inválido";
          bumpRender();
        } else {
          return entry.data;
        }
      }

      // Dedup: if already loading, reuse promise
      if (entry.status === "loading" && entry.inFlightPromise) {
        return entry.inFlightPromise;
      }

      const hadData = entry.data !== undefined;
      const shouldSWR = !force && REVALIDATE_STALE && hadData && entry.status === "success" && !isFresh(entry.updatedAt);

      // Cancel previous controller for this key
      if (entry.controller) {
        entry.controller.abort();
      }

      const controller = new AbortController();
      const requestId = entry.requestId + 1;

      entry.status = "loading";
      entry.error = null;
      entry.requestId = requestId;
      entry.controller = controller;

      const promise = (async () => {
        const data = await fetchFn(parceiroId, controller.signal);
        if (data === null || data === undefined) {
          throw new Error("Dados vazios");
        }
        return data;
      })();

      entry.inFlightPromise = promise;

      // If no SWR and no data, UI should show skeleton
      // If SWR (stale exists), UI can show old data + "Atualizando..." (derived below)
      bumpRender();

      try {
        const data = await promise;

        const current = getEntry<T>(key);
        if (current.requestId !== requestId) {
          // Stale response, ignore
          return data;
        }

        current.status = "success";
        current.data = data;
        current.updatedAt = Date.now();
        current.error = null;

        return data;
      } catch (err: any) {
        const current = getEntry<T>(key);

        // Ignore outdated errors
        if (current.requestId !== requestId) {
          throw err;
        }

        if (err?.message === "Aborted" || controller.signal.aborted) {
          // Cancellation: keep previous usable data if exists
          if (current.data !== undefined) {
            current.status = "success";
            current.error = null;
          } else {
            current.status = "idle";
            current.error = null;
          }
          throw err;
        }

        current.status = "error";
        current.error = err?.message || "Erro ao carregar dados";

        throw err;
      } finally {
        const current = getEntry<T>(key);
        if (current.requestId === requestId) {
          current.inFlightPromise = undefined;
          current.controller = undefined;
          // If we were loading without data (no SWR), keep loading state handled by status
          // If SWR, we still keep status="loading" only while promise is pending; reaching finally means done.
          if (current.status === "loading") {
            // Safety: never leave "loading" forever
            if (current.data !== undefined) current.status = "success";
            else if (current.error) current.status = "error";
            else current.status = "idle";
          }
        }
        bumpRender();
      }
    },
    [bumpRender, getEntry, getParamsHash, trackKeyForPartner]
  );

  // ============== SELECT / TAB FLOW ==============

  const loadResumo = useCallback(
    (parceiroId: string, force = false) => {
      void load(parceiroId, "resumo", fetchResumoData, { force });
    },
    [fetchResumoData, load]
  );

  const loadMovimentacoes = useCallback(
    (parceiroId: string, force = false) => {
      void load(parceiroId, "movimentacoes", fetchMovimentacoesData, { force });
    },
    [fetchMovimentacoesData, load]
  );

  const loadBookmakers = useCallback(
    (parceiroId: string, force = false) => {
      void load(parceiroId, "bookmakers", fetchBookmakersData, { force });
    },
    [fetchBookmakersData, load]
  );

  const selectParceiro = useCallback(
    (parceiroId: string | null) => {
      // Cancel in-flight requests of previous partner to avoid wasted work
      if (currentParceiroId && currentParceiroId !== parceiroId) {
        cancelPartner(currentParceiroId);
      }

      setCurrentParceiroId(parceiroId);

      if (!parceiroId) return;

      // IMPORTANT: header depends on Resumo data, so always load Resumo
      loadResumo(parceiroId);

      // Load the active tab too (if different)
      if (activeTab === "movimentacoes") loadMovimentacoes(parceiroId);
      if (activeTab === "bookmakers") loadBookmakers(parceiroId);
    },
    [activeTab, cancelPartner, currentParceiroId, loadBookmakers, loadMovimentacoes, loadResumo]
  );

  const changeTab = useCallback(
    (tab: TabKey) => {
      setActiveTab(tab);

      if (!currentParceiroId) return;

      if (tab === "resumo") loadResumo(currentParceiroId);
      else if (tab === "movimentacoes") loadMovimentacoes(currentParceiroId);
      else loadBookmakers(currentParceiroId);
    },
    [currentParceiroId, loadBookmakers, loadMovimentacoes, loadResumo]
  );

  const invalidateCache = useCallback(
    (parceiroId: string, tabs?: TabKey[]) => {
      const paramsHash = "";
      const targetTabs: TabKey[] = tabs ?? ["resumo", "movimentacoes", "bookmakers"];

      targetTabs.forEach((tab) => {
        const key = makeKey(parceiroId, tab, paramsHash);
        const entry = cacheRef.current.get(key) as CacheEntry<any> | undefined;
        if (entry?.controller) entry.controller.abort();
        cacheRef.current.delete(key);
      });

      bumpRender();

      // If current partner, reload relevant tabs
      if (currentParceiroId === parceiroId) {
        // Always ensure Resumo is present for header
        loadResumo(parceiroId, true);

        if (activeTab === "movimentacoes") loadMovimentacoes(parceiroId, true);
        if (activeTab === "bookmakers") loadBookmakers(parceiroId, true);
      }
    },
    [activeTab, bumpRender, currentParceiroId, loadBookmakers, loadMovimentacoes, loadResumo]
  );

  const invalidateAllCache = useCallback(() => {
    cacheRef.current.keys().forEach((key) => cancelKey(key));
    cacheRef.current.clear();
    keysByPartnerRef.current.clear();
    bumpRender();

    if (!currentParceiroId) return;

    loadResumo(currentParceiroId, true);
    if (activeTab === "movimentacoes") loadMovimentacoes(currentParceiroId, true);
    if (activeTab === "bookmakers") loadBookmakers(currentParceiroId, true);
  }, [activeTab, bumpRender, cancelKey, currentParceiroId, loadBookmakers, loadMovimentacoes, loadResumo]);

  const refreshCurrent = useCallback(() => {
    if (!currentParceiroId) return;

    if (activeTab === "resumo") loadResumo(currentParceiroId, true);
    else if (activeTab === "movimentacoes") loadMovimentacoes(currentParceiroId, true);
    else loadBookmakers(currentParceiroId, true);
  }, [activeTab, currentParceiroId, loadBookmakers, loadMovimentacoes, loadResumo]);

  const invalidateTab = useCallback(
    (tab: TabKey) => {
      if (!currentParceiroId) return;
      invalidateCache(currentParceiroId, [tab]);
    },
    [currentParceiroId, invalidateCache]
  );

  const prefetchTab = useCallback(
    (parceiroId: string, tab: TabKey) => {
      if (tab === "resumo") loadResumo(parceiroId);
      else if (tab === "movimentacoes") loadMovimentacoes(parceiroId);
      else loadBookmakers(parceiroId);
    },
    [loadBookmakers, loadMovimentacoes, loadResumo]
  );

  // ============== DERIVED UI STATE (per tab) ==============

  const derive = useCallback(
    <T,>(parceiroId: string | null, tab: TabKey): { data: T | null; loading: boolean; error: string | null; isRevalidating: boolean } => {
      if (!parceiroId) {
        return { data: null, loading: false, error: null, isRevalidating: false };
      }
      const key = makeKey(parceiroId, tab, "");
      const entry = cacheRef.current.get(key) as CacheEntry<T> | undefined;

      const data = (entry?.data ?? null) as T | null;
      const status = entry?.status ?? "idle";
      const error = status === "error" ? (entry?.error ?? "Erro ao carregar dados") : null;
      const isRevalidating = status === "loading" && data !== null;
      const loading = status === "loading" && data === null;

      return { data, loading, error, isRevalidating };
    },
    []
  );

  const resumo = useMemo(() => derive<ParceiroFinanceiroConsolidado>(currentParceiroId, "resumo"), [currentParceiroId, derive]);
  const movimentacoes = useMemo(() => derive<MovimentacoesData>(currentParceiroId, "movimentacoes"), [currentParceiroId, derive]);
  const bookmakers = useMemo(() => derive<BookmakersData>(currentParceiroId, "bookmakers"), [currentParceiroId, derive]);

  // ============== CLEANUP ==============

  useEffect(() => {
    return () => {
      cacheRef.current.keys().forEach((key) => cancelKey(key));
      cacheRef.current.clear();
      keysByPartnerRef.current.clear();
    };
  }, [cancelKey]);

  return {
    // State
    currentParceiroId,
    activeTab,

    // Data + tab states
    resumoData: resumo.data,
    resumoLoading: resumo.loading,
    resumoError: resumo.error,
    resumoIsRevalidating: resumo.isRevalidating,

    movimentacoesData: movimentacoes.data,
    movimentacoesLoading: movimentacoes.loading,
    movimentacoesError: movimentacoes.error,
    movimentacoesIsRevalidating: movimentacoes.isRevalidating,

    bookmakersData: bookmakers.data,
    bookmakersLoading: bookmakers.loading,
    bookmakersError: bookmakers.error,
    bookmakersIsRevalidating: bookmakers.isRevalidating,

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
