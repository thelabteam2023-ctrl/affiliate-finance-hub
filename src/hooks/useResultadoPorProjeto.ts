import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchProjetosLucroCanonico } from "@/services/fetchProjetosLucroCanonico";

export interface ResultadoPorProjetoItem {
  id: string;
  nome: string;
  moeda: string;
  lucroOperacional: number;
  lucroOperacionalBRL: number;
  lucroRealizado: number;
  lucroRealizadoBRL: number;
  capitalExposto: number;
  capitalExpostoBRL: number;
}

interface Params {
  workspaceId: string | null;
  cotacoesOficiais: {
    USD: number;
    EUR: number;
    GBP: number;
    MYR: number;
    MXN: number;
    ARS: number;
    COP: number;
  };
}

/**
 * Lista o resultado por projeto (Lucro Operacional canônico + Lucro Realizado +
 * Capital Exposto = diferença). Tudo na MOEDA DO PROJETO e também convertido
 * para BRL via Cotação de Trabalho para somatórios.
 */
export function useResultadoPorProjeto({ workspaceId, cotacoesOficiais }: Params) {
  const [items, setItems] = useState<ResultadoPorProjetoItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const { data: projetos, error } = await supabase
        .from("projetos")
        .select("id, nome, moeda_consolidacao")
        .eq("workspace_id", workspaceId);
      if (error) throw error;
      const list = projetos || [];
      const ids = list.map((p: any) => p.id);
      if (ids.length === 0) {
        setItems([]);
        return;
      }
      const resultado = await fetchProjetosLucroCanonico({
        projetoIds: ids,
        cotacoesOficiais,
      });
      const mapped: ResultadoPorProjetoItem[] = list.map((p: any) => {
        const r = resultado[p.id];
        const lucroOperacional = r?.consolidado ?? 0;
        const lucroOperacionalBRL = r?.consolidadoBRL ?? 0;
        const lucroRealizado = r?.lucroRealizado ?? 0;
        const lucroRealizadoBRL = r?.lucroRealizadoBRL ?? 0;
        return {
          id: p.id,
          nome: p.nome || "Projeto",
          moeda: (r?.moedaConsolidacao || p.moeda_consolidacao || "BRL").toUpperCase(),
          lucroOperacional,
          lucroOperacionalBRL,
          lucroRealizado,
          lucroRealizadoBRL,
          capitalExposto: lucroOperacional - lucroRealizado,
          capitalExpostoBRL: lucroOperacionalBRL - lucroRealizadoBRL,
        };
      });
      setItems(mapped);
    } catch (e) {
      console.error("[useResultadoPorProjeto]", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [
    workspaceId,
    cotacoesOficiais.USD,
    cotacoesOficiais.EUR,
    cotacoesOficiais.GBP,
    cotacoesOficiais.MYR,
    cotacoesOficiais.MXN,
    cotacoesOficiais.ARS,
    cotacoesOficiais.COP,
  ]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totaisBRL = items.reduce(
    (acc, it) => ({
      lucroOperacional: acc.lucroOperacional + it.lucroOperacionalBRL,
      lucroRealizado: acc.lucroRealizado + it.lucroRealizadoBRL,
      capitalExposto: acc.capitalExposto + it.capitalExpostoBRL,
    }),
    { lucroOperacional: 0, lucroRealizado: 0, capitalExposto: 0 }
  );

  return { items, totaisBRL, loading, refresh };
}