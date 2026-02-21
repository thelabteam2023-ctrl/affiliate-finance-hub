import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";

/**
 * Hook para calcular o Saldo Operável do projeto.
 * 
 * CONTRATO CANÔNICO (fonte: get_bookmaker_saldos RPC):
 * saldo_operavel = saldo_disponivel + saldo_freebet
 * 
 * Onde:
 * - saldo_disponivel = saldo_real - saldo_em_aposta
 * - saldo_real = bookmakers.saldo_atual (JÁ INCLUI o valor do bônus creditado via financial_events)
 * - saldo_freebet = bookmakers.saldo_freebet
 * - saldo_bonus = APENAS para DISPLAY (retornado pela RPC, mas NÃO somado no saldo_operavel)
 * - saldo_em_aposta = SUM de stakes pendentes
 * 
 * REGRA FUNDAMENTAL:
 * - O bônus creditado já está incluído em saldo_real (via financial_events quando creditado)
 * - saldo_bonus é retornado apenas para informação/breakdown na UI
 * - Apostas pendentes BLOQUEIAM capital
 * - Este é o ÚNICO local onde o Saldo Operável global do projeto deve ser calculado.
 */

interface BookmakerSaldoCompleto {
  id: string;
  nome: string;
  moeda: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  parceiro_primeiro_nome: string | null;
  logo_url: string | null;
  instance_identifier: string | null;
  saldo_real: number;
  saldo_freebet: number;
  saldo_bonus: number;
  saldo_em_aposta: number;
  saldo_disponivel: number;
  saldo_operavel: number;
  bonus_rollover_started: boolean;
}

interface RolloverPorCasa {
  progress: number;
  target: number;
  percentual: number;
}

