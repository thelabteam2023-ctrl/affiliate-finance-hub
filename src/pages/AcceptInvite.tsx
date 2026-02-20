import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getRoleLabel } from "@/lib/roleLabels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Building2, 
  UserPlus,
  LogIn,
  AlertCircle
} from "lucide-react";

interface InviteInfo {
  found: boolean;
  status?: string;
  email?: string;
  role?: string;
  workspace_id?: string;
  workspace_name?: string;
  inviter_name?: string;
  expires_at?: string;
  error?: string;
}

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, session, refreshWorkspace, signOut } = useAuth();
  const { toast } = useToast();
  
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  
  // Form para cadastro
  const [showSignupForm, setShowSignupForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);

  // Buscar informações do convite
  useEffect(() => {
    const fetchInviteInfo = async () => {
      if (!token) {
        console.log("[AcceptInvite] Token ausente na URL");
        setInviteInfo({ found: false, error: "Token não fornecido na URL" });
        setLoading(false);
        return;
      }

      console.log("[AcceptInvite] Buscando convite com token:", token);

      try {
        const { data, error } = await supabase.rpc('get_invite_by_token', {
          _token: token
        });

        console.log("[AcceptInvite] Resposta RPC:", { data, error });

        if (error) {
          console.error("[AcceptInvite] Erro RPC:", error);
          throw error;
        }
        
        const info = data as unknown as InviteInfo;
        console.log("[AcceptInvite] Info processada:", info);
        setInviteInfo(info);
        
        if (info.email) {
          setEmail(info.email);
        }
      } catch (error: any) {
        console.error("[AcceptInvite] Error fetching invite:", error);
        setInviteInfo({ 
          found: false, 
          error: error.message || "Erro ao buscar convite" 
        });
      } finally {
        setLoading(false);
      }
    };

    fetchInviteInfo();
  }, [token]);

  // Se usuário logado e convite válido, tentar aceitar automaticamente
  useEffect(() => {
    const autoAccept = async () => {
      if (!user || !session || !inviteInfo?.found || inviteInfo.status !== 'pending') {
        return;
      }

      console.log("[AcceptInvite] Usuário logado, tentando auto-aceitar...");
      console.log("[AcceptInvite] Email user:", user.email);
      console.log("[AcceptInvite] Email convite:", inviteInfo.email);

      const userEmail = user.email?.toLowerCase();
      const inviteEmail = inviteInfo.email?.toLowerCase();
      
      // Se os emails correspondem, aceitar automaticamente
      if (userEmail === inviteEmail) {
        console.log("[AcceptInvite] Emails correspondem, aceitando...");
        await handleAcceptInvite();
      } else {
        console.log("[AcceptInvite] Emails não correspondem");
      }
    };

    if (!loading && inviteInfo?.found && !accepting) {
      autoAccept();
    }
  }, [user, session, inviteInfo, loading, accepting]);

  const handleAcceptInvite = async () => {
    if (!token || accepting) return;

    try {
      setAccepting(true);
      console.log("[AcceptInvite] Chamando RPC accept_workspace_invite...");
      
      const { data, error } = await supabase.rpc('accept_workspace_invite', {
        _token: token
      });

      console.log("[AcceptInvite] Resposta:", { data, error });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; workspace_id?: string; already_accepted?: boolean };

      if (!result.success) {
        throw new Error(result.error || 'Erro ao aceitar convite');
      }

      toast({
        title: result.already_accepted ? "Convite já aceito" : "Convite aceito!",
        description: `Você agora faz parte do workspace ${inviteInfo?.workspace_name}.`,
      });

      console.log("[AcceptInvite] Sucesso! Recarregando workspace...");
      
      // Forçar reload completo para garantir estado correto
      window.location.href = '/';
    } catch (error: any) {
      console.error("[AcceptInvite] Error accepting invite:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível aceitar o convite.",
        variant: "destructive",
      });
      setAccepting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password || !fullName) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSignupLoading(true);
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName.toUpperCase() },
          emailRedirectTo: `${window.location.origin}/accept-invite?token=${token}`,
        },
      });

      if (error) throw error;

      toast({
        title: "Conta criada!",
        description: "Você foi logado automaticamente. Aceitando convite...",
      });

      // Aguardar um momento para a sessão ser estabelecida
      setTimeout(async () => {
        await handleAcceptInvite();
      }, 1000);
    } catch (error: any) {
      console.error("Error signing up:", error);
      toast({
        title: "Erro no cadastro",
        description: error.message || "Não foi possível criar sua conta.",
        variant: "destructive",
      });
    } finally {
      setSignupLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando convite...</p>
        </div>
      </div>
    );
  }

  // Convite não encontrado ou erro
  if (!inviteInfo?.found) {
    const errorMessage = inviteInfo?.error || "Este link de convite é inválido ou foi removido.";
    const isTokenMissing = !token;
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>
              {isTokenMissing ? "Link inválido" : "Convite não encontrado"}
            </CardTitle>
            <CardDescription>
              {isTokenMissing 
                ? "O link do convite está incompleto. Verifique se você copiou o link corretamente."
                : errorMessage
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <Link to="/auth">Ir para Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Convite expirado
  if (inviteInfo.status === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
              <Clock className="h-8 w-8 text-amber-500" />
            </div>
            <CardTitle>Convite expirado</CardTitle>
            <CardDescription>
              Este convite expirou. Peça ao administrador para enviar um novo convite.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild variant="outline">
              <Link to="/auth">Ir para Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Convite cancelado
  if (inviteInfo.status === 'canceled') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-gray-500/10 flex items-center justify-center mb-4">
              <XCircle className="h-8 w-8 text-gray-500" />
            </div>
            <CardTitle>Convite cancelado</CardTitle>
            <CardDescription>
              Este convite foi cancelado pelo administrador.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild variant="outline">
              <Link to="/auth">Ir para Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Convite já aceito
  if (inviteInfo.status === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle>Convite já aceito</CardTitle>
            <CardDescription>
              Você já aceitou este convite para {inviteInfo.workspace_name}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <Link to="/">Ir para o Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Convite pendente - usuário logado com email diferente
  if (user && user.email?.toLowerCase() !== inviteInfo.email?.toLowerCase()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-amber-500" />
            </div>
            <CardTitle>Email diferente</CardTitle>
            <CardDescription>
              Este convite foi enviado para <strong>{inviteInfo.email}</strong>, mas você está logado como <strong>{user.email}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Por favor, saia e entre com a conta correta para aceitar este convite.
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" asChild>
                <Link to="/">Voltar</Link>
              </Button>
              <Button onClick={async () => {
                await signOut();
                window.location.reload();
              }}>
                <LogIn className="h-4 w-4 mr-2" />
                Trocar de conta
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Convite pendente - usuário logado com email correto (aceitando)
  if (user && accepting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Aceitando convite...</p>
        </div>
      </div>
    );
  }

  // Convite pendente - usuário não logado
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>Convite para Workspace</CardTitle>
          <CardDescription>
            {inviteInfo.inviter_name} convidou você para participar de
          </CardDescription>
          <div className="mt-2">
            <Badge variant="secondary" className="text-base px-3 py-1">
              {inviteInfo.workspace_name}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            como <strong>{getRoleLabel(inviteInfo.role as any)}</strong>
          </p>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {!showSignupForm ? (
            // Opções: Login ou Cadastro
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Para aceitar o convite, faça login ou crie uma conta.
              </p>
              
              <div className="space-y-2">
                <Button asChild className="w-full">
                  <Link to={`/auth?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`}>
                    <LogIn className="h-4 w-4 mr-2" />
                    Já tenho conta - Fazer Login
                  </Link>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setShowSignupForm(true)}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Criar nova conta
                </Button>
              </div>
            </div>
          ) : (
            // Formulário de cadastro inline
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome"
                  required
                  disabled={signupLoading}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  disabled={true} // Email do convite é fixo
                />
                <p className="text-xs text-muted-foreground">
                  O email do convite não pode ser alterado.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  disabled={signupLoading}
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowSignupForm(false)}
                  disabled={signupLoading}
                >
                  Voltar
                </Button>
                <Button type="submit" className="flex-1" disabled={signupLoading}>
                  {signupLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Criar conta e aceitar
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
