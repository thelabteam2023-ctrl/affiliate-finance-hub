import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, LogOut, Mail, UserPlus, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface PendingInvite {
  id: string;
  token: string;
  workspace_name: string;
  role: string;
}

export function NoWorkspaceScreen() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    const checkPendingInvites = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        console.log("[NoWorkspaceScreen] Verificando convites pendentes para:", user.email);
        
        // Chamar RPC para buscar convites pendentes do usuário
        const { data, error } = await supabase.rpc('get_my_pending_invites');
        
        if (error) {
          console.error("[NoWorkspaceScreen] Erro ao buscar convites:", error);
          setLoading(false);
          return;
        }

        console.log("[NoWorkspaceScreen] Convites encontrados:", data);
        
        if (data && Array.isArray(data) && data.length > 0) {
          setPendingInvites(data as PendingInvite[]);
        }
      } catch (error) {
        console.error("[NoWorkspaceScreen] Erro:", error);
      } finally {
        setLoading(false);
      }
    };

    checkPendingInvites();
  }, [user]);

  const handleAcceptInvite = async (invite: PendingInvite) => {
    setAccepting(true);
    try {
      console.log("[NoWorkspaceScreen] Aceitando convite:", invite.token);
      
      const { data, error } = await supabase.rpc('accept_workspace_invite', {
        _token: invite.token
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; workspace_id?: string };
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao aceitar convite');
      }

      console.log("[NoWorkspaceScreen] Convite aceito! Recarregando...");
      
      // Forçar reload para atualizar o estado do auth
      window.location.href = '/';
    } catch (error: any) {
      console.error("[NoWorkspaceScreen] Erro ao aceitar:", error);
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Se tem convites pendentes, mostrar opção de aceitar
  if (pendingInvites.length > 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
              <UserPlus className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Convite Pendente</CardTitle>
            <CardDescription className="text-base">
              Você foi convidado para participar de um workspace!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingInvites.map((invite) => (
              <div 
                key={invite.id}
                className="bg-muted/50 rounded-lg p-4 space-y-3"
              >
                <div className="text-center">
                  <p className="font-medium text-lg">{invite.workspace_name}</p>
                  <p className="text-sm text-muted-foreground">
                    Função: {invite.role}
                  </p>
                </div>
                <Button 
                  className="w-full"
                  onClick={() => handleAcceptInvite(invite)}
                  disabled={accepting}
                >
                  {accepting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4 mr-2" />
                  )}
                  Aceitar Convite
                </Button>
              </div>
            ))}

            <div className="flex items-center gap-3 text-sm text-muted-foreground pt-2">
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

  // Sem convites pendentes - mostrar tela de aguardando
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