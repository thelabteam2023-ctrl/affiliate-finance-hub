import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { DatePicker } from "@/components/ui/date-picker";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { UserPlus, Truck, ArrowRight, DollarSign, HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ParceriaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parceria: any | null;
  isViewMode: boolean;
}

interface Parceiro {
  id: string;
  nome: string;
  cpf: string;
}

interface Indicador {
  id: string;
  nome: string;
  orcamento_por_parceiro?: number;
}

interface Fornecedor {
  id: string;
  nome: string;
}

export function ParceriaDialog({ open, onOpenChange, parceria, isViewMode }: ParceriaDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  
  const [formData, setFormData] = useState({
    parceiro_id: "",
    origem_tipo: "INDICADOR",
    indicador_id: "",
    fornecedor_id: "",
    data_inicio: new Date(),
    duracao_dias: 60,
    valor_indicador: 0,
    valor_parceiro: 0,
    valor_fornecedor: 0,
    status: "ATIVA",
    elegivel_renovacao: true,
    observacoes: "",
    custo_aquisicao_isento: false,
  });

  const [orcamentoDisponivel, setOrcamentoDisponivel] = useState(0);

  useEffect(() => {
    if (open) {
      fetchParceiros();
      fetchIndicadores();
      fetchFornecedores();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    
    // Always create a fresh date for today
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    if (parceria) {
      setFormData({
        parceiro_id: parceria.parceiro_id || "",
        origem_tipo: parceria.origem_tipo || "INDICADOR",
        indicador_id: "",
        fornecedor_id: parceria.fornecedor_id || "",
        data_inicio: parceria.data_inicio ? new Date(parceria.data_inicio) : hoje,
        duracao_dias: parceria.duracao_dias || 60,
        valor_indicador: parceria.valor_indicador || 0,
        valor_parceiro: parceria.valor_parceiro || 0,
        valor_fornecedor: parceria.valor_fornecedor || 0,
        status: parceria.status || "ATIVA",
        elegivel_renovacao: parceria.elegivel_renovacao ?? true,
        observacoes: parceria.observacoes || "",
        custo_aquisicao_isento: parceria.custo_aquisicao_isento ?? false,
      });
    } else {
      // New partnership: always set data_inicio to TODAY
      setFormData({
        parceiro_id: "",
        origem_tipo: "INDICADOR",
        indicador_id: "",
        fornecedor_id: "",
        data_inicio: hoje,
        duracao_dias: 60,
        valor_indicador: 0,
        valor_parceiro: 0,
        valor_fornecedor: 0,
        status: "ATIVA",
        elegivel_renovacao: true,
        observacoes: "",
        custo_aquisicao_isento: false,
      });
      setOrcamentoDisponivel(0);
    }
  }, [parceria, open]);

  const fetchParceiros = async () => {
    // If editing, show all active partners
    if (parceria) {
      const { data } = await supabase
        .from("parceiros")
        .select("id, nome, cpf")
        .eq("status", "ativo")
        .order("nome");
      setParceiros(data || []);
      return;
    }

    // For new partnerships, exclude partners that already have active partnerships
    const { data: parceriasExistentes } = await supabase
      .from("parcerias")
      .select("parceiro_id")
      .in("status", ["ATIVA", "EM_ENCERRAMENTO"]);

    const parceirosComParceria = new Set((parceriasExistentes || []).map(p => p.parceiro_id));

    const { data } = await supabase
      .from("parceiros")
      .select("id, nome, cpf")
      .eq("status", "ativo")
      .order("nome");

    // Filter out partners that already have active partnerships
    const parceirosDisponiveis = (data || []).filter(p => !parceirosComParceria.has(p.id));
    setParceiros(parceirosDisponiveis);
  };

  const fetchIndicadores = async () => {
    // Fetch indicadores with their acordos
    const { data: indicadoresData } = await supabase
      .from("indicadores_referral")
      .select("id, nome")
      .eq("status", "ATIVO")
      .order("nome");

    const { data: acordosData } = await supabase
      .from("indicador_acordos")
      .select("indicador_id, orcamento_por_parceiro")
      .eq("ativo", true);

    const indicadoresWithAcordo = (indicadoresData || []).map((ind) => {
      const acordo = acordosData?.find((a) => a.indicador_id === ind.id);
      return {
        ...ind,
        orcamento_por_parceiro: acordo?.orcamento_por_parceiro || 0,
      };
    });

    setIndicadores(indicadoresWithAcordo);
  };

  const fetchFornecedores = async () => {
    const { data } = await supabase
      .from("fornecedores")
      .select("id, nome")
      .eq("status", "ATIVO")
      .order("nome");
    setFornecedores(data || []);
  };

  const handleIndicadorChange = (indicadorId: string) => {
    const indicador = indicadores.find((i) => i.id === indicadorId);
    setFormData({ 
      ...formData, 
      indicador_id: indicadorId,
      valor_indicador: 0,
      valor_parceiro: 0,
    });
    setOrcamentoDisponivel(indicador?.orcamento_por_parceiro || 0);
  };

  const handleValorParceiroChange = (valor: number) => {
    const valorIndicador = Math.max(0, orcamentoDisponivel - valor);
    setFormData({
      ...formData,
      valor_parceiro: valor,
      valor_indicador: valorIndicador,
    });
  };

  const handleSubmit = async () => {
    if (!formData.parceiro_id) {
      toast({ title: "Selecione um parceiro", variant: "destructive" });
      return;
    }

    if (formData.origem_tipo === "INDICADOR" && !formData.indicador_id && !parceria) {
      toast({ title: "Selecione um indicador", variant: "destructive" });
      return;
    }

    if (formData.origem_tipo === "FORNECEDOR" && !formData.fornecedor_id) {
      toast({ title: "Selecione um fornecedor", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Create indication if needed
      let indicacaoId = parceria?.indicacao_id || null;
      if (formData.origem_tipo === "INDICADOR" && formData.indicador_id && !parceria) {
        const { data: indicacaoData, error: indicacaoError } = await supabase
          .from("indicacoes")
          .insert({
            user_id: user.id,
            indicador_id: formData.indicador_id,
            parceiro_id: formData.parceiro_id,
            data_indicacao: new Date().toISOString(),
          })
          .select()
          .single();

        if (indicacaoError && indicacaoError.code !== "23505") {
          throw indicacaoError;
        }
        indicacaoId = indicacaoData?.id;
      }

      const payload = {
        user_id: user.id,
        parceiro_id: formData.parceiro_id,
        indicacao_id: formData.origem_tipo === "INDICADOR" ? indicacaoId : null,
        fornecedor_id: formData.origem_tipo === "FORNECEDOR" ? formData.fornecedor_id : null,
        origem_tipo: formData.origem_tipo,
        data_inicio: format(formData.data_inicio, "yyyy-MM-dd"),
        duracao_dias: formData.duracao_dias,
        valor_indicador: formData.origem_tipo === "INDICADOR" ? formData.valor_indicador : 0,
        valor_parceiro: formData.origem_tipo === "INDICADOR" 
          ? formData.valor_parceiro 
          : formData.origem_tipo === "DIRETO" 
            ? formData.valor_parceiro 
            : 0,
        valor_fornecedor: formData.origem_tipo === "FORNECEDOR" ? formData.valor_fornecedor : 0,
        valor_comissao_indicador: formData.valor_indicador, // Keep for compatibility
        status: formData.status,
        elegivel_renovacao: formData.elegivel_renovacao,
        observacoes: formData.observacoes || null,
        custo_aquisicao_isento: formData.origem_tipo === "DIRETO" ? formData.custo_aquisicao_isento : false,
      };

      if (parceria?.id) {
        const { error } = await supabase
          .from("parcerias")
          .update(payload)
          .eq("id", parceria.id);
        if (error) throw error;
        toast({ title: "Parceria atualizada com sucesso" });
      } else {
        const { error } = await supabase
          .from("parcerias")
          .insert(payload);
        if (error) throw error;
        toast({ title: "Parceria criada com sucesso" });
      }

      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const diasDecorridos = parceria ? parceria.duracao_dias - (parceria.dias_restantes || 0) : 0;
  const progressPercent = parceria ? Math.min(100, (diasDecorridos / parceria.duracao_dias) * 100) : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isViewMode ? "Visualizar Parceria" : parceria ? "Editar Parceria" : "Nova Parceria"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress bar for existing partnerships */}
          {parceria && (
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <div className="flex justify-between text-sm">
                <span>Progresso da Parceria</span>
                <span>{diasDecorridos} de {parceria.duracao_dias} dias</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{format(new Date(parceria.data_inicio), "dd/MM/yyyy")}</span>
                <span>
                  {parceria.dias_restantes > 0
                    ? `${parceria.dias_restantes} dias restantes`
                    : "Vencida"}
                </span>
                <span>{format(new Date(parceria.data_fim_prevista), "dd/MM/yyyy")}</span>
              </div>
            </div>
          )}

          {/* Parceiro Selection */}
          <div className="space-y-2">
            <Label htmlFor="parceiro">Parceiro *</Label>
            <Select
              value={formData.parceiro_id}
              onValueChange={(value) => setFormData({ ...formData, parceiro_id: value })}
              disabled={isViewMode || !!parceria}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o parceiro" />
              </SelectTrigger>
              <SelectContent>
                {parceiros.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Origem Selection */}
          {!parceria && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label>Origem da Parceria *</Label>
                <div className="grid grid-cols-3 gap-3">
                  <Button
                    type="button"
                    variant={formData.origem_tipo === "INDICADOR" ? "default" : "outline"}
                    className="h-auto py-4 flex flex-col items-center gap-2"
                    onClick={() => setFormData({ ...formData, origem_tipo: "INDICADOR", fornecedor_id: "" })}
                    disabled={isViewMode}
                  >
                    <UserPlus className="h-5 w-5" />
                    <span className="text-xs">Via Indicador</span>
                  </Button>
                  <Button
                    type="button"
                    variant={formData.origem_tipo === "FORNECEDOR" ? "default" : "outline"}
                    className="h-auto py-4 flex flex-col items-center gap-2"
                    onClick={() => setFormData({ ...formData, origem_tipo: "FORNECEDOR", indicador_id: "" })}
                    disabled={isViewMode}
                  >
                    <Truck className="h-5 w-5" />
                    <span className="text-xs">Via Fornecedor</span>
                  </Button>
                  <Button
                    type="button"
                    variant={formData.origem_tipo === "DIRETO" ? "default" : "outline"}
                    className="h-auto py-4 flex flex-col items-center gap-2"
                    onClick={() => setFormData({ ...formData, origem_tipo: "DIRETO", indicador_id: "", fornecedor_id: "" })}
                    disabled={isViewMode}
                  >
                    <ArrowRight className="h-5 w-5" />
                    <span className="text-xs">Aquisição Direta</span>
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Indicador Fields */}
          {formData.origem_tipo === "INDICADOR" && !parceria && (
            <div className="space-y-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="space-y-2">
                <Label>Indicador *</Label>
                <Select
                  value={formData.indicador_id || "none"}
                  onValueChange={(value) => handleIndicadorChange(value === "none" ? "" : value)}
                  disabled={isViewMode}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o indicador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione...</SelectItem>
                    {indicadores.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.nome} {i.orcamento_por_parceiro ? `(Orçamento: ${formatCurrency(i.orcamento_por_parceiro)})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {orcamentoDisponivel > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <span>Orçamento disponível: <strong>{formatCurrency(orcamentoDisponivel)}</strong></span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Valor para o Parceiro (R$)</Label>
                      <Input
                        type="number"
                        value={formData.valor_parceiro}
                        onChange={(e) => handleValorParceiroChange(parseFloat(e.target.value) || 0)}
                        disabled={isViewMode}
                        min={0}
                        max={orcamentoDisponivel}
                        step={0.01}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Comissão do Indicador (R$)</Label>
                      <Input
                        type="number"
                        value={formData.valor_indicador}
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">Calculado automaticamente</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fornecedor Fields */}
          {formData.origem_tipo === "FORNECEDOR" && (
            <div className="space-y-4 p-4 rounded-lg bg-orange-500/5 border border-orange-500/20">
              <div className="space-y-2">
                <Label>Fornecedor *</Label>
                <Select
                  value={formData.fornecedor_id || "none"}
                  onValueChange={(value) => setFormData({ ...formData, fornecedor_id: value === "none" ? "" : value })}
                  disabled={isViewMode}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione...</SelectItem>
                    {fornecedores.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Valor Pago ao Fornecedor (R$)</Label>
                <Input
                  type="number"
                  value={formData.valor_fornecedor}
                  onChange={(e) => setFormData({ ...formData, valor_fornecedor: parseFloat(e.target.value) || 0 })}
                  disabled={isViewMode}
                  min={0}
                  step={0.01}
                />
              </div>
            </div>
          )}

          {/* Aquisição Direta - Custo de Aquisição */}
          {formData.origem_tipo === "DIRETO" && (
            <div className="space-y-4 p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label>Custo de Aquisição do CPF</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full">
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 text-sm">
                      <div className="space-y-2">
                        <p className="font-medium">Opções de custo:</p>
                        <p><strong>Sem pagamento:</strong> Parceiro indicado por amigo/família, sem custos associados.</p>
                        <p><strong>Pagamento ao parceiro:</strong> CPF com valor acordado a ser pago ao parceiro.</p>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <span className={`text-sm font-medium ${formData.custo_aquisicao_isento ? 'text-muted-foreground' : 'text-emerald-600'}`}>
                    Sem pagamento ao parceiro
                  </span>
                  <Switch 
                    checked={!formData.custo_aquisicao_isento}
                    onCheckedChange={(checked) => setFormData({
                      ...formData, 
                      custo_aquisicao_isento: !checked,
                      valor_parceiro: !checked ? 0 : formData.valor_parceiro
                    })}
                    disabled={isViewMode}
                  />
                  <span className={`text-sm font-medium ${!formData.custo_aquisicao_isento ? 'text-muted-foreground' : 'text-emerald-600'}`}>
                    Pagamento ao parceiro
                  </span>
                </div>

                {!formData.custo_aquisicao_isento && (
                  <div className="space-y-2">
                    <Label>Valor a Pagar (R$)</Label>
                    <Input
                      type="number"
                      value={formData.valor_parceiro}
                      onChange={(e) => setFormData({...formData, valor_parceiro: parseFloat(e.target.value) || 0})}
                      disabled={isViewMode}
                      min={0}
                      step={0.01}
                      placeholder="Ex: 500.00"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <Separator />

          {/* Duration and Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de Início</Label>
              <DatePicker
                value={format(formData.data_inicio, "yyyy-MM-dd")}
                onChange={(date) => {
                  // Fix timezone: parse date string correctly to avoid day-before bug
                  const [year, month, day] = date.split('-').map(Number);
                  const correctedDate = new Date(year, month - 1, day, 12, 0, 0);
                  setFormData({ ...formData, data_inicio: correctedDate });
                }}
                disabled={isViewMode}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duracao">Duração (dias)</Label>
              <Input
                id="duracao"
                type="number"
                value={formData.duracao_dias}
                onChange={(e) => setFormData({ ...formData, duracao_dias: parseInt(e.target.value) || 60 })}
                disabled={isViewMode}
                min={1}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value })}
              disabled={isViewMode}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ATIVA">Ativa</SelectItem>
                <SelectItem value="EM_ENCERRAMENTO">Em Encerramento</SelectItem>
                <SelectItem value="ENCERRADA">Encerrada</SelectItem>
                <SelectItem value="RENOVADA">Renovada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              disabled={isViewMode}
              placeholder="Observações sobre a parceria"
              rows={3}
            />
          </div>

          {!isViewMode && (
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? "Salvando..." : parceria ? "Salvar Alterações" : "Criar Parceria"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
