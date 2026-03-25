import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

      // If allowed list exists and has items, filter by it
      if (allowedIds && allowedIds.length > 0) {
        query = query.in("id", allowedIds);
      } else if (allowedIds && allowedIds.length === 0) {
        // No bookmakers configured = show nothing
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

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!catalogoId || !username || !password) throw new Error("Preencha os campos obrigatórios");

      const selectedCatalogo = catalogo.find((c: any) => c.id === catalogoId);

      const { error } = await supabase.from("supplier_bookmaker_accounts").insert({
        supplier_workspace_id: supplierWorkspaceId,
        bookmaker_catalogo_id: catalogoId,
        titular_id: titularId || null,
        login_username: username,
        login_password_encrypted: password, // TODO: encrypt client-side
        login_email: loginEmail || null,
        moeda: selectedCatalogo?.moeda_padrao || "BRL",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta criada com sucesso");
      queryClient.invalidateQueries({ queryKey: ["supplier-accounts"] });
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
    setLoginEmail("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Conta</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {catalogo.length === 0 && allowedIds !== undefined ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">
                Nenhuma casa de apostas foi configurada para este portal.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Solicite ao administrador que configure as casas permitidas.
              </p>
            </div>
          ) : (
          <>
          <div>
            <Label>Casa de Apostas *</Label>
            <Select value={catalogoId} onValueChange={setCatalogoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a casa" />
              </SelectTrigger>
              <SelectContent>
                {catalogo.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Titular</Label>
            <Select value={titularId} onValueChange={setTitularId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o titular (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {titulares.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Login / Username *</Label>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="usuario123" />
          </div>

          <div>
            <Label>Senha *</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </div>

          <div>
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
            disabled={!catalogoId || !username || !password || createMutation.isPending}
          >
            {createMutation.isPending ? "Criando..." : "Criar Conta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
