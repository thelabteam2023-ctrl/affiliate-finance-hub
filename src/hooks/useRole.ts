import { useAuth } from "./useAuth";

export function useRole() {
  const { role, isOwnerOrAdmin, isMaster } = useAuth();

  return {
    role,
    isOwner: role === 'owner',
    isAdmin: role === 'admin',
    isMaster: isMaster(),
    isOwnerOrAdmin: isOwnerOrAdmin(),
    isFinance: role === 'finance',
    isOperator: role === 'operator',
    isViewer: role === 'viewer',
    canManageWorkspace: role === 'owner' || role === 'admin' || role === 'master',
    canManageMembers: role === 'owner' || role === 'admin' || role === 'master',
  };
}
