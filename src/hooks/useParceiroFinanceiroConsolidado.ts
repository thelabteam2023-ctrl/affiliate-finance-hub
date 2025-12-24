import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BookmakerFinanceiro {
  bookmaker_id: string;
  bookmaker_nome: string;
  logo_url: string | null;
  total_depositado: number;
  total_sacado: number;
  lucro_prejuizo: number;
  qtd_apostas: number;
  saldo_atual: number;
  status: string;
  projetos: string[]; // IDs dos projetos onde foi usado
  has_credentials: boolean; // Indica se tem login_username preenchido
  login_username: string | null;
  login_password_encrypted: string | null;
}

export interface ParceiroFinanceiroConsolidado {
  parceiro_id: string;
  parceiro_nome: string;
  total_depositado: number;
  total_sacado: number;
  lucro_prejuizo: number;
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

      // Buscar quantidade de apostas por bookmaker from apostas_unificada
      let apostasMap = new Map<string, number>();

      if (bookmakerIds.length > 0) {
        const { data: apostasData } = await supabase
          .from("apostas_unificada")
          .select("bookmaker_id")
          .in("bookmaker_id", bookmakerIds);

        apostasData?.forEach((a) => {
          if (a.bookmaker_id) {
            const current = apostasMap.get(a.bookmaker_id) || 0;
            apostasMap.set(a.bookmaker_id, current + 1);
          }
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

      setData({
        parceiro_id: parceiroId,
        parceiro_nome: parceiroData.nome,
        total_depositado: totalDepositado,
        total_sacado: totalSacado,
        lucro_prejuizo: lucroTotal,
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
