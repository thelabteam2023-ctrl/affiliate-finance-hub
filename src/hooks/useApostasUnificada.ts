// Hook para operações CRUD na tabela apostas_unificada
// Suporte completo a multi-moeda (BRL + USD/USDT)
// REFACTOR: Dual-write para apostas_pernas (tabela normalizada)
// REFACTOR: Liquidação agora usa RPCs atômicos (ledger-based)
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  ApostaUnificadaRow,
  PernaArbitragem,
  CriarArbitragemParams,
  AtualizarArbitragemParams,
  LiquidarArbitragemParams,
  calcularStakeTotalPernas,
  calcularLucroReal,
  determinarResultadoArbitragem,
  parsePernaFromJson
} from "@/types/apostasUnificada";
import { getOperationalDateRangeForQuery } from "@/utils/dateUtils";
import { SupportedCurrency } from "@/types/currency";
import { useCurrencySnapshot } from "./useCurrencySnapshot";
import { useWorkspace } from "./useWorkspace";
import { liquidarAposta as liquidarApostaService, reliquidarAposta as reliquidarApostaService } from "@/services/aposta/ApostaService";
import { useCotacoes } from "./useCotacoes";
import { resolveEffectiveProjectRate } from "./useProjetoWorkingRates";

export interface UseApostasUnificadaReturn {
  loading: boolean;
  // Buscar operações
  fetchArbitragens: (projetoId: string, dateRange?: { start: Date; end: Date }) => Promise<ApostaUnificadaRow[]>;
  fetchArbitragemById: (id: string) => Promise<ApostaUnificadaRow | null>;
  // CRUD
  criarArbitragem: (params: CriarArbitragemParams) => Promise<string | null>;
  atualizarArbitragem: (params: AtualizarArbitragemParams) => Promise<boolean>;
  deletarArbitragem: (id: string) => Promise<boolean>;
  // Liquidação
  liquidarArbitragem: (params: LiquidarArbitragemParams) => Promise<boolean>;
  reverterLiquidacao: (id: string) => Promise<boolean>;
}

