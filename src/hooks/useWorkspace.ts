import { useAuth } from "./useAuth";

export function useWorkspace() {
  const { workspace, workspaceId, refreshWorkspace } = useAuth();

  return {
    workspace,
    workspaceId,
    workspaceName: workspace?.name ?? null,
    workspaceSlug: workspace?.slug ?? null,
    workspacePlan: workspace?.plan ?? 'free',
    refreshWorkspace,
    hasWorkspace: !!workspace,
  };
}
