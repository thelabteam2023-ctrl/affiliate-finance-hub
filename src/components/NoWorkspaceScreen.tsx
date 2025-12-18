import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, LogOut, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function NoWorkspaceScreen() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mb-4">
            <Clock className="h-8 w-8 text-amber-400" />
          </div>
          <CardTitle className="text-2xl">Aguardando Liberação</CardTitle>
          <CardDescription className="text-base">
            Sua conta foi criada com sucesso, mas ainda não foi vinculada a um workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              O administrador do sistema precisa liberar seu acesso. Isso pode levar alguns minutos ou horas, dependendo da disponibilidade.
            </p>
            <p className="text-sm text-muted-foreground">
              Você receberá uma notificação quando seu acesso for liberado.
            </p>
          </div>

          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" />
            <span>Logado como: {user?.email}</span>
          </div>

          <Button 
            variant="outline" 
            className="w-full gap-2"
            onClick={() => signOut()}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
