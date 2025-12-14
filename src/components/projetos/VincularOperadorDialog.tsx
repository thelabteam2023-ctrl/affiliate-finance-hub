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
import { DatePicker } from "@/components/ui/date-picker";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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

const MODELOS_PAGAMENTO = [
  { value: "FIXO_MENSAL", label: "Fixo Mensal" },
  { value: "PORCENTAGEM", label: "Porcentagem" },
  { value: "HIBRIDO", label: "Híbrido (Fixo + %)" },
  { value: "POR_ENTREGA", label: "Por Entrega" },
  { value: "COMISSAO_ESCALONADA", label: "Comissão Escalonada" },
  { value: "PROPORCIONAL_LUCRO", label: "Proporcional ao Lucro" },
];

const BASES_CALCULO = [
  { value: "LUCRO_PROJETO", label: "Lucro do Projeto" },
  { value: "FATURAMENTO_PROJETO", label: "Faturamento do Projeto" },
  { value: "RESULTADO_OPERACAO", label: "Resultado da Operação" },
];

const FREQUENCIAS = [
  { value: "SEMANAL", label: "Semanal" },
  { value: "QUINZENAL", label: "Quinzenal" },
  { value: "MENSAL", label: "Mensal" },
];

export function VincularOperadorDialog({
  open,
  onOpenChange,
  projetoId,
  onSuccess,
}: VincularOperadorDialogProps) {
  const [loading, setLoading] = useState(false);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [operadoresVinculados, setOperadoresVinculados] = useState<string[]>([]);
  const [acordoExpanded, setAcordoExpanded] = useState(false);
  const [formData, setFormData] = useState({
    operador_id: "",
    funcao: "",
    data_entrada: new Date().toISOString().split("T")[0],
    frequencia_conciliacao: "MENSAL",
    resumo_acordo: "",
    // Campos de referência do acordo (opcionais)
    modelo_pagamento: "FIXO_MENSAL",
    valor_fixo: "",
    percentual: "",
    base_calculo: "LUCRO_PROJETO",
  });

  useEffect(() => {
    if (open) {
      fetchOperadores();
      fetchOperadoresVinculados();
      setFormData({
        operador_id: "",
        funcao: "",
        data_entrada: new Date().toISOString().split("T")[0],
        frequencia_conciliacao: "MENSAL",
        resumo_acordo: "",
        modelo_pagamento: "FIXO_MENSAL",
        valor_fixo: "",
        percentual: "",
        base_calculo: "LUCRO_PROJETO",
      });
      setAcordoExpanded(false);
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

      const insertData: any = {
        operador_id: formData.operador_id,
        projeto_id: projetoId,
        funcao: formData.funcao || null,
        data_entrada: formData.data_entrada,
        status: "ATIVO",
        user_id: session.session.user.id,
        frequencia_conciliacao: formData.frequencia_conciliacao,
        resumo_acordo: formData.resumo_acordo || null,
        // Campos de referência (opcionais - não usados para cálculo automático)
        modelo_pagamento: formData.modelo_pagamento,
        valor_fixo: formData.valor_fixo ? parseFloat(formData.valor_fixo) : 0,
        percentual: formData.percentual ? parseFloat(formData.percentual) : 0,
        base_calculo: formData.base_calculo,
      };

      const { error } = await supabase.from("operador_projetos").insert(insertData);

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

  const operadoresDisponiveis = operadores.filter(
    op => !operadoresVinculados.includes(op.id)
  );

  const showValorFixo = ["FIXO_MENSAL", "HIBRIDO"].includes(formData.modelo_pagamento);
  const showPercentual = ["PORCENTAGEM", "HIBRIDO", "PROPORCIONAL_LUCRO", "COMISSAO_ESCALONADA"].includes(formData.modelo_pagamento);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vincular Operador ao Projeto</DialogTitle>
          <DialogDescription>
            Configure o vínculo do operador. Os campos de acordo são apenas para referência.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Seção Obrigatória */}
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Função no Projeto</Label>
                <Input
                  value={formData.funcao}
                  onChange={(e) => setFormData({ ...formData, funcao: e.target.value })}
                  placeholder="Ex: Trader, Analista"
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

            <div className="space-y-2">
              <Label>Frequência de Conciliação *</Label>
              <Select
                value={formData.frequencia_conciliacao}
                onValueChange={(value) => setFormData({ ...formData, frequencia_conciliacao: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIAS.map((freq) => (
                    <SelectItem key={freq.value} value={freq.value}>
                      {freq.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Define quando os relatórios de performance serão gerados e alertas disparados
              </p>
            </div>

            <div className="space-y-2">
              <Label>Resumo do Acordo</Label>
              <Textarea
                value={formData.resumo_acordo}
                onChange={(e) => setFormData({ ...formData, resumo_acordo: e.target.value })}
                placeholder="Descreva os termos do acordo com o operador (opcional)"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Documentação livre do acordo - não utilizado para cálculos automáticos
              </p>
            </div>
          </div>

          {/* Seção Colapsável: Referência do Acordo */}
          <Collapsible open={acordoExpanded} onOpenChange={setAcordoExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span>Referência do Acordo (opcional)</span>
                </div>
                {acordoExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 border">
                <p className="text-xs text-muted-foreground">
                  ℹ️ Estes campos são apenas para <strong>referência e documentação</strong>. 
                  Não são usados para cálculos automáticos de pagamento.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Modelo de Pagamento</Label>
                <Select
                  value={formData.modelo_pagamento}
                  onValueChange={(value) => setFormData({ ...formData, modelo_pagamento: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELOS_PAGAMENTO.map((modelo) => (
                      <SelectItem key={modelo.value} value={modelo.value}>
                        {modelo.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {showValorFixo && (
                  <div className="space-y-2">
                    <Label>Valor Fixo (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.valor_fixo}
                      onChange={(e) => setFormData({ ...formData, valor_fixo: e.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                )}

                {showPercentual && (
                  <div className="space-y-2">
                    <Label>Percentual (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={formData.percentual}
                      onChange={(e) => setFormData({ ...formData, percentual: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                )}
              </div>

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
            </CollapsibleContent>
          </Collapsible>
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
