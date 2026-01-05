import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuthVersionGuard } from "@/hooks/useAuthVersionGuard";
import { Loader2 } from "lucide-react";
import { NoWorkspaceScreen } from "@/components/NoWorkspaceScreen";
import { BlockedUserScreen } from "@/components/BlockedUserScreen";
import { AccessDenied } from "@/components/AccessDenied";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: string | string[];  // Aceita string ou array (qualquer uma é suficiente)
  requiredRole?: string[];
  requireSystemOwner?: boolean;
  fallback?: ReactNode;
}

/**
 * Logs access denial for debugging
 */
function logAccessDenial(reason: string, details: Record<string, any>) {
  console.warn('[ProtectedRoute] Access Denied:', reason, {
    timestamp: new Date().toISOString(),
    ...details,
  });
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
  const [denyCode, setDenyCode] = useState<string | null>(null);

  // CRÍTICO: Guard de auth_version para session versioning
  // Bloqueia validação enquanto o auth ainda está carregando (evita loop)
  const guardUserId = !loading && initialized ? (user?.id ?? null) : null;
  const guardWorkspaceId = !loading && initialized ? (workspace?.id ?? null) : null;

  const { isValid: isSessionValid, isChecking: isCheckingVersion } = useAuthVersionGuard(
    guardUserId,
    guardWorkspaceId
  );

  useEffect(() => {
    const checkAccess = async () => {
      // Wait until fully initialized
      if (!user || !initialized) return;

      const debugInfo = {
        route: location.pathname,
        user_id: user.id,
        workspace_id: workspace?.id,
        role: role,
        is_system_owner: isSystemOwner,
        required_permission: requiredPermission,
        required_roles: requiredRole,
        require_system_owner: requireSystemOwner,
      };

      // SYSTEM OWNER has full access to everything
      if (isSystemOwner) {
        console.log('[ProtectedRoute] System owner - full access granted', debugInfo);
        setHasAccess(true);
        setPermissionChecked(true);
        return;
      }

      // System owner requirement - only system owners can access
      if (requireSystemOwner) {
        logAccessDenial('REQUIRES_SYSTEM_OWNER', debugInfo);
        setDenyCode('REQUIRES_SYSTEM_OWNER');
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
            logAccessDenial('ROLE_INSUFFICIENT', {
              ...debugInfo,
              user_role: role,
              required_roles: requiredRole,
            });
            setDenyCode('ROLE_INSUFFICIENT');
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
          console.log('[ProtectedRoute] Owner/Admin - permission check bypassed', debugInfo);
          setHasAccess(true);
          setPermissionChecked(true);
          return;
        }

        // Handle array of permissions (ANY is sufficient)
        const permissionsToCheck = Array.isArray(requiredPermission) 
          ? requiredPermission 
          : [requiredPermission];

        console.log('[ProtectedRoute] Checking permissions:', {
          permissions: permissionsToCheck,
          role: role,
          workspaceId: workspace?.id
        });

        // Check if user has ANY of the required permissions
        const results = await Promise.all(
          permissionsToCheck.map(p => hasPermission(p))
        );
        const allowed = results.some(r => r === true);
        
        if (!allowed) {
          logAccessDenial('PERMISSION_MISSING', {
            ...debugInfo,
            required_permissions: permissionsToCheck,
          });
          setDenyCode('PERMISSION_MISSING');
          const permLabel = permissionsToCheck.join(' ou ');
          setDenyReason(`Permissão necessária: ${permLabel}`);
        } else {
          const grantedPerm = permissionsToCheck[results.findIndex(r => r)];
          console.log('[ProtectedRoute] Permission granted:', grantedPerm);
        }
        
        setHasAccess(allowed);
      }

      setPermissionChecked(true);
    };

    checkAccess();
  }, [user, initialized, role, requiredPermission, requiredRole, requireSystemOwner, hasPermission, isSystemOwner, workspace?.id, location.pathname]);

  // Show loading while checking auth or auth_version
  if (loading || !initialized || isCheckingVersion) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Se a sessão não é válida, o guard já está fazendo logout (1x)
  // Mostrar loading até o auth propagar o SIGNED_OUT (evita bounce /auth ↔ app)
  if (!isSessionValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Sessão expirada, redirecionando...</p>
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
