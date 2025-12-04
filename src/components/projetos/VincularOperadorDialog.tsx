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
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";

interface Operador {
  id: string;
  nome: string;
  cpf: string;
}

interface VincularOperadorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  onSuccess: () => void;
}

export function VincularOperadorDialog({
  open,
  onOpenChange,
  projetoId,
  onSuccess,
}: VincularOperadorDialogProps) {
  const [loading, setLoading] = useState(false);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [operadoresVinculados, setOperadoresVinculados] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    operador_id: "",
    funcao: "",
    data_entrada: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    if (open) {
      fetchOperadores();
      fetchOperadoresVinculados();
      setFormData({
        operador_id: "",
        funcao: "",
        data_entrada: new Date().toISOString().split("T")[0],
      });
    }
  }, [open, projetoId]);

  const fetchOperadores = async () => {
    const { data, error } = await supabase
      .from("operadores")
      .select("id, nome, cpf")
      .eq("status", "ATIVO")
      .order("nome");

    if (!error && data) {
      setOperadores(data);
    }
  };

  const fetchOperadoresVinculados = async () => {
    const { data, error } = await supabase
      .from("operador_projetos")
      .select("operador_id")
      .eq("projeto_id", projetoId)
      .eq("status", "ATIVO");

    if (!error && data) {
      setOperadoresVinculados(data.map(d => d.operador_id));
    }
  };

  const handleSave = async () => {
    if (!formData.operador_id) {
      toast.error("Selecione um operador");
      return;
    }

    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      const { error } = await supabase.from("operador_projetos").insert({
        operador_id: formData.operador_id,
        projeto_id: projetoId,
        funcao: formData.funcao || null,
        data_entrada: formData.data_entrada,
        status: "ATIVO",
        user_id: session.session.user.id,
      });

      if (error) throw error;
      
      toast.success("Operador vinculado com sucesso");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      if (error.code === "23505") {
        toast.error("Este operador já está vinculado ao projeto");
      } else {
        toast.error("Erro ao vincular: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Filtrar operadores que já estão vinculados ativos
  const operadoresDisponiveis = operadores.filter(
    op => !operadoresVinculados.includes(op.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular Operador ao Projeto</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Operador *</Label>
            <Select
              value={formData.operador_id}
              onValueChange={(value) => setFormData({ ...formData, operador_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um operador" />
              </SelectTrigger>
              <SelectContent>
                {operadoresDisponiveis.length === 0 ? (
                  <SelectItem value="none" disabled>
                    Nenhum operador disponível
                  </SelectItem>
                ) : (
                  operadoresDisponiveis.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.nome}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Função no Projeto</Label>
            <Input
              value={formData.funcao}
              onChange={(e) => setFormData({ ...formData, funcao: e.target.value })}
              placeholder="Ex: Trader, Analista, etc."
            />
          </div>

          <div className="space-y-2">
            <Label>Data de Entrada</Label>
            <DatePicker
              value={formData.data_entrada}
              onChange={(date) => setFormData({ ...formData, data_entrada: date })}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || !formData.operador_id}>
            {loading ? "Vinculando..." : "Vincular"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}