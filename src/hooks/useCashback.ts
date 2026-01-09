import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  CashbackRegraComBookmaker,
  CashbackRegistroComDetalhes,
  CashbackMetrics,
  CashbackPorBookmaker,
  CashbackRegraFormData,
  CashbackRegistroFormData,
} from "@/types/cashback";

interface UseCashbackOptions {
  projetoId: string;
  dataInicio?: Date | null;
  dataFim?: Date | null;
}

export function useCashback({ projetoId, dataInicio, dataFim }: UseCashbackOptions) {
  const { user } = useAuth();
  const { workspace, workspaceId } = useWorkspace();
  
  const [regras, setRegras] = useState<CashbackRegraComBookmaker[]>([]);
  const [registros, setRegistros] = useState<CashbackRegistroComDetalhes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch regras de cashback
  const fetchRegras = useCallback(async () => {
    if (!projetoId) return;

    try {
      const { data, error: fetchError } = await supabase
        .from("cashback_regras")
        .select(`
          *,
          bookmaker:bookmakers(id, nome, moeda)
        `)
        .eq("projeto_id", projetoId)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      setRegras((data || []) as CashbackRegraComBookmaker[]);
    } catch (err) {
      console.error("Erro ao buscar regras de cashback:", err);
      setError("Erro ao carregar regras de cashback");
    }
  }, [projetoId]);

  // Fetch registros de cashback
  const fetchRegistros = useCallback(async () => {
    if (!projetoId) return;

    try {
      let query = supabase
        .from("cashback_registros")
        .select(`
          *,
          regra:cashback_regras(id, nome, tipo, percentual, categoria),
          bookmaker:bookmakers(id, nome, moeda)
        `)
        .eq("projeto_id", projetoId)
        .order("periodo_fim", { ascending: false });

      if (dataInicio) {
        query = query.gte("periodo_fim", dataInicio.toISOString().split("T")[0]);
      }
      if (dataFim) {
        query = query.lte("periodo_inicio", dataFim.toISOString().split("T")[0]);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setRegistros((data || []) as CashbackRegistroComDetalhes[]);
    } catch (err) {
      console.error("Erro ao buscar registros de cashback:", err);
      setError("Erro ao carregar registros de cashback");
    }
  }, [projetoId, dataInicio, dataFim]);

  // Fetch all data
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchRegras(), fetchRegistros()]);
    setLoading(false);
  }, [fetchRegras, fetchRegistros]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Métricas calculadas
  const metrics: CashbackMetrics = useMemo(() => {
    const regrasAtivas = regras.filter((r) => r.status === "ativo").length;
    
    const registrosRecebidos = registros.filter((r) => r.status === "recebido");
    const registrosPendentes = registros.filter((r) => r.status === "pendente");
    
    const totalRecebido = registrosRecebidos.reduce(
      (acc, r) => acc + (r.valor_recebido ?? r.valor_calculado),
      0
    );
    
    const totalPendente = registrosPendentes.reduce(
      (acc, r) => acc + r.valor_calculado,
      0
    );
    
    const volumeElegivel = registros.reduce(
      (acc, r) => acc + r.volume_elegivel,
      0
    );
    
    const percentuais = registros.map((r) => r.percentual_aplicado);
    const percentualMedioRetorno =
      percentuais.length > 0
        ? percentuais.reduce((a, b) => a + b, 0) / percentuais.length
        : 0;

    return {
      totalRecebido,
      totalPendente,
      volumeElegivel,
      percentualMedioRetorno,
      totalRegistros: registros.length,
      regrasAtivas,
    };
  }, [regras, registros]);

  // Dados por bookmaker
  const porBookmaker: CashbackPorBookmaker[] = useMemo(() => {
    const map = new Map<string, CashbackPorBookmaker>();

    registros.forEach((registro) => {
      const key = registro.bookmaker_id;
      const existing = map.get(key);

      if (existing) {
        existing.totalRecebido +=
          registro.status === "recebido"
            ? (registro.valor_recebido ?? registro.valor_calculado)
            : 0;
        existing.totalPendente +=
          registro.status === "pendente" ? registro.valor_calculado : 0;
        existing.volumeElegivel += registro.volume_elegivel;
        existing.registros += 1;
        // Recalcular média
        existing.percentualMedio =
          (existing.percentualMedio * (existing.registros - 1) +
            registro.percentual_aplicado) /
          existing.registros;
      } else {
        map.set(key, {
          bookmaker_id: registro.bookmaker_id,
          bookmaker_nome: registro.bookmaker?.nome || "Casa",
          totalRecebido:
            registro.status === "recebido"
              ? (registro.valor_recebido ?? registro.valor_calculado)
              : 0,
          totalPendente:
            registro.status === "pendente" ? registro.valor_calculado : 0,
          volumeElegivel: registro.volume_elegivel,
          percentualMedio: registro.percentual_aplicado,
          registros: 1,
        });
      }
    });

    return Array.from(map.values());
  }, [registros]);

  // CRUD - Criar regra
  const createRegra = useCallback(
    async (data: CashbackRegraFormData): Promise<boolean> => {
      if (!user || !workspaceId) {
        toast.error("Usuário não autenticado");
        return false;
      }

      try {
        const { error: insertError } = await supabase
          .from("cashback_regras")
          .insert({
            ...data,
            projeto_id: projetoId,
            workspace_id: workspaceId,
            user_id: user.id,
          });

        if (insertError) throw insertError;

        toast.success("Regra de cashback criada com sucesso");
        await fetchRegras();
        return true;
      } catch (err) {
        console.error("Erro ao criar regra:", err);
        toast.error("Erro ao criar regra de cashback");
        return false;
      }
    },
    [projetoId, user, workspaceId, fetchRegras]
  );

  // CRUD - Atualizar regra
  const updateRegra = useCallback(
    async (id: string, data: CashbackRegraFormData): Promise<boolean> => {
      try {
        const { error: updateError } = await supabase
          .from("cashback_regras")
          .update(data)
          .eq("id", id);

        if (updateError) throw updateError;

        toast.success("Regra de cashback atualizada");
        await fetchRegras();
        return true;
      } catch (err) {
        console.error("Erro ao atualizar regra:", err);
        toast.error("Erro ao atualizar regra de cashback");
        return false;
      }
    },
    [fetchRegras]
  );

  // CRUD - Deletar regra
  const deleteRegra = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const { error: deleteError } = await supabase
          .from("cashback_regras")
          .delete()
          .eq("id", id);

        if (deleteError) throw deleteError;

        toast.success("Regra de cashback removida");
        await fetchRegras();
        return true;
      } catch (err) {
        console.error("Erro ao deletar regra:", err);
        toast.error("Erro ao remover regra de cashback");
        return false;
      }
    },
    [fetchRegras]
  );

  // CRUD - Criar registro
  const createRegistro = useCallback(
    async (data: CashbackRegistroFormData): Promise<boolean> => {
      if (!user || !workspaceId) {
        toast.error("Usuário não autenticado");
        return false;
      }

      try {
        const { error: insertError } = await supabase
          .from("cashback_registros")
          .insert({
            ...data,
            projeto_id: projetoId,
            workspace_id: workspaceId,
            user_id: user.id,
          });

        if (insertError) throw insertError;

        toast.success("Registro de cashback criado");
        await fetchRegistros();
        return true;
      } catch (err) {
        console.error("Erro ao criar registro:", err);
        toast.error("Erro ao criar registro de cashback");
        return false;
      }
    },
    [projetoId, user, workspaceId, fetchRegistros]
  );

  // CRUD - Confirmar recebimento
  const confirmarRecebimento = useCallback(
    async (id: string, valorRecebido: number): Promise<boolean> => {
      try {
        const { error: updateError } = await supabase
          .from("cashback_registros")
          .update({
            status: "recebido",
            valor_recebido: valorRecebido,
            data_credito: new Date().toISOString().split("T")[0],
          })
          .eq("id", id);

        if (updateError) throw updateError;

        toast.success("Cashback confirmado como recebido");
        await fetchRegistros();
        return true;
      } catch (err) {
        console.error("Erro ao confirmar recebimento:", err);
        toast.error("Erro ao confirmar recebimento");
        return false;
      }
    },
    [fetchRegistros]
  );

  // CRUD - Cancelar registro
  const cancelarRegistro = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const { error: updateError } = await supabase
          .from("cashback_registros")
          .update({ status: "cancelado" })
          .eq("id", id);

        if (updateError) throw updateError;

        toast.success("Registro de cashback cancelado");
        await fetchRegistros();
        return true;
      } catch (err) {
        console.error("Erro ao cancelar registro:", err);
        toast.error("Erro ao cancelar registro");
        return false;
      }
    },
    [fetchRegistros]
  );

  return {
    regras,
    registros,
    metrics,
    porBookmaker,
    loading,
    error,
    refresh: fetchAll,
    createRegra,
    updateRegra,
    deleteRegra,
    createRegistro,
    confirmarRecebimento,
    cancelarRegistro,
  };
}
