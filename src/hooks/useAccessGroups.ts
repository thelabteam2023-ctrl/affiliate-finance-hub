import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

export interface AccessGroup {
  id: string;
  name: string;
  code: string;
  description: string | null;
  status: string;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  workspace_count?: number;
  bookmaker_count?: number;
}

export interface GroupWorkspace {
  id: string;
  group_id: string;
  workspace_id: string;
  added_at: string;
  added_by: string | null;
  workspace?: {
    id: string;
    name: string;
    owner_email?: string;
    owner_public_id?: string;
  };
}

export interface GroupBookmaker {
  id: string;
  group_id: string;
  bookmaker_catalogo_id: string;
  added_at: string;
  added_by: string | null;
  bookmaker?: {
    id: string;
    nome: string;
    logo_url: string | null;
    visibility: string | null;
  };
}

export interface ResolvedWorkspace {
  token: string;
  token_type: 'id' | 'email' | 'invalid';
  status: 'found' | 'not_found' | 'no_workspace' | 'invalid_format';
  owner_id: string | null;
  owner_public_id: string | null;
  owner_email: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  workspace_plan: string | null;
  selected?: boolean;
}

export interface BatchResolveResult {
  found: ResolvedWorkspace[];
  notFound: ResolvedWorkspace[];
  noWorkspace: ResolvedWorkspace[];
  invalid: ResolvedWorkspace[];
}

