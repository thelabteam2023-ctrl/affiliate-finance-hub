import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";

/**
 * Hook para calcular o Saldo Operável do projeto.
 * 
 * CONTRATO CANÔNICO (fonte: get_bookmaker_saldos RPC):
 * saldo_operavel = saldo_disponivel + saldo_bonus
 * 
 * Onde:
 * - saldo_disponivel = saldo_real - saldo_em_aposta
 * - saldo_real = bookmakers.saldo_atual
 * - saldo_bonus = SUM(project_bookmaker_link_bonuses.saldo_atual) WHERE status='credited'
 * - saldo_em_aposta = SUM(apostas_unificada.stake) WHERE status='PENDENTE'
 * 
 * IMPORTANTE: Freebet NÃO entra no saldo_operavel (é recurso separado)
 * 
 * Este é o ÚNICO local onde o Saldo Operável global do projeto deve ser calculado.
 */

// Interface matching what the RPC actually returns
interface BookmakerSaldoRPC {
  id: string;
  nome: string;
  login_username: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  moeda: string;
  logo_url: string | null;
  saldo_real: number;
  saldo_freebet: number;
  saldo_bonus: number;
  saldo_em_aposta: number;
  saldo_disponivel: number;
  saldo_operavel: number;
  bonus_rollover_started: boolean;
  estado_conta: string;
  status: string;
}

export function useSaldoOperavel(projetoId: string) {
  const { convertToConsolidation, moedaConsolidacao } = useProjetoCurrency(projetoId);

  // Usa a RPC canônica que já calcula corretamente todos os componentes do saldo
  const { data: bookmakers = [], isLoading, refetch } = useQuery({
    queryKey: ["saldo-operavel-rpc", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_bookmaker_saldos", { p_projeto_id: projetoId });

      if (error) {
        console.error("Erro ao buscar saldos via RPC:", error);
        throw error;
      }
      
      // Map RPC response
      return (data || []).map((row: any): BookmakerSaldoRPC => ({
        id: row.id,
        nome: row.nome,
        login_username: row.login_username,
        parceiro_id: row.parceiro_id,
        parceiro_nome: row.parceiro_nome,
        moeda: row.moeda || "BRL",
        logo_url: row.logo_url,
        saldo_real: Number(row.saldo_real) || 0,
        saldo_freebet: Number(row.saldo_freebet) || 0,
        saldo_bonus: Number(row.saldo_bonus) || 0,
        saldo_em_aposta: Number(row.saldo_em_aposta) || 0,
        saldo_disponivel: Number(row.saldo_disponivel) || 0,
        saldo_operavel: Number(row.saldo_operavel) || 0,
        bonus_rollover_started: Boolean(row.bonus_rollover_started),
        estado_conta: row.estado_conta,
        status: row.status,
      }));
    },
    enabled: !!projetoId,
    staleTime: 10000, // 10 segundos
  });

  // Saldo Operável = soma do saldo_operavel de todas as casas (já calculado pela RPC)
  const totals = useMemo(() => {
    let saldoOperavel = 0;
    let saldoReal = 0;
    let saldoFreebet = 0;
    let saldoBonus = 0;
    let saldoEmAposta = 0;

    bookmakers.forEach((bk) => {
      const moeda = bk.moeda || "BRL";
      
      // Converte cada componente para a moeda de consolidação
      saldoOperavel += convertToConsolidation(bk.saldo_operavel, moeda);
      saldoReal += convertToConsolidation(bk.saldo_real, moeda);
      saldoFreebet += convertToConsolidation(bk.saldo_freebet, moeda);
      saldoBonus += convertToConsolidation(bk.saldo_bonus, moeda);
      saldoEmAposta += convertToConsolidation(bk.saldo_em_aposta, moeda);
    });

    return {
      saldoOperavel,
      saldoReal,
      saldoFreebet,
      saldoBonus,
      saldoEmAposta,
    };
  }, [bookmakers, convertToConsolidation]);

  const totalCasas = bookmakers.length;

  // Lista de casas com saldo > 0 para o tooltip detalhado
  // Ordenadas por maior saldo operável
  const casasComSaldo = useMemo(() => {
    return bookmakers
      .map((bk) => {
        const moeda = bk.moeda || "BRL";
        const saldoConvertido = convertToConsolidation(bk.saldo_operavel, moeda);
        // Extrai apenas o primeiro nome do parceiro para exibição compacta
        const parceiroNome = bk.parceiro_nome || "";
        const primeiroNomeParceiro = parceiroNome.split(/\s+/)[0] || "";
        return {
          id: bk.id,
          nome: bk.nome,
          parceiroNome,
          nomeExibicao: primeiroNomeParceiro, // Primeiro nome do parceiro
          saldoOperavel: saldoConvertido,
          moedaOriginal: moeda,
        };
      })
      .filter((casa) => casa.saldoOperavel > 0)
      .sort((a, b) => b.saldoOperavel - a.saldoOperavel);
  }, [bookmakers, convertToConsolidation]);

  return {
    // Valor principal do KPI
    saldoOperavel: totals.saldoOperavel,
    
    // Componentes para breakdown/tooltip
    saldoReal: totals.saldoReal,
    saldoFreebet: totals.saldoFreebet,
    saldoBonus: totals.saldoBonus,
    saldoEmAposta: totals.saldoEmAposta,
    
    // Detalhamento por casa (para tooltip)
    casasComSaldo,
    
    // Metadata
    totalCasas,
    isLoading,
    moedaConsolidacao,
    
    // Função para refetch manual
    refetch,
  };
}
