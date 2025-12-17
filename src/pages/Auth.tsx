import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<Date | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/parceiros");
      }
    };
    checkSession();
  }, [navigate]);

  // Check if account is blocked before attempting login
  const checkIfBlocked = async (emailToCheck: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('check_login_blocked', {
        p_email: emailToCheck
      });
      
      if (error) {
        console.error('Error checking block status:', error);
        return false;
      }
      
      if (data && data.length > 0 && data[0].is_blocked) {
        setIsBlocked(true);
        setBlockedUntil(new Date(data[0].blocked_until));
        return true;
      }
      
      setIsBlocked(false);
      setBlockedUntil(null);
      return false;
    } catch (err) {
      console.error('Error in checkIfBlocked:', err);
      return false;
    }
  };

  // Record login attempt
  const recordLoginAttempt = async (emailToRecord: string, success: boolean) => {
    try {
      await supabase.rpc('record_login_attempt', {
        p_email: emailToRecord,
        p_success: success,
        p_ip_address: null // IP is captured server-side if needed
      });
    } catch (err) {
      console.error('Error recording login attempt:', err);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/parceiros`,
        }
      });

      if (error) throw error;
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Não foi possível conectar com o Google. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) throw error;

      toast({
        title: "Email enviado!",
        description: "Verifique sua caixa de entrada para redefinir sua senha.",
      });
      setShowPasswordReset(false);
      setIsBlocked(false);
      setBlockedUntil(null);
    } catch (error: any) {
      // Generic error message - don't reveal if email exists
      toast({
        title: "Erro",
        description: "Não foi possível processar sua solicitação. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        // Check if blocked before attempting login
        const blocked = await checkIfBlocked(email);
        if (blocked) {
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          // Record failed attempt
          await recordLoginAttempt(email, false);
          
          // Check if now blocked after this attempt
          await checkIfBlocked(email);
          
          // Generic error message - don't reveal if email exists or password is wrong
          throw new Error("Credenciais inválidas. Verifique seus dados e tente novamente.");
        }

        // Record successful login
        await recordLoginAttempt(email, true);

        toast({
          title: "Login realizado!",
          description: "Bem-vindo de volta.",
        });
        navigate("/parceiros");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
            emailRedirectTo: `${window.location.origin}/parceiros`,
          },
        });

        if (error) throw error;

        toast({
          title: "Cadastro realizado!",
          description: "Você já pode fazer login.",
        });
        setIsLogin(true);
      }
    } catch (error: any) {
      let errorMessage = error.message;
      
      // Keep error messages generic for security
      if (error.message.includes("Invalid login credentials")) {
        errorMessage = "Credenciais inválidas. Verifique seus dados e tente novamente.";
      } else if (error.message.includes("Email not confirmed")) {
        errorMessage = "Email não confirmado. Verifique sua caixa de entrada.";
      } else if (error.message.includes("User already registered")) {
        errorMessage = "Este email já está em uso.";
      }
      
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTimeRemaining = (until: Date): string => {
    const now = new Date();
    const diff = until.getTime() - now.getTime();
    const minutes = Math.ceil(diff / 60000);
    if (minutes <= 1) return "menos de 1 minuto";
    return `${minutes} minutos`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">
            {showPasswordReset ? "Recuperar senha" : isLogin ? "Entrar" : "Criar conta"}
          </CardTitle>
          <CardDescription>
            {showPasswordReset
              ? "Digite seu email para receber o link de recuperação"
              : isLogin
              ? "Entre com suas credenciais para acessar o sistema"
              : "Crie sua conta para começar a usar o sistema"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Blocked account warning */}
          {isBlocked && blockedUntil && (
            <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">
                  Conta temporariamente bloqueada
                </p>
                <p className="text-sm text-muted-foreground">
                  Muitas tentativas de login. Aguarde {formatTimeRemaining(blockedUntil)} ou redefina sua senha.
                </p>
                <Button
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={() => {
                    setShowPasswordReset(true);
                    setIsBlocked(false);
                  }}
                >
                  Redefinir senha agora
                </Button>
              </div>
            </div>
          )}

          {/* Google login button - show on login and signup, not on password reset */}
          {!showPasswordReset && !isBlocked && (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleLogin}
                disabled={loading || googleLoading}
              >
                {googleLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                )}
                Continuar com Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">ou</span>
                </div>
              </div>
            </>
          )}

          <form onSubmit={showPasswordReset ? handlePasswordReset : handleSubmit} className="space-y-4">
            {!isLogin && !showPasswordReset && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required={!isLogin}
                  disabled={loading}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  // Clear blocked state when email changes
                  if (isBlocked) {
                    setIsBlocked(false);
                    setBlockedUntil(null);
                  }
                }}
                required
                disabled={loading}
              />
            </div>
            {!showPasswordReset && (
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading || isBlocked}
                  minLength={6}
                />
              </div>
            )}
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading || (isLogin && isBlocked)}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {showPasswordReset ? "Enviar email de recuperação" : isLogin ? "Entrar" : "Criar conta"}
            </Button>
            {isLogin && !showPasswordReset && (
              <Button
                type="button"
                variant="link"
                className="w-full text-sm text-muted-foreground"
                onClick={() => setShowPasswordReset(true)}
                disabled={loading}
              >
                Esqueci minha senha
              </Button>
            )}
            {!showPasswordReset && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setIsBlocked(false);
                  setBlockedUntil(null);
                }}
                disabled={loading}
              >
                {isLogin ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
              </Button>
            )}
            {showPasswordReset && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setShowPasswordReset(false);
                  setIsLogin(true);
                }}
                disabled={loading}
              >
                Voltar para login
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
