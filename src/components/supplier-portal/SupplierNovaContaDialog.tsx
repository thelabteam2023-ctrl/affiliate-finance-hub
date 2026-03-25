import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Building2, Eye, EyeOff, User, ChevronRight, ChevronLeft, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierWorkspaceId: string;
  onSuccess: () => void;
}

interface ContaEntry {
  catalogoId: string;
  catalogoNome: string;
  moeda: string;
  logoUrl: string | null;
  username: string;
  password: string;
  showPassword: boolean;
  loginEmail: string;
}

export function SupplierNovaContaDialog({ open, onOpenChange, supplierWorkspaceId, onSuccess }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [titularId, setTitularId] = useState("");
  const [selectedCasaIds, setSelectedCasaIds] = useState<Set<string>>(new Set());
  const [contas, setContas] = useState<ContaEntry[]>([]);
  const [casaSearch, setCasaSearch] = useState("");
  const queryClient = useQueryClient();

  // Fetch allowed bookmakers
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

  // Fetch bookmaker catalog
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

  // Fetch existing accounts
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

  // Available casas for the selected titular (exclude already existing)
  const availableCasas = useMemo(() => {
    if (!titularId) return catalogo;
    const usedCasaIds = new Set(
      existingAccounts
        .filter((a: any) => a.titular_id === titularId)
        .map((a: any) => a.bookmaker_catalogo_id)
    );
    return catalogo.filter((c: any) => !usedCasaIds.has(c.id));
  }, [titularId, catalogo, existingAccounts]);

  const filteredCasas = useMemo(() => {
    if (!casaSearch) return availableCasas;
    const q = casaSearch.toLowerCase();
    return availableCasas.filter((c: any) => c.nome.toLowerCase().includes(q));
  }, [availableCasas, casaSearch]);

  const selectedTitular = titulares.find((t: any) => t.id === titularId);

  function toggleCasa(id: string) {
    setSelectedCasaIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedCasaIds(prev => {
      const next = new Set(prev);
      filteredCasas.forEach((c: any) => next.add(c.id));
      return next;
    });
  }

  function deselectAll() {
    setSelectedCasaIds(new Set());
  }

  function goToStep2() {
    // Build conta entries for each selected casa
    const entries: ContaEntry[] = Array.from(selectedCasaIds).map(id => {
      const casa = catalogo.find((c: any) => c.id === id);
      // Preserve existing data if going back and forth
      const existing = contas.find(c => c.catalogoId === id);
      return {
        catalogoId: id,
        catalogoNome: casa?.nome || "",
        moeda: casa?.moeda_padrao || "BRL",
        logoUrl: casa?.logo_url || null,
        username: existing?.username || "",
        password: existing?.password || "",
        showPassword: existing?.showPassword || false,
        loginEmail: existing?.loginEmail || "",
      };
    }).sort((a, b) => a.catalogoNome.localeCompare(b.catalogoNome));
    setContas(entries);
    setStep(2);
  }

  function updateConta(index: number, field: keyof ContaEntry, value: string | boolean) {
    setContas(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  }

  const allContasFilled = contas.every(c => c.username.trim() && c.password.trim());

  const createMutation = useMutation({
    mutationFn: async () => {
      const rows = contas.map(c => ({
        supplier_workspace_id: supplierWorkspaceId,
        bookmaker_catalogo_id: c.catalogoId,
        titular_id: titularId,
        login_username: c.username.trim(),
        login_password_encrypted: c.password,
        login_email: c.loginEmail.trim() || null,
        moeda: c.moeda,
      }));

      const { error } = await supabase.from("supplier_bookmaker_accounts").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      const count = contas.length;
      toast.success(`${count} conta${count > 1 ? "s" : ""} criada${count > 1 ? "s" : ""} com sucesso`);
      queryClient.invalidateQueries({ queryKey: ["supplier-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-accounts-existing"] });
      resetForm();
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message),
  });

  function resetForm() {
    setStep(1);
    setTitularId("");
    setSelectedCasaIds(new Set());
    setContas([]);
    setCasaSearch("");
    onOpenChange(false);
  }

  const noConfig = catalogo.length === 0 && allowedIds !== undefined;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); else onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Nova Conta
            {step === 2 && (
              <span className="text-xs font-normal text-muted-foreground ml-1">
                — Credenciais
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {noConfig ? (
          <div className="text-center py-6">
            <Building2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma casa configurada.</p>
            <p className="text-xs text-muted-foreground mt-1">Solicite ao administrador.</p>
          </div>
        ) : step === 1 ? (
          /* ==================== STEP 1: Titular + Casas ==================== */
          <div className="space-y-4">
            {/* Titular (first) */}
            <div className="space-y-1.5">
              <Label>Titular <span className="text-destructive">*</span></Label>
              <Select value={titularId} onValueChange={(v) => { setTitularId(v); setSelectedCasaIds(new Set()); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o titular" />
                </SelectTrigger>
                <SelectContent>
                  {titulares.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        {t.nome}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Casas (multi-select) */}
            {titularId && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Casas de Apostas <span className="text-destructive">*</span></Label>
                  <div className="flex gap-2">
                    {selectedCasaIds.size > 0 && (
                      <button type="button" onClick={deselectAll} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Limpar
                      </button>
                    )}
                    <button type="button" onClick={selectAllFiltered} className="text-xs text-primary hover:text-primary/80 transition-colors font-medium">
                      Selecionar todas
                    </button>
                  </div>
                </div>

                {availableCasas.length === 0 ? (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      Este titular já possui conta em todas as casas disponíveis.
                    </p>
                  </div>
                ) : (
                  <>
                    {availableCasas.length > 5 && (
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={casaSearch}
                          onChange={e => setCasaSearch(e.target.value)}
                          placeholder="Buscar casa..."
                          className="pl-9 h-9"
                        />
                      </div>
                    )}
                    <ScrollArea className="max-h-[260px]">
                      <div className="space-y-0.5">
                        {filteredCasas.map((c: any) => {
                          const checked = selectedCasaIds.has(c.id);
                          return (
                            <label
                              key={c.id}
                              className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors",
                                checked ? "bg-primary/10" : "hover:bg-muted/50"
                              )}
                            >
                              <Checkbox checked={checked} onCheckedChange={() => toggleCasa(c.id)} />
                              <BookmakerIcon url={c.logo_url} />
                              <span className="text-sm font-medium">{c.nome}</span>
                            </label>
                          );
                        })}
                        {filteredCasas.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma casa encontrada</p>
                        )}
                      </div>
                    </ScrollArea>
                    <p className="text-xs text-muted-foreground text-center">
                      {selectedCasaIds.size} casa{selectedCasaIds.size !== 1 ? "s" : ""} selecionada{selectedCasaIds.size !== 1 ? "s" : ""}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ==================== STEP 2: Credenciais por casa ==================== */
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
              <User className="h-3.5 w-3.5" />
              <span>Titular: <strong className="text-foreground">{selectedTitular?.nome}</strong></span>
              <span className="ml-auto">{contas.length} conta{contas.length > 1 ? "s" : ""}</span>
            </div>

            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3">
                {contas.map((conta, i) => (
                  <div key={conta.catalogoId} className="rounded-lg border border-border bg-card p-3 space-y-2.5">
                    {/* Casa header */}
                    <div className="flex items-center gap-2">
                      <BookmakerIcon url={conta.logoUrl} />
                      <span className="text-sm font-semibold">{conta.catalogoNome}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {/* Username */}
                      <div className="space-y-1">
                        <Label className="text-xs">Login <span className="text-destructive">*</span></Label>
                        <Input
                          value={conta.username}
                          onChange={e => updateConta(i, "username", e.target.value)}
                          placeholder="usuario123"
                          className="h-8 text-sm"
                        />
                      </div>

                      {/* Password */}
                      <div className="space-y-1">
                        <Label className="text-xs">Senha <span className="text-destructive">*</span></Label>
                        <div className="relative">
                          <Input
                            type={conta.showPassword ? "text" : "password"}
                            value={conta.password}
                            onChange={e => updateConta(i, "password", e.target.value)}
                            placeholder="••••••"
                            className="h-8 text-sm pr-8"
                          />
                          <button
                            type="button"
                            onClick={() => updateConta(i, "showPassword", !conta.showPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {conta.showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Email */}
                    <div className="space-y-1">
                      <Label className="text-xs">E-mail de Login</Label>
                      <Input
                        value={conta.loginEmail}
                        onChange={e => updateConta(i, "loginEmail", e.target.value)}
                        placeholder="email@exemplo.com"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button
                onClick={goToStep2}
                disabled={!titularId || selectedCasaIds.size === 0}
                className="gap-1.5"
              >
                Próximo <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)} className="gap-1.5">
                <ChevronLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!allContasFilled || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Criando...</>
                ) : (
                  `Criar ${contas.length} Conta${contas.length > 1 ? "s" : ""}`
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BookmakerIcon({ url }: { url: string | null }) {
  if (url) {
    return (
      <div className="w-6 h-6 rounded shrink-0 overflow-hidden bg-muted/50 flex items-center justify-center border border-border/30">
        <img src={url} alt="" className="w-4 h-4 object-contain" />
      </div>
    );
  }
  return (
    <div className="w-6 h-6 rounded shrink-0 bg-muted/50 flex items-center justify-center border border-border/30">
      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}
