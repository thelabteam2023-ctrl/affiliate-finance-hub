import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { formatBookmakerProjectName } from "@/lib/bookmaker-display";

/**
 * Hook que busca nomes de bookmakers desvinculadas do projeto que ainda aparecem em apostas.
 * Resolve o problema de perder o nome do parceiro quando uma bookmaker é desvinculada.
 * 
 * @param missingBookmakerIds IDs de bookmakers que NÃO estão na lista do projeto
 */
export function useUnlinkedBookmakerNames(missingBookmakerIds: string[]) {
  const uniqueIds = useMemo(() => [...new Set(missingBookmakerIds)], [missingBookmakerIds]);

  const { data } = useQuery({
    queryKey: ["unlinked-bookmaker-names", uniqueIds],
    queryFn: async () => {
      if (uniqueIds.length === 0) return [];
      const { data, error } = await supabase
        .from("bookmakers")
        .select("id, nome, instance_identifier, parceiro:parceiros!bookmakers_parceiro_id_fkey(nome)")
        .in("id", uniqueIds);
      if (error) throw error;
      return data || [];
    },
    enabled: uniqueIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  /** Map<bookmaker_id, nome_formatado> para bookmakers desvinculadas */
  const unlinkedNomeMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!data) return map;
    for (const bk of data) {
      const parceiroNome = (bk.parceiro as any)?.nome || null;
      const formatted = formatBookmakerProjectName(bk.nome, parceiroNome, bk.instance_identifier);
      map.set(bk.id, formatted);
    }
    return map;
  }, [data]);

  return unlinkedNomeMap;
}
