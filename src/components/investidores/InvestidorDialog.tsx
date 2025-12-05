import { useState, useEffect } from "react";
import { Plus, Trash2, HelpCircle, Percent } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { validateCPF } from "@/lib/validators";

interface FaixaProgressiva {
  limite: number;
  percentual: number;
}

interface InvestidorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "view" | "edit" | "create";
  investidor?: any;
  onSuccess: () => void;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
};

export function InvestidorDialog({ open, onOpenChange, mode, investidor, onSuccess }: InvestidorDialogProps) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("dados");
  
  // Dados pessoais
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [status, setStatus] = useState("ativo");
  const [observacoes, setObservacoes] = useState("");
  const [cpfValidation, setCpfValidation] = useState<{ valid: boolean; message: string } | null>(null);
  const [cpfLoading, setCpfLoading] = useState(false);

  // Deal
  const [dealId, setDealId] = useState<string | null>(null);
  const [tipoDeal, setTipoDeal] = useState<"FIXO" | "PROGRESSIVO">("FIXO");
  const [baseCalculo, setBaseCalculo] = useState<"LUCRO" | "APORTE">("LUCRO");
  const [percentualFixo, setPercentualFixo] = useState("40");
  const [faixasProgressivas, setFaixasProgressivas] = useState<FaixaProgressiva[]>([
    { limite: 10000, percentual: 20 },
    { limite: 50000, percentual: 30 },
    { limite: 100000, percentual: 40 },
  ]);

  useEffect(() => {
    if (investidor) {
      setNome(investidor.nome || "");
      setCpf(investidor.cpf || "");
      setStatus(investidor.status || "ativo");
      setObservacoes(investidor.observacoes || "");
      // Fetch deal if exists
      if (mode !== "create") {
        fetchDeal(investidor.id);
      }
    } else {
      setNome("");
      setCpf("");
      setStatus("ativo");
      setObservacoes("");
      setDealId(null);
      setTipoDeal("FIXO");
      setBaseCalculo("LUCRO");
      setPercentualFixo("40");
      setFaixasProgressivas([
        { limite: 10000, percentual: 20 },
        { limite: 50000, percentual: 30 },
        { limite: 100000, percentual: 40 },
      ]);
    }
    setCpfValidation(null);
    setActiveTab("dados");
  }, [investidor, open]);

  const fetchDeal = async (investidorId: string) => {
    try {
      const { data, error } = await supabase
        .from("investidor_deals")
        .select("*")
        .eq("investidor_id", investidorId)
        .eq("ativo", true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setDealId(data.id);
        setTipoDeal(data.tipo_deal as "FIXO" | "PROGRESSIVO");
        setBaseCalculo((data.base_calculo as "LUCRO" | "APORTE") || "LUCRO");
        setPercentualFixo(data.percentual_fixo?.toString() || "40");
        if (data.faixas_progressivas && Array.isArray(data.faixas_progressivas)) {
          setFaixasProgressivas(data.faixas_progressivas as unknown as FaixaProgressiva[]);
        }
      } else {
        // Reset deal state when no existing deal found - CRITICAL for creating new deals per investor
        setDealId(null);
        setTipoDeal("FIXO");
        setBaseCalculo("LUCRO");
        setPercentualFixo("40");
        setFaixasProgressivas([
          { limite: 10000, percentual: 20 },
          { limite: 50000, percentual: 30 },
          { limite: 100000, percentual: 40 },
        ]);
      }
    } catch (error) {
      console.error("Erro ao carregar deal:", error);
    }
  };

  const validateCPFUnique = async (cpfValue: string) => {
    if (mode === "view") return;

    const cleanCPF = cpfValue.replace(/\D/g, "");
    if (cleanCPF.length !== 11) {
      setCpfValidation({ valid: false, message: "CPF inválido" });
      return;
    }

    if (!validateCPF(cleanCPF)) {
      setCpfValidation({ valid: false, message: "CPF inválido" });
      return;
    }

    setCpfLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("investidores")
        .select("id")
        .eq("user_id", user.id)
        .eq("cpf", cleanCPF);

      // Only exclude current investor when editing (not creating)
      if (mode === "edit" && investidor?.id) {
        query = query.neq("id", investidor.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data && data.length > 0) {
        setCpfValidation({ valid: false, message: "CPF já cadastrado" });
      } else {
        setCpfValidation({ valid: true, message: "" });
      }
    } catch (error) {
      console.error("Erro ao validar CPF:", error);
    } finally {
      setCpfLoading(false);
    }
  };

  useEffect(() => {
    if (mode !== "view" && cpf) {
      const timer = setTimeout(() => {
        validateCPFUnique(cpf);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [cpf, mode]);

  const formatCPFInput = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 11) {
      return numbers
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    }
    return value;
  };

  const addFaixa = () => {
    const lastFaixa = faixasProgressivas[faixasProgressivas.length - 1];
    setFaixasProgressivas([
      ...faixasProgressivas,
      { limite: lastFaixa ? lastFaixa.limite + 50000 : 10000, percentual: lastFaixa ? lastFaixa.percentual + 5 : 20 },
    ]);
  };

  const removeFaixa = (index: number) => {
    if (faixasProgressivas.length > 1) {
      setFaixasProgressivas(faixasProgressivas.filter((_, i) => i !== index));
    }
  };

  const updateFaixa = (index: number, field: "limite" | "percentual", value: number) => {
    const updated = [...faixasProgressivas];
    updated[index][field] = value;
    setFaixasProgressivas(updated);
  };

  const handleSubmit = async () => {
    if (!nome.trim() || !cpf.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (cpfValidation && !cpfValidation.valid) {
      toast.error("CPF inválido ou já cadastrado");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const cleanCPF = cpf.replace(/\D/g, "");
      const investidorData = {
        user_id: user.id,
        nome: nome.trim(),
        cpf: cleanCPF,
        status,
        observacoes: observacoes.trim() || null,
      };

      let investidorId = investidor?.id;

      if (mode === "create") {
        const { data, error } = await supabase
          .from("investidores")
          .insert([investidorData])
          .select("id")
          .single();
        if (error) throw error;
        investidorId = data.id;
        toast.success("Investidor criado com sucesso");
      } else if (mode === "edit") {
        const { error } = await supabase
          .from("investidores")
          .update(investidorData)
          .eq("id", investidor.id);
        if (error) throw error;
        toast.success("Investidor atualizado com sucesso");
      }

      // Save deal
      if (investidorId && mode !== "view") {
        const dealData = {
          investidor_id: investidorId,
          user_id: user.id,
          tipo_deal: tipoDeal,
          base_calculo: baseCalculo,
          percentual_fixo: tipoDeal === "FIXO" ? parseFloat(percentualFixo) : null,
          faixas_progressivas: tipoDeal === "PROGRESSIVO" ? JSON.parse(JSON.stringify(faixasProgressivas)) : [],
          ativo: true,
        };

        if (dealId) {
          // Update existing deal
          const { error } = await supabase
            .from("investidor_deals")
            .update(dealData)
            .eq("id", dealId);
          if (error) throw error;
        } else {
          // Create new deal
          const { error } = await supabase
            .from("investidor_deals")
            .insert([dealData]);
          if (error) throw error;
        }
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar investidor", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const isViewMode = mode === "view";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Novo Investidor" : mode === "edit" ? "Editar Investidor" : "Visualizar Investidor"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="dados">Dados Pessoais</TabsTrigger>
            <TabsTrigger value="acordo">Acordo de Remuneração</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome Completo *</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value.toUpperCase())}
                disabled={isViewMode}
                placeholder="Nome do investidor"
                className="uppercase"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cpf">CPF *</Label>
              <Input
                id="cpf"
                value={cpf}
                onChange={(e) => setCpf(formatCPFInput(e.target.value))}
                disabled={isViewMode}
                placeholder="000.000.000-00"
                maxLength={14}
              />
              {!isViewMode && cpfLoading && (
                <p className="text-xs text-muted-foreground">Validando CPF...</p>
              )}
              {!isViewMode && cpfValidation && !cpfValidation.valid && (
                <p className="text-xs text-destructive">{cpfValidation.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus} disabled={isViewMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">ATIVO</SelectItem>
                  <SelectItem value="inativo">INATIVO</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações (opcional)</Label>
              <Textarea
                id="observacoes"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                disabled={isViewMode}
                placeholder="Informações adicionais sobre o investidor"
                rows={4}
              />
            </div>
          </TabsContent>

          <TabsContent value="acordo" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-base">Tipo de Acordo</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                            <HelpCircle className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <div className="space-y-2 text-xs">
                            <p><strong>Fixo:</strong> Percentual único aplicado a todos os resultados. Ideal para acordos simples e previsíveis.</p>
                            <p><strong>Progressivo:</strong> Percentuais diferentes por faixa de lucro. Ideal para incentivar maior performance com remuneração escalonada.</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {tipoDeal === "FIXO" 
                      ? `Percentual fixo sobre ${baseCalculo === "LUCRO" ? "lucros" : "valor aportado"}` 
                      : "Percentual progressivo por faixas de lucro"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${tipoDeal === "FIXO" ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                    Fixo
                  </span>
                  <Switch
                    checked={tipoDeal === "PROGRESSIVO"}
                    onCheckedChange={(checked) => setTipoDeal(checked ? "PROGRESSIVO" : "FIXO")}
                    disabled={isViewMode}
                  />
                  <span className={`text-sm ${tipoDeal === "PROGRESSIVO" ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                    Progressivo
                  </span>
                </div>
              </div>

              {tipoDeal === "FIXO" ? (
                <div className="space-y-4">
                  {/* Base de Cálculo */}
                  <div className="p-4 rounded-lg bg-muted/20 border border-border/50">
                    <Label className="text-sm text-muted-foreground mb-3 block">Base de Cálculo</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={baseCalculo === "LUCRO" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setBaseCalculo("LUCRO")}
                        disabled={isViewMode}
                        className="flex-1"
                      >
                        Sobre Lucros
                      </Button>
                      <Button
                        type="button"
                        variant={baseCalculo === "APORTE" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setBaseCalculo("APORTE")}
                        disabled={isViewMode}
                        className="flex-1"
                      >
                        Sobre Valor Aportado
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {baseCalculo === "LUCRO" 
                        ? "O investidor recebe o percentual sobre os lucros gerados"
                        : "O investidor recebe o percentual sobre o valor total aportado"}
                    </p>
                  </div>

                  {/* Percentual */}
                  <div className="p-4 rounded-lg bg-muted/20 border border-border/50">
                    <Label className="text-sm text-muted-foreground">Percentual Fixo</Label>
                    <div className="flex items-center gap-3 mt-2">
                      <Input
                        type="number"
                        value={percentualFixo}
                        onChange={(e) => setPercentualFixo(e.target.value)}
                        disabled={isViewMode}
                        className="w-24 text-center text-lg font-bold"
                        min={0}
                        max={100}
                      />
                      <Percent className="h-5 w-5 text-primary" />
                      <span className="text-sm text-muted-foreground">
                        {baseCalculo === "LUCRO" ? "dos lucros" : "do valor aportado"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Faixas Progressivas</Label>
                    {!isViewMode && (
                      <Button variant="outline" size="sm" onClick={addFaixa}>
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar Faixa
                      </Button>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    {faixasProgressivas.map((faixa, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/50">
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              {index === 0 ? "Até" : "Acima de"}
                            </Label>
                            <Input
                              type="number"
                              value={faixa.limite}
                              onChange={(e) => updateFaixa(index, "limite", parseFloat(e.target.value) || 0)}
                              disabled={isViewMode}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Percentual</Label>
                            <div className="flex items-center gap-2 mt-1">
                              <Input
                                type="number"
                                value={faixa.percentual}
                                onChange={(e) => updateFaixa(index, "percentual", parseFloat(e.target.value) || 0)}
                                disabled={isViewMode}
                                className="w-20"
                                min={0}
                                max={100}
                              />
                              <span className="text-sm font-semibold text-primary">%</span>
                            </div>
                          </div>
                        </div>
                        {!isViewMode && faixasProgressivas.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFaixa(index)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    * O lucro é calculado de forma progressiva, aplicando cada percentual à faixa correspondente.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isViewMode ? "Fechar" : "Cancelar"}
          </Button>
          {!isViewMode && (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Salvando..." : mode === "create" ? "Criar Investidor" : "Salvar Alterações"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}