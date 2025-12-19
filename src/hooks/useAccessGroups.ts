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
    const { data, error } = await supabase
      .from("access_group_workspaces")
      .select(`
        *,
        workspace:workspaces(id, name)
      `)
      .eq("group_id", groupId);

    if (error) throw error;

    // Fetch owner emails separately
    const workspaceIds = data?.map(d => d.workspace_id) || [];
    const { data: membersData } = await supabase
      .from("workspace_members")
      .select(`
        workspace_id,
        user_id,
        role,
        profile:profiles(email)
      `)
      .in("workspace_id", workspaceIds)
      .eq("role", "owner");

    const ownerMap = new Map<string, string>();
    membersData?.forEach((m: any) => {
      if (m.profile?.email) {
        ownerMap.set(m.workspace_id, m.profile.email);
      }
    });

    return (data || []).map((d: any) => ({
      ...d,
      workspace: d.workspace ? {
        ...d.workspace,
        owner_email: ownerMap.get(d.workspace_id) || "",
      } : undefined,
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

  // Find workspaces by owner email using server-side RPC
  const findWorkspacesByEmails = async (emails: string[]): Promise<{ 
    found: Array<{ workspace_id: string; workspace_name: string; email: string }>; 
    notFound: string[];
    membersNotOwners: Array<{ email: string; workspaces: string[] }>;
  }> => {
    // Normalize: lowercase, trim, split by comma/semicolon/newlines, remove empty and duplicates
    const normalizedEmails = [...new Set(
      emails
        .flatMap(e => e.split(/[\n,;]+/))
        .map(e => e.toLowerCase().trim())
        .filter(e => e.length > 0 && e.includes('@'))
    )];

    console.log('[findWorkspacesByEmails] Normalized emails:', normalizedEmails);

    if (normalizedEmails.length === 0) {
      return { found: [], notFound: [], membersNotOwners: [] };
    }

    // Call server-side RPC function
    const { data, error } = await supabase
      .rpc('admin_find_workspaces_by_owner_emails', { p_emails: normalizedEmails });

    console.log('[findWorkspacesByEmails] RPC result:', { data, error });

    if (error) {
      console.error('[findWorkspacesByEmails] RPC error:', error);
      throw error;
    }

    const found: Array<{ workspace_id: string; workspace_name: string; email: string }> = [];
    const foundEmails = new Set<string>();
    const membersNotOwners: Array<{ email: string; workspaces: string[] }> = [];

    (data || []).forEach((row: any) => {
      if (row.is_owner && row.workspace_id) {
        found.push({
          workspace_id: row.workspace_id,
          workspace_name: row.workspace_name,
          email: row.owner_email,
        });
        foundEmails.add(row.owner_email.toLowerCase());
      } else if (row.is_member && !row.is_owner && row.member_workspaces) {
        membersNotOwners.push({
          email: row.owner_email,
          workspaces: row.member_workspaces,
        });
        foundEmails.add(row.owner_email.toLowerCase());
      }
    });

    const notFound = normalizedEmails.filter(e => !foundEmails.has(e));

    console.log('[findWorkspacesByEmails] Final result:', { 
      found: found.length, 
      notFound: notFound.length, 
      membersNotOwners: membersNotOwners.length 
    });

    return { found, notFound, membersNotOwners };
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
    fetchGroupBookmakers,
    addBookmakersToGroup,
    removeBookmakersFromGroup,
  };
}
