import { useState } from "react";
import { useNavigate, useSearchParams, useLocation, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, Eye, EyeOff, Mail, Lock, User, CreditCard, Phone, MailCheck, ArrowLeft } from "lucide-react";
import { z } from "zod";
import labbetLogo from "@/assets/labbet-logo-horizontal.png";
import { validateCPF, formatCPF } from "@/lib/validators";
import { PhoneInput } from "@/components/parceiros/PhoneInput";

// ── Validation schemas ──
const loginSchema = z.object({
  email: z.string().trim().min(1, "Email é obrigatório").email("Email inválido").max(255, "Email muito longo"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").max(128, "Senha muito longa"),
});

const signupSchema = z.object({
  displayName: z.string().trim().max(100, "Nome muito longo").optional().or(z.literal("")),
  email: z.string().trim().min(1, "Email é obrigatório").email("Email inválido").max(255, "Email muito longo"),
  cpf: z.string().min(1, "CPF é obrigatório").refine((val) => validateCPF(val), "CPF inválido"),
  telefone: z.string().optional().or(z.literal("")),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").max(128, "Senha muito longa"),
  confirmPassword: z.string().min(1, "Confirme sua senha"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

export default function Auth() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading, initialized } = useAuth();

  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const [signupComplete, setSignupComplete] = useState(false);
  const [signupCompletedEmail, setSignupCompletedEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<Date | null>(null);

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  // Signup fields
  const [displayName, setDisplayName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Reset password field
  const [resetEmail, setResetEmail] = useState("");

  const redirectTo = searchParams.get("redirect") || (location.state as any)?.from || null;

  // ── Loading state ──
  if (authLoading || !initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // ── Already authenticated ──
  if (user) {
    return <Navigate to={redirectTo || "/"} replace />;
  }

  // ── Brute-force helpers ──
  const checkIfBlocked = async (emailToCheck: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('check_login_blocked', { p_email: emailToCheck });
      if (error) return false;
      if (data && data.length > 0 && data[0].is_blocked) {
        setIsBlocked(true);
        setBlockedUntil(new Date(data[0].blocked_until));
        return true;
      }
      setIsBlocked(false);
      setBlockedUntil(null);
      return false;
    } catch { return false; }
  };

  const recordLoginAttempt = async (emailToRecord: string, success: boolean) => {
    try {
      await supabase.rpc('record_login_attempt', { p_email: emailToRecord, p_success: success, p_ip_address: null });
    } catch {}
  };

  // ── CPF mask ──
  const handleCpfChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    setCpf(formatCPF(digits));
  };

  // ── Handlers ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const validation = loginSchema.safeParse({ email: loginEmail, password: loginPassword });
      if (!validation.success) throw new Error(validation.error.errors[0].message);

      const blocked = await checkIfBlocked(loginEmail);
      if (blocked) return;

      const { error } = await supabase.auth.signInWithPassword({
        email: validation.data.email,
        password: validation.data.password,
      });

      if (error) {
        void recordLoginAttempt(loginEmail, false);
        void checkIfBlocked(loginEmail);
        throw new Error("Credenciais inválidas. Verifique seus dados e tente novamente.");
      }

      void recordLoginAttempt(loginEmail, true);
      toast({ title: "Login realizado!", description: "Bem-vindo de volta." });
      navigate(redirectTo || "/");
    } catch (error: any) {
      let msg = error.message;
      if (msg.includes("Invalid login credentials")) msg = "Credenciais inválidas. Verifique seus dados e tente novamente.";
      else if (msg.includes("Email not confirmed")) msg = "Email não confirmado. Verifique sua caixa de entrada.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const validation = signupSchema.safeParse({
        displayName, email: signupEmail, cpf, telefone, password: signupPassword, confirmPassword,
      });
      if (!validation.success) throw new Error(validation.error.errors[0].message);

      const fullName = validation.data.displayName || validation.data.email.split("@")[0];
      const cleanCpf = validation.data.cpf.replace(/\D/g, "");
      const cleanTelefone = validation.data.telefone || null;

      const { data, error } = await supabase.auth.signUp({
        email: validation.data.email,
        password: validation.data.password,
        options: {
          data: { full_name: fullName.toUpperCase(), cpf: cleanCpf, telefone: cleanTelefone },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) {
        if (error.message.includes("User already registered")) throw new Error("Este email já está em uso.");
        throw error;
      }

      // Try to save CPF/telefone to profile immediately
      if (data?.user?.id) {
        const updates: Record<string, string | null> = {};
        if (cleanCpf) updates.cpf = cleanCpf;
        if (cleanTelefone) updates.telefone = cleanTelefone;
        if (Object.keys(updates).length > 0) {
          await supabase.from('profiles').update(updates).eq('id', data.user.id);
        }
      }

      setSignupCompletedEmail(validation.data.email);
      setSignupComplete(true);
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({ title: "Email enviado!", description: "Verifique sua caixa de entrada para redefinir sua senha." });
      setShowPasswordReset(false);
    } catch {
      toast({ title: "Erro", description: "Não foi possível processar sua solicitação.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const formatTimeRemaining = (until: Date): string => {
    const diff = until.getTime() - Date.now();
    const minutes = Math.ceil(diff / 60000);
    return minutes <= 1 ? "menos de 1 minuto" : `${minutes} minutos`;
  };

  // ── Password reset view ──
  if (showPasswordReset) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <div className="border border-border rounded-2xl p-8 shadow-lg" style={{ backgroundColor: '#00204a' }}>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground mb-4">Recuperar senha</h1>
              <img src={labbetLogo} alt="LABBET" className="h-10 mx-auto mb-4 object-contain" />
              <p className="text-muted-foreground text-sm">
                Digite seu email para receber o link de recuperação
              </p>
            </div>

            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-sm font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    disabled={loading}
                    className="pl-10"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar email de recuperação
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full text-sm"
                onClick={() => setShowPasswordReset(false)}
                disabled={loading}
              >
                Voltar para login
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── Main auth view ──
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="border border-border rounded-2xl p-8 shadow-lg" style={{ backgroundColor: '#00204a' }}>
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-4">Bem-vindo</h1>
            <img src={labbetLogo} alt="LABBET" className="h-10 mx-auto mb-4 object-contain rounded-lg" />
            <p className="text-muted-foreground text-sm">
              Entre ou crie uma conta para gerenciar suas apostas
            </p>
          </div>

          {/* Email confirmation screen after signup */}
          {signupComplete ? (
            <div className="text-center space-y-5 py-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <MailCheck className="h-8 w-8 text-emerald-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">Verifique seu email</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Enviamos um link de confirmação para:
                </p>
                <p className="text-sm font-medium text-primary break-all">
                  {signupCompletedEmail}
                </p>
              </div>
              <div className="bg-muted/50 border border-border rounded-lg p-4 text-left space-y-2">
                <p className="text-sm text-muted-foreground">
                  📩 Abra seu email e clique no link de confirmação para ativar sua conta.
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Não encontrou? Verifique a pasta de spam ou lixo eletrônico.
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSignupComplete(false);
                  setActiveTab("login");
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para o login
              </Button>
            </div>
          ) : (
          <>
          {/* Blocked warning */}
          {isBlocked && blockedUntil && (
            <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg mb-6">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">Conta temporariamente bloqueada</p>
                <p className="text-sm text-muted-foreground">
                  Muitas tentativas de login. Aguarde {formatTimeRemaining(blockedUntil)} ou redefina sua senha.
                </p>
                <Button variant="link" className="h-auto p-0 text-sm" onClick={() => setShowPasswordReset(true)}>
                  Redefinir senha agora
                </Button>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex bg-muted rounded-lg p-1 mb-6">
            <button
              type="button"
              className={`flex-1 py-2.5 px-4 text-sm font-medium rounded-md transition-all ${
                activeTab === "login"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => { setActiveTab("login"); setIsBlocked(false); setBlockedUntil(null); }}
            >
              Entrar
            </button>
            <button
              type="button"
              className={`flex-1 py-2.5 px-4 text-sm font-medium rounded-md transition-all ${
                activeTab === "signup"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => { setActiveTab("signup"); setIsBlocked(false); setBlockedUntil(null); }}
            >
              Criar conta
            </button>
          </div>

          {/* Login form */}
          {activeTab === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email" className="text-sm font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="login-email"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => { setLoginEmail(e.target.value); if (isBlocked) { setIsBlocked(false); setBlockedUntil(null); } }}
                    placeholder="seu@email.com"
                    required
                    disabled={loading}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="login-password" className="text-sm font-medium">Senha</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => { setResetEmail(loginEmail); setShowPasswordReset(true); }}
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="login-password"
                    type={showLoginPassword ? "text" : "password"}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onKeyUp={(e) => setCapsLockOn(e.getModifierState("CapsLock"))}
                    onKeyDown={(e) => setCapsLockOn(e.getModifierState("CapsLock"))}
                    placeholder="••••••••"
                    required
                    disabled={loading || isBlocked}
                    minLength={6}
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                  >
                    {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {capsLockOn && (
                  <p className="text-xs text-warning flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Caps Lock está ativado
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading || isBlocked}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Entrar
              </Button>
            </form>
          )}

          {/* Signup form */}
          {activeTab === "signup" && (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="display-name" className="text-sm font-medium">
                  Nome de exibição <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Como você quer ser chamado"
                    disabled={loading}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-email" className="text-sm font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="signup-email"
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    disabled={loading}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpf" className="text-sm font-medium">CPF</Label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="cpf"
                    type="text"
                    value={cpf}
                    onChange={(e) => handleCpfChange(e.target.value)}
                    placeholder="000.000.000-00"
                    required
                    disabled={loading}
                    className="pl-10"
                    maxLength={14}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefone" className="text-sm font-medium">
                  Telefone <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <PhoneInput
                  value={telefone}
                  onChange={setTelefone}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-password" className="text-sm font-medium">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="signup-password"
                    type={showSignupPassword ? "text" : "password"}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                    minLength={6}
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                  >
                    {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-sm font-medium">Confirmar senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                    minLength={6}
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar conta
              </Button>
            </form>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