export function useAccessGroups() {
  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { isSystemOwner, user } = useAuth();

  const fetchGroups = useCallback(async () => {
    if (!isSystemOwner) {
      setGroups([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Fetch groups with counts
      const { data: groupsData, error: groupsError } = await supabase
        .from("access_groups")
        .select("*")
        .order("name");

      if (groupsError) throw groupsError;

      // Fetch workspace counts
      const { data: workspaceCounts } = await supabase
        .from("access_group_workspaces")
        .select("group_id");

      // Fetch bookmaker counts
      const { data: bookmakerCounts } = await supabase
        .from("access_group_bookmakers")
        .select("group_id");

      // Calculate counts
      const workspaceCountMap = new Map<string, number>();
      const bookmakerCountMap = new Map<string, number>();

      workspaceCounts?.forEach((w) => {
        workspaceCountMap.set(w.group_id, (workspaceCountMap.get(w.group_id) || 0) + 1);
      });

      bookmakerCounts?.forEach((b) => {
        bookmakerCountMap.set(b.group_id, (bookmakerCountMap.get(b.group_id) || 0) + 1);
      });

      const enrichedGroups = (groupsData || []).map((g) => ({
        ...g,
        workspace_count: workspaceCountMap.get(g.id) || 0,
        bookmaker_count: bookmakerCountMap.get(g.id) || 0,
      }));

      setGroups(enrichedGroups);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar grupos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [isSystemOwner, toast]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const createGroup = async (name: string, code: string, description?: string) => {
    if (!isSystemOwner) throw new Error("Acesso negado");

    const { data, error } = await supabase
      .from("access_groups")
      .insert({
        name,
        code: code.toLowerCase().replace(/[^a-z0-9]/g, "_"),
        description,
        created_by: user?.id,
      })
      .select()
      .single();

    if (error) throw error;

    await fetchGroups();
    return data;
  };

  const updateGroup = async (id: string, updates: { name?: string; description?: string; status?: string }) => {
    if (!isSystemOwner) throw new Error("Acesso negado");

    const { error } = await supabase
      .from("access_groups")
      .update(updates)
      .eq("id", id);

    if (error) throw error;

    await fetchGroups();
  };

  const deleteGroup = async (id: string) => {
    if (!isSystemOwner) throw new Error("Acesso negado");

    const { error } = await supabase
      .from("access_groups")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await fetchGroups();
  };

  // Workspaces in group
  const fetchGroupWorkspaces = async (groupId: string): Promise<GroupWorkspace[]> => {
    // Use RPC for reliable owner data access (bypasses RLS issues)
    const { data, error } = await supabase
      .rpc('admin_get_group_workspaces', { p_group_id: groupId });

    if (error) {
      console.error('[fetchGroupWorkspaces] RPC error:', error);
      throw error;
    }

    console.log('[fetchGroupWorkspaces] RPC result:', data);

    return (data || []).map((d: any) => ({
      id: d.id,
      group_id: d.group_id,
      workspace_id: d.workspace_id,
      added_at: d.added_at,
      added_by: d.added_by,
      workspace: {
        id: d.workspace_id,
        name: d.workspace_name || "—",
        owner_email: d.owner_email || "",
        owner_public_id: d.owner_public_id || "",
      },
    }));
  };

  const addWorkspacesToGroup = async (groupId: string, workspaceIds: string[]) => {
    if (!isSystemOwner || !user) throw new Error("Acesso negado");

    const inserts = workspaceIds.map((wsId) => ({
      group_id: groupId,
      workspace_id: wsId,
      added_by: user.id,
    }));

    const { error } = await supabase
      .from("access_group_workspaces")
      .upsert(inserts, { onConflict: "group_id,workspace_id" });

    if (error) throw error;

    await fetchGroups();
  };

  const removeWorkspacesFromGroup = async (groupId: string, workspaceIds: string[]) => {
    if (!isSystemOwner) throw new Error("Acesso negado");

    const { error } = await supabase
      .from("access_group_workspaces")
      .delete()
      .eq("group_id", groupId)
      .in("workspace_id", workspaceIds);

    if (error) throw error;

    await fetchGroups();
  };

  // Parse and classify tokens from input
  const parseTokens = (input: string): string[] => {
    return [...new Set(
      input
        .toLowerCase()
        .trim()
        .split(/[\s,;\n]+/)
        .map(t => t.trim())
        .filter(t => t.length > 0)
    )];
  };

  // Resolve workspaces by owner identifiers (IDs or emails)
  const resolveWorkspacesByOwnerIdentifiers = async (tokens: string[]): Promise<BatchResolveResult> => {
    if (tokens.length === 0) {
      return { found: [], notFound: [], noWorkspace: [], invalid: [] };
    }

    console.log('[resolveWorkspacesByOwnerIdentifiers] Tokens:', tokens);

    const { data, error } = await supabase
      .rpc('admin_resolve_workspaces_by_owner_identifiers', { p_tokens: tokens });

    if (error) {
      console.error('[resolveWorkspacesByOwnerIdentifiers] RPC error:', error);
      throw error;
    }

    console.log('[resolveWorkspacesByOwnerIdentifiers] RPC result:', data);

    const found: ResolvedWorkspace[] = [];
    const notFound: ResolvedWorkspace[] = [];
    const noWorkspace: ResolvedWorkspace[] = [];
    const invalid: ResolvedWorkspace[] = [];

    // Track unique tokens for each category
    const processedTokens = new Map<string, boolean>();

    (data || []).forEach((row: any) => {
      const item: ResolvedWorkspace = {
        token: row.token,
        token_type: row.token_type as 'id' | 'email' | 'invalid',
        status: row.status as 'found' | 'not_found' | 'no_workspace' | 'invalid_format',
        owner_id: row.owner_id,
        owner_public_id: row.owner_public_id,
        owner_email: row.owner_email,
        workspace_id: row.workspace_id,
        workspace_name: row.workspace_name,
        workspace_plan: row.workspace_plan,
        selected: row.status === 'found',
      };

      switch (row.status) {
        case 'found':
          found.push(item);
          break;
        case 'not_found':
          if (!processedTokens.has(row.token)) {
            notFound.push(item);
            processedTokens.set(row.token, true);
          }
          break;
        case 'no_workspace':
          if (!processedTokens.has(row.token)) {
            noWorkspace.push(item);
            processedTokens.set(row.token, true);
          }
          break;
        case 'invalid_format':
          if (!processedTokens.has(row.token)) {
            invalid.push(item);
            processedTokens.set(row.token, true);
          }
          break;
      }
    });

    console.log('[resolveWorkspacesByOwnerIdentifiers] Result:', {
      found: found.length,
      notFound: notFound.length,
      noWorkspace: noWorkspace.length,
      invalid: invalid.length,
    });

    return { found, notFound, noWorkspace, invalid };
  };

  // Legacy function for backward compatibility
  const findWorkspacesByEmails = async (emails: string[]): Promise<{ 
    found: Array<{ workspace_id: string; workspace_name: string; email: string }>; 
    notFound: string[];
    membersNotOwners: Array<{ email: string; workspaces: string[] }>;
  }> => {
    const tokens = parseTokens(emails.join('\n'));
    const result = await resolveWorkspacesByOwnerIdentifiers(tokens);
    
    return {
      found: result.found.map(f => ({
        workspace_id: f.workspace_id!,
        workspace_name: f.workspace_name!,
        email: f.owner_email!,
      })),
      notFound: result.notFound.map(n => n.token),
      membersNotOwners: [],
    };
  };

  // Bookmakers in group
  const fetchGroupBookmakers = async (groupId: string): Promise<GroupBookmaker[]> => {
    const { data, error } = await supabase
      .from("access_group_bookmakers")
      .select(`
        *,
        bookmaker:bookmakers_catalogo(id, nome, logo_url, visibility)
      `)
      .eq("group_id", groupId);

    if (error) throw error;

    return (data || []).map((d: any) => ({
      ...d,
      bookmaker: d.bookmaker,
    }));
  };

  const addBookmakersToGroup = async (groupId: string, bookmakerIds: string[], convertPrivateToRestricted: boolean = true) => {
    if (!isSystemOwner || !user) throw new Error("Acesso negado");

    // If converting, update visibility for private bookmakers
    if (convertPrivateToRestricted) {
      const { error: updateError } = await supabase
        .from("bookmakers_catalogo")
        .update({ visibility: "GLOBAL_RESTRICTED" })
        .in("id", bookmakerIds)
        .eq("visibility", "WORKSPACE_PRIVATE");

      if (updateError) throw updateError;
    }

    const inserts = bookmakerIds.map((bkId) => ({
      group_id: groupId,
      bookmaker_catalogo_id: bkId,
      added_by: user.id,
    }));

    const { error } = await supabase
      .from("access_group_bookmakers")
      .upsert(inserts, { onConflict: "group_id,bookmaker_catalogo_id" });

    if (error) throw error;

    await fetchGroups();
  };

  const removeBookmakersFromGroup = async (groupId: string, bookmakerIds: string[]) => {
    if (!isSystemOwner) throw new Error("Acesso negado");

    const { error } = await supabase
      .from("access_group_bookmakers")
      .delete()
      .eq("group_id", groupId)
      .in("bookmaker_catalogo_id", bookmakerIds);

    if (error) throw error;

    await fetchGroups();
  };

  return {
    groups,
    loading,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    fetchGroupWorkspaces,
    addWorkspacesToGroup,
    removeWorkspacesFromGroup,
    findWorkspacesByEmails,
    parseTokens,
    resolveWorkspacesByOwnerIdentifiers,
    fetchGroupBookmakers,
    addBookmakersToGroup,
    removeBookmakersFromGroup,
  };
}
