import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Building2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  const [casaSearch, setCasaSearch] = useState("");
  const [casaPickerOpen, setCasaPickerOpen] = useState(false);
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

  const selectedCasa = catalogo.find((c: any) => c.id === catalogoId);

  const filteredCasas = useMemo(() => {
    if (!casaSearch) return catalogo;
    const q = casaSearch.toLowerCase();
    return catalogo.filter((c: any) => c.nome.toLowerCase().includes(q));
  }, [catalogo, casaSearch]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!catalogoId || !username || !password) throw new Error("Preencha os campos obrigatórios");

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
    setCasaSearch("");
    setCasaPickerOpen(false);
    onOpenChange(false);
  }

  function BookmakerLogo({ url, nome }: { url: string | null; nome: string }) {
    if (url) {
      return (
        <div className="w-7 h-7 rounded-md bg-muted/50 flex items-center justify-center overflow-hidden shrink-0 border border-border/30">
          <img src={url} alt={nome} className="w-5 h-5 object-contain" />
        </div>
      );
    }
    return (
      <div className="w-7 h-7 rounded-md bg-muted/50 flex items-center justify-center shrink-0 border border-border/30">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
          {/* Casa de Apostas - Custom Picker */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Casa de Apostas <span className="text-destructive">*</span>
            </Label>

            {!casaPickerOpen && catalogoId ? (
              <button
                type="button"
                onClick={() => setCasaPickerOpen(true)}
                className="w-full flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:border-primary/40 transition-colors"
              >
                <BookmakerLogo url={selectedCasa?.logo_url} nome={selectedCasa?.nome || ""} />
                <span className="text-sm font-medium flex-1">{selectedCasa?.nome}</span>
                <span className="text-xs text-muted-foreground">Alterar</span>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={casaSearch}
                    onChange={e => setCasaSearch(e.target.value)}
                    placeholder="Buscar casa de apostas..."
                    className="pl-9"
                    autoFocus={casaPickerOpen}
                  />
                </div>
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-0.5">
                    {filteredCasas.map((c: any) => {
                      const isSelected = catalogoId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setCatalogoId(c.id);
                            setCasaSearch("");
                            setCasaPickerOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                            isSelected
                              ? "bg-primary/10 ring-1 ring-primary/30"
                              : "hover:bg-muted/50"
                          )}
                        >
                          <BookmakerLogo url={c.logo_url} nome={c.nome} />
                          <span className="text-sm font-medium flex-1">{c.nome}</span>
                          {isSelected && <Check className="h-4 w-4 text-primary" />}
                        </button>
                      );
                    })}
                    {filteredCasas.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhuma casa encontrada
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          {/* Titular */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Titular
            </Label>
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

          {/* Login */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Login / Username <span className="text-destructive">*</span>
            </Label>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="usuario123" />
          </div>

          {/* Senha */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Senha <span className="text-destructive">*</span>
            </Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </div>

          {/* E-mail */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              E-mail de Login
            </Label>
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
