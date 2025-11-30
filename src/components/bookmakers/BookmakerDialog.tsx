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
import { Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import BookmakerSelect from "./BookmakerSelect";
import ParceiroSelect from "@/components/parceiros/ParceiroSelect";

interface BookmakerDialogProps {
  open: boolean;
  onClose: () => void;
  bookmaker: any | null;
}

interface BookmakerCatalogo {
  id: string;
  nome: string;
  logo_url: string | null;
  links_json: Array<{ ref: string; url: string }>;
}

export default function BookmakerDialog({ open, onClose, bookmaker }: BookmakerDialogProps) {
  const [loading, setLoading] = useState(false);
  const [parceiroId, setParceiroId] = useState("");
  const [bookmakerId, setBookmakerId] = useState("");
  const [selectedBookmaker, setSelectedBookmaker] = useState<BookmakerCatalogo | null>(null);
  const [selectedLink, setSelectedLink] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [status, setStatus] = useState("ativo");
  const [observacoes, setObservacoes] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (bookmaker) {
      setParceiroId(bookmaker.parceiro_id || "");
      setBookmakerId(bookmaker.bookmaker_catalogo_id || "");
      setLoginUsername(bookmaker.login_username || "");
      setLoginPassword("");
      setStatus(bookmaker.status || "ativo");
      setObservacoes(bookmaker.observacoes || "");
      setSelectedLink(bookmaker.link_origem || "");
    } else {
      resetForm();
    }
  }, [bookmaker]);

  useEffect(() => {
    if (bookmakerId) {
      fetchBookmakerDetails();
    } else {
      setSelectedBookmaker(null);
      setSelectedLink("");
    }
  }, [bookmakerId]);

  const fetchBookmakerDetails = async () => {
    try {
      const { data, error } = await supabase
        .from("bookmakers_catalogo")
        .select("id, nome, logo_url, links_json")
        .eq("id", bookmakerId)
        .single();

      if (error) throw error;
      
      const bookmakerData: BookmakerCatalogo = {
        id: data.id,
        nome: data.nome,
        logo_url: data.logo_url,
        links_json: (data.links_json as any) || [],
      };
      
      setSelectedBookmaker(bookmakerData);
      
      // Auto-select first link (PADRÃO) if available
      const linksArray = bookmakerData.links_json;
      if (linksArray && linksArray.length > 0 && !selectedLink) {
        setSelectedLink(linksArray[0].ref);
      }
    } catch (error: any) {
      console.error("Erro ao carregar detalhes da bookmaker:", error);
    }
  };

  const resetForm = () => {
    setParceiroId("");
    setBookmakerId("");
    setSelectedBookmaker(null);
    setSelectedLink("");
    setLoginUsername("");
    setLoginPassword("");
    setStatus("ativo");
    setObservacoes("");
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

      const bookmakerData: any = {
        user_id: user.id,
        parceiro_id: parceiroId,
        bookmaker_catalogo_id: bookmakerId,
        nome: selectedBookmaker?.nome || "",
        link_origem: selectedLink,
        login_username: loginUsername,
        saldo_atual: 0, // Sempre começa com 0
        moeda: "BRL", // Padrão BRL
        status,
        observacoes: observacoes || null,
      };

      if (loginPassword) {
        bookmakerData.login_password_encrypted = encryptPassword(loginPassword);
      }

      if (bookmaker) {
        if (!loginPassword) {
          delete bookmakerData.login_password_encrypted;
        }

        const { error } = await supabase
          .from("bookmakers")
          .update(bookmakerData)
          .eq("id", bookmaker.id);

        if (error) throw error;
      } else {
        if (!loginPassword) {
          throw new Error("Senha é obrigatória para novo vínculo");
        }

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
      toast({
        title: "Erro ao salvar vínculo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const linkUrl = selectedBookmaker?.links_json?.find(
    (link) => link.ref === selectedLink
  )?.url || "";

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
            <ParceiroSelect
              value={parceiroId}
              onValueChange={setParceiroId}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label>Bookmaker *</Label>
            <BookmakerSelect
              value={bookmakerId}
              onValueChange={setBookmakerId}
              disabled={loading}
            />
          </div>

          {selectedBookmaker && (
            <>
              <div className="flex flex-col items-center gap-4 py-6 border-y">
                {selectedBookmaker.logo_url && (
                  <img
                    src={selectedBookmaker.logo_url}
                    alt={selectedBookmaker.nome}
                    className="h-32 w-32 rounded-lg object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-1">Bookmaker</div>
                  <div className="text-lg font-semibold uppercase">
                    {selectedBookmaker.nome}
                  </div>
                </div>
              </div>

              {selectedBookmaker.links_json && selectedBookmaker.links_json.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-base">
                    Link de Cadastro *
                  </Label>
                  <RadioGroup value={selectedLink} onValueChange={setSelectedLink}>
                    <div className="space-y-3">
                      {selectedBookmaker.links_json.map((link) => (
                        <label
                          key={link.ref}
                          htmlFor={link.ref}
                          className="flex items-start gap-3 p-4 border rounded-lg hover:bg-accent/40 transition-colors cursor-pointer"
                        >
                          <RadioGroupItem value={link.ref} id={link.ref} className="mt-1 flex-shrink-0" />
                          <div className="flex-1 space-y-2">
                            <Badge variant="secondary" className="uppercase text-xs">
                              {link.ref === "PADRÃO" ? "SITE OFICIAL" : link.ref}
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
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="loginUsername">Usuário de Login *</Label>
              <Input
                id="loginUsername"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="username ou email"
                required
                disabled={loading || !bookmakerId}
                autoComplete="off"
              />
            </div>

            <div>
              <Label htmlFor="loginPassword">
                Senha de Login {bookmaker ? "(deixe em branco para não alterar)" : "*"}
              </Label>
              <Input
                id="loginPassword"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder={bookmaker ? "••••••••" : "senha"}
                required={!bookmaker}
                disabled={loading || !bookmakerId}
                autoComplete="new-password"
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus} disabled={loading || !bookmakerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                  <SelectItem value="bloqueado">Bloqueado</SelectItem>
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
                disabled={loading || !bookmakerId}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !parceiroId || !bookmakerId} className="flex-1">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {bookmaker ? "Atualizar" : "Criar"} Vínculo
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
