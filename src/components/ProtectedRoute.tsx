import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { NoWorkspaceScreen } from "@/components/NoWorkspaceScreen";
import { BlockedUserScreen } from "@/components/BlockedUserScreen";
import { AccessDenied } from "@/components/AccessDenied";
import { Button } from "@/components/ui/button";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: string | string[];
  requiredRole?: string[];
  requireSystemOwner?: boolean;
  fallback?: ReactNode;
}

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
  const { user, loading, initialized, role, hasPermission, workspace, isSystemOwner, isBlocked, status } = useAuth();
  const location = useLocation();
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(true);
  const [denyReason, setDenyReason] = useState<string | null>(null);
  const [denyCode, setDenyCode] = useState<string | null>(null);

  useEffect(() => {
    const checkAccess = async () => {
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

      if (isSystemOwner) {
        console.log('[ProtectedRoute] System owner - full access granted', debugInfo);
        setHasAccess(true);
        setPermissionChecked(true);
        return;
      }

      if (requireSystemOwner) {
        logAccessDenial('REQUIRES_SYSTEM_OWNER', debugInfo);
        setDenyCode('REQUIRES_SYSTEM_OWNER');
        setDenyReason('Acesso restrito ao administrador do sistema.');
        setHasAccess(false);
        setPermissionChecked(true);
        return;
      }

      if (requiredRole && requiredRole.length > 0) {
        if (!role || !requiredRole.includes(role)) {
          if (role !== 'owner') {
            logAccessDenial('ROLE_INSUFFICIENT', { ...debugInfo, user_role: role, required_roles: requiredRole });
            setDenyCode('ROLE_INSUFFICIENT');
            setDenyReason(`Acesso restrito para: ${requiredRole.join(', ')}`);
            setHasAccess(false);
            setPermissionChecked(true);
            return;
          }
        }
      }

      if (requiredPermission) {
        if (role === 'owner' || role === 'admin') {
          console.log('[ProtectedRoute] Owner/Admin - permission check bypassed', debugInfo);
          setHasAccess(true);
          setPermissionChecked(true);
          return;
        }

        const permissionsToCheck = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];

        const results = await Promise.all(permissionsToCheck.map(p => hasPermission(p)));
        const allowed = results.some(r => r === true);
        
        if (!allowed) {
          logAccessDenial('PERMISSION_MISSING', { ...debugInfo, required_permissions: permissionsToCheck });
          setDenyCode('PERMISSION_MISSING');
          const permLabel = permissionsToCheck.join(' ou ');
          setDenyReason(`Permissão necessária: ${permLabel}`);
        }
        
        setHasAccess(allowed);
      }

      setPermissionChecked(true);
    };

    checkAccess();
  }, [user, initialized, role, requiredPermission, requiredRole, requireSystemOwner, hasPermission, isSystemOwner, workspace?.id, location.pathname]);

  // Show loading while bootstrapping
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

  // ── ERROR STATE: show retry screen only when status is truly 'error' ──
  if (!user && !loading && initialized) {
    const hasStoredSession = Object.keys(localStorage).some(key => 
      key.startsWith('sb-') && key.endsWith('-auth-token')
    );

    if (hasStoredSession) {
      // If status is 'error', show the error/retry screen
      if (status === 'error') {
        return (
          <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4 max-w-md text-center p-6">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <h2 className="text-xl font-semibold">Erro ao carregar sessão</h2>
              <p className="text-muted-foreground text-sm">
                Não foi possível verificar sua autenticação. Isso pode ser um problema temporário de conexão.
              </p>
              <div className="flex gap-3">
                <Button 
                  onClick={() => window.location.reload()} 
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Tentar novamente
                </Button>
                <Button 
                  variant="outline"
                  onClick={async () => {
                    const { supabase } = await import("@/integrations/supabase/client");
                    await supabase.auth.signOut();
                    window.location.href = "/auth";
                  }}
                >
                  Fazer login novamente
                </Button>
              </div>
            </div>
          </div>
        );
      }

      // Status is 'signed_out' but token exists — transient state during login, show spinner
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        </div>
      );
    }

    // No stored session — genuinely not authenticated
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }

  if (isBlocked) {
    return <BlockedUserScreen />;
  }

  if (!workspace && !isSystemOwner) {
    return <NoWorkspaceScreen />;
  }

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

  if (!hasAccess) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return <AccessDenied message={denyReason || undefined} />;
  }

  return <>{children}</>;
}
