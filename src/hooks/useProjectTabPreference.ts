import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useWorkspace } from "./useWorkspace";

export interface ProjectTabPreference {
  id: string;
  default_tab: string;
  created_at: string;
  updated_at: string;
}

interface UseProjectTabPreferenceResult {
  defaultTab: string | null;
  loading: boolean;
  isDefaultTab: (tabKey: string) => boolean;
  setDefaultTab: (tabKey: string) => Promise<boolean>;
  removeDefaultTab: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useProjectTabPreference(projectId: string | undefined): UseProjectTabPreferenceResult {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const [preference, setPreference] = useState<ProjectTabPreference | null>(null);
  const [loading, setLoading] = useState(true);

  // Reset state immediately when projectId changes
  useEffect(() => {
    setPreference(null);
    setLoading(true);
  }, [projectId]);

  const loadPreference = useCallback(async () => {
    if (!user || !projectId) {
      setPreference(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('project_user_preferences')
        .select('id, default_tab, created_at, updated_at')
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .maybeSingle();

      if (error) throw error;
      setPreference(data);
    } catch (error) {
      console.error("Error loading project tab preference:", error);
    } finally {
      setLoading(false);
    }
  }, [user, projectId]);

  useEffect(() => {
    loadPreference();
  }, [loadPreference]);

  const isDefaultTab = useCallback((tabKey: string): boolean => {
    return preference?.default_tab === tabKey;
  }, [preference]);

  const setDefaultTab = useCallback(async (tabKey: string): Promise<boolean> => {
    if (!user || !projectId || !workspace) return false;

    try {
      if (preference) {
        // Update existing preference
        const { error } = await supabase
          .from('project_user_preferences')
          .update({ 
            default_tab: tabKey,
            updated_at: new Date().toISOString()
          })
          .eq('id', preference.id);

        if (error) throw error;
      } else {
        // Insert new preference
        const { error } = await supabase
          .from('project_user_preferences')
          .insert({
            user_id: user.id,
            project_id: projectId,
            workspace_id: workspace.id,
            default_tab: tabKey,
          });

        if (error) throw error;
      }

      await loadPreference();
      return true;
    } catch (error) {
      console.error("Error setting default tab:", error);
      return false;
    }
  }, [user, projectId, workspace, preference, loadPreference]);

  const removeDefaultTab = useCallback(async (): Promise<boolean> => {
    if (!user || !projectId || !preference) return false;

    try {
      const { error } = await supabase
        .from('project_user_preferences')
        .delete()
        .eq('id', preference.id);

      if (error) throw error;

      setPreference(null);
      return true;
    } catch (error) {
      console.error("Error removing default tab:", error);
      return false;
    }
  }, [user, projectId, preference]);

  return {
    defaultTab: preference?.default_tab ?? null,
    loading,
    isDefaultTab,
    setDefaultTab,
    removeDefaultTab,
    refresh: loadPreference,
  };
}
