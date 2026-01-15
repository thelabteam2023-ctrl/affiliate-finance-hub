import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";

/**
 * Hook para calcular o Saldo Operável do projeto.
 * 
 * CONTRATO CANÔNICO (fonte: get_bookmaker_saldos RPC):
 * saldo_operavel = saldo_disponivel + saldo_freebet + saldo_bonus
 * 
 * Onde:
 * - saldo_disponivel = saldo_real - saldo_em_aposta
 * - saldo_real = bookmakers.saldo_atual
 * - saldo_freebet = bookmakers.saldo_freebet
 * - saldo_bonus = SUM(project_bookmaker_link_bonuses.saldo_atual) WHERE status='credited'
 * - saldo_em_aposta = SUM(apostas_unificada.stake) WHERE status='PENDENTE'
 * 
 * Este é o ÚNICO local onde o Saldo Operável global do projeto deve ser calculado.
 */

// Interface matching what the RPC actually returns (order matches RPC definition)
interface BookmakerSaldoRPC {
  bookmaker_id: string;
  nome: string;
  login_username: string;
  parceiro_nome: string | null;
  saldo_atual: number;
  saldo_freebet: number;
  saldo_irrecuperavel: number;
  moeda: string;
  status: string;
  estado_conta: string;
}

// Derived interface with calculated fields
interface BookmakerSaldoCompleto extends BookmakerSaldoRPC {
  id: string;
  saldo_real: number;
  saldo_operavel: number;
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
      
      // Map RPC response to include derived fields
      const rpcData = (data || []) as BookmakerSaldoRPC[];
      return rpcData.map((bk): BookmakerSaldoCompleto => ({
        ...bk,
        id: bk.bookmaker_id,
        saldo_real: bk.saldo_atual,
        // saldo_operavel = saldo_real + saldo_freebet (simplified, without bonus/em_aposta from RPC)
        saldo_operavel: bk.saldo_atual + bk.saldo_freebet,
      }));
    },
    enabled: !!projetoId,
    staleTime: 10000, // 10 segundos
  });

  // Saldo Operável = soma do saldo_operavel de todas as casas
  const totals = useMemo(() => {
    let saldoOperavel = 0;
    let saldoReal = 0;
    let saldoFreebet = 0;

    bookmakers.forEach((bk) => {
      const moeda = bk.moeda || "BRL";
      
      // Converte cada componente para a moeda de consolidação
      saldoOperavel += convertToConsolidation(Number(bk.saldo_operavel) || 0, moeda);
      saldoReal += convertToConsolidation(Number(bk.saldo_real) || 0, moeda);
      saldoFreebet += convertToConsolidation(Number(bk.saldo_freebet) || 0, moeda);
    });

    return {
      saldoOperavel,
      saldoReal,
      saldoFreebet,
    };
  }, [bookmakers, convertToConsolidation]);

  const totalCasas = bookmakers.length;

  // Lista de casas com saldo > 0 para o tooltip detalhado
  // Ordenadas por maior saldo operável, excluindo freebets não utilizadas
  const casasComSaldo = useMemo(() => {
    return bookmakers
      .map((bk) => {
        const moeda = bk.moeda || "BRL";
        // saldo_operavel já inclui real + bonus - em_aposta (exclui freebet não utilizada no saldo exibido)
        const saldoConvertido = convertToConsolidation(Number(bk.saldo_operavel) || 0, moeda);
        // Extrai apenas o primeiro nome do parceiro para exibição compacta
        const parceiroNome = bk.parceiro_nome || "";
        const primeiroNomeParceiro = parceiroNome.split(/\s+/)[0] || "";
        return {
          id: bk.id,
          nome: bk.nome,
          parceiroNome,
          nomeExibicao: primeiroNomeParceiro, // Primeiro nome do parceiro para exibir no tooltip
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
