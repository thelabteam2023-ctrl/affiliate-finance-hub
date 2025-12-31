// Hook para operações CRUD na tabela apostas_unificada
// Suporte completo a multi-moeda (BRL + USD/USDT)
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
import { SupportedCurrency } from "@/types/currency";
import { useCurrencySnapshot } from "./useCurrencySnapshot";
import { updateBookmakerBalance, calcularImpactoResultado } from "@/lib/bookmakerBalanceHelper";

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
        query = query.gte("data_aposta", dateRange.start.toISOString());
        query = query.lte("data_aposta", dateRange.end.toISOString());
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

      // Buscar workspace_id do usuário
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!workspaceMember?.workspace_id) {
        toast.error("Workspace não encontrado");
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
        workspace_id: workspaceMember.workspace_id,
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
      
      toast.success("Operação atualizada!");
      return true;
    } catch (error: any) {
      toast.error("Erro ao atualizar: " + error.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Deletar operação
  const deletarArbitragem = useCallback(async (id: string): Promise<boolean> => {
    try {
      setLoading(true);

      // Buscar a operação para verificar se precisa reverter saldos
      const { data: operacao } = await supabase
        .from("apostas_unificada")
        .select("pernas, status")
        .eq("id", id)
        .single();

      if (operacao && operacao.status === "LIQUIDADA" && operacao.pernas) {
        // Reverter saldos das bookmakers
        const pernas = parsePernaFromJson(operacao.pernas);
        for (const perna of pernas) {
          if (perna.resultado && perna.resultado !== "PENDENTE") {
            await reverterSaldoBookmaker(perna.bookmaker_id, perna);
          }
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
      toast.error("Erro ao excluir: " + error.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Liquidar operação (resolver resultados)
  const liquidarArbitragem = useCallback(async (params: LiquidarArbitragemParams): Promise<boolean> => {
    try {
      setLoading(true);

      // Buscar operação atual
      const { data: operacao, error: fetchError } = await supabase
        .from("apostas_unificada")
        .select("*")
        .eq("id", params.id)
        .single();

      if (fetchError || !operacao) {
        throw new Error("Operação não encontrada");
      }

      const pernasAtuais = parsePernaFromJson(operacao.pernas);
      
      // Atualizar resultados das pernas
      for (const update of params.pernas) {
        if (update.index >= 0 && update.index < pernasAtuais.length) {
          pernasAtuais[update.index].resultado = update.resultado;
          if (update.lucro_prejuizo !== undefined) {
            pernasAtuais[update.index].lucro_prejuizo = update.lucro_prejuizo;
          }
        }
      }

      // Calcular resultado geral
      const resultadoGeral = determinarResultadoArbitragem(pernasAtuais);
      const lucroReal = calcularLucroReal(pernasAtuais);
      const stakeTotal = calcularStakeTotalPernas(pernasAtuais);
      const roiReal = stakeTotal > 0 ? (lucroReal / stakeTotal) * 100 : 0;

      // Determinar se todas as pernas estão liquidadas
      const todasLiquidadas = pernasAtuais.every(p => 
        p.resultado && p.resultado !== "PENDENTE"
      );

      // Atualizar operação
      const { error: updateError } = await supabase
        .from("apostas_unificada")
        .update({
          pernas: pernasAtuais as any,
          status: todasLiquidadas ? "LIQUIDADA" : "PENDENTE",
          resultado: resultadoGeral,
          lucro_prejuizo: lucroReal,
          roi_real: roiReal,
          updated_at: new Date().toISOString()
        })
        .eq("id", params.id);

      if (updateError) throw updateError;

      // Atualizar saldos das bookmakers se liquidado
      if (todasLiquidadas) {
        for (const perna of pernasAtuais) {
          await atualizarSaldoBookmaker(perna.bookmaker_id, perna);
        }
      }

      toast.success("Operação liquidada!");
      return true;
    } catch (error: any) {
      toast.error("Erro ao liquidar: " + error.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Reverter liquidação
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

      const pernas = parsePernaFromJson(operacao.pernas);
      
      // Reverter saldos
      for (const perna of pernas) {
        if (perna.resultado && perna.resultado !== "PENDENTE") {
          await reverterSaldoBookmaker(perna.bookmaker_id, perna);
        }
      }

      // Resetar resultados das pernas
      const pernasResetadas = pernas.map(p => ({
        ...p,
        resultado: null,
        lucro_prejuizo: null
      }));

      // Atualizar operação para pendente
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

      toast.success("Liquidação revertida!");
      return true;
    } catch (error: any) {
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

// Helpers internos para manipulação de saldos - CORRIGIDO PARA MULTI-MOEDA
async function atualizarSaldoBookmaker(bookmakerId: string, perna: PernaArbitragem): Promise<void> {
  if (!perna.resultado || perna.resultado === "PENDENTE") return;

  // Calcular delta usando helper canônico
  const delta = calcularImpactoResultado(perna.stake, perna.odd, perna.resultado);
  
  if (delta !== 0) {
    // Usar helper que respeita moeda do bookmaker (USD vs BRL)
    await updateBookmakerBalance(bookmakerId, delta);
  }
}

async function reverterSaldoBookmaker(bookmakerId: string, perna: PernaArbitragem): Promise<void> {
  if (!perna.resultado || perna.resultado === "PENDENTE") return;

  // Calcular delta negativo (reversão) usando helper canônico
  const delta = -calcularImpactoResultado(perna.stake, perna.odd, perna.resultado);
  
  if (delta !== 0) {
    // Usar helper que respeita moeda do bookmaker (USD vs BRL)
    await updateBookmakerBalance(bookmakerId, delta);
  }
}
