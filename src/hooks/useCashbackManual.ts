import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { updateBookmakerBalance } from "@/lib/bookmakerBalanceHelper";
import {
  CashbackManualComBookmaker,
  CashbackManualFormData,
  CashbackManualMetrics,
  CashbackManualPorBookmaker,
} from "@/types/cashback-manual";

interface UseCashbackManualOptions {
  projetoId: string;
  dataInicio?: Date | null;
  dataFim?: Date | null;
}

export function useCashbackManual({ projetoId, dataInicio, dataFim }: UseCashbackManualOptions) {
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  
  const [registros, setRegistros] = useState<CashbackManualComBookmaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch registros de cashback manual
  const fetchRegistros = useCallback(async () => {
    if (!projetoId) return;

    try {
      let query = supabase
        .from("cashback_manual")
        .select(`
          *,
          bookmaker:bookmakers(
            id, 
            nome, 
            moeda, 
            parceiro_id,
            parceiro:parceiros!bookmakers_parceiro_id_fkey(id, nome)
          )
        `)
        .eq("projeto_id", projetoId)
        .order("data_credito", { ascending: false });

      if (dataInicio) {
        query = query.gte("data_credito", dataInicio.toISOString().split("T")[0]);
      }
      if (dataFim) {
        query = query.lte("data_credito", dataFim.toISOString().split("T")[0]);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setRegistros((data || []) as CashbackManualComBookmaker[]);
    } catch (err) {
      console.error("Erro ao buscar cashback manual:", err);
      setError("Erro ao carregar cashback");
    }
  }, [projetoId, dataInicio, dataFim]);

  // Fetch all data
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await fetchRegistros();
    setLoading(false);
  }, [fetchRegistros]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Métricas calculadas
  const metrics: CashbackManualMetrics = useMemo(() => {
    const totalRecebido = registros.reduce((acc, r) => acc + Number(r.valor), 0);
    const totalLancamentos = registros.length;
    const mediaPorLancamento = totalLancamentos > 0 ? totalRecebido / totalLancamentos : 0;

    return {
      totalRecebido,
      totalLancamentos,
      mediaPorLancamento,
    };
  }, [registros]);

  // Dados por bookmaker (vínculo = casa + parceiro)
  const porBookmaker: CashbackManualPorBookmaker[] = useMemo(() => {
    const map = new Map<string, CashbackManualPorBookmaker>();

    registros.forEach((registro) => {
      const key = registro.bookmaker_id;
      const existing = map.get(key);

      if (existing) {
        existing.totalRecebido += Number(registro.valor);
        existing.totalLancamentos += 1;
      } else {
        map.set(key, {
          bookmaker_id: registro.bookmaker_id,
          bookmaker_nome: registro.bookmaker?.nome || "Casa",
          bookmaker_moeda: registro.bookmaker?.moeda || "BRL",
          parceiro_nome: registro.bookmaker?.parceiro?.nome || null,
          totalRecebido: Number(registro.valor),
          totalLancamentos: 1,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalRecebido - a.totalRecebido);
  }, [registros]);

  // Criar lançamento de cashback manual
  const criarCashback = useCallback(
    async (data: CashbackManualFormData): Promise<boolean> => {
      if (!user || !workspaceId) {
        toast.error("Usuário não autenticado");
        return false;
      }

      try {
        // 1. VALIDAÇÃO CRÍTICA: Verificar que a casa pertence ao projeto
        const { data: bookmaker, error: bookmakerError } = await supabase
          .from("bookmakers")
          .select("id, moeda, projeto_id")
          .eq("id", data.bookmaker_id)
          .single();

        if (bookmakerError) throw bookmakerError;

        // Bloquear se a casa não pertence ao projeto
        if (!bookmaker || bookmaker.projeto_id !== projetoId) {
          toast.error("Esta casa não está vinculada a este projeto");
          console.error("Tentativa de lançar cashback em casa não vinculada:", {
            bookmaker_id: data.bookmaker_id,
            projeto_id: projetoId,
            bookmaker_projeto_id: bookmaker?.projeto_id
          });
          return false;
        }

        const moedaOperacao = bookmaker.moeda || "BRL";
        const dataCredito = data.data_credito || new Date().toISOString().split("T")[0];

        // 2. Inserir registro de cashback
        const { data: novoCashback, error: insertError } = await supabase
          .from("cashback_manual")
          .insert({
            projeto_id: projetoId,
            bookmaker_id: data.bookmaker_id,
            workspace_id: workspaceId,
            user_id: user.id,
            valor: data.valor,
            data_credito: dataCredito,
            observacoes: data.observacoes || null,
            moeda_operacao: moedaOperacao,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // 3. Atualizar saldo da casa imediatamente
        const saldoAtualizado = await updateBookmakerBalance(
          data.bookmaker_id,
          data.valor,
          projetoId,
          {
            origem: "cashback_manual",
            referenciaId: novoCashback.id,
            observacoes: `Cashback manual: ${data.observacoes || "Sem observações"}`,
          }
        );

        if (!saldoAtualizado) {
          console.warn("Aviso: Saldo da casa não foi atualizado automaticamente");
        }

        toast.success("Cashback lançado com sucesso! Saldo atualizado.");
        await fetchRegistros();
        return true;
      } catch (err) {
        console.error("Erro ao criar cashback:", err);
        toast.error("Erro ao lançar cashback");
        return false;
      }
    },
    [projetoId, user, workspaceId, fetchRegistros]
  );

  // Deletar lançamento de cashback (reverte saldo)
  const deletarCashback = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        // 1. Buscar registro para reverter saldo
        const { data: registro, error: fetchError } = await supabase
          .from("cashback_manual")
          .select("bookmaker_id, valor")
          .eq("id", id)
          .single();

        if (fetchError) throw fetchError;

        // 2. Reverter saldo da casa (subtrair valor)
        if (registro) {
          await updateBookmakerBalance(
            registro.bookmaker_id,
            -Number(registro.valor),
            projetoId,
            {
              origem: "cashback_manual_estorno",
              referenciaId: id,
              observacoes: "Estorno de cashback manual deletado",
            }
          );
        }

        // 3. Deletar registro
        const { error: deleteError } = await supabase
          .from("cashback_manual")
          .delete()
          .eq("id", id);

        if (deleteError) throw deleteError;

        toast.success("Cashback removido e saldo ajustado");
        await fetchRegistros();
        return true;
      } catch (err) {
        console.error("Erro ao deletar cashback:", err);
        toast.error("Erro ao remover cashback");
        return false;
      }
    },
    [projetoId, fetchRegistros]
  );

  return {
    registros,
    metrics,
    porBookmaker,
    loading,
    error,
    refresh: fetchAll,
    criarCashback,
    deletarCashback,
  };
}
