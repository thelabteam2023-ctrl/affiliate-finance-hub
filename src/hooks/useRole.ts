import { useAuth } from "./useAuth";

export function useRole() {
  const { role, isOwnerOrAdmin, isSystemOwner } = useAuth();

  return {
    role,
    isOwner: role === 'owner',
    isAdmin: role === 'admin',
    isSystemOwner,
    isOwnerOrAdmin: isOwnerOrAdmin(),
    isFinance: role === 'finance',
    isOperator: role === 'operator',
    isViewer: role === 'viewer',
    canManageWorkspace: role === 'owner' || role === 'admin',
    canManageMembers: role === 'owner' || role === 'admin',
  };
}
