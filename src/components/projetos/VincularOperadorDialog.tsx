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
import { HelpCircle, TrendingUp, DollarSign, Target, Layers, Percent } from "lucide-react";
import { FaixasEscalonadasInput } from "@/components/entregas/FaixasEscalonadasInput";

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
  { value: "VOLUME_APOSTADO", label: "Volume de Valor Apostado" },
];

const FREQUENCIAS = [
  { value: "SEMANAL", label: "Semanal" },
  { value: "QUINZENAL", label: "Quinzenal" },
  { value: "MENSAL", label: "Mensal" },
];

const TIPOS_META = [
  { value: "VALOR_FIXO", label: "Valor Fixo" },
  { value: "PERCENTUAL", label: "Percentual (%)" },
];

const MOEDAS = [
  { value: "BRL", label: "R$ (BRL)", symbol: "R$" },
  { value: "USD", label: "$ (USD)", symbol: "$" },
  { value: "EUR", label: "€ (EUR)", symbol: "€" },
];

interface Faixa {
  min: number;
  max: number | null;
  percentual: number;
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
  const [showBaseCalculoHelp, setShowBaseCalculoHelp] = useState(false);
  const [showModelosHelp, setShowModelosHelp] = useState(false);
  const [formData, setFormData] = useState({
    operador_id: "",
    funcao: "",
    data_entrada: new Date().toISOString().split("T")[0],
    modelo_pagamento: "FIXO_MENSAL",
    valor_fixo: "",
    moeda_valor_fixo: "BRL",
    percentual: "",
    base_calculo: "LUCRO_PROJETO",
    frequencia_entrega: "MENSAL",
    tipo_meta: "VALOR_FIXO",
    meta_valor: "",
    moeda_meta: "BRL",
    meta_percentual: "",
    // Regras financeiras
    regra_prejuizo: "ZERAR",
    teto_pagamento: "",
    piso_pagamento: "",
    // Meta de volume (quando base_calculo = VOLUME_APOSTADO)
    meta_volume: "",
  });
  const [faixasEscalonadas, setFaixasEscalonadas] = useState<Faixa[]>([
    { min: 0, max: 10000, percentual: 5 },
    { min: 10001, max: 30000, percentual: 8 },
    { min: 30001, max: null, percentual: 12 },
  ]);

  const handleNumericChange = (field: string, value: string, allowNegative = false) => {
    if (value === "") {
      setFormData({ ...formData, [field]: "" });
      return;
    }
    const num = parseFloat(value);
    if (!allowNegative && num < 0) {
      toast.error("Valores negativos não são permitidos");
      return;
    }
    setFormData({ ...formData, [field]: value });
  };

