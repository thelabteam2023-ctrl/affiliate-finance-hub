import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useCentralAlertsCount() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        // Fetch all alert sources in parallel
        const [
          alertasResult,
          entregasResult,
          saquesPendentesResult,
          parceriasResult,
          movimentacoesResult,
          alertasLucroResult,
          pagamentosOperadorResult,
          participacoesResult,
          encerResult,
          todosParceirosResult,
          todasParceriasResult,
          custosResult,
          acordosResult,
          comissoesResult,
          indicacoesResult,
        ] = await Promise.all([
          // Alertas do painel operacional
          supabase.from("v_painel_operacional").select("entidade_id", { count: "exact", head: true }),
          // Entregas pendentes
          supabase.from("v_entregas_pendentes").select("id", { count: "exact", head: true }).in("status_conciliacao", ["PRONTA"]),
          // Saques pendentes
          supabase.from("cash_ledger").select("id", { count: "exact", head: true }).eq("tipo_transacao", "SAQUE").eq("status", "PENDENTE"),
          // Parcerias para pagamentos
          supabase
            .from("parcerias")
            .select("id")
            .in("status", ["ATIVA", "EM_ENCERRAMENTO"])
            .or("custo_aquisicao_isento.is.null,custo_aquisicao_isento.eq.false")
            .gt("valor_parceiro", 0),
          // Movimentações para filtrar pagamentos já feitos
          supabase
            .from("movimentacoes_indicacao")
            .select("parceria_id, tipo, status, indicador_id"),
          // Alertas de lucro
          supabase.from("parceiro_lucro_alertas").select("id", { count: "exact", head: true }).eq("notificado", false),
          // Pagamentos de operador pendentes
          supabase.from("pagamentos_operador").select("id", { count: "exact", head: true }).eq("status", "PENDENTE"),
          // Participações pendentes
          supabase.from("participacao_ciclos").select("id", { count: "exact", head: true }).eq("status", "A_PAGAR"),
          // Parcerias próximas do encerramento
          supabase
            .from("parcerias")
            .select("id, data_fim_prevista")
            .in("status", ["ATIVA", "EM_ENCERRAMENTO"])
            .not("data_fim_prevista", "is", null),
          // Parceiros sem parceria
          supabase.from("parceiros").select("id").eq("status", "ativo"),
          // Todas as parcerias ativas (para filtrar parceiros sem parceria)
          supabase.from("parcerias").select("parceiro_id").in("status", ["ATIVA", "EM_ENCERRAMENTO"]),
          // Custos para bonus
          supabase.from("v_custos_aquisicao").select("indicador_id"),
          // Acordos ativos
          supabase.from("indicador_acordos").select("indicador_id, meta_parceiros, valor_bonus").eq("ativo", true),
          // Comissões pendentes
          supabase
            .from("parcerias")
            .select("id, parceiro_id")
            .eq("comissao_paga", false)
            .not("valor_comissao_indicador", "is", null)
            .gt("valor_comissao_indicador", 0),
          // Indicações para mapping
          supabase.from("indicacoes").select("parceiro_id, indicador_id"),
        ]);

        let totalCount = 0;

        // Count from v_painel_operacional
        if (alertasResult.count) totalCount += alertasResult.count;

        // Count entregas pendentes
        if (entregasResult.count) totalCount += entregasResult.count;

        // Count saques pendentes
        if (saquesPendentesResult.count) totalCount += saquesPendentesResult.count;

        // Count alertas de lucro
        if (alertasLucroResult.count) totalCount += alertasLucroResult.count;

        // Count pagamentos operador pendentes
        if (pagamentosOperadorResult.count) totalCount += pagamentosOperadorResult.count;

        // Count participações pendentes
        if (participacoesResult.count) totalCount += participacoesResult.count;

        // Count pagamentos pendentes a parceiros (excluding already paid)
        if (parceriasResult.data && movimentacoesResult.data) {
          const parceriasPagas = (movimentacoesResult.data || [])
            .filter((m: any) => m.tipo === "PAGTO_PARCEIRO" && m.status === "CONFIRMADO")
            .map((m: any) => m.parceria_id);
          
          const pagamentosPendentes = (parceriasResult.data || [])
            .filter((p: any) => !parceriasPagas.includes(p.id)).length;
          totalCount += pagamentosPendentes;
        }

        // Count parcerias próximas do encerramento (≤ 7 dias)
        if (encerResult.data) {
          const alertasEncer = (encerResult.data || []).filter((p: any) => {
            const dataFim = new Date(p.data_fim_prevista);
            dataFim.setHours(0, 0, 0, 0);
            const diasRestantes = Math.ceil((dataFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
            return diasRestantes >= 0 && diasRestantes <= 7;
          }).length;
          totalCount += alertasEncer;
        }

        // Count parceiros sem parceria
        if (todosParceirosResult.data && todasParceriasResult.data) {
          const parceirosComParceria = new Set((todasParceriasResult.data || []).map((p: any) => p.parceiro_id));
          const parceirosSemParceria = (todosParceirosResult.data || [])
            .filter((p: any) => !parceirosComParceria.has(p.id)).length;
          totalCount += parceirosSemParceria;
        }

        // Count bonus pendentes
        if (custosResult.data && acordosResult.data && movimentacoesResult.data) {
          const indicadorQtd: Record<string, number> = {};
          custosResult.data.forEach((c: any) => {
            if (c.indicador_id) {
              indicadorQtd[c.indicador_id] = (indicadorQtd[c.indicador_id] || 0) + 1;
            }
          });

          const bonusPagosPorIndicador: Record<string, number> = {};
          (movimentacoesResult.data || [])
            .filter((m: any) => m.tipo === "BONUS_INDICADOR" && m.status === "CONFIRMADO")
            .forEach((m: any) => {
              if (m.indicador_id) {
                bonusPagosPorIndicador[m.indicador_id] = (bonusPagosPorIndicador[m.indicador_id] || 0) + 1;
              }
            });

          (acordosResult.data || []).forEach((acordo: any) => {
            const qtd = indicadorQtd[acordo.indicador_id] || 0;
            if (acordo.meta_parceiros && acordo.meta_parceiros > 0) {
              const ciclosCompletos = Math.floor(qtd / acordo.meta_parceiros);
              const bonusJaPagos = bonusPagosPorIndicador[acordo.indicador_id] || 0;
              const ciclosPendentes = ciclosCompletos - bonusJaPagos;
              if (ciclosPendentes > 0) totalCount += 1;
            }
          });
        }

        // Count comissões pendentes
        if (comissoesResult.data && indicacoesResult.data) {
          const parceiroIndicadorMap: Record<string, boolean> = {};
          indicacoesResult.data.forEach((ind: any) => {
            if (ind.parceiro_id && ind.indicador_id) {
              parceiroIndicadorMap[ind.parceiro_id] = true;
            }
          });

          const comissoesPendentes = (comissoesResult.data || [])
            .filter((p: any) => p.parceiro_id && parceiroIndicadorMap[p.parceiro_id]).length;
          totalCount += comissoesPendentes;
        }

        setCount(totalCount);
      } catch (error) {
        console.error("Error fetching central alerts count:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCount();

    // Refresh every 60 seconds
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, []);

  return { count, loading };
}
