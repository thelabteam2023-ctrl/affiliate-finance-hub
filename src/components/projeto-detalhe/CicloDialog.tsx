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
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import { addMonths, format } from "date-fns";

interface Ciclo {
  id: string;
  numero_ciclo: number;
  data_inicio: string;
  data_fim_prevista: string;
  data_fim_real: string | null;
  status: string;
  lucro_bruto: number;
  lucro_liquido: number;
  observacoes: string | null;
}

interface CicloDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  ciclo: Ciclo | null;
  proximoNumero: number;
  onSuccess: () => void;
}

export function CicloDialog({
  open,
  onOpenChange,
  projetoId,
  ciclo,
  proximoNumero,
  onSuccess,
}: CicloDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    data_inicio: new Date().toISOString().split("T")[0],
    data_fim_prevista: addMonths(new Date(), 1).toISOString().split("T")[0],
    observacoes: "",
  });

  const isEditMode = !!ciclo;

  useEffect(() => {
    if (open) {
      if (ciclo) {
        setFormData({
          data_inicio: ciclo.data_inicio,
          data_fim_prevista: ciclo.data_fim_prevista,
          observacoes: ciclo.observacoes || "",
        });
      } else {
        // Para novo ciclo, buscar último ciclo para definir data de início
        fetchUltimoCiclo();
      }
    }
  }, [open, ciclo]);

  const fetchUltimoCiclo = async () => {
    const { data } = await supabase
      .from("projeto_ciclos")
      .select("data_fim_prevista")
      .eq("projeto_id", projetoId)
      .order("numero_ciclo", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      // Novo ciclo começa no dia seguinte ao fim do último
      const novaDataInicio = new Date(data.data_fim_prevista);
      novaDataInicio.setDate(novaDataInicio.getDate() + 1);
      const novaDataFim = addMonths(novaDataInicio, 1);
      
      setFormData({
        data_inicio: novaDataInicio.toISOString().split("T")[0],
        data_fim_prevista: novaDataFim.toISOString().split("T")[0],
        observacoes: "",
      });
    } else {
      // Buscar data de início do projeto
      const { data: projeto } = await supabase
        .from("projetos")
        .select("data_inicio")
        .eq("id", projetoId)
        .maybeSingle();

      if (projeto?.data_inicio) {
        const dataInicio = new Date(projeto.data_inicio);
        const dataFim = addMonths(dataInicio, 1);
        setFormData({
          data_inicio: projeto.data_inicio,
          data_fim_prevista: dataFim.toISOString().split("T")[0],
          observacoes: "",
        });
      }
    }
  };

  const handleSave = async () => {
    if (!formData.data_inicio || !formData.data_fim_prevista) {
      toast.error("Preencha as datas do ciclo");
      return;
    }

    if (new Date(formData.data_fim_prevista) <= new Date(formData.data_inicio)) {
      toast.error("Data fim deve ser posterior à data início");
      return;
    }

    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      if (isEditMode) {
        const { error } = await supabase
          .from("projeto_ciclos")
          .update({
            data_inicio: formData.data_inicio,
            data_fim_prevista: formData.data_fim_prevista,
            observacoes: formData.observacoes || null,
          })
          .eq("id", ciclo!.id);

        if (error) throw error;
        toast.success("Ciclo atualizado com sucesso!");
      } else {
        const { error } = await supabase
          .from("projeto_ciclos")
          .insert({
            user_id: session.session.user.id,
            projeto_id: projetoId,
            numero_ciclo: proximoNumero,
            data_inicio: formData.data_inicio,
            data_fim_prevista: formData.data_fim_prevista,
            observacoes: formData.observacoes || null,
            status: "EM_ANDAMENTO",
          });

        if (error) throw error;
        toast.success("Ciclo criado com sucesso!");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? `Editar Ciclo ${ciclo?.numero_ciclo}` : `Criar Ciclo ${proximoNumero}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Início *</Label>
              <DatePicker
                value={formData.data_inicio}
                onChange={(date) => setFormData({ ...formData, data_inicio: date })}
                disabled={isEditMode && ciclo?.status === "FECHADO"}
              />
            </div>
            <div className="space-y-2">
              <Label>Data Fim Prevista *</Label>
              <DatePicker
                value={formData.data_fim_prevista}
                onChange={(date) => setFormData({ ...formData, data_fim_prevista: date })}
                disabled={ciclo?.status === "FECHADO"}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              placeholder="Notas sobre este ciclo..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={loading || ciclo?.status === "FECHADO"}>
              {loading ? "Salvando..." : isEditMode ? "Salvar" : "Criar Ciclo"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
