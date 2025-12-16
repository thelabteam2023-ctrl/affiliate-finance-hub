import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookmakerFinanceiro, ParceiroFinanceiroConsolidado } from "./useParceiroFinanceiroConsolidado";

interface CacheEntry {
  data: ParceiroFinanceiroConsolidado;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutos de validade

export function useParceiroFinanceiroCache() {
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const [currentData, setCurrentData] = useState<ParceiroFinanceiroConsolidado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentParceiroIdRef = useRef<string | null>(null);

  const isCacheValid = useCallback((entry: CacheEntry | undefined): boolean => {
    if (!entry) return false;
    return Date.now() - entry.timestamp < CACHE_TTL;
  }, []);

  const fetchDataForParceiro = useCallback(async (parceiroId: string): Promise<ParceiroFinanceiroConsolidado | null> => {
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
        saldo_atual,
        status,
        projeto_id,
        bookmaker_catalogo_id,
        login_username,
        login_password_encrypted
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

    // Buscar transações financeiras (depósitos e saques) por bookmaker
    let depositosMap = new Map<string, number>();
    let saquesMap = new Map<string, number>();

    if (bookmakerIds.length > 0) {
      // Depósitos (destino é o bookmaker)
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

      // Saques (origem é o bookmaker)
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

    // Buscar quantidade de apostas por bookmaker (simples e múltiplas)
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

    // Montar dados por bookmaker
    const bookmakersFinanceiro: BookmakerFinanceiro[] = (bookmakers || []).map(bm => {
      const depositado = depositosMap.get(bm.id) || 0;
      const sacado = saquesMap.get(bm.id) || 0;
      const saldoAtual = Number(bm.saldo_atual) || 0;
      // Lucro = Sacado + Saldo Atual - Depositado
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

    // Calcular totais consolidados
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

  const selectParceiro = useCallback(async (parceiroId: string | null) => {
    // Se é o mesmo parceiro, não faz nada
    if (parceiroId === currentParceiroIdRef.current && currentData) {
      return;
    }

    currentParceiroIdRef.current = parceiroId;

    if (!parceiroId) {
      setCurrentData(null);
      setError(null);
      return;
    }

    // Verificar cache
    const cached = cacheRef.current.get(parceiroId);
    if (isCacheValid(cached)) {
      // Cache hit - atualização instantânea
      setCurrentData(cached!.data);
      setError(null);
      setLoading(false);
      return;
    }

    // Cache miss - buscar do backend
    setLoading(true);
    setError(null);

    try {
      const data = await fetchDataForParceiro(parceiroId);
      
      // Verificar se ainda é o parceiro selecionado (evita race conditions)
      if (currentParceiroIdRef.current !== parceiroId) return;
      
      if (data) {
        // Salvar no cache
        cacheRef.current.set(parceiroId, {
          data,
          timestamp: Date.now(),
        });
        setCurrentData(data);
      }
    } catch (err: any) {
      console.error("Erro ao carregar dados financeiros:", err);
      if (currentParceiroIdRef.current === parceiroId) {
        setError(err.message);
      }
    } finally {
      if (currentParceiroIdRef.current === parceiroId) {
        setLoading(false);
      }
    }
  }, [currentData, isCacheValid, fetchDataForParceiro]);

  // Invalidar cache de um parceiro específico
  const invalidateCache = useCallback((parceiroId: string) => {
    cacheRef.current.delete(parceiroId);
    
    // Se é o parceiro atual, recarregar
    if (currentParceiroIdRef.current === parceiroId) {
      selectParceiro(parceiroId);
    }
  }, [selectParceiro]);

  // Invalidar todo o cache
  const invalidateAllCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  // Forçar refresh do parceiro atual
  const refreshCurrent = useCallback(async () => {
    const parceiroId = currentParceiroIdRef.current;
    if (!parceiroId) return;

    // Remove do cache para forçar reload
    cacheRef.current.delete(parceiroId);
    currentParceiroIdRef.current = null; // Reset para permitir nova busca
    await selectParceiro(parceiroId);
  }, [selectParceiro]);

  return {
    data: currentData,
    loading,
    error,
    selectParceiro,
    invalidateCache,
    invalidateAllCache,
    refreshCurrent,
  };
}
