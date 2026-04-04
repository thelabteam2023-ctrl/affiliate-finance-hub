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
import { Loader2, AlertTriangle, User, ShieldAlert } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import BookmakerSelect from "./BookmakerSelect";
import ParceiroSelect from "@/components/parceiros/ParceiroSelect";
import { PasswordInput } from "@/components/parceiros/PasswordInput";
import { FIAT_CURRENCIES, type FiatCurrency, CURRENCY_SYMBOLS } from "@/types/currency";
import { useWorkspace } from "@/hooks/useWorkspace";

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
      // Verificar cash_ledger — apenas transações confirmadas/consolidadas
      const { count: cashCount } = await supabase
        .from("cash_ledger")
        .select("id", { count: "exact", head: true })
        .or(`origem_bookmaker_id.eq.${bookmakerId},destino_bookmaker_id.eq.${bookmakerId}`)
        .in("status", VALID_STATUSES_CASH);

      if (cashCount && cashCount > 0) {
        setHasFinancialOperations(true);
        return;
      }

      // Verificar apostas_unificada — apenas apostas com resultado definido
      const { count: apostasCount } = await supabase
        .from("apostas_unificada")
        .select("id", { count: "exact", head: true })
        .eq("bookmaker_id", bookmakerId)
        .in("status", VALID_STATUSES_APOSTAS);

      if (apostasCount && apostasCount > 0) {
        setHasFinancialOperations(true);
        return;
      }

      // Verificar apostas_pernas — apenas com resultado definido
      const { count: pernasCount } = await supabase
        .from("apostas_pernas")
        .select("id", { count: "exact", head: true })
        .eq("bookmaker_id", bookmakerId)
        .not("resultado", "is", null);

      if (pernasCount && pernasCount > 0) {
        setHasFinancialOperations(true);
        return;
      }

      // Verificar bônus ativos (não cancelados)
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
      // Em caso de erro, assumir que há operações (fail-safe)
      setHasFinancialOperations(true);
    } finally {
      setCheckingOperations(false);
    }
  };

  // Função para carregar detalhes da bookmaker
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
      
      // Herdar moeda padrão do catálogo (apenas em modo criação, não edição)
      if (!preserveMoeda && bookmakerData.moeda_padrao) {
        setMoedaOperacional(bookmakerData.moeda_padrao as FiatCurrency);
      }
      
      // Auto-select link
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

  // Função para buscar nome do parceiro
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

  // Reset quando dialog fecha
  useEffect(() => {
    if (!open) {
      // Pequeno delay para garantir que o dialog fechou antes de resetar
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

  // Verificar operações quando em modo edição
  useEffect(() => {
    if (open && bookmaker?.id) {
      checkFinancialOperations(bookmaker.id);
    }
  }, [open, bookmaker?.id]);

  // Inicialização quando dialog abre - efeito separado para garantir execução determinística
  useEffect(() => {
    if (!open) return;
    
    // Modo edição - aguardar bookmaker válido com parceiro_id
    if (bookmaker) {
      // CRÍTICO: Só inicializar se temos os dados essenciais
      if (!bookmaker.id || !bookmaker.parceiro_id) {
        // Dados incompletos, não inicializar ainda
        return;
      }
      
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
      setParceiroNome("");
      setIsInitialized(true);
      
      fetchParceiroNome(bookmaker.parceiro_id);
      
      if (bookmaker.bookmaker_catalogo_id) {
        fetchBookmakerDetails(bookmaker.bookmaker_catalogo_id, bookmaker.link_origem, true);
      }
    } else {
      // Modo criação - inicialização com valores dos props
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
      
      if (newParceiroId) {
        fetchParceiroNome(newParceiroId);
      }
      if (newBookmakerId) {
        fetchBookmakerDetails(newBookmakerId);
      }
    }
  }, [open, bookmaker?.id, bookmaker?.parceiro_id, defaultParceiroId, defaultBookmakerId]);

  // Handler para mudança manual de bookmaker
  const handleBookmakerChange = (newBookmakerId: string) => {
    setBookmakerId(newBookmakerId);
    setSelectedBookmaker(null);
    setSelectedLink("");
    
    if (newBookmakerId) {
      fetchBookmakerDetails(newBookmakerId);
    }
  };

  // Detectar automaticamente se o parceiro já tem outra conta na mesma casa
  useEffect(() => {
    const checkDuplicateAccounts = async () => {
      // Se já tem identificador preenchido (edição), sempre mostrar
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

  // encryptPassword moved to utils/cryptoPassword.ts

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (!parceiroId) {
        throw new Error("Selecione um parceiro");
      }

      if (!bookmakerId) {
        throw new Error("Selecione uma bookmaker");
      }

      if (!selectedLink) {
        throw new Error("Selecione um link de cadastro");
      }

      if (!workspaceId) {
        throw new Error("Workspace não disponível nesta aba");
      }

      const bookmakerData: any = {
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

      if (bookmaker) {
        // Se não houver nova senha, não atualizar o campo de senha
        if (!loginPassword) {
          delete bookmakerData.login_password_encrypted;
        }

        const { error } = await supabase
          .from("bookmakers")
          .update(bookmakerData)
          .eq("id", bookmaker.id);

        if (error) throw error;
      } else {
        const { data: insertedData, error } = await supabase
          .from("bookmakers")
          .insert(bookmakerData)
          .select("id")
          .single();

        if (error) throw error;

        // After successful creation, notify parent with context for "next best action"
        if (onCreated && insertedData) {
          const createdContext: VinculoCriadoContext = {
            bookmakerId: insertedData.id,
            bookmakerNome: selectedBookmaker?.nome || "",
            parceiroId: parceiroId,
            parceiroNome: parceiroNome,
            moeda: moedaOperacional,
          };
          onClose();
          onCreated(createdContext);
          return; // Skip default toast — parent handles UX
        }
      }

      const credentialsUpdated = bookmaker && !!loginPassword;
      
      toast({
        title: bookmaker ? "✅ Vínculo atualizado com sucesso" : "Vínculo criado",
        description: credentialsUpdated 
          ? "🔒 Credenciais atualizadas com sucesso" 
          : "Os dados foram salvos com sucesso.",
      });

      // Limpar campo de senha após salvar com sucesso
      if (credentialsUpdated) {
        setLoginPassword("");
      }

      onClose();
    } catch (error: any) {
      let errorMessage = error.message;
      
      // MULTI-CONTA: A constraint foi removida, mas mantemos tratamento de erro genérico 23505
      // para outros possíveis conflitos de unicidade
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

  // Em modo edição, mostrar loading até dados estarem prontos
  const isEditMode = !!bookmaker;
  const isWaitingForData = isEditMode && !isInitialized;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl">
            Parceiro ↔ Bookmaker
          </DialogTitle>
        </DialogHeader>

        {isWaitingForData ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Carregando dados do vínculo...</span>
          </div>
        ) : (
          <>
            <Alert className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Segurança:</strong> As credenciais são armazenadas de forma criptografada no banco de dados.
                Mantenha essas informações confidenciais.
              </AlertDescription>
            </Alert>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Parceiro + Bookmaker em grid 2 colunas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Parceiro *</Label>
              {lockParceiro && parceiroId ? (
                <div className="flex items-center justify-center gap-3 h-12 border rounded-md bg-muted/30 px-4">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium uppercase">
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
              {lockParceiro && (
                <p className="text-xs text-muted-foreground">
                  Parceiro selecionado a partir do contexto atual
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Bookmaker *</Label>
              {lockBookmaker && bookmakerId ? (
                <div className="flex items-center justify-center gap-3 h-12 border rounded-md bg-muted/30 px-4">
                  {isLoadingDetails ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      <span className="text-muted-foreground">Carregando...</span>
                    </>
                  ) : selectedBookmaker ? (
                    <>
                      {selectedBookmaker.logo_url && (
                        <img 
                          src={selectedBookmaker.logo_url} 
                          alt="" 
                          className="h-6 w-6 rounded object-contain"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      )}
                      <span className="uppercase font-medium">{selectedBookmaker.nome}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Bookmaker não encontrada</span>
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
              {lockBookmaker && (
                <p className="text-xs text-muted-foreground">
                  Bookmaker selecionada a partir do contexto atual
                </p>
              )}
            </div>
          </div>

          {isLoadingDetails && bookmakerId && (
            <div className="flex items-center justify-center py-4 border rounded-lg bg-muted/30">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Carregando detalhes...</span>
            </div>
          )}

          {!isLoadingDetails && selectedBookmaker && selectedBookmaker.links_json && selectedBookmaker.links_json.length > 0 && (
            <div className="space-y-3">
              <Label className="text-base">
                Link de Cadastro *
              </Label>
              <RadioGroup value={selectedLink} onValueChange={setSelectedLink}>
                <div className="space-y-3">
                  {selectedBookmaker.links_json.map((link) => (
                    <label
                      key={link.referencia}
                      htmlFor={link.referencia}
                      className="flex items-start gap-3 p-4 border rounded-lg hover:bg-accent/40 transition-colors cursor-pointer"
                    >
                      <RadioGroupItem value={link.referencia} id={link.referencia} className="mt-1 flex-shrink-0" />
                      <div className="flex-1 flex items-center gap-3">
                        <Badge variant="secondary" className="uppercase text-xs flex-shrink-0">
                          {link.referencia === "PADRÃO" ? "SITE OFICIAL" : link.referencia}
                        </Badge>
                        <div className="text-xs text-muted-foreground break-all">
                          {link.url}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </RadioGroup>
            </div>
          )}

          {/* ═══════════ MOEDA OPERACIONAL — Campo crítico, posição estratégica ═══════════ */}
          {!isLoadingDetails && selectedBookmaker && (
            <div className={`p-4 rounded-lg border-2 transition-colors ${
              hasFinancialOperations 
                ? 'border-muted bg-muted/20' 
                : 'border-amber-500/50 bg-amber-500/5'
            }`}>
              <Label htmlFor="moedaOperacional" className="flex items-center gap-2 text-base font-semibold mb-1">
                <ShieldAlert className={`h-4 w-4 ${hasFinancialOperations ? 'text-muted-foreground' : 'text-amber-500'}`} />
                Moeda Operacional
                {checkingOperations && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
                {hasFinancialOperations && !checkingOperations && (
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                    🔒 Bloqueada
                  </Badge>
                )}
              </Label>
              {!hasFinancialOperations && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                  ⚠️ Campo crítico — impacta todas as operações financeiras desta conta. Não poderá ser alterado após a primeira transação confirmada.
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
                <SelectTrigger className={`text-base ${hasFinancialOperations ? "bg-muted/50 cursor-not-allowed" : ""}`}>
                  <SelectValue placeholder="Selecione a moeda" />
                </SelectTrigger>
                <SelectContent>
                  {FIAT_CURRENCIES.map((currency) => (
                    <SelectItem key={currency.value} value={currency.value}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{currency.symbol}</span>
                        <span>{currency.value} - {currency.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasFinancialOperations ? (
                <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  A moeda não pode ser alterada — existem transações confirmadas associadas.
                </p>
              ) : !bookmaker ? (
                <div className="flex items-center gap-2 mt-3">
                  <Checkbox
                    id="moedaConfirmacao"
                    checked={moedaConfirmada}
                    onCheckedChange={(checked) => setMoedaConfirmada(checked === true)}
                  />
                  <label htmlFor="moedaConfirmacao" className="text-xs cursor-pointer select-none">
                    Confirmo que a moeda <strong className="font-mono">{moedaOperacional}</strong> está correta para esta conta
                  </label>
                </div>
              ) : null}
            </div>
          )}

          {/* MULTI-CONTA: Aparece automaticamente quando o parceiro já tem outra conta na mesma casa */}
          {showInstanceField && (
            <div>
              <Label htmlFor="instanceIdentifier" className="flex items-center gap-2">
                Identificador da Conta
                <span className="text-xs text-muted-foreground">(recomendado)</span>
              </Label>
              <Input
                id="instanceIdentifier"
                value={instanceIdentifier}
                onChange={(e) => setInstanceIdentifier(e.target.value)}
                placeholder="Ex: Principal, Backup, Email João, #1"
                disabled={loading}
                autoComplete="off"
                maxLength={50}
              />
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Este parceiro já possui outra conta nesta casa. Diferencie com um identificador.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="loginUsername">
                Usuário de Login <span className="text-xs text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="loginUsername"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="username ou email"
                disabled={loading}
                autoComplete="off"
              />
            </div>

            <div>
              <Label htmlFor="loginPassword">
                Senha de Login <span className="text-xs text-muted-foreground">{bookmaker ? "(opcional - deixe em branco para não alterar)" : "(opcional)"}</span>
              </Label>
              <PasswordInput
                value={loginPassword}
                onChange={setLoginPassword}
                placeholder={bookmaker ? "••••••••" : "senha"}
                disabled={loading}
              />
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus} disabled={loading}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="limitada">Limitada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                placeholder="Notas internas sobre este vínculo..."
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={loading}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading || isLoadingDetails || !parceiroId || !bookmakerId || !selectedLink || (!bookmaker && !moedaConfirmada)} 
              className="flex-1"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {bookmaker ? "Atualizar" : "Criar"} Vínculo
            </Button>
          </div>
          </form>
          </>
        )}
          </form>
          </>
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
