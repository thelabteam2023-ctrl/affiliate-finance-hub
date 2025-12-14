import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { ChevronDown, FileText, Calendar, User } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface EditarAcordoOperadorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operadorProjeto: {
    id: string;
    operador_id: string;
    funcao: string | null;
    data_entrada: string;
    modelo_pagamento: string;
    valor_fixo: number | null;
    percentual: number | null;
    base_calculo: string | null;
    frequencia_conciliacao: string | null;
    dias_intervalo_conciliacao: number | null;
    resumo_acordo: string | null;
    operador?: {
      nome: string;
      cpf: string;
    };
  } | null;
  onSuccess: () => void;
}

const FREQUENCIAS = [
  { value: "SEMANAL", label: "Semanal", descricao: "Toda segunda-feira" },
  { value: "MENSAL", label: "Mensal", descricao: "Dia 1º de cada mês" },
  { value: "CUSTOMIZADO", label: "Customizado", descricao: "A cada X dias" },
];

const MODELOS_PAGAMENTO = [
  { value: "FIXO_MENSAL", label: "Fixo Mensal" },
  { value: "PORCENTAGEM", label: "Porcentagem" },
  { value: "HIBRIDO", label: "Híbrido (Fixo + %)" },
  { value: "POR_ENTREGA", label: "Por Entrega" },
  { value: "COMISSAO_ESCALONADA", label: "Comissão Escalonada" },
];

const BASES_CALCULO = [
  { value: "LUCRO_PROJETO", label: "Lucro do Projeto" },
  { value: "VOLUME_APOSTAS", label: "Volume de Apostas" },
  { value: "LUCRO_LIQUIDO", label: "Lucro Líquido" },
];

