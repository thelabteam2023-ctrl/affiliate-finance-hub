import { useNavigate, useLocation } from "react-router-dom";
import { useCallback, useMemo } from "react";
import { ShieldX, Home, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SAFE_ROUTE } from "@/lib/routes";

interface AccessDeniedProps {
  message?: string;
}

interface LocationState {
  from?: string;
  deniedPath?: string;
}

export function AccessDenied({ message }: AccessDeniedProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Acesso Negado</CardTitle>
          <CardDescription>
            {message || "Você não tem permissão para acessar esta página."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground text-center">
            Você foi redirecionado para uma área sem permissão. 
            Entre em contato com o administrador do workspace para solicitar acesso.
          </p>
          
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
