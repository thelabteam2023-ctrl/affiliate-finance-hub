import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierWorkspaceId: string;
  onSuccess: () => void;
}

export function SupplierNovaContaDialog({ open, onOpenChange, supplierWorkspaceId, onSuccess }: Props) {
  const [catalogoId, setCatalogoId] = useState("");
  const [titularId, setTitularId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const queryClient = useQueryClient();

  // Fetch allowed bookmakers for this supplier
  const { data: allowedIds } = useQuery({
    queryKey: ["supplier-allowed-bookmakers", supplierWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_allowed_bookmakers")
        .select("bookmaker_catalogo_id")
        .eq("supplier_workspace_id", supplierWorkspaceId);
      if (error) throw error;
      return (data || []).map((d: any) => d.bookmaker_catalogo_id);
    },
  });

  // Fetch bookmaker catalog, filtered by allowed list
  const { data: catalogo = [] } = useQuery({
    queryKey: ["bookmakers-catalogo-supplier", supplierWorkspaceId, allowedIds],
    queryFn: async () => {
      let query = supabase
        .from("bookmakers_catalogo")
        .select("id, nome, logo_url, moeda_padrao")
        .in("status", ["REGULAMENTADA", "NAO_REGULAMENTADA"])
        .order("nome");

      if (allowedIds && allowedIds.length > 0) {
        query = query.in("id", allowedIds);
      } else if (allowedIds && allowedIds.length === 0) {
        return [];
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: allowedIds !== undefined,
  });

  // Fetch titulares
  const { data: titulares = [] } = useQuery({
    queryKey: ["supplier-titulares", supplierWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_titulares")
        .select("id, nome")
        .eq("supplier_workspace_id", supplierWorkspaceId)
        .eq("status", "ATIVO")
        .order("nome");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch existing accounts to prevent duplicates (same casa + titular)
  const { data: existingAccounts = [] } = useQuery({
    queryKey: ["supplier-accounts-existing", supplierWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_bookmaker_accounts")
        .select("bookmaker_catalogo_id, titular_id")
        .eq("supplier_workspace_id", supplierWorkspaceId)
        .eq("status", "ATIVA");
      if (error) throw error;
      return data || [];
    },
  });

  const selectedCasa = catalogo.find((c: any) => c.id === catalogoId);

  // Filter titulares: only show those who DON'T already have an account for the selected casa
  const availableTitulares = useMemo(() => {
    if (!catalogoId) return titulares;
    const usedTitularIds = new Set(
      existingAccounts
        .filter((a: any) => a.bookmaker_catalogo_id === catalogoId && a.titular_id)
        .map((a: any) => a.titular_id)
    );
    return titulares.filter((t: any) => !usedTitularIds.has(t.id));
  }, [catalogoId, titulares, existingAccounts]);

  // Check if ALL titulares already have accounts for the selected casa
  const allTitularesUsed = catalogoId && availableTitulares.length === 0 && titulares.length > 0;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!catalogoId || !username || !password) throw new Error("Preencha os campos obrigatórios");

      // Double-check for duplicate
      if (titularId) {
        const isDuplicate = existingAccounts.some(
          (a: any) => a.bookmaker_catalogo_id === catalogoId && a.titular_id === titularId
        );
        if (isDuplicate) throw new Error("Este titular já possui conta nesta casa de apostas");
      }

      const { error } = await supabase.from("supplier_bookmaker_accounts").insert({
        supplier_workspace_id: supplierWorkspaceId,
        bookmaker_catalogo_id: catalogoId,
        titular_id: titularId || null,
        login_username: username,
        login_password_encrypted: password,
        login_email: loginEmail || null,
        moeda: selectedCasa?.moeda_padrao || "BRL",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta criada com sucesso");
      queryClient.invalidateQueries({ queryKey: ["supplier-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-accounts-existing"] });
      resetForm();
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message),
  });

  function resetForm() {
    setCatalogoId("");
    setTitularId("");
    setUsername("");
    setPassword("");
    setShowPassword(false);
    setLoginEmail("");
    onOpenChange(false);
  }

  // Reset titular when casa changes
  function handleCasaChange(value: string) {
    setCatalogoId(value);
    setTitularId("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Conta</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {catalogo.length === 0 && allowedIds !== undefined ? (
            <div className="text-center py-4">
              <Building2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhuma casa de apostas configurada.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Solicite ao administrador que configure as casas permitidas.
              </p>
            </div>
          ) : (
          <>
          {/* Casa de Apostas */}
          <div className="space-y-1.5">
            <Label>Casa de Apostas <span className="text-destructive">*</span></Label>
            <Select value={catalogoId} onValueChange={handleCasaChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a casa">
                  {selectedCasa && (
                    <span className="flex items-center gap-2">
                      <BookmakerIcon url={selectedCasa.logo_url} />
                      {selectedCasa.nome}
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {catalogo.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <BookmakerIcon url={c.logo_url} />
                        {c.nome}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* Titular */}
          <div className="space-y-1.5">
            <Label>
              Titular <span className="text-destructive">*</span>
            </Label>
            {allTitularesUsed ? (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <p className="text-xs text-muted-foreground">
                  Todos os titulares já possuem conta nesta casa.
                </p>
              </div>
            ) : (
              <Select value={titularId} onValueChange={setTitularId} disabled={!catalogoId}>
                <SelectTrigger>
                  <SelectValue placeholder={catalogoId ? "Selecione o titular" : "Selecione a casa primeiro"} />
                </SelectTrigger>
                <SelectContent>
                  {availableTitulares.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Login */}
          <div className="space-y-1.5">
            <Label>Login / Username <span className="text-destructive">*</span></Label>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="usuario123" />
          </div>

          {/* Senha */}
          <div className="space-y-1.5">
            <Label>Senha <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* E-mail */}
          <div className="space-y-1.5">
            <Label>E-mail de Login</Label>
            <Input value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="email@exemplo.com" />
          </div>
          </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!catalogoId || !titularId || !username || !password || !!allTitularesUsed || createMutation.isPending}
          >
            {createMutation.isPending ? "Criando..." : "Criar Conta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BookmakerIcon({ url }: { url: string | null }) {
  if (url) {
    return (
      <div className="w-5 h-5 rounded shrink-0 overflow-hidden bg-muted/50 flex items-center justify-center">
        <img src={url} alt="" className="w-4 h-4 object-contain" />
      </div>
    );
  }
  return <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />;
}
