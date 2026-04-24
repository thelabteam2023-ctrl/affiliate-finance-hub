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
  projetoAtivoNome: string | null; // Nome do projeto ativo (se houver)
}

export interface BookmakerUsageMap {
  [bookmakerId: string]: BookmakerUsageInfo;
}

interface HistoricoRow {
  bookmaker_id: string;
  data_desvinculacao: string | null;
  tipo_projeto_snapshot: string | null;
  projeto_id: string | null;
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
      const [historicoResult, bookmakersAtivosResult, apostasResult, ledgerOrigemResult, ledgerDestinoResult] = await Promise.all([
        supabase
          .from("projeto_bookmaker_historico")
          .select("bookmaker_id, data_desvinculacao, tipo_projeto_snapshot, projeto_id, projetos(nome)")
          .in("bookmaker_id", bookmakerIds),
        supabase
          .from("bookmakers")
          .select("id, projeto_id, projetos:projetos!bookmakers_projeto_id_fkey(nome, tipo_projeto)")
          .in("id", bookmakerIds)
          .not("projeto_id", "is", null),
        supabase
          .from("apostas_unificada")
          .select("bookmaker_id")
          .in("bookmaker_id", bookmakerIds),
        supabase
          .from("cash_ledger")
          .select("origem_bookmaker_id")
          .in("origem_bookmaker_id", bookmakerIds),
        supabase
          .from("cash_ledger")
          .select("destino_bookmaker_id")
          .in("destino_bookmaker_id", bookmakerIds),
      ]);

      if (historicoResult.error) throw historicoResult.error;
      if (bookmakersAtivosResult.error) throw bookmakersAtivosResult.error;
      if (apostasResult.error) throw apostasResult.error;
      if (ledgerOrigemResult.error) throw ledgerOrigemResult.error;
      if (ledgerDestinoResult.error) throw ledgerDestinoResult.error;

      const historico = historicoResult.data;
      const bookmakersAtivos = bookmakersAtivosResult.data;
      const apostasData = apostasResult.data;
      const ledgerOrigemData = ledgerOrigemResult.data;
      const ledgerDestinoData = ledgerDestinoResult.data;

      // Mapa de vínculos ativos diretos da tabela bookmakers
      const activeProjectMap = new Map<string, { projetoNome: string; tipoProjeto: string | null }>();
      (bookmakersAtivos || []).forEach((bm: any) => {
        if (bm.projeto_id) {
          activeProjectMap.set(bm.id, {
            projetoNome: bm.projetos?.nome || null,
            tipoProjeto: bm.projetos?.tipo_projeto || null,
          });
        }
      });

      // Montar mapa de operações por bookmaker
      const operacoesSet = new Set<string>();
      apostasData?.forEach((a) => {
        if (a.bookmaker_id) operacoesSet.add(a.bookmaker_id);
      });
      ledgerOrigemData?.forEach((l) => {
        if (l.origem_bookmaker_id) operacoesSet.add(l.origem_bookmaker_id);
      });
      ledgerDestinoData?.forEach((l) => {
        if (l.destino_bookmaker_id) operacoesSet.add(l.destino_bookmaker_id);
      });

      // Processar histórico para cada bookmaker
      const resultMap: BookmakerUsageMap = {};

      bookmakerIds.forEach((id) => {
        const bookmakerHistorico = (historico || []).filter(
          (h: any) => h.bookmaker_id === id
        );

        const vinculosAtivos = bookmakerHistorico.filter(
          (h: any) => !h.data_desvinculacao
        );
        let projetosAtivos = vinculosAtivos.length;

        // Fonte primária: tabela bookmakers.projeto_id (vínculo real)
        const activeProject = activeProjectMap.get(id);
        const isActiveFromBookmakers = !!activeProject;

        // Se o vínculo existe na tabela bookmakers mas não no histórico, ainda é ATIVA
        if (isActiveFromBookmakers && projetosAtivos === 0) {
          projetosAtivos = 1;
        }

        // Pegar o nome do primeiro projeto ativo (preferência: histórico, fallback: bookmakers)
        const projetoAtivoNome = vinculosAtivos.length > 0 
          ? vinculosAtivos[0]?.projetos?.nome || activeProject?.projetoNome || null 
          : activeProject?.projetoNome || null;

        const tiposProjeto = [
          ...new Set(
            [
              ...bookmakerHistorico
                .map((h: any) => h.tipo_projeto_snapshot)
                .filter(Boolean),
              ...(activeProject?.tipoProjeto ? [activeProject.tipoProjeto] : []),
            ] as TipoProjeto[]
          ),
        ];

        const hasHistory = bookmakerHistorico.length > 0;
        const hasOperations = operacoesSet.has(id);
        const isActiveInProject = projetosAtivos > 0 || isActiveFromBookmakers;

        // Categoria baseada APENAS em vínculos a projetos.
        // hasOperations (depósitos/saques avulsos) NÃO deve marcar a casa como
        // "JA_USADA" — esse status reflete fluxo de projeto, não movimentação
        // financeira solta. hasOperations continua exposto no objeto para
        // outras regras (ex.: canDeleteBookmaker).
        let category: BookmakerUsageCategory;
        if (isActiveInProject) {
          category = "ATIVA";
        } else if (hasHistory) {
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
          projetoAtivoNome,
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
      color: "text-muted-foreground/40",
      iconColor: "text-muted-foreground/30",
      bgColor: "bg-muted/20",
      tooltip: "Nunca foi usada em projeto",
    },
    JA_USADA: {
      label: "Já usada",
      icon: "history",
      color: "text-amber-400/60",
      iconColor: "text-amber-400/50",
      bgColor: "bg-amber-500/5",
      tooltip: "Já operou em projetos anteriores",
    },
    ATIVA: {
      label: "Ativa",
      icon: "circle-check",
      color: "text-emerald-400/70",
      iconColor: "text-emerald-400/60",
      bgColor: "bg-emerald-500/5",
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