  useEffect(() => {
    if (open) {
      fetchOperadores();
      fetchOperadoresVinculados();
      setFormData({
        operador_id: "",
        funcao: "",
        data_entrada: new Date().toISOString().split("T")[0],
        modelo_pagamento: "FIXO_MENSAL",
        valor_fixo: "",
        moeda_valor_fixo: "BRL",
        percentual: "",
        base_calculo: "LUCRO_PROJETO",
        frequencia_entrega: "MENSAL",
        tipo_meta: "VALOR_FIXO",
        meta_valor: "",
        moeda_meta: "BRL",
        meta_percentual: "",
        regra_prejuizo: "ZERAR",
        teto_pagamento: "",
        piso_pagamento: "",
        meta_volume: "",
      });
      setFaixasEscalonadas([
        { min: 0, max: 10000, percentual: 5 },
        { min: 10001, max: 30000, percentual: 8 },
        { min: 30001, max: null, percentual: 12 },
      ]);
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

    const modelo = formData.modelo_pagamento;
    if ((modelo === "FIXO_MENSAL" || modelo === "HIBRIDO") && !formData.valor_fixo) {
      toast.error("Informe o valor fixo mensal");
      return;
    }
    if ((modelo === "PORCENTAGEM" || modelo === "HIBRIDO") && !formData.percentual) {
      toast.error("Informe o percentual");
      return;
    }
    if (modelo === "POR_ENTREGA" && !formData.meta_valor && !formData.meta_percentual) {
      toast.error("Informe a meta de entrega");
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
        modelo_pagamento: formData.modelo_pagamento,
        valor_fixo: formData.valor_fixo ? parseFloat(formData.valor_fixo) : 0,
        percentual: formData.percentual ? parseFloat(formData.percentual) : 0,
        base_calculo: formData.base_calculo,
        frequencia_entrega: formData.frequencia_entrega,
        // Regras financeiras
        regra_prejuizo: formData.regra_prejuizo,
        teto_pagamento: formData.teto_pagamento ? parseFloat(formData.teto_pagamento) : null,
        piso_pagamento: formData.piso_pagamento ? parseFloat(formData.piso_pagamento) : null,
        // Meta de volume (quando base_calculo = VOLUME_APOSTADO)
        meta_volume: formData.base_calculo === "VOLUME_APOSTADO" && formData.meta_volume 
          ? parseFloat(formData.meta_volume) 
          : null,
      };

      if (modelo === "POR_ENTREGA") {
        insertData.tipo_meta = formData.tipo_meta;
        insertData.meta_valor = formData.meta_valor ? parseFloat(formData.meta_valor) : null;
        insertData.meta_percentual = formData.meta_percentual ? parseFloat(formData.meta_percentual) : null;
      }

      if (modelo === "COMISSAO_ESCALONADA") {
        insertData.faixas_escalonadas = faixasEscalonadas;
      }

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
  const showPercentual = ["PORCENTAGEM", "HIBRIDO", "PROPORCIONAL_LUCRO"].includes(formData.modelo_pagamento);
  const showBaseCalculo = showPercentual || formData.modelo_pagamento === "POR_ENTREGA";
  const showFrequencia = ["FIXO_MENSAL", "PORCENTAGEM", "HIBRIDO", "COMISSAO_ESCALONADA", "PROPORCIONAL_LUCRO"].includes(formData.modelo_pagamento);
  const showFaixas = formData.modelo_pagamento === "COMISSAO_ESCALONADA";
  const showMetaPorEntrega = formData.modelo_pagamento === "POR_ENTREGA";
  const showMetaVolume = formData.base_calculo === "VOLUME_APOSTADO";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                <div className="flex items-center gap-2">
                  <Label>Tipo de Acordo *</Label>
                  <button
                    type="button"
                    onClick={() => setShowModelosHelp(true)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </div>
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

              {showFrequencia && (
                <div className="space-y-2">
                  <Label>Frequência de Conciliação</Label>
                  <Select
                    value={formData.frequencia_entrega}
                    onValueChange={(value) => setFormData({ ...formData, frequencia_entrega: value })}
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
                </div>
              )}

              {showValorFixo && (
                <div className="space-y-2">
                  <Label>Valor Fixo *</Label>
                  <div className="flex gap-2">
                    <Select
                      value={formData.moeda_valor_fixo}
                      onValueChange={(value) => setFormData({ ...formData, moeda_valor_fixo: value })}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MOEDAS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.valor_fixo}
                      onChange={(e) => handleNumericChange("valor_fixo", e.target.value)}
                      placeholder="0,00"
                      className="flex-1"
                    />
                  </div>
                </div>
              )}

              {showPercentual && (
                <div className="space-y-2">
                  <Label>Percentual (%) *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={formData.percentual}
                    onChange={(e) => handleNumericChange("percentual", e.target.value)}
                    placeholder="0"
                  />
                </div>
              )}

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

              {/* Meta Por Entrega */}
              {showMetaPorEntrega && (
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

                  {formData.tipo_meta === "VALOR_FIXO" ? (
                    <div className="space-y-2">
                      <Label>Meta *</Label>
                      <div className="flex gap-2">
                        <Select
                          value={formData.moeda_meta}
                          onValueChange={(value) => setFormData({ ...formData, moeda_meta: value })}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MOEDAS.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.meta_valor}
                          onChange={(e) => handleNumericChange("meta_valor", e.target.value)}
                          placeholder="30000"
                          className="flex-1"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Meta (%) *</Label>
                      <p className="text-xs text-muted-foreground">
                        % sobre {formData.base_calculo === "LUCRO_PROJETO" ? "Lucro" : formData.base_calculo === "FATURAMENTO_PROJETO" ? "Faturamento" : "Resultado"}
                      </p>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={formData.meta_percentual}
                        onChange={(e) => handleNumericChange("meta_percentual", e.target.value)}
                        placeholder="10"
                      />
                      <p className="text-xs text-amber-400">
                        Conciliação ocorrerá ao final de cada período ({formData.frequencia_entrega.toLowerCase()})
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Faixas Escalonadas */}
              {showFaixas && (
                <div className="border-t pt-4">
                  <FaixasEscalonadasInput
                    value={faixasEscalonadas}
                    onChange={setFaixasEscalonadas}
                  />
                </div>
              )}

              {/* Regras Financeiras */}
              <div className="border-t pt-4 space-y-4">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Regras Financeiras
                </h4>
                
                <div className="space-y-2">
                  <Label>Regra de Prejuízo</Label>
                  <Select
                    value={formData.regra_prejuizo}
                    onValueChange={(value) => setFormData({ ...formData, regra_prejuizo: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ZERAR">Zerar e seguir (não acumula dívida)</SelectItem>
                      <SelectItem value="CARRY_FORWARD">Carry-forward (abate do próximo ciclo)</SelectItem>
                      <SelectItem value="PROPORCIONAL">Proporcional (divide com empresa)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {formData.regra_prejuizo === "ZERAR" && "Em ciclos negativos, operador não recebe mas não acumula dívida"}
                    {formData.regra_prejuizo === "CARRY_FORWARD" && "Prejuízo é descontado dos lucros dos próximos ciclos"}
                    {formData.regra_prejuizo === "PROPORCIONAL" && "Empresa e operador dividem o prejuízo proporcionalmente"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Piso de Pagamento</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.piso_pagamento}
                      onChange={(e) => handleNumericChange("piso_pagamento", e.target.value)}
                      placeholder="0,00"
                    />
                    <p className="text-xs text-muted-foreground">
                      Valor mínimo por ciclo (opcional)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Teto de Pagamento</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.teto_pagamento}
                      onChange={(e) => handleNumericChange("teto_pagamento", e.target.value)}
                      placeholder="0,00"
                    />
                    <p className="text-xs text-muted-foreground">
                      Valor máximo por ciclo (opcional)
                    </p>
                  </div>
                </div>
              </div>

              {/* Campo de Meta de Volume (quando base_calculo = VOLUME_APOSTADO) */}
              {showMetaVolume && (
                <div className="space-y-2">
                  <Label>Meta de Volume (R$) *</Label>
                  <Input
                    type="number"
                    step="1000"
                    min="0"
                    value={formData.meta_volume}
                    onChange={(e) => handleNumericChange("meta_volume", e.target.value)}
                    placeholder="150000"
                  />
                  <p className="text-xs text-muted-foreground">
                    O ciclo será fechado quando o volume apostado atingir este valor
                  </p>
                </div>
              )}

              {/* Modal de Ajuda - Base de Cálculo */}
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
                          <strong>Exemplo:</strong> Projeto faturou R$ 100.000, com custos de R$ 60.000. 
                          Lucro = R$ 40.000. Se o operador tem 10%, recebe <strong>R$ 4.000</strong>.
                        </div>
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
                          <strong>Exemplo:</strong> Projeto faturou R$ 100.000. 
                          Se o operador tem 10%, recebe <strong>R$ 10.000</strong>.
                        </div>
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
                          O percentual é calculado sobre o <strong>resultado específico</strong> das 
                          operações que o operador participou.
                        </p>
                        <div className="text-xs text-muted-foreground mt-2 p-2 bg-background/50 rounded">
                          <strong>Exemplo:</strong> Operador gerou R$ 50.000 em resultado. 
                          Se tem 10%, recebe <strong>R$ 5.000</strong>.
                        </div>
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

              {/* Modal de Ajuda - Tipos de Acordo */}
              <Dialog open={showModelosHelp} onOpenChange={setShowModelosHelp}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Tipos de Acordo - Entenda as Opções</DialogTitle>
                    <DialogDescription>
                      Escolha o modelo de pagamento que melhor se adapta ao operador
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 mt-4">
                    <div className="flex gap-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <DollarSign className="h-5 w-5 text-emerald-500" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-medium text-emerald-400">Fixo Mensal</h4>
                        <p className="text-sm text-muted-foreground">
                          Valor fixo pago ao operador independente do resultado do projeto.
                        </p>
                        <div className="text-xs text-muted-foreground mt-2 p-2 bg-background/50 rounded">
                          <strong>Conciliação:</strong> Ao final de cada período (semanal, quinzenal ou mensal).
                          <br />
                          <strong>Exemplo:</strong> R$ 3.000 fixos por mês.
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                          <Percent className="h-5 w-5 text-blue-500" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-medium text-blue-400">Porcentagem</h4>
                        <p className="text-sm text-muted-foreground">
                          Percentual sobre a base de cálculo escolhida (lucro, faturamento ou resultado).
                        </p>
                        <div className="text-xs text-muted-foreground mt-2 p-2 bg-background/50 rounded">
                          <strong>Conciliação:</strong> Ao final de cada período configurado.
                          <br />
                          <strong>Exemplo:</strong> 10% do lucro do projeto = se lucro foi R$ 50.000, recebe R$ 5.000.
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                          <TrendingUp className="h-5 w-5 text-purple-500" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-medium text-purple-400">Híbrido (Fixo + %)</h4>
                        <p className="text-sm text-muted-foreground">
                          Combina um valor fixo garantido + percentual variável sobre resultado.
                        </p>
                        <div className="text-xs text-muted-foreground mt-2 p-2 bg-background/50 rounded">
                          <strong>Conciliação:</strong> Ao final de cada período configurado.
                          <br />
                          <strong>Exemplo:</strong> R$ 2.000 fixo + 5% do lucro.
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                          <Target className="h-5 w-5 text-amber-500" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-medium text-amber-400">Por Entrega</h4>
                        <p className="text-sm text-muted-foreground">
                          Pagamento vinculado ao atingimento de uma meta específica (valor fixo ou percentual).
                        </p>
                        <div className="text-xs text-muted-foreground mt-2 p-2 bg-background/50 rounded">
                          <strong>Conciliação - Meta Valor Fixo:</strong> Quando o resultado atingir o valor definido.
                          <br />
                          <strong>Conciliação - Meta Percentual:</strong> Ao final de cada período configurado, verificando se % foi alcançado.
                          <br />
                          <strong>Exemplo:</strong> Meta de R$ 30.000 ou 15% de ROI. Excedente transfere para próxima entrega.
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4 p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                          <Layers className="h-5 w-5 text-cyan-500" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-medium text-cyan-400">Comissão Escalonada</h4>
                        <p className="text-sm text-muted-foreground">
                          Faixas progressivas de comissão que aumentam conforme o resultado.
                        </p>
                        <div className="text-xs text-muted-foreground mt-2 p-2 bg-background/50 rounded">
                          <strong>Conciliação:</strong> Ao final de cada período configurado.
                          <br />
                          <strong>Exemplo:</strong> Até R$ 10.000 = 5%, de R$ 10.001 a R$ 30.000 = 8%, acima = 12%.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end mt-4">
                    <Button onClick={() => setShowModelosHelp(false)}>
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
          <Button onClick={handleSave} disabled={loading || !formData.operador_id}>
            {loading ? "Vinculando..." : "Vincular"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
