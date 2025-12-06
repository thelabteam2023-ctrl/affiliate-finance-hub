import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface PerdaOperacionalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  onSuccess: () => void;
}

interface Bookmaker {
  id: string;
  nome: string;
  parceiro: {
    nome: string;
  } | null;
}

const CATEGORIAS = [
  { value: "CONTA_LIMITADA", label: "Conta Limitada" },
  { value: "BONUS_TRAVADO", label: "Bônus Travado" },
  { value: "TAXA_CONVERSAO", label: "Taxa de Conversão" },
  { value: "FRAUDE_DETECTADA", label: "Fraude Detectada" },
  { value: "SALDO_BLOQUEADO", label: "Saldo Bloqueado" },
  { value: "SALDO_RESIDUAL", label: "Saldo Residual" },
  { value: "OUTRO", label: "Outro" },
];

export function PerdaOperacionalDialog({
  open,
  onOpenChange,
  projetoId,
  onSuccess,
}: PerdaOperacionalDialogProps) {
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [bookmakerId, setBookmakerId] = useState<string>("");
  const [valor, setValor] = useState<string>("");
  const [categoria, setCategoria] = useState<string>("");
  const [descricao, setDescricao] = useState<string>("");

  useEffect(() => {
    if (open) {
      fetchBookmakers();
      resetForm();
    }
  }, [open, projetoId]);

  const resetForm = () => {
    setBookmakerId("");
    setValor("");
    setCategoria("");
    setDescricao("");
  };

  const fetchBookmakers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("bookmakers")
        .select("id, nome, parceiro:parceiros(nome)")
        .eq("projeto_id", projetoId)
        .order("nome");

      if (error) throw error;
      setBookmakers(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar bookmakers: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!bookmakerId) {
      toast.error("Selecione um bookmaker");
      return;
    }

    if (!categoria) {
      toast.error("Selecione uma categoria");
      return;
    }

    const valorNumerico = parseFloat(valor.replace(",", "."));
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      toast.error("Informe um valor válido");
      return;
    }

    try {
      setSaving(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase.from("projeto_perdas").insert({
        user_id: user.id,
        projeto_id: projetoId,
        bookmaker_id: bookmakerId,
        valor: valorNumerico,
        categoria,
        descricao: descricao || null,
      });

      if (error) throw error;

      toast.success("Perda registrada com sucesso");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao registrar perda: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Registrar Perda Operacional</DialogTitle>
          <DialogDescription>
            Registre perdas que impactam o resultado do projeto (contas limitadas, bônus travados, etc.)
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Bookmaker */}
          <div className="grid gap-2">
            <Label htmlFor="bookmaker">Bookmaker *</Label>
            <Select value={bookmakerId} onValueChange={setBookmakerId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o bookmaker" />
              </SelectTrigger>
              <SelectContent>
                {bookmakers.map((bk) => (
                  <SelectItem key={bk.id} value={bk.id}>
                    {bk.nome} {bk.parceiro?.nome ? `- ${bk.parceiro.nome}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Categoria */}
          <div className="grid gap-2">
            <Label htmlFor="categoria">Categoria *</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Valor */}
          <div className="grid gap-2">
            <Label htmlFor="valor">Valor da Perda (R$) *</Label>
            <Input
              id="valor"
              type="text"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>

          {/* Descrição */}
          <div className="grid gap-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              placeholder="Detalhes sobre a perda..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Salvando..." : "Registrar Perda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
