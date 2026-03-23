import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface BetSource {
  id: string;
  name: string;
  color: string;
  is_favorite: boolean;
}

function generateColor(name: string, index: number): string {
  const hue = (index * 137.508 + hashCode(name) * 47) % 360;
  return `hsl(${Math.round(hue)}, 70%, 55%)`;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function useWorkspaceBetSources(workspaceId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ["workspace-bet-sources", workspaceId];

  const { data: sources = [], isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<BetSource[]> => {
      if (!workspaceId) return [];

      const { data, error } = await supabase
        .from("workspace_bet_sources" as any)
        .select("id, name, color, is_favorite")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[useWorkspaceBetSources] Error:", error);
        return [];
      }

      return ((data as any[]) || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        color: s.color || generateColor(s.name, 0),
        is_favorite: s.is_favorite || false,
      }));
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });

  const favoriteSource = sources.find((s) => s.is_favorite) || null;

  const addSource = useMutation({
    mutationFn: async ({ name, makeFavorite }: { name: string; makeFavorite?: boolean }) => {
      if (!workspaceId) throw new Error("No workspace");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const color = generateColor(name, sources.length);

      if (makeFavorite) {
        const { error: clearError } = await supabase
          .from("workspace_bet_sources" as any)
          .update({ is_favorite: false } as any)
          .eq("workspace_id", workspaceId)
          .eq("is_favorite", true);

        if (clearError) throw clearError;
      }

      const { error } = await supabase
        .from("workspace_bet_sources" as any)
        .insert({
          workspace_id: workspaceId,
          name: name.trim(),
          color,
          is_favorite: makeFavorite || false,
          created_by: user.id,
        } as any);

      if (error) throw error;
      return name.trim();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const toggleFavorite = useMutation({
    mutationFn: async (sourceId: string) => {
      if (!workspaceId) throw new Error("No workspace");

      const source = sources.find((s) => s.id === sourceId);
      if (!source) throw new Error("Source not found");

      const newFav = !source.is_favorite;

      if (newFav) {
        const { error: clearError } = await supabase
          .from("workspace_bet_sources" as any)
          .update({ is_favorite: false } as any)
          .eq("workspace_id", workspaceId)
          .eq("is_favorite", true);

        if (clearError) throw clearError;
      }

      const { error: updateError } = await supabase
        .from("workspace_bet_sources" as any)
        .update({ is_favorite: newFav } as any)
        .eq("id", sourceId);

      if (updateError) throw updateError;

      return { sourceId, newFav };
    },
    onMutate: async (sourceId) => {
      await queryClient.cancelQueries({ queryKey });
      const previousSources = queryClient.getQueryData<BetSource[]>(queryKey) || [];

      queryClient.setQueryData<BetSource[]>(queryKey, (current = []) =>
        current.map((source) => ({
          ...source,
          is_favorite: source.id === sourceId ? !source.is_favorite : false,
        }))
      );

      return { previousSources };
    },
    onError: (_error, _sourceId, context) => {
      if (context?.previousSources) {
        queryClient.setQueryData(queryKey, context.previousSources);
      }
      toast.error("Não foi possível definir a fonte favorita");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return { sources, isLoading, addSource, toggleFavorite, favoriteSource };
}
