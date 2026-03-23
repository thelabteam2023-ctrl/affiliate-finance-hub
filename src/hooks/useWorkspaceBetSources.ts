import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_SOURCES = ["OddsNotifier", "RebelBetting"];

export function useWorkspaceBetSources(workspaceId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ["workspace-bet-sources", workspaceId];

  const { data: sources = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!workspaceId) return DEFAULT_SOURCES;
      
      const { data, error } = await supabase
        .from("workspace_bet_sources" as any)
        .select("name")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[useWorkspaceBetSources] Error:", error);
        return DEFAULT_SOURCES;
      }

      const dbSources = (data as any[])?.map((s: any) => s.name) || [];
      
      // If no sources in DB yet, seed defaults
      if (dbSources.length === 0) {
        await seedDefaults(workspaceId);
        return DEFAULT_SOURCES;
      }
      
      return dbSources;
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });

  const seedDefaults = async (wsId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const rows = DEFAULT_SOURCES.map(name => ({
      workspace_id: wsId,
      name,
      created_by: user.id,
    }));

    await supabase.from("workspace_bet_sources" as any).insert(rows as any);
    queryClient.invalidateQueries({ queryKey });
  };

  const addSource = useMutation({
    mutationFn: async (name: string) => {
      if (!workspaceId) throw new Error("No workspace");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("workspace_bet_sources" as any)
        .insert({ workspace_id: workspaceId, name: name.trim(), created_by: user.id } as any);

      if (error) throw error;
      return name.trim();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return { sources, isLoading, addSource };
}