export function useSaldoOperavel(projetoId: string) {
  const { convertToConsolidation, moedaConsolidacao, cotacaoAtual } = useProjetoCurrency(projetoId);

  // Usa a RPC canônica que já calcula corretamente todos os componentes do saldo
  // CRITICAL FIX: Increased staleTime to prevent frequent refetches triggered by rate changes
  const { data: bookmakers = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["saldo-operavel-rpc", projetoId],
    queryFn: async () => {
      console.log("[useSaldoOperavel] Chamando RPC get_bookmaker_saldos para projeto:", projetoId);
      
      const { data, error } = await supabase
        .rpc("get_bookmaker_saldos", { p_projeto_id: projetoId });

      if (error) {
        console.error("[useSaldoOperavel] ERRO CRÍTICO na RPC get_bookmaker_saldos:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          projetoId
        });
        throw error;
      }
      
      console.log("[useSaldoOperavel] RPC retornou", data?.length || 0, "casas");
      return (data || []) as BookmakerSaldoCompleto[];
    },
    enabled: !!projetoId,
    staleTime: 5000, // 5 segundos - permite reatividade após invalidação
    gcTime: 60 * 1000, // 1 minuto cache
    retry: 2,
    refetchOnWindowFocus: false,
  });

  // Query separada para rollover por casa (individual)
  const { data: rolloverData } = useQuery({
    queryKey: ["rollover-por-casa", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_bookmaker_link_bonuses")
        .select("rollover_progress, rollover_target_amount, bookmaker_id, saldo_atual")
        .eq("project_id", projetoId)
        .eq("status", "credited");

      if (error) {
        console.error("[useSaldoOperavel] Erro ao buscar rollover:", error);
        return null;
      }

      return data || [];
    },
    enabled: !!projetoId,
    staleTime: 10000,
  });

  // Saldo Operável = soma do saldo_operavel de todas as casas (já inclui real + freebet + bonus - em_aposta)
  // CRITICAL FIX: Depend on cotacaoAtual (primitive) instead of convertToConsolidation (function reference)
  // This prevents infinite re-renders when the function reference changes due to rate updates
  const totals = useMemo(() => {
    let saldoOperavel = 0;
    let saldoReal = 0;
    let saldoBonus = 0;
    let saldoFreebet = 0;
    let saldoEmAposta = 0;

    bookmakers.forEach((bk) => {
      const moeda = bk.moeda || "BRL";
      
      // Converte cada componente para a moeda de consolidação
      saldoOperavel += convertToConsolidation(Number(bk.saldo_operavel) || 0, moeda);
      saldoReal += convertToConsolidation(Number(bk.saldo_real) || 0, moeda);
      saldoBonus += convertToConsolidation(Number(bk.saldo_bonus) || 0, moeda);
      saldoFreebet += convertToConsolidation(Number(bk.saldo_freebet) || 0, moeda);
      saldoEmAposta += convertToConsolidation(Number(bk.saldo_em_aposta) || 0, moeda);
    });

    return {
      saldoOperavel,
      saldoReal,
      saldoBonus,
      saldoFreebet,
      saldoEmAposta,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmakers, moedaConsolidacao, cotacaoAtual]); // Primitive deps instead of function reference

  // Mapear rollover por bookmaker_id
  const rolloverPorCasa = useMemo(() => {
    const map = new Map<string, { progress: number; target: number; percentual: number }>();
    
    if (!rolloverData) return map;

    rolloverData.forEach((bonus) => {
      const bookmarkerId = bonus.bookmaker_id;
      if (!bookmarkerId) return;

      const progress = Number(bonus.rollover_progress) || 0;
      const target = Number(bonus.rollover_target_amount) || 0;
      
      if (target > 0) {
        const existing = map.get(bookmarkerId);
        if (existing) {
          // Somar se houver múltiplos bônus na mesma casa
          existing.progress += progress;
          existing.target += target;
          existing.percentual = Math.min(100, (existing.progress / existing.target) * 100);
        } else {
          map.set(bookmarkerId, {
            progress,
            target,
            percentual: Math.min(100, (progress / target) * 100),
          });
        }
      }
    });

    return map;
  }, [rolloverData]);

  const totalCasas = bookmakers.length;

  // Lista de casas com saldo > 0 para o tooltip detalhado
  // Ordenadas por maior saldo operável
  const casasComSaldo = useMemo(() => {
    return bookmakers
      .map((bk) => {
        const moeda = bk.moeda || "BRL";
        // Converter todos os componentes para moeda de consolidação
        const saldoOperavel = convertToConsolidation(Number(bk.saldo_operavel) || 0, moeda);
        const saldoReal = convertToConsolidation(Number(bk.saldo_real) || 0, moeda);
        const saldoDisponivel = convertToConsolidation(Number(bk.saldo_disponivel) || 0, moeda);
        const saldoEmAposta = convertToConsolidation(Number(bk.saldo_em_aposta) || 0, moeda);
        const saldoFreebet = convertToConsolidation(Number(bk.saldo_freebet) || 0, moeda);
        const saldoBonus = convertToConsolidation(Number(bk.saldo_bonus) || 0, moeda);
        
        // Valores nativos (sem conversão) para exibição na lista "Saldo por Casa"
        const saldoRealNativo = Number(bk.saldo_real) || 0;
        const saldoFreebetNativo = Number(bk.saldo_freebet) || 0;
        const saldoEmApostaNativo = Number(bk.saldo_em_aposta) || 0;
        
        // Rollover individual desta casa
        const rolloverInfo = rolloverPorCasa.get(bk.id);
        
        return {
          id: bk.id,
          nome: bk.nome,
          instanceIdentifier: bk.instance_identifier || null,
          parceiroPrimeiroNome: bk.parceiro_primeiro_nome || "",
          parceiroNome: bk.parceiro_nome || "",
          saldoOperavel,
          saldoReal,
          saldoDisponivel,
          saldoEmAposta,
          saldoFreebet,
          saldoBonus,
          moedaOriginal: moeda,
          logoUrl: bk.logo_url,
          // Valores nativos para exibição por casa
          saldoRealNativo,
          saldoFreebetNativo,
          saldoEmApostaNativo,
          // Rollover individual
          hasRollover: !!rolloverInfo,
          rolloverProgress: rolloverInfo?.progress || 0,
          rolloverTarget: rolloverInfo?.target || 0,
          rolloverPercentual: rolloverInfo?.percentual || 0,
        };
      })
      .filter((casa) => casa.saldoOperavel > 0 || casa.saldoEmAposta > 0)
      .sort((a, b) => b.saldoOperavel - a.saldoOperavel);
  }, [bookmakers, convertToConsolidation, rolloverPorCasa]);

  return {
    // Valor principal do KPI
    saldoOperavel: totals.saldoOperavel,
    
    // Componentes para breakdown/tooltip
    saldoReal: totals.saldoReal,
    saldoBonus: totals.saldoBonus,
    saldoFreebet: totals.saldoFreebet,
    saldoEmAposta: totals.saldoEmAposta,
    
    // Detalhamento por casa (para tooltip) - inclui rollover individual
    casasComSaldo,
    
    // Metadata
    totalCasas,
    isLoading,
    isError,
    error,
    moedaConsolidacao,
    
    // Função para refetch manual
    refetch,
  };
}
