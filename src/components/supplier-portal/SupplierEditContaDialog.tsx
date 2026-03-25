import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Eye, EyeOff, Loader2, Copy, Check, Building2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  login_username: string;
  login_password_encrypted: string;
  moeda: string;
  saldo_atual: number;
  observacoes: string | null;
  bookmakers_catalogo: { nome: string; logo_url: string | null } | null;
  supplier_titulares: { nome: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account;
  onSuccess: () => void;
}

export function SupplierEditContaDialog({ open, onOpenChange, account, onSuccess }: Props) {
  const [username, setUsername] = useState(account.login_username);
  const [password, setPassword] = useState("");
  const [observacoes, setObservacoes] = useState(account.observacoes || "");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoadingPassword, setIsLoadingPassword] = useState(false);
  const [passwordLoaded, setPasswordLoaded] = useState(false);
  const [copied, setCopied] = useState<"user" | "pass" | null>(null);

  const queryClient = useQueryClient();
  const supplierToken = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  useEffect(() => {
    if (open) {
      setUsername(account.login_username);
      setPassword("");
      setObservacoes(account.observacoes || "");
      setShowPassword(false);
      setPasswordLoaded(false);
    }
  }, [open, account.id]);

  async function loadPassword() {
    if (passwordLoaded) return;
    setIsLoadingPassword(true);
    try {
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/supplier-auth?action=decrypt-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anonKey },
          body: JSON.stringify({ token: supplierToken, account_id: account.id }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro");
      setPassword(data.password);
      setPasswordLoaded(true);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar senha");
    } finally {
      setIsLoadingPassword(false);
    }
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/supplier-auth?action=update-account`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anonKey },
          body: JSON.stringify({
            token: supplierToken,
            account_id: account.id,
            login_username: username.trim(),
            password: passwordLoaded ? password.trim() : undefined,
            observacoes: observacoes.trim() || null,
          }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro ao salvar");
      return data;
    },
    onSuccess: () => {
      toast.success("Conta atualizada com sucesso");
      queryClient.invalidateQueries({ queryKey: ["supplier-accounts"] });
      onSuccess();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/supplier-auth?action=delete-account`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anonKey },
          body: JSON.stringify({ token: supplierToken, account_id: account.id }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro ao excluir");
      return data;
    },
    onSuccess: () => {
      toast.success("Conta removida com sucesso");
      queryClient.invalidateQueries({ queryKey: ["supplier-accounts"] });
      onSuccess();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  function handleCopy(value: string, type: "user" | "pass") {
    navigator.clipboard.writeText(value);
    setCopied(type);
    setTimeout(() => setCopied(null), 1500);
  }

  const isPending = updateMutation.isPending || deleteMutation.isPending;
  const casaNome = account.bookmakers_catalogo?.nome || "Casa";
  const titularNome = account.supplier_titulares?.nome;
  const hasBalance = Number(account.saldo_atual) !== 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Editar Conta
          </DialogTitle>
        </DialogHeader>

        {/* Account header */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
          {account.bookmakers_catalogo?.logo_url ? (
            <img
              src={account.bookmakers_catalogo.logo_url}
              alt=""
              className="w-8 h-8 rounded-md object-contain bg-muted p-0.5"
            />
          ) : (
            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold">{casaNome}</p>
            {titularNome && (
              <p className="text-xs text-muted-foreground">{titularNome}</p>
            )}
          </div>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {account.moeda}
          </Badge>
        </div>

        <div className="space-y-4">
          {/* Login */}
          <div className="space-y-1.5">
            <Label>Login / Email</Label>
            <div className="flex gap-1.5">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Login"
                disabled={isPending}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0"
                onClick={() => handleCopy(username, "user")}
              >
                {copied === "user" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label>Senha</Label>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={passwordLoaded ? password : "••••••••"}
                  onChange={(e) => { if (passwordLoaded) setPassword(e.target.value); }}
                  onFocus={() => { if (!passwordLoaded) loadPassword(); }}
                  placeholder="Senha"
                  disabled={isPending || isLoadingPassword}
                  className="pr-10 font-mono"
                />
                {isLoadingPassword && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0"
                onClick={() => {
                  if (!passwordLoaded) loadPassword();
                  setShowPassword(!showPassword);
                }}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0"
                onClick={() => {
                  if (!passwordLoaded) {
                    loadPassword().then(() => handleCopy(password, "pass"));
                  } else {
                    handleCopy(password, "pass");
                  }
                }}
              >
                {copied === "pass" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Notas sobre esta conta..."
              rows={2}
              disabled={isPending}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                disabled={isPending || hasBalance}
                title={hasBalance ? "Zere o saldo antes de excluir" : undefined}
              >
                <Trash2 className="h-4 w-4" />
                Excluir
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
                <AlertDialogDescription>
                  A conta <strong>{casaNome}</strong> ({account.login_username}) será desativada permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Sim, excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={() => updateMutation.mutate()} disabled={isPending || !username.trim()}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
