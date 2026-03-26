import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, Eye, EyeOff, User, ChevronRight, ChevronLeft, Search, Loader2, Check, Sparkles, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BookmakerLogo } from "@/components/ui/bookmaker-logo";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierWorkspaceId: string;
  onSuccess: () => void;
  prefillTitularId?: string;
  prefillBookmakerIds?: string[];
  activeTaskId?: string;
  supplierToken?: string;
  onTaskItemsCompleted?: () => void;
}

interface ContaEntry {
  catalogoId: string;
  catalogoNome: string;
  moeda: string;
  logoUrl: string | null;
  username: string;
  password: string;
  showPassword: boolean;
  manuallyEdited: boolean;
  autoFilled: boolean;
}

export function SupplierNovaContaDialog({ open, onOpenChange, supplierWorkspaceId, onSuccess, prefillTitularId, prefillBookmakerIds }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [titularId, setTitularId] = useState("");
  const [selectedCasaIds, setSelectedCasaIds] = useState<Set<string>>(new Set());
  const [contas, setContas] = useState<ContaEntry[]>([]);
  const [casaSearch, setCasaSearch] = useState("");
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [globalLogin, setGlobalLogin] = useState("");
  const [globalPassword, setGlobalPassword] = useState("");
  const [showGlobalPassword, setShowGlobalPassword] = useState(false);
  const queryClient = useQueryClient();
  const supplierToken = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // Fetch allowed bookmakers via edge function (bypasses RLS for GLOBAL_RESTRICTED)
  const { data: catalogo = [] } = useQuery({
    queryKey: ["bookmakers-catalogo-supplier", supplierWorkspaceId],
    queryFn: async () => {
      if (!supplierToken) return [];
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/supplier-auth?action=get-allowed-bookmakers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
          },
          body: JSON.stringify({ token: supplierToken }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro ao buscar casas");
      return data.bookmakers || [];
    },
    enabled: !!supplierToken,
    staleTime: 5 * 60 * 1000,
  });

  const { data: titulares = [] } = useQuery({
    queryKey: ["supplier-titulares", supplierWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_titulares")
        .select("id, nome, email")
        .eq("supplier_workspace_id", supplierWorkspaceId)
        .eq("status", "ATIVO")
        .order("nome");
      if (error) throw error;
      return data || [];
    },
  });

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

  // Fetch existing credentials from main system for selected titular via supplier token
  const { data: mainCredentials = [], isLoading: isLoadingMainCredentials } = useQuery({
    queryKey: ["titular-main-credentials", supplierWorkspaceId, titularId],
    queryFn: async () => {
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/supplier-auth?action=get-titular-credentials`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
          },
          body: JSON.stringify({ token: supplierToken, titular_id: titularId }),
        }
      );

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Erro ao buscar credenciais existentes");
      }

      return data.credentials || [];
    },
    enabled: !!titularId && !!supplierToken,
    staleTime: 5 * 60 * 1000,
  });

  // Apply prefill when dialog opens with prefill props
  useEffect(() => {
    if (open && prefillTitularId && !prefillApplied) {
      setTitularId(prefillTitularId);
      if (prefillBookmakerIds?.length) {
        setSelectedCasaIds(new Set(prefillBookmakerIds));
      }
      setPrefillApplied(true);
    }
    if (!open) {
      setPrefillApplied(false);
    }
  }, [open, prefillTitularId, prefillBookmakerIds, prefillApplied]);

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

  async function goToStep2() {
    if (!supplierToken) {
      toast.error("Token do portal inválido ou ausente");
      return;
    }

    if (isLoadingMainCredentials) {
      toast.info("Carregando credenciais existentes...");
      return;
    }

    const credMap = new Map<string, { username: string; password: string }>();
    mainCredentials.forEach((mc: any) => {
      credMap.set(mc.bookmaker_catalogo_id, {
        username: mc.login_username || "",
        password: mc.login_password || "",
      });
    });

    const entries: ContaEntry[] = Array.from(selectedCasaIds).map(id => {
      const casa = catalogo.find((c: any) => c.id === id);
      const existing = contas.find(c => c.catalogoId === id);
      const mainCred = credMap.get(id);
      const hasMainCred = !!mainCred && !!(mainCred.username || mainCred.password);

      return {
        catalogoId: id,
        catalogoNome: casa?.nome || "",
        moeda: casa?.moeda_padrao || "BRL",
        logoUrl: casa?.logo_url || null,
        username: existing?.username || mainCred?.username || "",
        password: existing?.password || mainCred?.password || "",
        showPassword: existing?.showPassword || (!existing && !!mainCred?.password),
        manuallyEdited: existing?.manuallyEdited || false,
        autoFilled: existing?.autoFilled || (!existing && hasMainCred),
      };
    }).sort((a, b) => a.catalogoNome.localeCompare(b.catalogoNome));

    setContas(entries);
    setCurrentCardIndex(0);
    setStep(2);
  }

  function updateContaManual(index: number, field: keyof ContaEntry, value: string | boolean) {
    setContas(prev => prev.map((c, i) => i === index ? { ...c, [field]: value, manuallyEdited: true } : c));
  }

  function updateConta(index: number, field: keyof ContaEntry, value: string | boolean) {
    setContas(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  }

  function handleGlobalLoginChange(value: string) {
    setGlobalLogin(value);
    setContas(prev => prev.map(c => c.manuallyEdited ? c : { ...c, username: value }));
  }

  function handleGlobalPasswordChange(value: string) {
    setGlobalPassword(value);
    setContas(prev => prev.map(c => c.manuallyEdited ? c : { ...c, password: value }));
  }

  function applyGlobalToEmpty() {
    setContas(prev => prev.map(c => ({
      ...c,
      username: c.username.trim() ? c.username : globalLogin,
      password: c.password.trim() ? c.password : globalPassword,
    })));
  }

  const MAX_USERNAME_LEN = 100;
  const MAX_PASSWORD_LEN = 200;

  const allContasFilled = contas.every(c => {
    const u = c.username.trim();
    const p = c.password.trim();
    return u.length > 0 && u.length <= MAX_USERNAME_LEN && p.length > 0 && p.length <= MAX_PASSWORD_LEN;
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!supplierToken) {
        throw new Error("Token do portal inválido ou ausente.");
      }

      for (const c of contas) {
        const u = c.username.trim();
        const p = c.password.trim();
        if (!u || !p) throw new Error("Login e senha são obrigatórios para todas as contas.");
        if (u.length > MAX_USERNAME_LEN) throw new Error(`Login muito longo para ${c.catalogoNome}`);
        if (p.length > MAX_PASSWORD_LEN) throw new Error(`Senha muito longa para ${c.catalogoNome}`);
      }

      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/supplier-auth?action=create-accounts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
          },
          body: JSON.stringify({
            token: supplierToken,
            titular_id: titularId,
            accounts: contas.map((c) => ({
              bookmaker_catalogo_id: c.catalogoId,
              login_username: c.username.trim(),
              password: c.password.trim(),
            })),
          }),
        }
      );

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Erro ao criar conta");
      }
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
    setCurrentCardIndex(0);
    setGlobalLogin("");
    setGlobalPassword("");
    setShowGlobalPassword(false);
    onOpenChange(false);
  }

  const noConfig = catalogo.length === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); else onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0 border-border/50">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold tracking-tight">
              Nova Conta
            </DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-4">
            <StepIndicator number={1} label="Seleção" active={step === 1} done={step === 2} />
            <div className="flex-1 h-px bg-border" />
            <StepIndicator number={2} label="Credenciais" active={step === 2} done={false} />
          </div>
        </div>

        <div className="px-6 pb-2">
          <div className="h-px bg-border/60" />
        </div>

        {/* Content */}
        <div className="px-6 pb-6 pt-2">
          {noConfig ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Nenhuma casa configurada</p>
              <p className="text-xs text-muted-foreground mt-1">Solicite ao administrador para liberar as casas.</p>
            </div>
          ) : step === 1 ? (
            <div className="space-y-5">
              {/* Titular */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Titular <span className="text-destructive">*</span>
                </Label>
                <Select value={titularId} onValueChange={(v) => { setTitularId(v); setSelectedCasaIds(new Set()); }}>
                  <SelectTrigger className="h-11 bg-card border-border/60 hover:border-primary/40 transition-colors">
                    <SelectValue placeholder="Selecione o titular" />
                  </SelectTrigger>
                  <SelectContent>
                    {titulares.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="h-3 w-3 text-primary" />
                          </div>
                          <span className="font-medium">{t.nome}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Casas */}
              {titularId && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Casas de Apostas <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex gap-3">
                      {selectedCasaIds.size > 0 && (
                        <button type="button" onClick={deselectAll} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                          Limpar
                        </button>
                      )}
                      <button type="button" onClick={selectAllFiltered} className="text-[11px] text-primary hover:text-primary/80 transition-colors font-semibold">
                        Selecionar todas
                      </button>
                    </div>
                  </div>

                  {availableCasas.length === 0 ? (
                    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-6 text-center">
                      <Check className="h-5 w-5 text-primary mx-auto mb-2" />
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
                            className="pl-9 h-10 bg-card border-border/60"
                          />
                        </div>
                      )}
                      <div className="max-h-[240px] overflow-y-auto rounded-lg border border-border/40 p-1">
                        <div className="space-y-1">
                          {filteredCasas.map((c: any) => {
                            const checked = selectedCasaIds.has(c.id);
                            return (
                              <label
                                key={c.id}
                                className={cn(
                                  "flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-all duration-150",
                                  checked
                                    ? "bg-primary/10 border border-primary/30 shadow-sm"
                                    : "border border-transparent hover:bg-muted/40"
                                )}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggleCasa(c.id)}
                                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                                <BookmakerLogo
                                  logoUrl={c.logo_url}
                                  size="h-7 w-7"
                                  iconSize="h-3.5 w-3.5"
                                  className="border border-border/40"
                                />
                                <span className="text-sm font-medium flex-1">{c.nome}</span>
                                {checked && <Check className="h-4 w-4 text-primary shrink-0" />}
                              </label>
                            );
                          })}
                          {filteredCasas.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma casa encontrada</p>
                          )}
                        </div>
                      </div>

                      {/* Counter badge */}
                      <div className="flex items-center justify-center">
                        <span className={cn(
                          "text-xs font-medium px-3 py-1 rounded-full transition-colors",
                          selectedCasaIds.size > 0
                            ? "bg-primary/10 text-primary"
                            : "bg-muted/50 text-muted-foreground"
                        )}>
                          {selectedCasaIds.size} casa{selectedCasaIds.size !== 1 ? "s" : ""} selecionada{selectedCasaIds.size !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Action */}
              <div className="flex items-center gap-3 pt-2">
                <Button variant="outline" onClick={resetForm} className="flex-1 h-11">
                  Cancelar
                </Button>
                <Button
                  onClick={goToStep2}
                  disabled={!titularId || selectedCasaIds.size === 0 || isLoadingMainCredentials}
                  className="flex-1 h-11 gap-1.5 font-semibold"
                >
                  {isLoadingMainCredentials ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</>
                  ) : (
                    <>Próximo <ChevronRight className="h-4 w-4" /></>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            /* ==================== STEP 2 ==================== */
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/20 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Titular</p>
                  <p className="text-sm font-semibold text-foreground truncate">{selectedTitular?.nome}</p>
                </div>
                <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                  {contas.length} conta{contas.length > 1 ? "s" : ""}
                </span>
              </div>

              {/* Global credentials */}
              {contas.length > 1 && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Login & Senha padrão
                    </p>
                    <button
                      type="button"
                      onClick={applyGlobalToEmpty}
                      className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
                    >
                      <Copy className="h-3 w-3" /> Aplicar às vazias
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      value={globalLogin}
                      onChange={e => handleGlobalLoginChange(e.target.value)}
                      placeholder="Login padrão"
                      className="h-9 text-sm bg-background border-border/60"
                    />
                    <div className="relative">
                      <Input
                        type={showGlobalPassword ? "text" : "password"}
                        value={globalPassword}
                        onChange={e => handleGlobalPasswordChange(e.target.value)}
                        placeholder="Senha padrão"
                        className="h-9 text-sm pr-9 bg-background border-border/60"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGlobalPassword(!showGlobalPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showGlobalPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Preenche automaticamente casas não editadas. Edite individualmente abaixo se necessário.
                  </p>
                </div>
              )}

              {/* Card navigation */}
              {contas.length > 0 && (() => {
                const conta = contas[currentCardIndex];
                const i = currentCardIndex;
                const filled = conta.username.trim() && conta.password.trim();
                return (
                  <div className="space-y-3">
                    {/* Card counter + arrows */}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setCurrentCardIndex(prev => prev - 1)}
                        disabled={currentCardIndex === 0}
                        className={cn(
                          "flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
                          currentCardIndex === 0
                            ? "text-muted-foreground/40 cursor-not-allowed"
                            : "text-foreground hover:bg-muted/50"
                        )}
                      >
                        <ChevronLeft className="h-4 w-4" /> Anterior
                      </button>

                      <div className="flex items-center gap-1.5">
                        {contas.map((c, idx) => {
                          const isFilled = c.username.trim() && c.password.trim();
                          return (
                            <button
                              key={c.catalogoId}
                              type="button"
                              onClick={() => setCurrentCardIndex(idx)}
                              className={cn(
                                "w-2 h-2 rounded-full transition-all duration-200",
                                idx === currentCardIndex
                                  ? "w-5 bg-primary"
                                  : isFilled
                                    ? "bg-primary/40"
                                    : "bg-muted-foreground/30"
                              )}
                            />
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() => setCurrentCardIndex(prev => prev + 1)}
                        disabled={currentCardIndex === contas.length - 1}
                        className={cn(
                          "flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
                          currentCardIndex === contas.length - 1
                            ? "text-muted-foreground/40 cursor-not-allowed"
                            : "text-foreground hover:bg-muted/50"
                        )}
                      >
                        Próxima <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Single card */}
                    <div className={cn(
                      "rounded-xl border bg-card p-4 space-y-3",
                      conta.manuallyEdited ? "border-warning/40" : "border-border/60"
                    )}>
                      <div className="flex items-center gap-3">
                        <BookmakerLogo
                          logoUrl={conta.logoUrl}
                          size="h-9 w-9"
                          iconSize="h-4 w-4"
                          className="border border-border/40"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-bold">{conta.catalogoNome}</span>
                          <p className="text-[11px] text-muted-foreground">{currentCardIndex + 1} de {contas.length}</p>
                        </div>
                        {conta.autoFilled && !conta.manuallyEdited && (
                          <span className="text-[10px] font-medium text-info bg-info/10 px-2 py-0.5 rounded-full">
                            Auto-preenchido
                          </span>
                        )}
                        {conta.manuallyEdited && (
                          <span className="text-[10px] font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-full">
                            Editado
                          </span>
                        )}
                        {filled && (
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                            <Check className="h-3.5 w-3.5 text-primary" />
                          </div>
                        )}
                      </div>

                      <div className="h-px bg-border/40" />

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Login <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            value={conta.username}
                            onChange={e => updateContaManual(i, "username", e.target.value)}
                            placeholder="usuario123"
                            className="h-9 text-sm bg-background border-border/60"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Senha <span className="text-destructive">*</span>
                          </Label>
                          <div className="relative">
                            <Input
                              type={conta.showPassword ? "text" : "password"}
                              value={conta.password}
                              onChange={e => updateContaManual(i, "password", e.target.value)}
                              placeholder="••••••"
                              className="h-9 text-sm pr-9 bg-background border-border/60"
                            />
                            <button
                              type="button"
                              onClick={() => updateConta(i, "showPassword", !conta.showPassword)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {conta.showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })()}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-1">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1 h-11 gap-1.5">
                  <ChevronLeft className="h-4 w-4" /> Voltar
                </Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!allContasFilled || createMutation.isPending}
                  className="flex-1 h-11 font-semibold gap-1.5"
                >
                  {createMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</>
                  ) : (
                    <><Sparkles className="h-4 w-4" /> Criar {contas.length} Conta{contas.length > 1 ? "s" : ""}</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* Step indicator pill — defined outside to avoid re-mounts */
function StepIndicator({ number, label, active, done }: { number: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200",
        done ? "bg-primary text-primary-foreground" :
        active ? "bg-primary text-primary-foreground shadow-md shadow-primary/30" :
        "bg-muted text-muted-foreground"
      )}>
        {done ? <Check className="h-3.5 w-3.5" /> : number}
      </div>
      <span className={cn(
        "text-xs font-medium transition-colors",
        active || done ? "text-foreground" : "text-muted-foreground"
      )}>
        {label}
      </span>
    </div>
  );
}
