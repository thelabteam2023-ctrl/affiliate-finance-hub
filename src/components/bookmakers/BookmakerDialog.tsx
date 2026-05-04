import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, User, ShieldAlert, Link2, KeyRound, Coins, StickyNote, ChevronDown, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import BookmakerSelect from "./BookmakerSelect";
import ParceiroSelect from "@/components/parceiros/ParceiroSelect";
import { PasswordInput } from "@/components/parceiros/PasswordInput";
import { BookmakerLogo } from "@/components/ui/bookmaker-logo";
import { FIAT_CURRENCIES, type FiatCurrency, CURRENCY_SYMBOLS } from "@/types/currency";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";

export interface VinculoCriadoContext {
  bookmakerId: string;
  bookmakerNome: string;
  parceiroId: string;
  parceiroNome: string;
  moeda: string;
}

interface BookmakerDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (context: VinculoCriadoContext) => void;
  bookmaker: any | null;
  defaultParceiroId?: string;
  defaultBookmakerId?: string;
  lockParceiro?: boolean;
  lockBookmaker?: boolean;
}

interface BookmakerCatalogo {
  id: string;
  nome: string;
  logo_url: string | null;
  links_json: Array<{ referencia: string; url: string }>;
  observacoes: string | null;
  moeda_padrao?: string;
}

/** Section wrapper with subtle header */
function FormSection({ icon: Icon, title, children, className, badge }: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  className?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        {badge}
      </div>
      {children}
    </div>
  );
}

