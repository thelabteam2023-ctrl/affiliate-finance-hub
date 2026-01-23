import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TipoProjeto } from "@/types/projeto";

export type BookmakerUsageCategory = 'VIRGEM' | 'JA_USADA' | 'ATIVA';

export interface BookmakerUsageInfo {
  category: BookmakerUsageCategory;
  isActiveInProject: boolean;
  hasHistory: boolean;
  hasOperations: boolean;
  tiposProjeto: TipoProjeto[];
  totalVinculos: number;
  projetosAtivos: number;
}

export interface BookmakerUsageMap {
  [bookmakerId: string]: BookmakerUsageInfo;
}

interface HistoricoRow {
  bookmaker_id: string;
  data_desvinculacao: string | null;
  tipo_projeto_snapshot: string | null;
}

/**
 * Hook para buscar status de uso de todas as bookmakers do workspace
 * Retorna um mapa com informações de uso para cada bookmaker
 */
export function useBookmakerUsageStatus(bookmakerIds: string[]) {
  const [usageMap, setUsageMap] = useState<BookmakerUsageMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookmakerIds.length) {
      setUsageMap({});
      setLoading(false);
      return;
    }

    fetchUsageStatus();
  }, [bookmakerIds.join(",")]);

  const fetchUsageStatus = async () => {
    setLoading(true);
    setError(null);

    try {
      // Buscar histórico de vínculos
      const { data: historico, error: histError } = await supabase
        .from("projeto_bookmaker_historico")
        .select("bookmaker_id, data_desvinculacao, tipo_projeto_snapshot")
        .in("bookmaker_id", bookmakerIds);

      if (histError) throw histError;

      // Buscar se tem operações (apostas, transações, bônus) - para bloquear delete
      const { data: apostasData, error: apostasError } = await supabase
        .from("apostas_unificada")
        .select("bookmaker_id")
        .in("bookmaker_id", bookmakerIds);

      if (apostasError) throw apostasError;

      const { data: ledgerData, error: ledgerError } = await supabase
        .from("cash_ledger")
        .select("origem_bookmaker_id, destino_bookmaker_id")
        .or(`origem_bookmaker_id.in.(${bookmakerIds.join(",")}),destino_bookmaker_id.in.(${bookmakerIds.join(",")})`);

      if (ledgerError) throw ledgerError;

      // Montar mapa de operações por bookmaker
      const operacoesSet = new Set<string>();
      apostasData?.forEach((a) => {
        if (a.bookmaker_id) operacoesSet.add(a.bookmaker_id);
      });
      ledgerData?.forEach((l) => {
        if (l.origem_bookmaker_id) operacoesSet.add(l.origem_bookmaker_id);
        if (l.destino_bookmaker_id) operacoesSet.add(l.destino_bookmaker_id);
      });

      // Processar histórico para cada bookmaker
      const resultMap: BookmakerUsageMap = {};

      bookmakerIds.forEach((id) => {
        const bookmakerHistorico = (historico || []).filter(
          (h: HistoricoRow) => h.bookmaker_id === id
        );

        const projetosAtivos = bookmakerHistorico.filter(
          (h: HistoricoRow) => !h.data_desvinculacao
        ).length;

        const tiposProjeto = [
          ...new Set(
            bookmakerHistorico
              .map((h: HistoricoRow) => h.tipo_projeto_snapshot)
              .filter(Boolean) as TipoProjeto[]
          ),
        ];

        const hasHistory = bookmakerHistorico.length > 0;
        const hasOperations = operacoesSet.has(id);
        const isActiveInProject = projetosAtivos > 0;

        let category: BookmakerUsageCategory;
        if (isActiveInProject) {
          category = "ATIVA";
        } else if (hasHistory || hasOperations) {
          category = "JA_USADA";
        } else {
          category = "VIRGEM";
        }

        resultMap[id] = {
          category,
          isActiveInProject,
          hasHistory,
          hasOperations,
          tiposProjeto,
          totalVinculos: bookmakerHistorico.length,
          projetosAtivos,
        };
      });

      setUsageMap(resultMap);
    } catch (err: any) {
      console.error("Erro ao buscar status de uso:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { usageMap, loading, error, refetch: fetchUsageStatus };
}

/**
 * Retorna configuração visual para cada categoria de uso
 */
export function getUsageCategoryConfig(category: BookmakerUsageCategory) {
  const configs: Record<
    BookmakerUsageCategory,
    {
      label: string;
      icon: string;
      color: string;
      iconColor: string;
      bgColor: string;
      tooltip: string;
    }
  > = {
    VIRGEM: {
      label: "Virgem",
      icon: "circle-dashed",
      color: "text-muted-foreground/50",
      iconColor: "text-muted-foreground/40",
      bgColor: "bg-muted/30",
      tooltip: "Nunca foi usada em projeto",
    },
    JA_USADA: {
      label: "Já usada",
      icon: "history",
      color: "text-amber-500/80",
      iconColor: "text-amber-400",
      bgColor: "bg-amber-500/10",
      tooltip: "Já operou em projetos anteriores",
    },
    ATIVA: {
      label: "Ativa",
      icon: "circle-check",
      color: "text-emerald-500",
      iconColor: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
      tooltip: "Em uso em projeto ativo",
    },
  };

  return configs[category];
}

/**
 * Verifica se uma bookmaker pode ser excluída
 * (apenas casas virgens podem ser excluídas)
 */
export function canDeleteBookmaker(usage: BookmakerUsageInfo | undefined): {
  canDelete: boolean;
  reason: string;
} {
  if (!usage) {
    return { canDelete: true, reason: "" };
  }

  if (usage.isActiveInProject) {
    return {
      canDelete: false,
      reason: "Esta casa está vinculada a um projeto ativo. Desvincule primeiro.",
    };
  }

  if (usage.hasHistory) {
    return {
      canDelete: false,
      reason: "Esta casa possui histórico de projetos. Desative em vez de excluir.",
    };
  }

  if (usage.hasOperations) {
    return {
      canDelete: false,
      reason: "Esta casa possui operações registradas. Desative em vez de excluir.",
    };
  }

  return { canDelete: true, reason: "" };
}
