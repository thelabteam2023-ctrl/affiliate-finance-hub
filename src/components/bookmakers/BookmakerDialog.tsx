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
import { Loader2, AlertTriangle, User } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import BookmakerSelect from "./BookmakerSelect";
import ParceiroSelect from "@/components/parceiros/ParceiroSelect";
import { PasswordInput } from "@/components/parceiros/PasswordInput";
import { FIAT_CURRENCIES, type FiatCurrency, CURRENCY_SYMBOLS } from "@/types/currency";

interface BookmakerDialogProps {
  open: boolean;
  onClose: () => void;
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
  bookmaker,
  defaultParceiroId,
  defaultBookmakerId,
  lockParceiro = false,
  lockBookmaker = false 
}: BookmakerDialogProps) {
  const [loading, setLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [parceiroId, setParceiroId] = useState("");
  const [parceiroNome, setParceiroNome] = useState("");  // Nome do parceiro para display estático
  const [bookmakerId, setBookmakerId] = useState("");
  const [selectedBookmaker, setSelectedBookmaker] = useState<BookmakerCatalogo | null>(null);
  const [selectedLink, setSelectedLink] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [moedaOperacional, setMoedaOperacional] = useState<FiatCurrency>("USD");
  const [status, setStatus] = useState("ativo");
  const [saldoIrrecuperavel, setSaldoIrrecuperavel] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [showObservacoesDialog, setShowObservacoesDialog] = useState(false);
  const { toast } = useToast();

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
        setSaldoIrrecuperavel("");
        setObservacoes("");
        setIsLoadingDetails(false);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  // Inicialização quando dialog abre - efeito separado para garantir execução determinística
  useEffect(() => {
    if (!open) return;
    
    // Modo edição
    if (bookmaker) {
      setParceiroId(bookmaker.parceiro_id || "");
      setBookmakerId(bookmaker.bookmaker_catalogo_id || "");
      setLoginUsername(bookmaker.login_username || "");
      setLoginPassword("");
      setMoedaOperacional((bookmaker.moeda as FiatCurrency) || "BRL");
      setStatus(bookmaker.status || "ativo");
      setSaldoIrrecuperavel(bookmaker.saldo_irrecuperavel?.toString() || "0");
      setObservacoes(bookmaker.observacoes || "");
      setSelectedLink(bookmaker.link_origem || "");
      setSelectedBookmaker(null);
      setParceiroNome("");
      
      if (bookmaker.parceiro_id) {
        fetchParceiroNome(bookmaker.parceiro_id);
      }
      if (bookmaker.bookmaker_catalogo_id) {
        // Em modo edição, preservar a moeda existente
        fetchBookmakerDetails(bookmaker.bookmaker_catalogo_id, bookmaker.link_origem, true);
      }
    } else {
      // Modo criação - inicialização com valores dos props
      setLoginUsername("");
      setLoginPassword("");
      setStatus("ativo");
      setSaldoIrrecuperavel("");
      setObservacoes("");
      setSelectedLink("");
      setSelectedBookmaker(null);
      setParceiroNome("");
      
      // Definir parceiro e bookmaker a partir dos defaults
      const newParceiroId = defaultParceiroId || "";
      const newBookmakerId = defaultBookmakerId || "";
      
      setParceiroId(newParceiroId);
      setBookmakerId(newBookmakerId);
      
      // Carregar nome do parceiro se houver ID default
      if (newParceiroId) {
        fetchParceiroNome(newParceiroId);
      }
      // Carregar detalhes da bookmaker se houver ID default
      if (newBookmakerId) {
        fetchBookmakerDetails(newBookmakerId);
      }
    }
  }, [open, bookmaker?.id, defaultParceiroId, defaultBookmakerId]);

  // Handler para mudança manual de bookmaker
  const handleBookmakerChange = (newBookmakerId: string) => {
    setBookmakerId(newBookmakerId);
    setSelectedBookmaker(null);
    setSelectedLink("");
    
    if (newBookmakerId) {
      fetchBookmakerDetails(newBookmakerId);
    }
  };

  const encryptPassword = (password: string): string => {
    return btoa(password);
  };

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

      // Buscar workspace do usuário
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      const workspaceId = workspaceMember?.workspace_id || null;

      const bookmakerData: any = {
        user_id: user.id,
        workspace_id: workspaceId,
        parceiro_id: parceiroId,
        bookmaker_catalogo_id: bookmakerId,
        nome: selectedBookmaker?.nome || "",
        link_origem: selectedLink,
        login_username: loginUsername || "",
        login_password_encrypted: loginPassword ? encryptPassword(loginPassword) : "",
        saldo_atual: 0,
        saldo_usd: 0,
        saldo_irrecuperavel: parseFloat(saldoIrrecuperavel) || 0,
        moeda: moedaOperacional,
        status,
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
        const { error } = await supabase
          .from("bookmakers")
          .insert(bookmakerData);

        if (error) throw error;
      }

      toast({
        title: bookmaker ? "Vínculo atualizado" : "Vínculo criado",
        description: "Os dados foram salvos com sucesso.",
      });

      onClose();
    } catch (error: any) {
      let errorMessage = error.message;
      
      // Detectar erro de vínculo duplicado
      if (error.message?.includes('bookmakers_user_parceiro_bookmaker_unique') || 
          error.code === '23505') {
        errorMessage = "Este parceiro já possui um vínculo cadastrado com esta bookmaker. Cada parceiro pode ter apenas um vínculo por casa de apostas.";
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl">
            Parceiro ↔ Bookmaker
          </DialogTitle>
        </DialogHeader>

        <Alert className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Segurança:</strong> As credenciais são armazenadas de forma criptografada no banco de dados.
            Mantenha essas informações confidenciais.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Parceiro *</Label>
            {/* Modo contextual: display estático (não usa ParceiroSelect) */}
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
                  // Resetar bookmaker quando parceiro muda (lista filtrada muda)
                  if (!bookmaker) {
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
            {/* Modo contextual: display estático (não usa BookmakerSelect) */}
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
              /* Modo genérico: select normal */
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
              <Label htmlFor="moedaOperacional">Moeda Operacional</Label>
              <Select 
                value={moedaOperacional} 
                onValueChange={(val) => setMoedaOperacional(val as FiatCurrency)} 
                disabled={loading}
              >
                <SelectTrigger>
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
              <p className="text-xs text-muted-foreground mt-1">
                Moeda em que a casa opera (saldo e transações)
              </p>
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

            <div>
              <Label htmlFor="saldoIrrecuperavel" className="flex items-center gap-2">
                Saldo Irrecuperável
                <span className="text-xs text-muted-foreground">({CURRENCY_SYMBOLS[moedaOperacional]})</span>
              </Label>
              <Input
                id="saldoIrrecuperavel"
                type="number"
                step="0.01"
                min="0"
                value={saldoIrrecuperavel}
                onChange={(e) => setSaldoIrrecuperavel(e.target.value)}
                placeholder="0,00"
                disabled={loading}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Valor bloqueado/perdido que não pode ser sacado
              </p>
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
            <Button type="submit" disabled={loading || isLoadingDetails || !parceiroId || !bookmakerId || !selectedLink} className="flex-1">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {bookmaker ? "Atualizar" : "Criar"} Vínculo
            </Button>
          </div>
        </form>
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