export default function BookmakerDialog({ 
  open, 
  onClose, 
  onCreated,
  bookmaker,
  defaultParceiroId,
  defaultBookmakerId,
  lockParceiro = false,
  lockBookmaker = false 
}: BookmakerDialogProps) {
  const [loading, setLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [parceiroId, setParceiroId] = useState("");
  const [parceiroNome, setParceiroNome] = useState("");
  const [bookmakerId, setBookmakerId] = useState("");
  const [selectedBookmaker, setSelectedBookmaker] = useState<BookmakerCatalogo | null>(null);
  const [selectedLink, setSelectedLink] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [moedaOperacional, setMoedaOperacional] = useState<FiatCurrency>("USD");
  const [status, setStatus] = useState("ativo");
  
  const [instanceIdentifier, setInstanceIdentifier] = useState("");
  const [showInstanceField, setShowInstanceField] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const [showObservacoesDialog, setShowObservacoesDialog] = useState(false);
  const [hasFinancialOperations, setHasFinancialOperations] = useState(false);
  const [checkingOperations, setCheckingOperations] = useState(false);
  const [moedaConfirmada, setMoedaConfirmada] = useState(false);
  const { toast } = useToast();
  const { workspaceId } = useWorkspace();

  // Status considerados válidos/consolidados para bloqueio de moeda
  const VALID_STATUSES_CASH = ["CONFIRMADO", "PROCESSADO", "CONSOLIDADO"];
  const VALID_STATUSES_APOSTAS = ["confirmada", "ganha", "perdida", "cashout", "meio_ganha", "meio_perdida"];

  // Verificar se existem operações financeiras VÁLIDAS associadas ao vínculo
  const checkFinancialOperations = async (bookmakerId: string) => {
    if (!bookmakerId) {
      setHasFinancialOperations(false);
      return;
    }

    setCheckingOperations(true);
    try {
      const { count: cashCount } = await supabase
        .from("cash_ledger")
        .select("id", { count: "exact", head: true })
        .or(`origem_bookmaker_id.eq.${bookmakerId},destino_bookmaker_id.eq.${bookmakerId}`)
        .in("status", VALID_STATUSES_CASH);

      if (cashCount && cashCount > 0) {
        setHasFinancialOperations(true);
        return;
      }

      const { count: apostasCount } = await supabase
        .from("apostas_unificada")
        .select("id", { count: "exact", head: true })
        .eq("bookmaker_id", bookmakerId)
        .in("status", VALID_STATUSES_APOSTAS);

      if (apostasCount && apostasCount > 0) {
        setHasFinancialOperations(true);
        return;
      }

      const { count: pernasCount } = await supabase
        .from("apostas_pernas")
        .select("id", { count: "exact", head: true })
        .eq("bookmaker_id", bookmakerId)
        .not("resultado", "is", null);

      if (pernasCount && pernasCount > 0) {
        setHasFinancialOperations(true);
        return;
      }

      const { count: bonusCount } = await supabase
        .from("project_bookmaker_link_bonuses")
        .select("id", { count: "exact", head: true })
        .eq("bookmaker_id", bookmakerId)
        .neq("status", "cancelado");

      if (bonusCount && bonusCount > 0) {
        setHasFinancialOperations(true);
        return;
      }

      setHasFinancialOperations(false);
    } catch (error) {
      console.error("Erro ao verificar operações:", error);
      setHasFinancialOperations(true);
    } finally {
      setCheckingOperations(false);
    }
  };

  const fetchBookmakerDetails = async (bookmakerIdToFetch: string, presetLink?: string, preserveMoeda = false) => {
    if (!bookmakerIdToFetch) return;
    
    setIsLoadingDetails(true);
    try {
      const { data, error } = await supabase
        .from("bookmakers_catalogo")
        .select("id, nome, logo_url, links_json, observacoes, moeda_padrao")
        .eq("id", bookmakerIdToFetch)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setIsLoadingDetails(false);
        return;
      }
      
      const bookmakerData: BookmakerCatalogo = {
        id: data.id,
        nome: data.nome,
        logo_url: data.logo_url,
        links_json: (data.links_json as any) || [],
        observacoes: data.observacoes,
        moeda_padrao: data.moeda_padrao,
      };
      
      setSelectedBookmaker(bookmakerData);
      
      if (!preserveMoeda && bookmakerData.moeda_padrao) {
        setMoedaOperacional(bookmakerData.moeda_padrao as FiatCurrency);
      }
      
      const linksArray = bookmakerData.links_json;
      if (presetLink) {
        setSelectedLink(presetLink);
      } else if (linksArray && linksArray.length > 0) {
        setSelectedLink(linksArray[0].referencia);
      }
    } catch (error: any) {
      console.error("Erro ao carregar detalhes da bookmaker:", error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const fetchParceiroNome = async (parceiroIdToFetch: string) => {
    if (!parceiroIdToFetch) return;
    
    try {
      const { data } = await supabase
        .from("parceiros")
        .select("nome")
        .eq("id", parceiroIdToFetch)
        .maybeSingle();
      
      if (data) {
        setParceiroNome(data.nome);
      }
    } catch (error) {
      console.error("Erro ao buscar nome do parceiro:", error);
    }
  };

  useEffect(() => {
    if (!open) {
      const timeout = setTimeout(() => {
        setParceiroId("");
        setParceiroNome("");
        setBookmakerId("");
        setSelectedBookmaker(null);
        setSelectedLink("");
        setLoginUsername("");
        setLoginPassword("");
        setMoedaOperacional("USD");
        setStatus("ativo");
        setInstanceIdentifier("");
        setObservacoes("");
        setIsLoadingDetails(false);
        setIsInitialized(false);
        setHasFinancialOperations(false);
        setCheckingOperations(false);
        setMoedaConfirmada(false);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  useEffect(() => {
    if (open && bookmaker?.id) {
      checkFinancialOperations(bookmaker.id);
    }
  }, [open, bookmaker?.id]);

  useEffect(() => {
    if (!open) return;
    
    if (bookmaker) {
      if (!bookmaker.id || !bookmaker.parceiro_id) return;
      
      setParceiroId(bookmaker.parceiro_id);
      setBookmakerId(bookmaker.bookmaker_catalogo_id || "");
      setLoginUsername(bookmaker.login_username || "");
      setLoginPassword("");
      setMoedaOperacional((bookmaker.moeda as FiatCurrency) || "BRL");
      setStatus(bookmaker.status || "ativo");
      setInstanceIdentifier(bookmaker.instance_identifier || "");
      setObservacoes(bookmaker.observacoes || "");
      setSelectedLink(bookmaker.link_origem || "");
      setSelectedBookmaker(null);
      // Tentar usar o nome que já veio no objeto se disponível para evitar "Carregando..."
      const currentParceiroNome = bookmaker.parceiros?.nome || "";
      setParceiroNome(currentParceiroNome);
      setIsInitialized(true);
      
      if (!currentParceiroNome) {
        fetchParceiroNome(bookmaker.parceiro_id);
      }
      
      if (bookmaker.bookmaker_catalogo_id) {
        fetchBookmakerDetails(bookmaker.bookmaker_catalogo_id, bookmaker.link_origem, true);
      }
    } else {
      setLoginUsername("");
      setLoginPassword("");
      setStatus("ativo");
      setInstanceIdentifier("");
      setObservacoes("");
      setSelectedLink("");
      setSelectedBookmaker(null);
      setParceiroNome("");
      
      const newParceiroId = defaultParceiroId || "";
      const newBookmakerId = defaultBookmakerId || "";
      
      setParceiroId(newParceiroId);
      setBookmakerId(newBookmakerId);
      setIsInitialized(true);
      
      if (newParceiroId) fetchParceiroNome(newParceiroId);
      if (newBookmakerId) fetchBookmakerDetails(newBookmakerId);
    }
  }, [open, bookmaker?.id, bookmaker?.parceiro_id, defaultParceiroId, defaultBookmakerId]);

  const handleBookmakerChange = (newBookmakerId: string) => {
    setBookmakerId(newBookmakerId);
    setSelectedBookmaker(null);
    setSelectedLink("");
    if (newBookmakerId) fetchBookmakerDetails(newBookmakerId);
  };

  useEffect(() => {
    const checkDuplicateAccounts = async () => {
      if (instanceIdentifier) {
        setShowInstanceField(true);
        return;
      }

      if (!parceiroId || !bookmakerId) {
        setShowInstanceField(false);
        return;
      }

      try {
        const { count, error } = await supabase
          .from("bookmakers")
          .select("id", { count: "exact", head: true })
          .eq("parceiro_id", parceiroId)
          .eq("bookmaker_catalogo_id", bookmakerId)
          .neq("id", bookmaker?.id || "00000000-0000-0000-0000-000000000000");

        if (!error && (count || 0) > 0) {
          setShowInstanceField(true);
        } else {
          setShowInstanceField(false);
        }
      } catch {
        setShowInstanceField(false);
      }
    };

    checkDuplicateAccounts();
  }, [parceiroId, bookmakerId, bookmaker?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (!parceiroId) throw new Error("Selecione um parceiro");
      if (!bookmakerId) throw new Error("Selecione uma bookmaker");
      if (!selectedLink) throw new Error("Selecione um link de cadastro");
      if (!workspaceId) throw new Error("Workspace não disponível nesta aba");

      if (bookmaker) {
        // Para EDIÇÃO: Apenas campos mutáveis para evitar destruição de dados (como saldo)
        const updateData: any = {
          link_origem: selectedLink,
          login_username: loginUsername || "",
          status,
          instance_identifier: instanceIdentifier || null,
          observacoes: observacoes || null,
        };

        // Só atualiza a moeda se não houver operações financeiras
        if (!hasFinancialOperations) {
          updateData.moeda = moedaOperacional;
        }

        // Só atualiza a senha se foi digitada uma nova
        if (loginPassword) {
          updateData.login_password_encrypted = await (await import("@/utils/cryptoPassword")).encryptPassword(loginPassword);
        }

        // Só atualiza o nome da casa se ele estiver carregado (evita salvar vazio)
        if (selectedBookmaker?.nome) {
          updateData.nome = selectedBookmaker.nome;
        }

        const { error } = await supabase
          .from("bookmakers")
          .update(updateData)
          .eq("id", bookmaker.id);
        if (error) throw error;
      } else {
        // Para NOVO VÍNCULO: Objeto completo
        const insertData: any = {
          user_id: user.id,
          workspace_id: workspaceId,
          parceiro_id: parceiroId,
          bookmaker_catalogo_id: bookmakerId,
          nome: selectedBookmaker?.nome || "",
          link_origem: selectedLink,
          login_username: loginUsername || "",
          login_password_encrypted: loginPassword ? await (await import("@/utils/cryptoPassword")).encryptPassword(loginPassword) : "",
          saldo_atual: 0,
          saldo_usd: 0,
          moeda: moedaOperacional,
          status,
          instance_identifier: instanceIdentifier || null,
          observacoes: observacoes || null,
        };

        const { data: insertedData, error } = await supabase
          .from("bookmakers")
          .insert(insertData)
          .select("id")
          .single();
        if (error) throw error;

        if (onCreated && insertedData) {
          const createdContext: VinculoCriadoContext = {
            bookmakerId: insertedData.id,
            bookmakerNome: selectedBookmaker?.nome || "",
            parceiroId,
            parceiroNome,
            moeda: moedaOperacional,
          };
          onClose();
          onCreated(createdContext);
          return;
        }
      }

      const credentialsUpdated = bookmaker && !!loginPassword;
      
      toast({
        title: bookmaker ? "✅ Vínculo atualizado com sucesso" : "Vínculo criado",
        description: credentialsUpdated 
          ? "🔒 Credenciais atualizadas com sucesso" 
          : "Os dados foram salvos com sucesso.",
      });

      if (credentialsUpdated) setLoginPassword("");
      onClose();
    } catch (error: any) {
      let errorMessage = error.message;
      if (error.code === '23505') {
        errorMessage = "Conflito de dados detectado. Verifique se os dados são válidos.";
      }
      toast({
        title: "Erro ao salvar vínculo",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isEditMode = !!bookmaker;
  const isWaitingForData = isEditMode && !isInitialized;
  const hasLinks = !isLoadingDetails && selectedBookmaker?.links_json && selectedBookmaker.links_json.length > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* ── Header ── */}
        <div className="sticky top-0 z-10 bg-background border-b px-5 py-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {isEditMode ? "Editar Vínculo" : "Novo Vínculo"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isEditMode ? "Atualize os dados do vínculo Parceiro ↔ Bookmaker." : "Configure o vínculo entre um parceiro e uma casa de apostas."}
            </p>
          </DialogHeader>
        </div>

        {isWaitingForData ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col">
            <div className="px-5 py-4 space-y-5">

              {/* ═══ SECTION: Vínculo (Parceiro + Bookmaker) ═══ */}
              <FormSection icon={User} title="Vínculo">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Parceiro */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Parceiro <span className="text-destructive">*</span></Label>
                    {lockParceiro && parceiroId ? (
                      <div className="flex items-center gap-2.5 h-9 border rounded-md bg-muted/30 px-3">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium uppercase truncate">
                          {parceiroNome || "Carregando..."}
                        </span>
                      </div>
                    ) : (
                      <ParceiroSelect
                        key={open ? 'parceiro-open' : 'parceiro-closed'}
                        value={parceiroId}
                        onValueChange={(newParceiroId) => {
                          setParceiroId(newParceiroId);
                          if (!bookmaker && !lockBookmaker) {
                            setBookmakerId("");
                            setSelectedBookmaker(null);
                            setSelectedLink("");
                          }
                        }}
                        disabled={loading}
                        includeParceiroId={bookmaker?.parceiro_id}
                      />
                    )}
                  </div>

                  {/* Bookmaker */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Bookmaker <span className="text-destructive">*</span></Label>
                    {lockBookmaker && bookmakerId ? (
                      <div className="flex items-center gap-2.5 h-9 border rounded-md bg-muted/30 px-3">
                        {isLoadingDetails ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : selectedBookmaker ? (
                          <>
                            <BookmakerLogo
                              logoUrl={selectedBookmaker.logo_url}
                              alt={selectedBookmaker.nome}
                              size="h-5 w-5"
                              iconSize="h-3 w-3"
                            />
                            <span className="text-sm uppercase font-medium truncate">{selectedBookmaker.nome}</span>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">Não encontrada</span>
                        )}
                      </div>
                    ) : (
                      <BookmakerSelect
                        key={open ? `bookmaker-${parceiroId || 'none'}` : 'bookmaker-closed'}
                        value={bookmakerId}
                        onValueChange={handleBookmakerChange}
                        disabled={loading}
                        excludeVinculosDoParceiro={!bookmaker ? parceiroId : undefined}
                      />
                    )}
                  </div>
                </div>

                {/* Multi-conta identifier */}
                {showInstanceField && (
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1.5">
                      Identificador da Conta
                      <span className="text-[10px] text-muted-foreground">(recomendado)</span>
                    </Label>
                    <Input
                      value={instanceIdentifier}
                      onChange={(e) => setInstanceIdentifier(e.target.value)}
                      placeholder="Ex: Principal, Backup, #1"
                      disabled={loading}
                      className="h-9 text-sm"
                      maxLength={50}
                    />
                    <p className="text-[11px] text-amber-500">
                      Este parceiro já possui outra conta nesta casa.
                    </p>
                  </div>
                )}
              </FormSection>

              {/* Loading details */}
              {isLoadingDetails && bookmakerId && (
                <div className="flex items-center justify-center py-6 border rounded-lg bg-muted/20">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-xs text-muted-foreground">Carregando detalhes...</span>
                </div>
              )}

              {/* ═══ SECTION: Link de Cadastro ═══ */}
              {hasLinks && (
                <FormSection icon={Link2} title="Link de Cadastro">
                  <RadioGroup value={selectedLink} onValueChange={setSelectedLink}>
                    <div className="space-y-1.5">
                      {selectedBookmaker!.links_json.map((link) => (
                        <label
                          key={link.referencia}
                          htmlFor={`link-${link.referencia}`}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 border rounded-lg cursor-pointer transition-all",
                            selectedLink === link.referencia
                              ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                              : "hover:bg-accent/30 border-border"
                          )}
                        >
                          <RadioGroupItem value={link.referencia} id={`link-${link.referencia}`} className="shrink-0" />
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Badge variant="secondary" className="uppercase text-[10px] shrink-0 py-0 h-5">
                              {link.referencia === "PADRÃO" ? "Site Oficial" : link.referencia}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground truncate">{link.url}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </RadioGroup>
                </FormSection>
              )}

              {/* ═══ SECTION: Moeda Operacional ═══ */}
              {!isLoadingDetails && selectedBookmaker && (
                <FormSection
                  icon={Coins}
                  title="Moeda Operacional"
                  badge={
                    <>
                      {checkingOperations && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                      {hasFinancialOperations && !checkingOperations && (
                        <Badge variant="secondary" className="text-[9px] py-0 px-1.5 h-4">🔒 Bloqueada</Badge>
                      )}
                    </>
                  }
                >
                  <div className={cn(
                    "rounded-lg border p-3 space-y-2.5",
                    hasFinancialOperations
                      ? "border-muted bg-muted/10"
                      : "border-amber-500/30 bg-amber-500/5"
                  )}>
                    {!hasFinancialOperations && (
                      <p className="text-[11px] text-amber-500 leading-tight">
                        Campo crítico — impacta todas as operações financeiras. Não poderá ser alterado após a primeira transação confirmada.
                      </p>
                    )}
                    <Select 
                      value={moedaOperacional} 
                      onValueChange={(val) => {
                        setMoedaOperacional(val as FiatCurrency);
                        setMoedaConfirmada(false);
                      }}
                      disabled={loading || hasFinancialOperations}
                    >
                      <SelectTrigger className={cn("h-9 text-sm", hasFinancialOperations && "bg-muted/50 cursor-not-allowed")}>
                        <SelectValue placeholder="Selecione a moeda" />
                      </SelectTrigger>
                      <SelectContent>
                        {FIAT_CURRENCIES.map((currency) => (
                          <SelectItem key={currency.value} value={currency.value}>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs">{currency.symbol}</span>
                              <span>{currency.value} - {currency.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {hasFinancialOperations ? (
                      <p className="text-[11px] text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Existem transações confirmadas — moeda bloqueada.
                      </p>
                    ) : !bookmaker ? (
                      <div className="flex items-center gap-2 pt-0.5">
                        <Checkbox
                          id="moedaConfirmacao"
                          checked={moedaConfirmada}
                          onCheckedChange={(checked) => setMoedaConfirmada(checked === true)}
                        />
                        <label htmlFor="moedaConfirmacao" className="text-[11px] cursor-pointer select-none leading-tight">
                          Confirmo que <strong className="font-mono">{moedaOperacional}</strong> está correta para esta conta
                        </label>
                      </div>
                    ) : null}
                  </div>
                </FormSection>
              )}

              {/* ═══ SECTION: Credenciais ═══ */}
              <FormSection icon={KeyRound} title="Credenciais de Acesso">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Usuário <span className="text-[10px] text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder="username ou email"
                      disabled={loading}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Senha <span className="text-[10px] text-muted-foreground">{bookmaker ? "(deixe em branco para manter)" : "(opcional)"}</span>
                    </Label>
                    <PasswordInput
                      value={loginPassword}
                      onChange={setLoginPassword}
                      placeholder={bookmaker ? "••••••••" : "senha"}
                      disabled={loading}
                    />
                  </div>
                </div>
              </FormSection>

              {/* ═══ SECTION: Configuração ═══ */}
              <FormSection icon={StickyNote} title="Configuração">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5 sm:col-span-2 sm:max-w-[240px] sm:mx-auto">
                    <Label className="text-xs">Status</Label>
                    <Select value={status} onValueChange={setStatus} disabled={loading}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="limitada">Limitada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">
                      Observações <span className="text-[10px] text-muted-foreground">(opcional)</span>
                    </Label>
                    <Textarea
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      rows={2}
                      placeholder="Notas internas..."
                      disabled={loading}
                      className="text-sm resize-none"
                    />
                  </div>
                </div>
              </FormSection>
            </div>

            {/* ── Footer ── */}
            <div className="sticky bottom-0 bg-background border-t px-5 py-3 flex gap-2.5">
              <Button type="button" variant="ghost" onClick={onClose} className="flex-1 h-9" disabled={loading}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={loading || isLoadingDetails || !parceiroId || !bookmakerId || !selectedLink || (!bookmaker && !moedaConfirmada)} 
                className="flex-1 h-9"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="mr-2 h-3.5 w-3.5" />
                )}
                {bookmaker ? "Salvar" : "Criar Vínculo"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>

      {/* Dialog de Observações */}
      <Dialog open={showObservacoesDialog} onOpenChange={setShowObservacoesDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="uppercase">{selectedBookmaker?.nome}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <h4 className="text-sm font-medium mb-2 text-muted-foreground">Observações:</h4>
            <p className="text-sm whitespace-pre-wrap">{selectedBookmaker?.observacoes}</p>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
