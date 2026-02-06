// Hook para operações CRUD na tabela apostas_unificada
// Suporte completo a multi-moeda (BRL + USD/USDT)
// REFACTOR: Dual-write para apostas_pernas (tabela normalizada)
// REFACTOR: Liquidação agora usa RPCs atômicos (ledger-based)
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  ApostaUnificadaRow,
  ApostaUnificadaInsert,
  PernaArbitragem,
  CriarArbitragemParams,
  AtualizarArbitragemParams,
  LiquidarArbitragemParams,
  calcularStakeTotalPernas,
  calcularSpread,
  calcularRoiEsperado,
  calcularLucroEsperado,
  calcularLucroReal,
  determinarResultadoArbitragem,
  parsePernaFromJson
} from "@/types/apostasUnificada";
import { getOperationalDateRangeForQuery } from "@/utils/dateUtils";
import { pernasToInserts } from "@/types/apostasPernas";
import { SupportedCurrency } from "@/types/currency";
import { useCurrencySnapshot } from "./useCurrencySnapshot";
import { useWorkspace } from "./useWorkspace";
import { liquidarAposta as liquidarApostaService, reliquidarAposta as reliquidarApostaService } from "@/services/aposta/ApostaService";

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
  const { getSnapshotFields, isForeignCurrency } = useCurrencySnapshot();

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

      const stakeTotal = calcularStakeTotalPernas(params.pernas);
      const spread = calcularSpread(params.pernas);
      const roiEsperado = calcularRoiEsperado(params.pernas);
      const lucroEsperado = calcularLucroEsperado(params.pernas);

      // Determinar moeda da operação baseado nas pernas
      // Para operações multi-moeda, usamos a moeda da primeira perna ou BRL
      const moedaOperacao = params.moeda_operacao || "BRL";
      
      // Criar snapshot de conversão se for moeda estrangeira
      const snapshotFields = getSnapshotFields(stakeTotal, moedaOperacao as SupportedCurrency);

      const insertData: ApostaUnificadaInsert = {
        user_id: user.id,
        workspace_id: workspaceId,
        projeto_id: params.projeto_id,
        forma_registro: "ARBITRAGEM",
        estrategia: params.estrategia,
        contexto_operacional: params.contexto_operacional,
        evento: params.evento,
        esporte: params.esporte,
        mercado: params.mercado,
        modelo: params.modelo,
        pernas: params.pernas as any,
        stake_total: stakeTotal,
        spread_calculado: spread,
        roi_esperado: roiEsperado,
        lucro_esperado: lucroEsperado,
        observacoes: params.observacoes,
        status: "PENDENTE",
        resultado: "PENDENTE",
        data_aposta: new Date().toISOString(),
        // Campos de multi-moeda
        moeda_operacao: snapshotFields.moeda_operacao,
        cotacao_snapshot: snapshotFields.cotacao_snapshot,
        cotacao_snapshot_at: snapshotFields.cotacao_snapshot_at,
        valor_brl_referencia: snapshotFields.valor_brl_referencia,
      };

      const { data, error } = await supabase
        .from("apostas_unificada")
        .insert(insertData)
        .select("id")
        .single();

      if (error) throw error;
      
      // DUAL-WRITE: Inserir pernas na tabela normalizada
      if (data?.id && params.pernas.length > 0) {
        const pernasInsert = pernasToInserts(data.id, params.pernas);
        const { error: pernasError } = await supabase
          .from("apostas_pernas")
          .insert(pernasInsert);
        
        if (pernasError) {
          console.error("[useApostasUnificada] Erro ao inserir pernas normalizadas:", pernasError);
          // Não falhar a operação principal, apenas logar
        }
      }
      
      const isForeign = isForeignCurrency(moedaOperacao);
      toast.success(
        isForeign 
          ? `Operação registrada (${moedaOperacao})!` 
          : "Operação registrada com sucesso!"
      );
      return data.id;
    } catch (error: any) {
      toast.error("Erro ao criar operação: " + error.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [getSnapshotFields, isForeignCurrency]);

  // Atualizar operação existente
  const atualizarArbitragem = useCallback(async (params: AtualizarArbitragemParams): Promise<boolean> => {
    try {
      setLoading(true);

      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (params.evento !== undefined) updateData.evento = params.evento;
      if (params.esporte !== undefined) updateData.esporte = params.esporte;
      if (params.mercado !== undefined) updateData.mercado = params.mercado;
      if (params.observacoes !== undefined) updateData.observacoes = params.observacoes;
      
      if (params.pernas !== undefined) {
        updateData.pernas = params.pernas;
        updateData.stake_total = calcularStakeTotalPernas(params.pernas);
        updateData.spread_calculado = calcularSpread(params.pernas);
        updateData.roi_esperado = calcularRoiEsperado(params.pernas);
        updateData.lucro_esperado = calcularLucroEsperado(params.pernas);
      }

      const { error } = await supabase
        .from("apostas_unificada")
        .update(updateData)
        .eq("id", params.id);

      if (error) throw error;
      
      // DUAL-WRITE: Atualizar pernas na tabela normalizada
      if (params.pernas !== undefined) {
        // Deletar pernas existentes e reinserir
        await supabase
          .from("apostas_pernas")
          .delete()
          .eq("aposta_id", params.id);
        
        if (params.pernas.length > 0) {
          const pernasInsert = pernasToInserts(params.id, params.pernas);
          const { error: pernasError } = await supabase
            .from("apostas_pernas")
            .insert(pernasInsert);
          
          if (pernasError) {
            console.error("[useApostasUnificada] Erro ao atualizar pernas normalizadas:", pernasError);
          }
        }
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
