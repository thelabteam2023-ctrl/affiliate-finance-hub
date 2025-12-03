import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface DespesaAdministrativa {
  id?: string;
  categoria: string;
  descricao: string;
  valor: number;
  data_despesa: string;
  recorrente: boolean;
  status: string;
}

interface DespesaAdministrativaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  despesa?: DespesaAdministrativa | null;
  onSuccess?: () => void;
}

const categorias = [
  { value: "ENERGIA", label: "Energia / Luz" },
  { value: "INTERNET_4G", label: "Internet / 4G" },
  { value: "ALUGUEL", label: "Aluguel" },
  { value: "FUNCIONARIOS", label: "Funcionários / Operadores" },
  { value: "OUTROS", label: "Outros" },
];

export function DespesaAdministrativaDialog({
  open,
  onOpenChange,
  despesa,
  onSuccess,
}: DespesaAdministrativaDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<DespesaAdministrativa>({
    categoria: "ENERGIA",
    descricao: "",
    valor: 0,
    data_despesa: new Date().toISOString().split("T")[0],
    recorrente: false,
    status: "CONFIRMADO",
  });

  useEffect(() => {
    if (despesa) {
      setFormData({
        ...despesa,
        data_despesa: despesa.data_despesa.split("T")[0],
      });
    } else {
      setFormData({
        categoria: "ENERGIA",
        descricao: "",
        valor: 0,
        data_despesa: new Date().toISOString().split("T")[0],
        recorrente: false,
        status: "CONFIRMADO",
      });
    }
  }, [despesa, open]);

  const handleSubmit = async () => {
    if (!formData.categoria || formData.valor <= 0) {
      toast({
        title: "Campos obrigatórios",
        description: "Selecione a categoria e informe um valor válido.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const payload = {
        categoria: formData.categoria,
        descricao: formData.descricao || null,
        valor: formData.valor,
        data_despesa: formData.data_despesa,
        recorrente: formData.recorrente,
        status: formData.status,
        user_id: user.id,
      };

      if (despesa?.id) {
        const { error } = await supabase
          .from("despesas_administrativas")
          .update(payload)
          .eq("id", despesa.id);
        if (error) throw error;
        toast({ title: "Despesa atualizada com sucesso!" });
      } else {
        const { error } = await supabase
          .from("despesas_administrativas")
          .insert(payload);
        if (error) throw error;
        toast({ title: "Despesa registrada com sucesso!" });
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar despesa",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {despesa?.id ? "Editar Despesa Administrativa" : "Nova Despesa Administrativa"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Categoria *</Label>
            <Select
              value={formData.categoria}
              onValueChange={(value) => setFormData({ ...formData, categoria: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Valor *</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={formData.valor || ""}
              onChange={(e) => setFormData({ ...formData, valor: parseFloat(e.target.value) || 0 })}
              placeholder="R$ 0,00"
            />
          </div>

          <div className="space-y-2">
            <Label>Data da Despesa *</Label>
            <DatePicker
              value={formData.data_despesa}
              onChange={(date) => setFormData({ ...formData, data_despesa: date })}
              placeholder="Selecione a data"
            />
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              placeholder="Descrição opcional da despesa..."
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Despesa Recorrente</Label>
              <p className="text-xs text-muted-foreground">
                Marque se esta despesa se repete mensalmente
              </p>
            </div>
            <Switch
              checked={formData.recorrente}
              onCheckedChange={(checked) => setFormData({ ...formData, recorrente: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CONFIRMADO">Confirmado</SelectItem>
                <SelectItem value="PENDENTE">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {despesa?.id ? "Salvar" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