export function useApostasUnificada(): UseApostasUnificadaReturn {
  const [loading, setLoading] = useState(false);
  const { workspaceId } = useWorkspace();
  const { getSnapshotFields } = useCurrencySnapshot();
  const { getRate } = useCotacoes();

  // Buscar operações de arbitragem de um projeto
  const fetchArbitragens = useCallback(async (
    projetoId: string, 
    dateRange?: { start: Date; end: Date }
  ): Promise<ApostaUnificadaRow[]> => {
    try {
      setLoading(true);
      
      let query = supabase
        .from("apostas_unificada")
        .select("*")
        .eq("projeto_id", projetoId)
        .eq("forma_registro", "ARBITRAGEM")
        .order("data_aposta", { ascending: false });
      
      if (dateRange) {
        // CRÍTICO: Usar getOperationalDateRangeForQuery para garantir timezone operacional (São Paulo)
        const { startUTC, endUTC } = getOperationalDateRangeForQuery(dateRange.start, dateRange.end);
        query = query.gte("data_aposta", startUTC);
        query = query.lte("data_aposta", endUTC);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error("Erro ao buscar arbitragens:", error.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Buscar uma operação específica por ID
  const fetchArbitragemById = useCallback(async (id: string): Promise<ApostaUnificadaRow | null> => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from("apostas_unificada")
        .select("*")
        .eq("id", id)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error("Erro ao buscar arbitragem:", error.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Criar nova operação de arbitragem
  // Suporte multi-moeda: calcula snapshot de conversão para operações em moeda estrangeira
  const criarArbitragem = useCallback(async (params: CriarArbitragemParams): Promise<string | null> => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return null;
      }

      if (!workspaceId) {
        toast.error("Workspace não disponível nesta aba");
        return null;
      }

      const { data: workingRates } = await supabase
        .from("projetos")
        .select("fonte_cotacao, cotacao_trabalho, cotacao_trabalho_eur, cotacao_trabalho_gbp, cotacao_trabalho_myr, cotacao_trabalho_mxn, cotacao_trabalho_ars, cotacao_trabalho_cop")
        .eq("id", params.projeto_id)
        .maybeSingle();
      
      // Arbitragem real sempre nasce pelo motor atômico. A estratégia continua
      // sendo decisão operacional editável quando a origem é Todas Apostas.
      // O contexto operacional preserva a aba de origem (ex: BONUS/FREEBET).
      const pernasComSnapshot = params.pernas.map((perna) => {
        const pernaMoeda = (perna.moeda || "BRL") as SupportedCurrency;
        const pernaRate = resolveEffectiveProjectRate(pernaMoeda, workingRates, getRate);
        const pernaSnapshot = getSnapshotFields(perna.stake || 0, pernaMoeda, pernaRate.rate);
        return {
          ...perna,
          moeda: pernaMoeda,
          stake_brl_referencia: pernaSnapshot.valor_brl_referencia,
          cotacao_snapshot: pernaSnapshot.cotacao_snapshot,
          cotacao_snapshot_at: pernaSnapshot.cotacao_snapshot_at,
        };
      });

      const { data, error } = await supabase.rpc('criar_surebet_atomica', {
        p_workspace_id: workspaceId,
        p_user_id: user.id,
        p_projeto_id: params.projeto_id,
        p_evento: params.evento,
        p_esporte: params.esporte || null,
        p_mercado: params.mercado || null,
        p_modelo: params.modelo || null,
        p_estrategia: params.estrategia || 'SUREBET',
        p_contexto_operacional: params.contexto_operacional || 'NORMAL',
        p_data_aposta: new Date().toISOString(),
        p_pernas: pernasComSnapshot as any,
      });

      if (error) throw error;
      const result = data?.[0];
      if (!result?.success || !result.aposta_id) {
        throw new Error(result?.message || 'Falha ao criar arbitragem');
      }
      
      toast.success("Operação registrada com sucesso!");
      return result.aposta_id;
    } catch (error: any) {
      toast.error("Erro ao criar operação: " + error.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [getSnapshotFields, getRate, workspaceId]);

  // Atualizar operação existente
  const atualizarArbitragem = useCallback(async (params: AtualizarArbitragemParams): Promise<boolean> => {
    try {
      setLoading(true);

      const { data: apostaAtual, error: fetchError } = await supabase
        .from("apostas_unificada")
        .select("modelo, estrategia, contexto_operacional, data_aposta")
        .eq("id", params.id)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!apostaAtual) throw new Error("Arbitragem não encontrada");

      const { data: pernasAtuais, error: pernasFetchError } = await supabase
        .from("apostas_pernas")
        .select("id, bookmaker_id, stake, odd, moeda, selecao, selecao_livre, ordem, fonte_saldo, cotacao_snapshot, stake_brl_referencia")
        .eq("aposta_id", params.id)
        .order("ordem", { ascending: true });

      if (pernasFetchError) throw pernasFetchError;
      
      const sourcePernas = params.pernas || (pernasAtuais || []);
      const pernasParaRpc = sourcePernas.map((perna: any, index: number) => ({
        id: perna.id || pernasAtuais?.[index]?.id || null,
        bookmaker_id: perna.bookmaker_id,
        stake: perna.stake,
        odd: perna.odd,
        moeda: perna.moeda || "BRL",
        selecao: perna.selecao,
        selecao_livre: perna.selecao_livre || null,
        cotacao_snapshot: perna.cotacao_snapshot,
        stake_brl_referencia: perna.stake_brl_referencia,
        fonte_saldo: perna.fonte_saldo || "REAL",
      }));

      const { data: rpcResult, error } = await supabase.rpc('editar_surebet_completa_v1', {
        p_aposta_id: params.id,
        p_pernas: pernasParaRpc as any,
        p_evento: params.evento ?? null,
        p_esporte: params.esporte ?? null,
        p_mercado: params.mercado ?? null,
        p_modelo: apostaAtual.modelo,
        p_estrategia: apostaAtual.estrategia,
        p_contexto: apostaAtual.contexto_operacional,
        p_data_aposta: apostaAtual.data_aposta,
        p_stake_total: null,
        p_stake_consolidado: null,
        p_lucro_esperado: null,
        p_roi_esperado: null,
        p_lucro_prejuizo: null,
        p_roi_real: null,
        p_status: null,
        p_resultado: null,
      });

      if (error) throw error;
      const result = rpcResult as any;
      if (result && !result.success) {
        throw new Error(result.error || 'Falha ao atualizar arbitragem');
      }
      
      toast.success("Operação atualizada!");
      return true;
    } catch (error: any) {
      toast.error("Erro ao atualizar: " + error.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  // Deletar operação
  // REFACTOR: Agora usa RPC atômica para reversão financeira antes de deletar
  const deletarArbitragem = useCallback(async (id: string): Promise<boolean> => {
    try {
      setLoading(true);

      // Buscar a operação para verificar se precisa reverter saldos
      const { data: operacao } = await supabase
        .from("apostas_unificada")
        .select("pernas, status, projeto_id, resultado")
        .eq("id", id)
        .single();

      if (operacao && operacao.status === "LIQUIDADA" && operacao.resultado !== "PENDENTE") {
        // Usar RPC atômica para reverter impacto financeiro via ledger
        const result = await reliquidarApostaService(id, 'VOID', 0);
        
        if (!result.success) {
          console.error("[useApostasUnificada] Erro ao reverter antes de deletar:", result.error);
          // Continuar com delete mesmo se reversão falhar (mas logar o erro)
        }
      }

      const { error } = await supabase
        .from("apostas_unificada")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      toast.success("Operação excluída!");
      return true;
    } catch (error: any) {
      console.error("[useApostasUnificada] Erro ao excluir:", error);
      toast.error("Erro ao excluir: " + error.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Liquidar operação (resolver resultados)
  // REFACTOR: Agora usa RPC atômica via ApostaService (ledger-based)
  const liquidarArbitragem = useCallback(async (params: LiquidarArbitragemParams): Promise<boolean> => {
    try {
      setLoading(true);

      // Buscar operação atual para calcular resultado geral
      const { data: operacao, error: fetchError } = await supabase
        .from("apostas_unificada")
        .select("*")
        .eq("id", params.id)
        .single();

      if (fetchError || !operacao) {
        throw new Error("Operação não encontrada");
      }

      const pernasAtuais = parsePernaFromJson(operacao.pernas);
      
      // Atualizar resultados das pernas localmente para calcular resultado geral
      for (const update of params.pernas) {
        if (update.index >= 0 && update.index < pernasAtuais.length) {
          pernasAtuais[update.index].resultado = update.resultado;
          if (update.lucro_prejuizo !== undefined) {
            pernasAtuais[update.index].lucro_prejuizo = update.lucro_prejuizo;
          }
        }
      }

      // Calcular resultado geral e lucro
      const resultadoGeral = determinarResultadoArbitragem(pernasAtuais);
      const lucroReal = calcularLucroReal(pernasAtuais);

      // Determinar se todas as pernas estão liquidadas
      const todasLiquidadas = pernasAtuais.every(p => 
        p.resultado && p.resultado !== "PENDENTE"
      );

      // Só chamar RPC atômica se todas liquidadas (impacto financeiro)
      if (todasLiquidadas) {
        // Preparar resultados por perna para o RPC
        const resultadosPernas = params.pernas.map((update) => ({
          ordem: update.index,
          resultado: update.resultado,
          lucro_prejuizo: update.lucro_prejuizo ?? 0,
        }));

        // Mapear resultado geral para tipo esperado pelo RPC
        const resultadoMapped = resultadoGeral === 'PENDENTE' ? 'VOID' : resultadoGeral;

        // Usar ApostaService.liquidarAposta (RPC atômica com ledger)
        const result = await liquidarApostaService({
          id: params.id,
          resultado: resultadoMapped as 'GREEN' | 'RED' | 'MEIO_GREEN' | 'MEIO_RED' | 'VOID',
          lucro_prejuizo: lucroReal,
          resultados_pernas: resultadosPernas,
        });

        if (!result.success) {
          throw new Error(result.error?.message || "Erro ao liquidar via RPC");
        }
      } else {
        // Liquidação parcial - apenas atualizar dados sem impacto financeiro
        const stakeTotal = calcularStakeTotalPernas(pernasAtuais);
        const roiReal = stakeTotal && stakeTotal > 0 ? (lucroReal / stakeTotal) * 100 : 0;

        const { error: updateError } = await supabase
          .from("apostas_unificada")
          .update({
            pernas: pernasAtuais as any,
            status: "PENDENTE",
            resultado: resultadoGeral,
            lucro_prejuizo: lucroReal,
            roi_real: roiReal,
            updated_at: new Date().toISOString()
          })
          .eq("id", params.id);

        if (updateError) throw updateError;

        // DUAL-WRITE: Atualizar pernas na tabela normalizada
        for (const update of params.pernas) {
          if (update.index >= 0 && update.index < pernasAtuais.length) {
            await supabase
              .from("apostas_pernas")
              .update({
                resultado: update.resultado,
                lucro_prejuizo: update.lucro_prejuizo ?? null,
              })
              .eq("aposta_id", params.id)
              .eq("ordem", update.index);
          }
        }
      }

      toast.success("Operação liquidada!");
      return true;
    } catch (error: any) {
      console.error("[useApostasUnificada] Erro ao liquidar:", error);
      toast.error("Erro ao liquidar: " + error.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Reverter liquidação
  // REFACTOR: Agora usa RPC atômica via ApostaService (ledger-based)
  const reverterLiquidacao = useCallback(async (id: string): Promise<boolean> => {
    try {
      setLoading(true);

      const { data: operacao, error: fetchError } = await supabase
        .from("apostas_unificada")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !operacao) {
        throw new Error("Operação não encontrada");
      }

      // Verificar se está liquidada
      if (operacao.status !== "LIQUIDADA") {
        // Se não está liquidada, apenas resetar campos sem impacto financeiro
        const pernas = parsePernaFromJson(operacao.pernas);
        const pernasResetadas = pernas.map(p => ({
          ...p,
          resultado: null,
          lucro_prejuizo: null
        }));

        const { error: updateError } = await supabase
          .from("apostas_unificada")
          .update({
            pernas: pernasResetadas as any,
            status: "PENDENTE",
            resultado: "PENDENTE",
            lucro_prejuizo: null,
            roi_real: null,
            updated_at: new Date().toISOString()
          })
          .eq("id", id);

        if (updateError) throw updateError;
      } else {
        // Usar RPC reliquidar para reverter com impacto no ledger
        // Reliquidar para VOID efetivamente reverte o impacto financeiro
        const result = await reliquidarApostaService(id, 'VOID', 0);

        if (!result.success) {
          throw new Error(result.error?.message || "Erro ao reverter via RPC");
        }

        // Agora resetar para PENDENTE (após reversão financeira)
        const pernas = parsePernaFromJson(operacao.pernas);
        const pernasResetadas = pernas.map(p => ({
          ...p,
          resultado: null,
          lucro_prejuizo: null
        }));

        const { error: updateError } = await supabase
          .from("apostas_unificada")
          .update({
            pernas: pernasResetadas as any,
            status: "PENDENTE",
            resultado: "PENDENTE",
            lucro_prejuizo: null,
            roi_real: null,
            updated_at: new Date().toISOString()
          })
          .eq("id", id);

        if (updateError) throw updateError;
      }

      // DUAL-WRITE: Resetar pernas na tabela normalizada
      const { error: pernasResetError } = await supabase
        .from("apostas_pernas")
        .update({
          resultado: null,
          lucro_prejuizo: null,
        })
        .eq("aposta_id", id);
      
      if (pernasResetError) {
        console.error("[useApostasUnificada] Erro ao resetar pernas normalizadas:", pernasResetError);
      }

      toast.success("Liquidação revertida!");
      return true;
    } catch (error: any) {
      console.error("[useApostasUnificada] Erro ao reverter:", error);
      toast.error("Erro ao reverter: " + error.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    fetchArbitragens,
    fetchArbitragemById,
    criarArbitragem,
    atualizarArbitragem,
    deletarArbitragem,
    liquidarArbitragem,
    reverterLiquidacao
  };
}

// Helper interno para calcular impacto financeiro de um resultado
// NOTA: Usado apenas para cálculos locais - impacto real é via ledger
function calcularImpactoResultado(stake: number, odd: number, resultado: string): number {
  switch (resultado) {
    case 'GREEN':
      return stake * (odd - 1);
    case 'RED':
      return -stake;
    case 'MEIO_GREEN':
      return (stake * (odd - 1)) / 2;
    case 'MEIO_RED':
      return -stake / 2;
    case 'VOID':
    default:
      return 0;
  }
}

// DEPRECATED: Funções abaixo foram substituídas por RPCs atômicos
// Mantidas apenas para documentação - não são mais chamadas
// Ver: ApostaService.liquidarAposta() e ApostaService.reliquidarAposta()
