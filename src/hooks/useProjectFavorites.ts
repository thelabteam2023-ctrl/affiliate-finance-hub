import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useWorkspace } from "./useWorkspace";

export interface ProjectFavorite {
  id: string;
  project_id: string;
  created_at: string;
}

export function useProjectFavorites() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const [favorites, setFavorites] = useState<ProjectFavorite[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFavorites = useCallback(async () => {
    if (!user || !workspace) {
      setFavorites([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('project_favorites')
        .select('id, project_id, created_at')
        .eq('workspace_id', workspace.id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFavorites(data || []);
    } catch (error) {
      console.error("Error loading project favorites:", error);
    } finally {
      setLoading(false);
    }
  }, [user, workspace]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const isFavorite = useCallback((projectId: string): boolean => {
    return favorites.some(f => f.project_id === projectId);
  }, [favorites]);

  const getFavoriteIds = useCallback((): string[] => {
    return favorites.map(f => f.project_id);
  }, [favorites]);

  const addFavorite = useCallback(async (projectId: string): Promise<boolean> => {
    if (!user || !workspace) return false;

    if (isFavorite(projectId)) return true;

    // Optimistic update
    const tempId = crypto.randomUUID();
    const tempFavorite: ProjectFavorite = {
      id: tempId,
      project_id: projectId,
      created_at: new Date().toISOString(),
    };
    setFavorites(prev => [tempFavorite, ...prev]);

    try {
      const { data, error } = await supabase
        .from('project_favorites')
        .insert({
          workspace_id: workspace.id,
          project_id: projectId,
          user_id: user.id,
        })
        .select('id, project_id, created_at')
        .single();

      if (error) throw error;

      // Replace temp with real data
      setFavorites(prev => prev.map(f => f.id === tempId ? data : f));
      return true;
    } catch (error: any) {
      console.error("Error adding project favorite:", error);
      // Revert optimistic update
      setFavorites(prev => prev.filter(f => f.id !== tempId));
      return false;
    }
  }, [user, workspace, isFavorite]);

  const removeFavorite = useCallback(async (projectId: string): Promise<boolean> => {
    if (!user || !workspace) return false;

    const favorite = favorites.find(f => f.project_id === projectId);
    if (!favorite) return true;

    // Optimistic update
    setFavorites(prev => prev.filter(f => f.project_id !== projectId));

    try {
      const { error } = await supabase
        .from('project_favorites')
        .delete()
        .eq('workspace_id', workspace.id)
        .eq('project_id', projectId)
        .eq('user_id', user.id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error removing project favorite:", error);
      // Revert optimistic update
      setFavorites(prev => [favorite, ...prev]);
      return false;
    }
  }, [user, workspace, favorites]);

  const toggleFavorite = useCallback(async (projectId: string): Promise<boolean> => {
    if (isFavorite(projectId)) {
      return removeFavorite(projectId);
    } else {
      return addFavorite(projectId);
    }
  }, [isFavorite, removeFavorite, addFavorite]);

  return {
    favorites,
    loading,
    isFavorite,
    getFavoriteIds,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    refresh: loadFavorites,
    count: favorites.length,
  };
}
