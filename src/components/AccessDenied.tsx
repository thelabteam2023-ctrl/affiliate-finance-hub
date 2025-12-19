import { useNavigate, useLocation } from "react-router-dom";
import { useCallback, useMemo, useEffect } from "react";
import { ShieldX, Home, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SAFE_ROUTE } from "@/lib/routes";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";

interface AccessDeniedProps {
  message?: string;
  denyCode?: string;
}

interface LocationState {
  from?: string;
  deniedPath?: string;
}

export function AccessDenied({ message, denyCode }: AccessDeniedProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const { user, role, isSystemOwner } = useAuth();
  const { workspaceId, workspaceName } = useWorkspace();
  
  // Log access denial for debugging
  useEffect(() => {
    console.warn('[AccessDenied] Access denied displayed', {
      timestamp: new Date().toISOString(),
      denied_path: location.pathname,
      deny_code: denyCode,
      deny_message: message,
      user_id: user?.id,
      workspace_id: workspaceId,
      workspace_name: workspaceName,
      role: role,
      is_system_owner: isSystemOwner,
      from_state: state?.from,
      referrer: document.referrer,
    });
  }, [location.pathname, denyCode, message, user, workspaceId, workspaceName, role, isSystemOwner, state]);
  
  // Determina se podemos usar o histórico de forma segura
  const canGoBack = useMemo(() => {
    // Se temos uma rota anterior no state
    if (state?.from) {
      // Evitar loop: não voltar para a mesma rota que foi negada
      if (state.from === location.pathname) return false;
      if (state.from === state.deniedPath) return false;
      // Não voltar para rotas de auth
      if (state.from.startsWith('/auth')) return false;
      return true;
    }
    
    // Verificar se há histórico disponível
    // window.history.length > 2 significa que há páginas antes desta
    return window.history.length > 2;
  }, [state, location.pathname]);
  
  const handleGoBack = useCallback(() => {
    if (canGoBack && state?.from) {
      // Usar a rota anterior do state
      navigate(state.from, { replace: true });
    } else if (canGoBack) {
      // Tentar voltar pelo histórico
      navigate(-1);
    } else {
      // Fallback: ir para rota segura
      navigate(SAFE_ROUTE, { replace: true });
    }
  }, [canGoBack, state, navigate]);
  
  const handleGoHome = useCallback(() => {
    navigate(SAFE_ROUTE, { replace: true });
  }, [navigate]);

  // Determine display message based on deny code
  const displayMessage = useMemo(() => {
    if (message) return message;
    
    switch (denyCode) {
      case 'REQUIRES_SYSTEM_OWNER':
        return 'Esta área é restrita ao administrador do sistema.';
      case 'ROLE_INSUFFICIENT':
        return 'Sua função não tem acesso a esta área.';
      case 'PERMISSION_MISSING':
        return 'Você não tem a permissão necessária para acessar esta página.';
      case 'NO_WORKSPACE':
        return 'Você não está associado a nenhum workspace.';
      case 'NO_MEMBERSHIP':
        return 'Você não é membro deste workspace.';
      default:
        return 'Você não tem permissão para acessar esta página.';
    }
  }, [message, denyCode]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Acesso Negado</CardTitle>
          <CardDescription>
            {displayMessage}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground text-center">
            Você foi redirecionado para uma área sem permissão. 
            Entre em contato com o administrador do workspace para solicitar acesso.
          </p>
          
          {/* Debug info in development */}
          {process.env.NODE_ENV === 'development' && (
            <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono">
              <p className="text-muted-foreground mb-1">Debug Info:</p>
              <p>Role: {role || 'N/A'}</p>
              <p>Workspace: {workspaceName || 'N/A'}</p>
              <p>Path: {location.pathname}</p>
              {denyCode && <p>Code: {denyCode}</p>}
            </div>
          )}
          
          <div className="flex flex-col gap-2">
            <Button 
              variant="default" 
              onClick={handleGoHome}
              className="w-full"
            >
              <Home className="mr-2 h-4 w-4" />
              Ir para Início
            </Button>
            
            {canGoBack && (
              <Button 
                variant="outline" 
                onClick={handleGoBack}
                className="w-full"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
