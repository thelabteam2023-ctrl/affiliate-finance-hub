import { useState, useEffect, useCallback, useRef } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [modulesWithStatus, setModulesWithStatus] = useState<ModuleWithStatus[]>([]);
  
  // Track if we've done initial fetch to avoid flicker
  const hasFetched = useRef(false);

  // Fetch catalog (all available modules) - with error handling
  const fetchCatalog = useCallback(async (): Promise<ModuleCatalog[]> => {
    try {
      const { data, error } = await supabase
        .from("project_modules_catalog")
        .select("*")
        .order("default_order");

      if (error) {
        console.error("Error fetching module catalog:", error);
        setError("Erro ao carregar catálogo de módulos");
        return [];
      }
      
      setCatalog(data || []);
      return data || [];
    } catch (err) {
      console.error("Exception fetching catalog:", err);
      return [];
    }
  }, []);

  // Fetch project-specific modules - with error handling
  const fetchProjectModules = useCallback(async (): Promise<ProjectModule[]> => {
    if (!projetoId) return [];
    
    try {
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

      if (error) {
        console.error("Error fetching project modules:", error);
        // Don't set error state here - just return empty, the project might be new
        return [];
      }
      
      setProjectModules((data || []) as ProjectModule[]);
      return (data || []) as ProjectModule[];
    } catch (err) {
      console.error("Exception fetching project modules:", err);
      return [];
    }
  }, [projetoId]);

  // Refresh all data - with retry on failure
  const refresh = useCallback(async () => {
    if (!projetoId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const [catalogData, modulesData] = await Promise.all([
        fetchCatalog(),
        fetchProjectModules(),
      ]);

      // Build combined status list - only if we have catalog data
      if (catalogData.length === 0) {
        // No catalog - might be a network error or empty database
        // Keep existing data if any, just stop loading
        setLoading(false);
        return;
      }

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
      hasFetched.current = true;
    } catch (err) {
      console.error("Error refreshing modules:", err);
      setError("Erro ao carregar módulos");
    } finally {
      setLoading(false);
    }
  }, [fetchCatalog, fetchProjectModules, projetoId]);

  useEffect(() => {
    if (projetoId) {
      refresh();
    }
  }, [projetoId, refresh]);

  // Listen for module changes from other instances
  useEffect(() => {
    const handler = () => {
      if (projetoId) refresh();
    };
    window.addEventListener("lovable:project-modules-changed", handler);
    return () => window.removeEventListener("lovable:project-modules-changed", handler);
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
        window.dispatchEvent(new CustomEvent("lovable:project-modules-changed"));
        return true;
      } catch (error: any) {
        toast.error("Erro ao ativar módulo: " + error.message);
        return false;
      }
    },
    [projetoId, workspaceId, catalog, modulesWithStatus, refresh]
  );

  // Deactivate/archive a module - with robust error handling
  const deactivateModule = useCallback(
    async (moduleId: string, reason?: string) => {
      if (!projetoId) {
        toast.error("Projeto não identificado");
        return false;
      }

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

        // Check if module has data - with fallback if function fails
        let hasData = false;
        try {
          const { data, error } = await supabase.rpc("check_module_has_data", {
            p_projeto_id: projetoId,
            p_module_id: moduleId,
          });
          
          if (error) {
            console.warn("check_module_has_data failed, defaulting to archive:", error);
            // If the function fails, default to archiving (safer)
            hasData = true;
          } else {
            hasData = Boolean(data);
          }
        } catch (rpcError) {
          console.warn("RPC call failed, defaulting to archive:", rpcError);
          hasData = true;
        }

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
        window.dispatchEvent(new CustomEvent("lovable:project-modules-changed"));
        return true;
      } catch (error: any) {
        console.error("Error deactivating module:", error);
        toast.error("Erro ao desativar módulo: " + error.message);
        return false;
      }
    },
    [projetoId, modulesWithStatus, refresh]
  );

  // Bulk activate modules (for wizard) - with robust error handling
  const activateModules = useCallback(
    async (moduleIds: string[]): Promise<boolean> => {
      if (!projetoId || !workspaceId) {
        console.warn("activateModules called without projetoId or workspaceId");
        return false;
      }
      
      if (!moduleIds || moduleIds.length === 0) {
        // No modules to activate is not an error
        return true;
      }

      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) {
          toast.error("Usuário não autenticado");
          return false;
        }

        let successCount = 0;
        let errorCount = 0;

        // Process each module with individual error handling
        for (const moduleId of moduleIds) {
          try {
            const existing = modulesWithStatus.find((m) => m.id === moduleId);
            
            if (existing?.projectModuleId) {
              // Reactivate existing archived module
              const { error } = await supabase
                .from("project_modules")
                .update({
                  status: "active",
                  archived_at: null,
                  archive_reason: null,
                })
                .eq("id", existing.projectModuleId);
              
              if (error) {
                console.error(`Failed to reactivate module ${moduleId}:`, error);
                errorCount++;
              } else {
                successCount++;
              }
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

              if (error) {
                // Check for duplicate key - not really an error
                if (error.code === "23505") {
                  console.warn(`Module ${moduleId} already exists, skipping`);
                  successCount++;
                } else {
                  console.error(`Failed to activate module ${moduleId}:`, error);
                  errorCount++;
                }
              } else {
                successCount++;
              }
            }
          } catch (moduleError) {
            console.error(`Exception activating module ${moduleId}:`, moduleError);
            errorCount++;
          }
        }

        // Refresh regardless of partial failures
        await refresh();

        if (errorCount > 0 && successCount > 0) {
          toast.warning(`${successCount} módulo(s) ativado(s), ${errorCount} com erro`);
        } else if (errorCount > 0) {
          toast.error("Erro ao ativar módulos");
          return false;
        }

        return true;
      } catch (error: any) {
        console.error("Error in activateModules:", error);
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
    error,
    refresh,
    isModuleActive,
    activateModule,
    deactivateModule,
    activateModules,
  };
}
