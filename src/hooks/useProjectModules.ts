import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "sonner";

export interface ModuleCatalog {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  default_order: number;
  category: string;
}

export interface ProjectModule {
  id: string;
  module_id: string;
  status: "active" | "archived";
  display_order: number;
  activated_at: string;
  archived_at: string | null;
  archive_reason: string | null;
  // Joined from catalog
  name?: string;
  description?: string | null;
  icon?: string;
}

export interface ModuleWithStatus extends ModuleCatalog {
  projectModuleId?: string;
  status: "available" | "active" | "archived";
  hasData?: boolean;
  activatedAt?: string;
  archivedAt?: string | null;
}

export function useProjectModules(projetoId: string | undefined) {
  const { workspaceId } = useWorkspace();
  const [catalog, setCatalog] = useState<ModuleCatalog[]>([]);
  const [projectModules, setProjectModules] = useState<ProjectModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modulesWithStatus, setModulesWithStatus] = useState<ModuleWithStatus[]>([]);

  // Fetch catalog (all available modules)
  const fetchCatalog = useCallback(async () => {
    const { data, error } = await supabase
      .from("project_modules_catalog")
      .select("*")
      .order("default_order");

    if (!error && data) {
      setCatalog(data);
    }
    return data || [];
  }, []);

  // Fetch project-specific modules
  const fetchProjectModules = useCallback(async () => {
    if (!projetoId) return [];
    
    const { data, error } = await supabase
      .from("project_modules")
      .select(`
        id,
        module_id,
        status,
        display_order,
        activated_at,
        archived_at,
        archive_reason
      `)
      .eq("projeto_id", projetoId)
      .order("display_order");

    if (!error && data) {
      setProjectModules(data as ProjectModule[]);
    }
    return data || [];
  }, [projetoId]);

  // Refresh all data
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogData, modulesData] = await Promise.all([
        fetchCatalog(),
        fetchProjectModules(),
      ]);

      // Build combined status list
      const combined: ModuleWithStatus[] = catalogData.map((cat) => {
        const projectModule = modulesData.find((pm) => pm.module_id === cat.id);
        
        let status: "available" | "active" | "archived" = "available";
        if (projectModule) {
          status = projectModule.status as "active" | "archived";
        }

        return {
          ...cat,
          projectModuleId: projectModule?.id,
          status,
          activatedAt: projectModule?.activated_at,
          archivedAt: projectModule?.archived_at,
        };
      });

      setModulesWithStatus(combined);
    } finally {
      setLoading(false);
    }
  }, [fetchCatalog, fetchProjectModules]);

  useEffect(() => {
    if (projetoId) {
      refresh();
    }
  }, [projetoId, refresh]);

  // Get active modules only (for menu rendering)
  const activeModules = modulesWithStatus.filter((m) => m.status === "active");

  // Check if a specific module is active
  const isModuleActive = useCallback(
    (moduleId: string) => {
      return activeModules.some((m) => m.id === moduleId);
    },
    [activeModules]
  );

  // Activate a module
  const activateModule = useCallback(
    async (moduleId: string) => {
      if (!projetoId || !workspaceId) {
        toast.error("Projeto ou workspace não identificado");
        return false;
      }

      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) {
          toast.error("Usuário não autenticado");
          return false;
        }

        // Check if module already exists (maybe archived)
        const existing = modulesWithStatus.find((m) => m.id === moduleId);
        
        if (existing?.projectModuleId && existing.status === "archived") {
          // Reactivate existing module
          const { error } = await supabase
            .from("project_modules")
            .update({
              status: "active",
              archived_at: null,
              archive_reason: null,
            })
            .eq("id", existing.projectModuleId);

          if (error) throw error;
        } else {
          // Insert new module
          const catalogModule = catalog.find((c) => c.id === moduleId);
          
          const { error } = await supabase.from("project_modules").insert({
            projeto_id: projetoId,
            module_id: moduleId,
            workspace_id: workspaceId,
            activated_by: session.session.user.id,
            display_order: catalogModule?.default_order || 100,
            status: "active",
          });

          if (error) throw error;
        }

        toast.success("Módulo ativado com sucesso");
        await refresh();
        return true;
      } catch (error: any) {
        toast.error("Erro ao ativar módulo: " + error.message);
        return false;
      }
    },
    [projetoId, workspaceId, catalog, modulesWithStatus, refresh]
  );

  // Deactivate/archive a module
  const deactivateModule = useCallback(
    async (moduleId: string, reason?: string) => {
      if (!projetoId) return false;

      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) {
          toast.error("Usuário não autenticado");
          return false;
        }

        const existing = modulesWithStatus.find((m) => m.id === moduleId);
        if (!existing?.projectModuleId) {
          toast.error("Módulo não encontrado");
          return false;
        }

        // Check if module has data
        const { data: hasData } = await supabase.rpc("check_module_has_data", {
          p_projeto_id: projetoId,
          p_module_id: moduleId,
        });

        if (hasData) {
          // Archive (preserve data)
          const { error } = await supabase
            .from("project_modules")
            .update({
              status: "archived",
              archived_at: new Date().toISOString(),
              archived_by: session.session.user.id,
              archive_reason: reason || "Desativado pelo usuário",
            })
            .eq("id", existing.projectModuleId);

          if (error) throw error;
          toast.success("Módulo arquivado (dados preservados)");
        } else {
          // Delete completely
          const { error } = await supabase
            .from("project_modules")
            .delete()
            .eq("id", existing.projectModuleId);

          if (error) throw error;
          toast.success("Módulo removido");
        }

        await refresh();
        return true;
      } catch (error: any) {
        toast.error("Erro ao desativar módulo: " + error.message);
        return false;
      }
    },
    [projetoId, modulesWithStatus, refresh]
  );

  // Bulk activate modules (for wizard)
  const activateModules = useCallback(
    async (moduleIds: string[]) => {
      if (!projetoId || !workspaceId) return false;

      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) return false;

        const inserts = moduleIds.map((moduleId) => {
          const catalogModule = catalog.find((c) => c.id === moduleId);
          return {
            projeto_id: projetoId,
            module_id: moduleId,
            workspace_id: workspaceId,
            activated_by: session.session!.user.id,
            display_order: catalogModule?.default_order || 100,
            status: "active" as const,
          };
        });

        // Use upsert to handle existing archived modules
        for (const insert of inserts) {
          const existing = modulesWithStatus.find((m) => m.id === insert.module_id);
          
          if (existing?.projectModuleId) {
            await supabase
              .from("project_modules")
              .update({
                status: "active",
                archived_at: null,
                archive_reason: null,
              })
              .eq("id", existing.projectModuleId);
          } else {
            await supabase.from("project_modules").insert(insert);
          }
        }

        await refresh();
        return true;
      } catch (error: any) {
        toast.error("Erro ao ativar módulos: " + error.message);
        return false;
      }
    },
    [projetoId, workspaceId, catalog, modulesWithStatus, refresh]
  );

  return {
    catalog,
    projectModules,
    modulesWithStatus,
    activeModules,
    loading,
    refresh,
    isModuleActive,
    activateModule,
    deactivateModule,
    activateModules,
  };
}
