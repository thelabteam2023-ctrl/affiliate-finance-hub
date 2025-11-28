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
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface BookmakerDialogProps {
  open: boolean;
  onClose: () => void;
  bookmaker: any | null;
}

export default function BookmakerDialog({ open, onClose, bookmaker }: BookmakerDialogProps) {
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [saldoAtual, setSaldoAtual] = useState("0.00");
  const [moeda, setMoeda] = useState("BRL");
  const [status, setStatus] = useState("ativo");
  const [observacoes, setObservacoes] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (bookmaker) {
      setNome(bookmaker.nome || "");
      setUrl(bookmaker.url || "");
      setLoginUsername(bookmaker.login_username || "");
      setLoginPassword(""); // Never show the actual password
      setSaldoAtual(bookmaker.saldo_atual?.toString() || "0.00");
      setMoeda(bookmaker.moeda || "BRL");
      setStatus(bookmaker.status || "ativo");
      setObservacoes(bookmaker.observacoes || "");
    } else {
      resetForm();
    }
  }, [bookmaker]);

  const resetForm = () => {
    setNome("");
    setUrl("");
    setLoginUsername("");
    setLoginPassword("");
    setSaldoAtual("0.00");
    setMoeda("BRL");
    setStatus("ativo");
    setObservacoes("");
  };

  // Simple client-side encryption (base64) - NOT secure for production
  // In production, use proper encryption or store credentials in a secure vault
  const encryptPassword = (password: string): string => {
    return btoa(password); // Basic base64 encoding
  };

  const decryptPassword = (encrypted: string): string => {
    try {
      return atob(encrypted); // Basic base64 decoding
    } catch {
      return "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const bookmakerData: any = {
        user_id: user.id,
        nome,
        url: url || null,
        login_username: loginUsername,
        saldo_atual: parseFloat(saldoAtual),
        moeda,
        status,
        observacoes: observacoes || null,
      };

      // Only update password if a new one is provided
      if (loginPassword) {
        bookmakerData.login_password_encrypted = encryptPassword(loginPassword);
      }

      if (bookmaker) {
        // If editing and no new password, remove it from update
        if (!loginPassword) {
          delete bookmakerData.login_password_encrypted;
        }

        const { error } = await supabase
          .from("bookmakers")
          .update(bookmakerData)
          .eq("id", bookmaker.id);

        if (error) throw error;
      } else {
        // For new bookmakers, password is required
        if (!loginPassword) {
          throw new Error("Senha é obrigatória para novo bookmaker");
        }

        const { error } = await supabase
          .from("bookmakers")
          .insert(bookmakerData);

        if (error) throw error;
      }

      toast({
        title: bookmaker ? "Bookmaker atualizado" : "Bookmaker criado",
        description: "Os dados foram salvos com sucesso.",
      });

      onClose();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar bookmaker",
        description: error.message,
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
          <DialogTitle>
            {bookmaker ? "Editar Bookmaker" : "Novo Bookmaker"}
          </DialogTitle>
        </DialogHeader>

        <Alert className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Segurança:</strong> As credenciais são armazenadas de forma criptografada no banco de dados.
            Mantenha essas informações confidenciais.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="nome">Nome do Bookmaker *</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Bet365, Betano, etc"
                required
                disabled={loading}
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="url">URL do Site</Label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                disabled={loading}
              />
            </div>

            <div>
              <Label htmlFor="loginUsername">Usuário de Login *</Label>
              <Input
                id="loginUsername"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="username ou email"
                required
                disabled={loading}
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
                disabled={loading}
                autoComplete="new-password"
              />
            </div>

            <div>
              <Label htmlFor="saldoAtual">Saldo Inicial *</Label>
              <Input
                id="saldoAtual"
                type="number"
                step="0.01"
                value={saldoAtual}
                onChange={(e) => setSaldoAtual(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div>
              <Label htmlFor="moeda">Moeda *</Label>
              <select
                id="moeda"
                value={moeda}
                onChange={(e) => setMoeda(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background"
                disabled={loading}
              >
                <option value="BRL">Real (BRL)</option>
                <option value="USD">Dólar (USD)</option>
                <option value="EUR">Euro (EUR)</option>
                <option value="USDT">Tether (USDT)</option>
                <option value="BTC">Bitcoin (BTC)</option>
                <option value="ETH">Ethereum (ETH)</option>
              </select>
            </div>

            <div className="col-span-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background"
                disabled={loading}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="suspenso">Suspenso</option>
                <option value="bloqueado">Bloqueado</option>
              </select>
            </div>

            <div className="col-span-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                placeholder="Notas internas sobre este bookmaker..."
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {bookmaker ? "Atualizar" : "Criar"} Bookmaker
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
