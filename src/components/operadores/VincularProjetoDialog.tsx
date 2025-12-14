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
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { HelpCircle, TrendingUp, DollarSign, Target, Layers } from "lucide-react";

interface Projeto {
  id: string;
  nome: string;
  status: string;
}

interface VincularProjetoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operadorId: string;
  onSuccess: () => void;
}

const MODELOS_PAGAMENTO = [
  { value: "FIXO_MENSAL", label: "Fixo Mensal" },
  { value: "PORCENTAGEM", label: "Porcentagem" },
  { value: "HIBRIDO", label: "Híbrido (Fixo + %)" },
  { value: "POR_ENTREGA", label: "Por Entrega" },
  { value: "COMISSAO_ESCALONADA", label: "Comissão Escalonada" },
];

const BASES_CALCULO = [
  { value: "LUCRO_PROJETO", label: "Lucro do Projeto" },
  { value: "FATURAMENTO_PROJETO", label: "Faturamento do Projeto" },
  { value: "RESULTADO_OPERACAO", label: "Resultado da Operação" },
  { value: "VOLUME_APOSTADO", label: "Volume de Valor Apostado" },
];


export function VincularProjetoDialog({
  open,
  onOpenChange,
  operadorId,
  onSuccess,
}: VincularProjetoDialogProps) {
  const [loading, setLoading] = useState(false);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projetosVinculados, setProjetosVinculados] = useState<string[]>([]);
  const [showBaseCalculoHelp, setShowBaseCalculoHelp] = useState(false);
  const [formData, setFormData] = useState({
    projeto_id: "",
    funcao: "",
    data_entrada: new Date().toISOString().split("T")[0],
    modelo_pagamento: "FIXO_MENSAL",
    valor_fixo: "",
    percentual: "",
    base_calculo: "LUCRO_PROJETO",
    meta_volume: "",
  });

  useEffect(() => {
    if (open) {
      fetchProjetos();
      fetchProjetosVinculados();
      setFormData({
        projeto_id: "",
        funcao: "",
        data_entrada: new Date().toISOString().split("T")[0],
        modelo_pagamento: "FIXO_MENSAL",
        valor_fixo: "",
        percentual: "",
        base_calculo: "LUCRO_PROJETO",
        meta_volume: "",
      });
    }
  }, [open, operadorId]);

  const fetchProjetos = async () => {
    const { data, error } = await supabase
      .from("projetos")
      .select("id, nome, status")
      .in("status", ["PLANEJADO", "EM_ANDAMENTO"])
      .order("nome");

    if (!error && data) {
      setProjetos(data);
    }
  };

  const fetchProjetosVinculados = async () => {
    const { data, error } = await supabase
      .from("operador_projetos")
      .select("projeto_id")
      .eq("operador_id", operadorId)
      .eq("status", "ATIVO");

    if (!error && data) {
      setProjetosVinculados(data.map(d => d.projeto_id));
    }
  };

  const handleSave = async () => {
    if (!formData.projeto_id) {
      toast.error("Selecione um projeto");
      return;
    }

    const modelo = formData.modelo_pagamento;
    if ((modelo === "FIXO_MENSAL" || modelo === "HIBRIDO") && !formData.valor_fixo) {
      toast.error("Informe o valor fixo mensal");
      return;
    }
    if ((modelo === "PORCENTAGEM" || modelo === "HIBRIDO" || modelo === "COMISSAO_ESCALONADA") && !formData.percentual) {
      toast.error("Informe o percentual");
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
        operador_id: operadorId,
        projeto_id: formData.projeto_id,
        funcao: formData.funcao || null,
        data_entrada: formData.data_entrada,
        status: "ATIVO",
        user_id: session.session.user.id,
        modelo_pagamento: formData.modelo_pagamento,
        valor_fixo: formData.valor_fixo ? parseFloat(formData.valor_fixo) : 0,
        percentual: formData.percentual ? parseFloat(formData.percentual) : 0,
        base_calculo: formData.base_calculo,
        meta_volume: formData.base_calculo === "VOLUME_APOSTADO" && formData.meta_volume 
          ? parseFloat(formData.meta_volume) 
          : null,
      });

      if (error) throw error;
      
      toast.success("Projeto vinculado com sucesso");
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

  const projetosDisponiveis = projetos.filter(
    p => !projetosVinculados.includes(p.id)
  );

  const showValorFixo = ["FIXO_MENSAL", "HIBRIDO", "POR_ENTREGA"].includes(formData.modelo_pagamento);
  const showPercentual = ["PORCENTAGEM", "HIBRIDO", "COMISSAO_ESCALONADA"].includes(formData.modelo_pagamento);
  const showBaseCalculo = showPercentual || formData.modelo_pagamento === "POR_ENTREGA";
  const showMetaVolume = formData.base_calculo === "VOLUME_APOSTADO";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular a um Projeto</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Projeto *</Label>
            <Select
              value={formData.projeto_id}
              onValueChange={(value) => setFormData({ ...formData, projeto_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um projeto" />
              </SelectTrigger>
              <SelectContent>
                {projetosDisponiveis.length === 0 ? (
                  <SelectItem value="none" disabled>
                    Nenhum projeto disponível
                  </SelectItem>
                ) : (
                  projetosDisponiveis.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
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

          <div className="border-t pt-4 mt-4">
            <h4 className="text-sm font-medium mb-3">Modelo de Pagamento</h4>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo de Acordo *</Label>
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
                    <Label>Valor Fixo (R$) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.valor_fixo}
                      onChange={(e) => setFormData({ ...formData, valor_fixo: e.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                )}

                {showPercentual && (
                  <div className="space-y-2">
                    <Label>Percentual (%) *</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.percentual}
                      onChange={(e) => setFormData({ ...formData, percentual: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                )}
              </div>

              {showBaseCalculo && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Base de Cálculo</Label>
                    <button
                      type="button"
                      onClick={() => setShowBaseCalculoHelp(true)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <HelpCircle className="h-4 w-4" />
                    </button>
                  </div>
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
              )}

              {/* Campo de Meta de Volume (quando base_calculo = VOLUME_APOSTADO) */}
              {showMetaVolume && (
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
                  <p className="text-xs text-muted-foreground">
                    O ciclo será fechado quando o volume apostado atingir este valor
                  </p>
                </div>
              )}
              <Dialog open={showBaseCalculoHelp} onOpenChange={setShowBaseCalculoHelp}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Base de Cálculo - Entenda as Opções</DialogTitle>
                    <DialogDescription>
                      Escolha como o percentual do operador será calculado
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-6 mt-4">
                    <div className="flex gap-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <TrendingUp className="h-5 w-5 text-emerald-500" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-medium text-emerald-400">Lucro do Projeto</h4>
                        <p className="text-sm text-muted-foreground">
                          O percentual é calculado sobre o <strong>lucro líquido</strong> do projeto.
                        </p>
                        <div className="text-xs text-muted-foreground mt-2 p-2 bg-background/50 rounded">
                          <strong>Exemplo:</strong> Lucro = R$ 40.000. Se 10%, recebe <strong>R$ 4.000</strong>.
                        </div>
                        <p className="text-xs text-emerald-400/70 mt-1">
                          ✓ Recomendado para alinhar incentivos com resultado real
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                          <DollarSign className="h-5 w-5 text-blue-500" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-medium text-blue-400">Faturamento do Projeto</h4>
                        <p className="text-sm text-muted-foreground">
                          O percentual é calculado sobre o <strong>faturamento bruto</strong> total.
                        </p>
                        <div className="text-xs text-muted-foreground mt-2 p-2 bg-background/50 rounded">
                          <strong>Exemplo:</strong> Faturou R$ 100.000. Se 10%, recebe <strong>R$ 10.000</strong>.
                        </div>
                        <p className="text-xs text-blue-400/70 mt-1">
                          ✓ Ideal para operadores com foco em volume de operações
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                          <Target className="h-5 w-5 text-purple-500" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-medium text-purple-400">Resultado da Operação</h4>
                        <p className="text-sm text-muted-foreground">
                          O percentual é calculado sobre o <strong>resultado específico</strong> das operações do operador.
                        </p>
                        <div className="text-xs text-muted-foreground mt-2 p-2 bg-background/50 rounded">
                          <strong>Exemplo:</strong> Gerou R$ 50.000 em resultado. Se 10%, recebe <strong>R$ 5.000</strong>.
                        </div>
                        <p className="text-xs text-purple-400/70 mt-1">
                          ✓ Melhor para traders com operações individuais rastreáveis
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                          <Layers className="h-5 w-5 text-amber-500" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-medium text-amber-400">Volume de Valor Apostado</h4>
                        <p className="text-sm text-muted-foreground">
                          O ciclo de pagamento é <strong>fechado por volume</strong>. Ao atingir a meta de 
                          valor apostado, o ciclo encerra e o operador é pago.
                        </p>
                        <div className="text-xs text-muted-foreground mt-2 p-2 bg-background/50 rounded">
                          <strong>Exemplo:</strong> Meta de R$ 120.000 em volume apostado. 
                          Ao atingir, operador recebe o valor fixo definido (ex: R$ 5.000).
                        </div>
                        <p className="text-xs text-amber-400/70 mt-1">
                          ✓ Ideal para operadores com foco em gerar volume de apostas
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end mt-4">
                    <Button onClick={() => setShowBaseCalculoHelp(false)}>
                      Entendi
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || !formData.projeto_id}>
            {loading ? "Vinculando..." : "Vincular"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
