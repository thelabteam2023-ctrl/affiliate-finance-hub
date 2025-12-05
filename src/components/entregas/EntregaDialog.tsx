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
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { addDays, addWeeks, format } from "date-fns";

interface EntregaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operadorProjetoId: string;
  modeloPagamento: string;
  frequenciaEntrega?: string;
  saldoInicial?: number;
  onSuccess: () => void;
}

const FREQUENCIAS = [
  { value: "SEMANAL", label: "Semanal", days: 7 },
  { value: "QUINZENAL", label: "Quinzenal", days: 15 },
  { value: "MENSAL", label: "Mensal", days: 30 },
];

const TIPOS_META = [
  { value: "VALOR_FIXO", label: "Valor Fixo (R$)" },
  { value: "PERCENTUAL", label: "Percentual (%)" },
];

const BASES_CALCULO = [
  { value: "LUCRO_PROJETO", label: "Lucro do Projeto" },
  { value: "FATURAMENTO_PROJETO", label: "Faturamento do Projeto" },
  { value: "RESULTADO_OPERACAO", label: "Resultado da Operação" },
];

export function EntregaDialog({
  open,
  onOpenChange,
  operadorProjetoId,
  modeloPagamento,
  frequenciaEntrega = "MENSAL",
  saldoInicial = 0,
  onSuccess,
}: EntregaDialogProps) {
  const [loading, setLoading] = useState(false);
  const [nextNumero, setNextNumero] = useState(1);
  
  const isPorEntrega = modeloPagamento === "POR_ENTREGA";
  const isPeriodico = ["FIXO_MENSAL", "PORCENTAGEM", "HIBRIDO", "COMISSAO_ESCALONADA"].includes(modeloPagamento);
  
  const getDefaultDataFim = () => {
    const freq = FREQUENCIAS.find(f => f.value === frequenciaEntrega);
    return format(addDays(new Date(), freq?.days || 30), "yyyy-MM-dd");
  };

  const [formData, setFormData] = useState({
    data_inicio: format(new Date(), "yyyy-MM-dd"),
    data_fim_prevista: isPeriodico ? getDefaultDataFim() : "",
    tipo_gatilho: isPorEntrega ? "META_ATINGIDA" : "PERIODO",
    tipo_meta: "VALOR_FIXO",
    meta_valor: "",
    meta_percentual: "",
    base_calculo: "LUCRO_PROJETO",
    descricao: "",
  });

  useEffect(() => {
    if (open) {
      fetchNextNumero();
      setFormData({
        data_inicio: format(new Date(), "yyyy-MM-dd"),
        data_fim_prevista: isPeriodico ? getDefaultDataFim() : "",
        tipo_gatilho: isPorEntrega ? "META_ATINGIDA" : "PERIODO",
        tipo_meta: "VALOR_FIXO",
        meta_valor: "",
        meta_percentual: "",
        base_calculo: "LUCRO_PROJETO",
        descricao: "",
      });
    }
  }, [open, operadorProjetoId, modeloPagamento]);

  const fetchNextNumero = async () => {
    const { data, error } = await supabase
      .from("entregas")
      .select("numero_entrega")
      .eq("operador_projeto_id", operadorProjetoId)
      .order("numero_entrega", { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      setNextNumero(data[0].numero_entrega + 1);
    } else {
      setNextNumero(1);
    }
  };

  const handleSave = async () => {
    if (isPorEntrega && !formData.meta_valor && !formData.meta_percentual) {
      toast.error("Informe a meta para a entrega");
      return;
    }

    if (isPeriodico && !formData.data_fim_prevista) {
      toast.error("Informe a data de fim do período");
      return;
    }

    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      const { error } = await supabase.from("entregas").insert({
        user_id: session.session.user.id,
        operador_projeto_id: operadorProjetoId,
        numero_entrega: nextNumero,
        descricao: formData.descricao || null,
        data_inicio: formData.data_inicio,
        data_fim_prevista: formData.data_fim_prevista || null,
        tipo_gatilho: formData.tipo_gatilho,
        tipo_meta: isPorEntrega ? formData.tipo_meta : null,
        meta_valor: formData.meta_valor ? parseFloat(formData.meta_valor) : null,
        meta_percentual: formData.meta_percentual ? parseFloat(formData.meta_percentual) : null,
        base_calculo: formData.base_calculo,
        saldo_inicial: saldoInicial,
        status: "EM_ANDAMENTO",
      });

      if (error) throw error;

      toast.success("Entrega criada com sucesso");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao criar entrega: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Entrega #{nextNumero}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {saldoInicial > 0 && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-sm text-emerald-400">
                <strong>Saldo Inicial:</strong> {formatCurrency(saldoInicial)} (excedente da entrega anterior)
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              placeholder="Ex: Entrega de janeiro, Primeira remessa..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de Início</Label>
              <DatePicker
                value={formData.data_inicio}
                onChange={(date) => setFormData({ ...formData, data_inicio: date })}
              />
            </div>

            {isPeriodico && (
              <div className="space-y-2">
                <Label>Data de Fim</Label>
                <DatePicker
                  value={formData.data_fim_prevista}
                  onChange={(date) => setFormData({ ...formData, data_fim_prevista: date })}
                />
              </div>
            )}
          </div>

          {isPorEntrega && (
            <div className="border-t pt-4 space-y-4">
              <h4 className="text-sm font-medium">Configuração da Meta</h4>
              
              <div className="space-y-2">
                <Label>Tipo de Meta</Label>
                <Select
                  value={formData.tipo_meta}
                  onValueChange={(value) => setFormData({ ...formData, tipo_meta: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_META.map((tipo) => (
                      <SelectItem key={tipo.value} value={tipo.value}>
                        {tipo.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {formData.tipo_meta === "VALOR_FIXO" ? (
                  <div className="space-y-2">
                    <Label>Meta (R$) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.meta_valor}
                      onChange={(e) => setFormData({ ...formData, meta_valor: e.target.value })}
                      placeholder="30000"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Meta (%) *</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.meta_percentual}
                      onChange={(e) => setFormData({ ...formData, meta_percentual: e.target.value })}
                      placeholder="10"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Base de Cálculo</Label>
                  <Select
                    value={formData.base_calculo}
                    onValueChange={(value) => setFormData({ ...formData, base_calculo: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BASES_CALCULO.map((base) => (
                        <SelectItem key={base.value} value={base.value}>
                          {base.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Criando..." : "Criar Entrega"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
