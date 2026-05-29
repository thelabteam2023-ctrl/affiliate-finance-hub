import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ValuebetProjectSummary {
  projeto_id: string;
  nome: string;
  total_bets: number;
  liquidadas: number;
  ultima_data: string;
}

export function useValuebetProjectsSummary() {
  const { workspaceId } = useAuth();

  return useQuery({
    queryKey: ["valuebet-projects-summary", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_valuebet_projects_summary");

      if (error) {
        console.error("[useValuebetProjectsSummary] Error:", error);
        throw error;
      }

      return data as ValuebetProjectSummary[];
    },
    enabled: !!workspaceId,
  });
}