export function EditarAcordoOperadorDialog({
  open,
  onOpenChange,
  operadorProjeto,
  onSuccess,
}: EditarAcordoOperadorDialogProps) {
  const [saving, setSaving] = useState(false);
  const [acordoExpanded, setAcordoExpanded] = useState(false);
  
  // Form state
  const [frequenciaConciliacao, setFrequenciaConciliacao] = useState("MENSAL");
  const [diasIntervaloConciliacao, setDiasIntervaloConciliacao] = useState("15");
  const [resumoAcordo, setResumoAcordo] = useState("");
  const [modeloPagamento, setModeloPagamento] = useState("FIXO_MENSAL");
  const [valorFixo, setValorFixo] = useState("");
  const [percentual, setPercentual] = useState("");
  const [baseCalculo, setBaseCalculo] = useState("LUCRO_PROJETO");

  useEffect(() => {
    if (operadorProjeto) {
      setFrequenciaConciliacao(operadorProjeto.frequencia_conciliacao || "MENSAL");
      setDiasIntervaloConciliacao(operadorProjeto.dias_intervalo_conciliacao?.toString() || "15");
      setResumoAcordo(operadorProjeto.resumo_acordo || "");
      setModeloPagamento(operadorProjeto.modelo_pagamento || "FIXO_MENSAL");
      setValorFixo(operadorProjeto.valor_fixo?.toString() || "");
      setPercentual(operadorProjeto.percentual?.toString() || "");
      setBaseCalculo(operadorProjeto.base_calculo || "LUCRO_PROJETO");
      
      // Expand if has any reference data
      if (operadorProjeto.valor_fixo || operadorProjeto.percentual || operadorProjeto.base_calculo) {
        setAcordoExpanded(true);
      }
    }
  }, [operadorProjeto]);

  const handleSave = async () => {
    if (!operadorProjeto) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from("operador_projetos")
        .update({
          frequencia_conciliacao: frequenciaConciliacao,
          dias_intervalo_conciliacao: frequenciaConciliacao === "CUSTOMIZADO" 
            ? parseInt(diasIntervaloConciliacao) || 15 
            : null,
          resumo_acordo: resumoAcordo || null,
          modelo_pagamento: modeloPagamento,
          valor_fixo: valorFixo ? parseFloat(valorFixo) : null,
          percentual: percentual ? parseFloat(percentual) : null,
          base_calculo: baseCalculo,
        })
        .eq("id", operadorProjeto.id);

      if (error) throw error;

      toast.success("Acordo atualizado com sucesso");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao atualizar acordo: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!operadorProjeto) return null;

  const showValorFixo = modeloPagamento === "FIXO_MENSAL" || modeloPagamento === "HIBRIDO" || modeloPagamento === "POR_ENTREGA";
  const showPercentual = modeloPagamento === "PORCENTAGEM" || modeloPagamento === "HIBRIDO" || modeloPagamento === "COMISSAO_ESCALONADA";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Acordo - {operadorProjeto.operador?.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Read-only info */}
          <div className="p-3 rounded-lg bg-muted/50 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Função:</span>
              <span>{operadorProjeto.funcao || "Não definida"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Entrada:</span>
              <span>{format(new Date(operadorProjeto.data_entrada), "dd/MM/yyyy", { locale: ptBR })}</span>
            </div>
          </div>

          {/* Frequência de Conciliação */}
          <div className="space-y-2">
            <Label>Frequência de Conciliação</Label>
            <Select value={frequenciaConciliacao} onValueChange={setFrequenciaConciliacao}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIAS.map((freq) => (
                  <SelectItem key={freq.value} value={freq.value}>
                    <div className="flex flex-col">
                      <span>{freq.label}</span>
                      <span className="text-xs text-muted-foreground">{freq.descricao}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {frequenciaConciliacao === "SEMANAL" && "Alertas toda segunda-feira"}
              {frequenciaConciliacao === "MENSAL" && "Alertas no dia 1º de cada mês"}
              {frequenciaConciliacao === "CUSTOMIZADO" && "Alertas a cada X dias a partir da entrada"}
            </p>
          </div>

          {frequenciaConciliacao === "CUSTOMIZADO" && (
            <div className="space-y-2">
              <Label>Intervalo em Dias</Label>
              <Input
                type="number"
                min="1"
                max="365"
                value={diasIntervaloConciliacao}
                onChange={(e) => setDiasIntervaloConciliacao(e.target.value)}
                placeholder="15"
              />
              <p className="text-xs text-muted-foreground">
                A cada {diasIntervaloConciliacao || "X"} dias a partir da data de entrada
              </p>
            </div>
          )}

          {/* Resumo do Acordo */}
          <div className="space-y-2">
            <Label>Resumo do Acordo</Label>
            <Textarea
              value={resumoAcordo}
              onChange={(e) => setResumoAcordo(e.target.value)}
              placeholder="Descreva os termos do acordo..."
              rows={3}
            />
          </div>

          {/* Referência do Acordo (Collapsible) */}
          <Collapsible open={acordoExpanded} onOpenChange={setAcordoExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                <span className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4" />
                  Referência do Acordo (opcional)
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${acordoExpanded ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4 border-t mt-2">
              {/* Modelo de Pagamento */}
              <div className="space-y-2">
                <Label>Modelo de Pagamento</Label>
                <Select value={modeloPagamento} onValueChange={setModeloPagamento}>
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

              {/* Valor Fixo */}
              {showValorFixo && (
                <div className="space-y-2">
                  <Label>Valor Fixo (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={valorFixo}
                    onChange={(e) => setValorFixo(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              )}

              {/* Percentual */}
              {showPercentual && (
                <div className="space-y-2">
                  <Label>Percentual (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={percentual}
                    onChange={(e) => setPercentual(e.target.value)}
                    placeholder="0"
                  />
                </div>
              )}

              {/* Base de Cálculo */}
              <div className="space-y-2">
                <Label>Base de Cálculo</Label>
                <Select value={baseCalculo} onValueChange={setBaseCalculo}>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
