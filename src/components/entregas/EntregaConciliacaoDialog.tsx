import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp } from "lucide-react";

interface Entrega {
  id: string;
  numero_entrega: number;
  resultado_nominal: number;
  saldo_inicial: number;
  meta_valor: number | null;
  meta_percentual: number | null;
  tipo_gatilho: string;
  data_inicio: string;
  data_fim_prevista: string | null;
}

interface EntregaConciliacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entrega: Entrega | null;
  operadorNome?: string;
  modeloPagamento: string;
  valorFixo?: number;
  percentual?: number;
  onSuccess: () => void;
}

const TIPOS_AJUSTE = [
  { value: "PERDA_FRICCIONAL", label: "Perda Friccional" },
  { value: "GANHO_OPERACIONAL", label: "Ganho Operacional" },
  { value: "OUTRO", label: "Outro" },
];

export function EntregaConciliacaoDialog({
  open,
  onOpenChange,
  entrega,
  operadorNome,
  modeloPagamento,
  valorFixo = 0,
  percentual = 0,
  onSuccess,
}: EntregaConciliacaoDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    resultado_real: "",
    tipo_ajuste: "PERDA_FRICCIONAL",
    observacoes_conciliacao: "",
    valor_pagamento_operador: "",
  });

  useEffect(() => {
    if (open && entrega) {
      const valorSugerido = calcularPagamentoSugerido(entrega.resultado_nominal);
      setFormData({
        resultado_real: entrega.resultado_nominal.toString(),
        tipo_ajuste: "PERDA_FRICCIONAL",
        observacoes_conciliacao: "",
        valor_pagamento_operador: valorSugerido.toString(),
      });
    }
  }, [open, entrega]);

  const calcularPagamentoSugerido = (resultado: number) => {
    switch (modeloPagamento) {
      case "FIXO_MENSAL":
        return valorFixo;
      case "PORCENTAGEM":
        return resultado * (percentual / 100);
      case "HIBRIDO":
        return valorFixo + (resultado * (percentual / 100));
      case "POR_ENTREGA":
        return entrega?.meta_valor || 0;
      default:
        return 0;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const ajuste = entrega 
    ? parseFloat(formData.resultado_real || "0") - entrega.resultado_nominal
    : 0;

  const excedente = entrega
    ? Math.max(0, parseFloat(formData.resultado_real || "0") - (entrega.meta_valor || 0))
    : 0;

  const handleSave = async () => {
    if (!entrega) return;

    if (!formData.resultado_real) {
      toast.error("Informe o resultado real");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("entregas")
        .update({
          resultado_real: parseFloat(formData.resultado_real),
          ajuste: ajuste,
          tipo_ajuste: ajuste !== 0 ? formData.tipo_ajuste : null,
          observacoes_conciliacao: formData.observacoes_conciliacao || null,
          valor_pagamento_operador: parseFloat(formData.valor_pagamento_operador || "0"),
          excedente_proximo: excedente,
          conciliado: true,
          data_conciliacao: new Date().toISOString(),
          data_fim_real: new Date().toISOString().split("T")[0],
          status: "CONCLUIDA",
        })
        .eq("id", entrega.id);

      if (error) throw error;

      toast.success("Entrega conciliada com sucesso");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao conciliar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!entrega) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Conciliar Entrega #{entrega.numero_entrega}</DialogTitle>
          <DialogDescription>
            {operadorNome && `Operador: ${operadorNome}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo da Entrega */}
          <div className="p-4 rounded-lg bg-muted/50 border space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Saldo Inicial:</span>
              <span>{formatCurrency(entrega.saldo_inicial)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Resultado Nominal:</span>
              <span className="font-medium">{formatCurrency(entrega.resultado_nominal)}</span>
            </div>
            {entrega.meta_valor && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Meta:</span>
                <span>{formatCurrency(entrega.meta_valor)}</span>
              </div>
            )}
          </div>

          {/* Resultado Real */}
          <div className="space-y-2">
            <Label>Resultado Real (R$) *</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.resultado_real}
              onChange={(e) => setFormData({ ...formData, resultado_real: e.target.value })}
              placeholder="0,00"
            />
          </div>

          {/* Ajuste */}
          {ajuste !== 0 && (
            <div className={`p-3 rounded-lg border ${ajuste < 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
              <div className="flex items-center gap-2 mb-2">
                {ajuste < 0 ? (
                  <TrendingDown className="h-4 w-4 text-red-400" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                )}
                <span className={`font-medium ${ajuste < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  Ajuste: {formatCurrency(ajuste)}
                </span>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Tipo de Ajuste</Label>
                <Select
                  value={formData.tipo_ajuste}
                  onValueChange={(value) => setFormData({ ...formData, tipo_ajuste: value })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_AJUSTE.map((tipo) => (
                      <SelectItem key={tipo.value} value={tipo.value}>
                        {tipo.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Excedente */}
          {excedente > 0 && modeloPagamento === "POR_ENTREGA" && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-400" />
                <span className="text-sm text-blue-400">
                  <strong>Excedente para próxima entrega:</strong> {formatCurrency(excedente)}
                </span>
              </div>
            </div>
          )}

          {/* Valor Pagamento */}
          <div className="space-y-2">
            <Label>Valor Pagamento ao Operador (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.valor_pagamento_operador}
              onChange={(e) => setFormData({ ...formData, valor_pagamento_operador: e.target.value })}
              placeholder="0,00"
            />
            <p className="text-xs text-muted-foreground">
              Sugerido: {formatCurrency(calcularPagamentoSugerido(parseFloat(formData.resultado_real) || 0))}
            </p>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label>Observações da Conciliação</Label>
            <Textarea
              value={formData.observacoes_conciliacao}
              onChange={(e) => setFormData({ ...formData, observacoes_conciliacao: e.target.value })}
              placeholder="Observações sobre a conciliação..."
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Conciliando..." : "Conciliar Entrega"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
