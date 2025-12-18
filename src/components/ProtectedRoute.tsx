import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, ShieldX } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NoWorkspaceScreen } from "@/components/NoWorkspaceScreen";
import { BlockedUserScreen } from "@/components/BlockedUserScreen";

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

  useEffect(() => {
    const checkAccess = async () => {
      // Wait until fully initialized
      if (!user || !initialized) return;

      // SYSTEM OWNER has full access to everything
      if (isSystemOwner) {
        setHasAccess(true);
        setPermissionChecked(true);
        return;
      }

      // System owner requirement - only system owners can access
      if (requireSystemOwner) {
        setHasAccess(false);
        setPermissionChecked(true);
        return;
      }

      // Check role requirement
      if (requiredRole && requiredRole.length > 0) {
        if (!role || !requiredRole.includes(role)) {
          // Owner and master bypass role checks
          if (role !== 'owner' && role !== 'master') {
            setHasAccess(false);
            setPermissionChecked(true);
            return;
          }
        }
      }

      // Check permission requirement
      if (requiredPermission) {
        // Owner, admin, and master bypass permission checks
        if (role === 'owner' || role === 'admin' || role === 'master') {
          setHasAccess(true);
          setPermissionChecked(true);
          return;
        }

        const allowed = await hasPermission(requiredPermission);
        setHasAccess(allowed);
      }

      setPermissionChecked(true);
    };

    checkAccess();
  }, [user, initialized, role, requiredPermission, requiredRole, requireSystemOwner, hasPermission, isSystemOwner]);

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

  // Redirect to auth if not logged in
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
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

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <ShieldX className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Acesso Negado</CardTitle>
            <CardDescription>
              Você não tem permissão para acessar esta página.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground text-center">
              Entre em contato com o administrador do workspace para solicitar acesso.
            </p>
            <Button 
              variant="outline" 
              onClick={() => window.history.back()}
              className="w-full"
            >
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
