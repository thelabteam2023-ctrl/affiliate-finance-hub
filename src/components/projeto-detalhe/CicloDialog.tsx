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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { addMonths, addDays } from "date-fns";
import { Clock, Target, Zap } from "lucide-react";

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
  tipo_gatilho: string;
  meta_volume: number | null;
  metrica_acumuladora: string;
  valor_acumulado: number;
  excedente_anterior: number;
  operador_projeto_id: string | null;
}

interface OperadorProjeto {
  id: string;
  operador_id: string;
  tipo_gatilho: string;
  meta_volume: number | null;
  periodo_maximo_dias: number;
  metrica_acumuladora: string;
  operador: {
    nome: string;
  };
}

interface CicloDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  ciclo: Ciclo | null;
  proximoNumero: number;
  onSuccess: () => void;
}

const TIPOS_GATILHO = [
  { value: "TEMPO", label: "Por Tempo", icon: Clock },
  { value: "VOLUME", label: "Por Volume", icon: Target },
  { value: "HIBRIDO", label: "Híbrido", icon: Zap },
];

const METRICAS = [
  { value: "LUCRO", label: "Lucro Realizado" },
  { value: "VOLUME_APOSTADO", label: "Volume Apostado" },
  { value: "TURNOVER", label: "Turnover" },
];

