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
import { Loader2, Plus } from "lucide-react";

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
  categoriasExtras?: string[];
}

const categoriasBase = [
  { value: "ENERGIA", label: "Energia" },
  { value: "INTERNET", label: "Internet" },
  { value: "MOVEL", label: "Móvel" },
  { value: "ALUGUEL", label: "Aluguel" },
  { value: "OPERADORES", label: "Operadores" },
];

export function DespesaAdministrativaDialog({
  open,
  onOpenChange,
  despesa,
  onSuccess,
  categoriasExtras = [],
}: DespesaAdministrativaDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showNovaCategoria, setShowNovaCategoria] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState("");
  const [formData, setFormData] = useState<DespesaAdministrativa>({
    categoria: "ENERGIA",
    descricao: "",
    valor: 0,
    data_despesa: new Date().toISOString().split("T")[0],
    recorrente: false,
    status: "CONFIRMADO",
  });

  // Combina categorias base com extras (personalizadas)
  const todasCategorias = [
    ...categoriasBase,
    ...categoriasExtras
      .filter(c => !categoriasBase.some(b => b.value === c))
      .map(c => ({ value: c, label: c }))
  ];

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
            {showNovaCategoria ? (
              <div className="flex gap-2">
                <Input
                  value={novaCategoria}
                  onChange={(e) => setNovaCategoria(e.target.value.toUpperCase())}
                  placeholder="Nome da nova categoria"
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (novaCategoria.trim()) {
                      setFormData({ ...formData, categoria: novaCategoria.trim() });
                      setShowNovaCategoria(false);
                      setNovaCategoria("");
                    }
                  }}
                >
                  OK
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowNovaCategoria(false);
                    setNovaCategoria("");
                  }}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Select
                  value={formData.categoria}
                  onValueChange={(value) => setFormData({ ...formData, categoria: value })}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {todasCategorias.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowNovaCategoria(true)}
                  title="Criar nova categoria"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
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
