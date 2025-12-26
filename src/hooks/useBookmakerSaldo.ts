import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * CONTRATO ÚNICO DE SALDO POR BOOKMAKER
 * 
 * Este hook centraliza TODA a lógica de saldo de bookmakers para garantir
 * consistência absoluta entre todos os formulários de apostas.
 * 
 * Regras obrigatórias:
 * - saldo_real: saldo_atual da tabela bookmakers
 * - saldo_freebet: saldo_freebet da tabela bookmakers
 * - saldo_bonus: soma de bônus creditados (status='credited') da tabela project_bookmaker_link_bonuses
 * - saldo_operavel: saldo_real + saldo_freebet + saldo_bonus
 * 
 * TODOS os formulários DEVEM usar este hook para exibir e validar saldos.
 * Nenhum formulário pode implementar lógica própria de saldo.
 */

export interface BookmakerSaldo {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  logo_url: string | null;
  moeda: string;
  // Saldos padronizados
  saldo_real: number;
  saldo_freebet: number;
  saldo_bonus: number;
  saldo_operavel: number;
}

export interface BookmakerSaldoSelecionado {
  saldo_real: number;
  saldo_freebet: number;
  saldo_bonus: number;
  saldo_operavel: number;
  moeda: string;
}

interface UseBookmakerSaldoOptions {
  projetoId: string;
  statusFilter?: string[];
  minSaldoOperavel?: number;
}

export function useBookmakerSaldo({
  projetoId,
  statusFilter = ["ativo", "ATIVO", "EM_USO"],
  minSaldoOperavel = 0,
}: UseBookmakerSaldoOptions) {
  const [bookmakers, setBookmakers] = useState<BookmakerSaldo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBookmakers = useCallback(async () => {
    if (!projetoId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // 1. Buscar bookmakers do projeto
      const { data: bookmakersData, error: bookmakersError } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          parceiro_id,
          saldo_atual,
          saldo_freebet,
          moeda,
          parceiro:parceiros (nome),
          bookmakers_catalogo (logo_url)
        `)
        .eq("projeto_id", projetoId)
        .in("status", statusFilter);

      if (bookmakersError) throw bookmakersError;
      if (!bookmakersData || bookmakersData.length === 0) {
        setBookmakers([]);
        return;
      }

      // 2. Buscar bônus creditados para todos os bookmakers do projeto
      const bookmakerIds = bookmakersData.map(b => b.id);
      const { data: bonusData, error: bonusError } = await supabase
        .from("project_bookmaker_link_bonuses")
        .select("bookmaker_id, current_balance")
        .eq("project_id", projetoId)
        .eq("status", "credited")
        .in("bookmaker_id", bookmakerIds);

      if (bonusError) {
        console.warn("Erro ao buscar bônus:", bonusError);
      }

      // 3. Agregar bônus por bookmaker (usar current_balance, não bonus_amount)
      const bonusByBookmaker: Record<string, number> = {};
      (bonusData || []).forEach((b: any) => {
        bonusByBookmaker[b.bookmaker_id] = (bonusByBookmaker[b.bookmaker_id] || 0) + (b.current_balance || 0);
      });

      // 4. Montar lista com contrato padronizado
      const enrichedBookmakers: BookmakerSaldo[] = bookmakersData.map((bk: any) => {
        const saldoReal = Number(bk.saldo_atual) || 0;
        const saldoFreebet = Number(bk.saldo_freebet) || 0;
        const saldoBonus = bonusByBookmaker[bk.id] || 0;
        const saldoOperavel = saldoReal + saldoFreebet + saldoBonus;

        return {
          id: bk.id,
          nome: bk.nome,
          parceiro_id: bk.parceiro_id,
          parceiro_nome: bk.parceiro?.nome || null,
          logo_url: bk.bookmakers_catalogo?.logo_url || null,
          moeda: bk.moeda || "BRL",
          saldo_real: saldoReal,
          saldo_freebet: saldoFreebet,
          saldo_bonus: saldoBonus,
          saldo_operavel: saldoOperavel,
        };
      });

      // 5. Filtrar por saldo mínimo se especificado
      const filtered = minSaldoOperavel > 0
        ? enrichedBookmakers.filter(bk => bk.saldo_operavel >= minSaldoOperavel)
        : enrichedBookmakers;

      setBookmakers(filtered);
    } catch (err: any) {
      console.error("Erro ao buscar bookmakers:", err);
      setError(err.message || "Erro ao carregar bookmakers");
    } finally {
      setLoading(false);
    }
  }, [projetoId, statusFilter.join(","), minSaldoOperavel]);

  useEffect(() => {
    fetchBookmakers();
  }, [fetchBookmakers]);

  /**
   * Retorna o saldo de um bookmaker específico pelo ID
   */
  const getSaldoById = useCallback((bookmakerId: string): BookmakerSaldoSelecionado | null => {
    const bk = bookmakers.find(b => b.id === bookmakerId);
    if (!bk) return null;
    
    return {
      saldo_real: bk.saldo_real,
      saldo_freebet: bk.saldo_freebet,
      saldo_bonus: bk.saldo_bonus,
      saldo_operavel: bk.saldo_operavel,
      moeda: bk.moeda,
    };
  }, [bookmakers]);

  /**
   * Valida se uma stake é válida para um bookmaker
   */
  const validarStake = useCallback((bookmakerId: string, stake: number): { valido: boolean; mensagem?: string } => {
    const saldo = getSaldoById(bookmakerId);
    if (!saldo) {
      return { valido: false, mensagem: "Bookmaker não encontrado" };
    }
    if (stake <= 0) {
      return { valido: false, mensagem: "Stake deve ser maior que zero" };
    }
    if (stake > saldo.saldo_operavel) {
      return { 
        valido: false, 
        mensagem: `Stake excede saldo operável (${formatCurrency(saldo.saldo_operavel)})` 
      };
    }
    return { valido: true };
  }, [getSaldoById]);

  /**
   * Formata valor como moeda
   */
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return {
    bookmakers,
    loading,
    error,
    refetch: fetchBookmakers,
    getSaldoById,
    validarStake,
    formatCurrency,
  };
}

/**
 * Hook simplificado para exibição de saldo no select
 * Retorna label formatada com breakdown completo
 */
export function formatBookmakerLabel(bk: BookmakerSaldo, showBreakdown: boolean = true): string {
  const parceiroPrefix = bk.parceiro_nome ? `${getFirstLastName(bk.parceiro_nome)} - ` : "";
  
  if (!showBreakdown) {
    return `${parceiroPrefix}${bk.nome} (${formatCurrencySimple(bk.saldo_operavel)})`;
  }
  
  const parts = [`R$ ${bk.saldo_real.toFixed(2)}`];
  if (bk.saldo_freebet > 0) parts.push(`FB: ${bk.saldo_freebet.toFixed(2)}`);
  if (bk.saldo_bonus > 0) parts.push(`🎁: ${bk.saldo_bonus.toFixed(2)}`);
  
  return `${parceiroPrefix}${bk.nome} (${parts.join(" + ")})`;
}

function getFirstLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function formatCurrencySimple(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