export function CicloDialog({
  open,
  onOpenChange,
  projetoId,
  ciclo,
  proximoNumero,
  onSuccess,
}: CicloDialogProps) {
  const [loading, setLoading] = useState(false);
  const [operadoresProjeto, setOperadoresProjeto] = useState<OperadorProjeto[]>([]);
  const [formData, setFormData] = useState({
    operador_projeto_id: "",
    data_inicio: new Date().toISOString().split("T")[0],
    data_fim_prevista: addMonths(new Date(), 1).toISOString().split("T")[0],
    tipo_gatilho: "TEMPO",
    meta_volume: "",
    metrica_acumuladora: "LUCRO",
    observacoes: "",
  });

  const isEditMode = !!ciclo;

  useEffect(() => {
    if (open) {
      fetchOperadoresProjeto();
      if (ciclo) {
        setFormData({
          operador_projeto_id: ciclo.operador_projeto_id || "",
          data_inicio: ciclo.data_inicio,
          data_fim_prevista: ciclo.data_fim_prevista,
          tipo_gatilho: ciclo.tipo_gatilho || "TEMPO",
          meta_volume: ciclo.meta_volume?.toString() || "",
          metrica_acumuladora: ciclo.metrica_acumuladora || "LUCRO",
          observacoes: ciclo.observacoes || "",
        });
      } else {
        fetchUltimoCiclo();
      }
    }
  }, [open, ciclo]);

  const fetchOperadoresProjeto = async () => {
    const { data, error } = await supabase
      .from("operador_projetos")
      .select(`
        id,
        operador_id,
        tipo_gatilho,
        meta_volume,
        periodo_maximo_dias,
        metrica_acumuladora,
        operador:operadores(nome)
      `)
      .eq("projeto_id", projetoId)
      .eq("status", "ATIVO");

    if (!error && data) {
      setOperadoresProjeto(data as any);
    }
  };

  const fetchUltimoCiclo = async () => {
    const { data } = await supabase
      .from("projeto_ciclos")
      .select("data_fim_prevista")
      .eq("projeto_id", projetoId)
      .order("numero_ciclo", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const novaDataInicio = addDays(new Date(data.data_fim_prevista), 1);
      const novaDataFim = addMonths(novaDataInicio, 1);
      
      setFormData(prev => ({
        ...prev,
        data_inicio: novaDataInicio.toISOString().split("T")[0],
        data_fim_prevista: novaDataFim.toISOString().split("T")[0],
      }));
    } else {
      const { data: projeto } = await supabase
        .from("projetos")
        .select("data_inicio")
        .eq("id", projetoId)
        .maybeSingle();

      if (projeto?.data_inicio) {
        const dataInicio = new Date(projeto.data_inicio);
        const dataFim = addMonths(dataInicio, 1);
        setFormData(prev => ({
          ...prev,
          data_inicio: projeto.data_inicio,
          data_fim_prevista: dataFim.toISOString().split("T")[0],
        }));
      }
    }
  };

  // Quando seleciona um operador, herda configurações do contrato
  const handleOperadorChange = (operadorProjetoId: string) => {
    const op = operadoresProjeto.find(o => o.id === operadorProjetoId);
    if (op) {
      const dataFim = addDays(new Date(formData.data_inicio), op.periodo_maximo_dias || 30);
      setFormData({
        ...formData,
        operador_projeto_id: operadorProjetoId,
        tipo_gatilho: op.tipo_gatilho || "TEMPO",
        meta_volume: op.meta_volume?.toString() || "",
        metrica_acumuladora: op.metrica_acumuladora || "LUCRO",
        data_fim_prevista: dataFim.toISOString().split("T")[0],
      });
    } else {
      setFormData({ ...formData, operador_projeto_id: operadorProjetoId });
    }
  };

  const handleSave = async () => {
    if (!formData.data_inicio || !formData.data_fim_prevista) {
      toast.error("Preencha as datas do ciclo");
      return;
    }

    if (formData.tipo_gatilho !== "TEMPO" && !formData.meta_volume) {
      toast.error("Informe a meta de volume para ciclos volumétricos");
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

      const cicloData = {
        data_inicio: formData.data_inicio,
        data_fim_prevista: formData.data_fim_prevista,
        tipo_gatilho: formData.tipo_gatilho,
        meta_volume: formData.meta_volume ? parseFloat(formData.meta_volume) : null,
        metrica_acumuladora: formData.metrica_acumuladora,
        observacoes: formData.observacoes || null,
        operador_projeto_id: formData.operador_projeto_id || null,
      };

      if (isEditMode) {
        const { error } = await supabase
          .from("projeto_ciclos")
          .update(cicloData)
          .eq("id", ciclo!.id);

        if (error) throw error;
        toast.success("Ciclo atualizado com sucesso!");
      } else {
        const { error } = await supabase
          .from("projeto_ciclos")
          .insert({
            ...cicloData,
            user_id: session.session.user.id,
            projeto_id: projetoId,
            numero_ciclo: proximoNumero,
            status: "EM_ANDAMENTO",
            valor_acumulado: 0,
            excedente_anterior: 0,
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

  const showVolumeFields = formData.tipo_gatilho === "VOLUME" || formData.tipo_gatilho === "HIBRIDO";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? `Editar Ciclo ${ciclo?.numero_ciclo}` : `Criar Ciclo ${proximoNumero}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Seleção de Operador (opcional) */}
          {operadoresProjeto.length > 0 && (
            <div className="space-y-2">
              <Label>Operador Vinculado (opcional)</Label>
              <Select
                value={formData.operador_projeto_id}
                onValueChange={handleOperadorChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ciclo geral do projeto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Ciclo geral do projeto</SelectItem>
                  {operadoresProjeto.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.operador?.nome} - {TIPOS_GATILHO.find(t => t.value === op.tipo_gatilho)?.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Vincular a um operador herda as configurações de gatilho do contrato
              </p>
            </div>
          )}

          {/* Tipo de Gatilho */}
          <div className="space-y-2">
            <Label>Tipo de Gatilho *</Label>
            <Select
              value={formData.tipo_gatilho}
              onValueChange={(value) => setFormData({ ...formData, tipo_gatilho: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_GATILHO.map((tipo) => (
                  <SelectItem key={tipo.value} value={tipo.value}>
                    <div className="flex items-center gap-2">
                      <tipo.icon className="h-4 w-4" />
                      {tipo.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Campos de Volume */}
          {showVolumeFields && (
            <>
              <div className="space-y-2">
                <Label>Métrica Acumuladora *</Label>
                <Select
                  value={formData.metrica_acumuladora}
                  onValueChange={(value) => setFormData({ ...formData, metrica_acumuladora: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METRICAS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Meta de Volume (R$) *</Label>
                <Input
                  type="number"
                  step="1000"
                  min="0"
                  value={formData.meta_volume}
                  onChange={(e) => setFormData({ ...formData, meta_volume: e.target.value })}
                  placeholder="150000"
                />
              </div>
            </>
          )}

          {/* Datas */}
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
              <Label>
                {formData.tipo_gatilho === "VOLUME" ? "Data Limite" : "Data Fim Prevista"} *
              </Label>
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