import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2 } from "lucide-react";

interface BookmakerCatalogoDialogProps {
  open: boolean;
  onClose: () => void;
  bookmaker: any | null;
}

export default function BookmakerCatalogoDialog({
  open,
  onClose,
  bookmaker,
}: BookmakerCatalogoDialogProps) {
  const [nome, setNome] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [status, setStatus] = useState("REGULAMENTADA");
  const [operacional, setOperacional] = useState("ATIVA");
  const [verificacao, setVerificacao] = useState("OBRIGATORIA");
  const [links, setLinks] = useState<Array<{ url: string; referencia: string }>>([{ url: "", referencia: "" }]);
  const [bonusEnabled, setBonusEnabled] = useState(false);
  const [multibonusEnabled, setMultibonusEnabled] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (bookmaker) {
      setNome(bookmaker.nome || "");
      setLogoUrl(bookmaker.logo_url || "");
      setStatus(bookmaker.status || "REGULAMENTADA");
      setOperacional(bookmaker.operacional || "ATIVA");
      setVerificacao(bookmaker.verificacao || "OBRIGATORIA");
      setLinks(Array.isArray(bookmaker.links_json) && bookmaker.links_json.length > 0 
        ? bookmaker.links_json 
        : [{ url: "", referencia: "" }]);
      setBonusEnabled(bookmaker.bonus_enabled || false);
      setMultibonusEnabled(bookmaker.multibonus_enabled || false);
      setObservacoes(bookmaker.observacoes || "");
    } else {
      resetForm();
    }
  }, [bookmaker, open]);

  const resetForm = () => {
    setNome("");
    setLogoUrl("");
    setStatus("REGULAMENTADA");
    setOperacional("ATIVA");
    setVerificacao("OBRIGATORIA");
    setLinks([{ url: "", referencia: "" }]);
    setBonusEnabled(false);
    setMultibonusEnabled(false);
    setObservacoes("");
  };

  const addLink = () => {
    setLinks([...links, { url: "", referencia: "" }]);
  };

  const removeLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const updateLink = (index: number, field: "url" | "referencia", value: string) => {
    const newLinks = [...links];
    newLinks[index][field] = value;
    setLinks(newLinks);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const validLinks = links.filter(link => link.url.trim() !== "");

      const catalogoData = {
        user_id: user.id,
        nome,
        logo_url: logoUrl || null,
        status,
        operacional,
        verificacao,
        links_json: validLinks,
        bonus_enabled: bonusEnabled,
        multibonus_enabled: multibonusEnabled,
        observacoes: observacoes || null,
      };

      if (bookmaker) {
        const { error } = await supabase
          .from("bookmakers_catalogo")
          .update(catalogoData)
          .eq("id", bookmaker.id);

        if (error) throw error;

        toast({
          title: "Casa atualizada",
          description: "Os dados da casa foram atualizados com sucesso.",
        });
      } else {
        const { error } = await supabase
          .from("bookmakers_catalogo")
          .insert([catalogoData]);

        if (error) throw error;

        toast({
          title: "Casa adicionada",
          description: "A nova casa foi adicionada ao catálogo com sucesso.",
        });
      }

      onClose();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
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

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="nome">Nome da Casa *</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Bet365"
                required
              />
            </div>

            <div>
              <Label htmlFor="logo">URL do Logo</Label>
              <Input
                id="logo"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                >
                  <option value="REGULAMENTADA">Regulamentada</option>
                  <option value="NAO_REGULAMENTADA">Não Regulamentada</option>
                </select>
              </div>

              <div>
                <Label htmlFor="operacional">Operacional</Label>
                <select
                  id="operacional"
                  value={operacional}
                  onChange={(e) => setOperacional(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                >
                  <option value="ATIVA">Ativa</option>
                  <option value="INATIVA">Inativa</option>
                </select>
              </div>

              <div>
                <Label htmlFor="verificacao">Verificação</Label>
                <select
                  id="verificacao"
                  value={verificacao}
                  onChange={(e) => setVerificacao(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                >
                  <option value="OBRIGATORIA">Obrigatória</option>
                  <option value="OPCIONAL">Opcional</option>
                  <option value="NAO_REQUERIDA">Não Requerida</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Links</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLink}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar Link
                </Button>
              </div>
              {links.map((link, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="URL"
                    value={link.url}
                    onChange={(e) => updateLink(index, "url", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Referência (ex: site_oficial)"
                    value={link.referencia}
                    onChange={(e) => updateLink(index, "referencia", e.target.value)}
                    className="flex-1"
                  />
                  {links.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeLink(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Configurações de Bônus</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bonusEnabled}
                    onChange={(e) => setBonusEnabled(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Bônus Habilitado</span>
                </label>
                {bonusEnabled && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={multibonusEnabled}
                      onChange={(e) => setMultibonusEnabled(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Múltiplos Bônus</span>
                  </label>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Notas adicionais sobre esta casa..."
                rows={3}
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {bookmaker ? "Atualizar" : "Adicionar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
