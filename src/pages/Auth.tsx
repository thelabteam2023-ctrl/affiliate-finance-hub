import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
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
    } catch (error: any) {
      let errorMessage = error.message;
      
      // Traduzir erros comuns do Supabase para português
      if (error.message.includes("Invalid")) {
        errorMessage = "Email inválido ou não encontrado";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

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
      
      // Traduzir erros comuns do Supabase para português
      if (error.message.includes("Invalid login credentials")) {
        errorMessage = "Credenciais inválidas";
      } else if (error.message.includes("Email not confirmed")) {
        errorMessage = "Email não confirmado";
      } else if (error.message.includes("User already registered")) {
        errorMessage = "Usuário já cadastrado";
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
              : "Crie sua conta para começar a usar o Labbet"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={showPasswordReset ? handlePasswordReset : handleSubmit} className="space-y-4">
            {!isLogin && (
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
                onChange={(e) => setEmail(e.target.value)}
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
                  disabled={loading}
                  minLength={6}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
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
                onClick={() => setIsLogin(!isLogin)}
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
