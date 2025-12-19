import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { NoWorkspaceScreen } from "@/components/NoWorkspaceScreen";
import { BlockedUserScreen } from "@/components/BlockedUserScreen";
import { AccessDenied } from "@/components/AccessDenied";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: string;
  requiredRole?: string[];
  requireSystemOwner?: boolean;
  fallback?: ReactNode;
}

export function ProtectedRoute({ 
  children, 
  requiredPermission,
  requiredRole,
  requireSystemOwner,
  fallback 
}: ProtectedRouteProps) {
  const { user, loading, initialized, role, hasPermission, workspace, isSystemOwner, isBlocked } = useAuth();
  const location = useLocation();
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(true);
  const [denyReason, setDenyReason] = useState<string | null>(null);

  useEffect(() => {
    const checkAccess = async () => {
      // Wait until fully initialized
      if (!user || !initialized) return;

      // SYSTEM OWNER has full access to everything
      if (isSystemOwner) {
        console.log('[ProtectedRoute] System owner - full access granted');
        setHasAccess(true);
        setPermissionChecked(true);
        return;
      }

      // System owner requirement - only system owners can access
      if (requireSystemOwner) {
        console.log('[ProtectedRoute] Denied: requires system owner');
        setDenyReason('Acesso restrito ao administrador do sistema.');
        setHasAccess(false);
        setPermissionChecked(true);
        return;
      }

      // Check role requirement
      if (requiredRole && requiredRole.length > 0) {
        if (!role || !requiredRole.includes(role)) {
          // Owner bypasses role checks
          if (role !== 'owner') {
            console.log('[ProtectedRoute] Denied: role not in required list', { 
              userRole: role, 
              requiredRoles: requiredRole 
            });
            setDenyReason(`Acesso restrito para: ${requiredRole.join(', ')}`);
            setHasAccess(false);
            setPermissionChecked(true);
            return;
          }
        }
      }

      // Check permission requirement
      if (requiredPermission) {
        // Owner and admin bypass permission checks
        if (role === 'owner' || role === 'admin') {
          console.log('[ProtectedRoute] Owner/Admin - permission check bypassed');
          setHasAccess(true);
          setPermissionChecked(true);
          return;
        }

        console.log('[ProtectedRoute] Checking permission:', {
          permission: requiredPermission,
          role: role,
          workspaceId: workspace?.id
        });

        const allowed = await hasPermission(requiredPermission);
        
        if (!allowed) {
          console.log('[ProtectedRoute] Denied: permission not granted', {
            permission: requiredPermission,
            role: role
          });
          setDenyReason(`Permissão necessária: ${requiredPermission}`);
        }
        
        setHasAccess(allowed);
      }

      setPermissionChecked(true);
    };

    checkAccess();
  }, [user, initialized, role, requiredPermission, requiredRole, requireSystemOwner, hasPermission, isSystemOwner, workspace?.id]);

  // Show loading while checking auth
  if (loading || !initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Redirect to auth if not logged in, passing current location
  if (!user) {
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }

  // Check if user is blocked
  if (isBlocked) {
    return <BlockedUserScreen />;
  }

  // Check if user has no workspace (system owner bypasses this requirement)
  if (!workspace && !isSystemOwner) {
    return <NoWorkspaceScreen />;
  }

  // Show loading while checking permissions
  if ((requiredPermission || requiredRole || requireSystemOwner) && !permissionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  // Show access denied if no permission
  if (!hasAccess) {
    if (fallback) {
      return <>{fallback}</>;
    }

    // Render AccessDenied with state for smart navigation
    return <AccessDenied message={denyReason || undefined} />;
  }

  return <>{children}</>;
}
