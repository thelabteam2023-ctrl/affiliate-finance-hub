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
import { format } from "date-fns";

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
}

export function ParceriaDialog({ open, onOpenChange, parceria, isViewMode }: ParceriaDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [formData, setFormData] = useState({
    parceiro_id: "",
    indicador_id: "",
    data_inicio: new Date(),
    duracao_dias: 60,
    valor_comissao_indicador: 0,
    status: "ATIVA",
    elegivel_renovacao: true,
    observacoes: "",
  });

  useEffect(() => {
    if (open) {
      fetchParceiros();
      fetchIndicadores();
    }
  }, [open]);

  useEffect(() => {
    if (parceria) {
      setFormData({
        parceiro_id: parceria.parceiro_id || "",
        indicador_id: "",
        data_inicio: parceria.data_inicio ? new Date(parceria.data_inicio) : new Date(),
        duracao_dias: parceria.duracao_dias || 60,
        valor_comissao_indicador: parceria.valor_comissao_indicador || 0,
        status: parceria.status || "ATIVA",
        elegivel_renovacao: parceria.elegivel_renovacao ?? true,
        observacoes: parceria.observacoes || "",
      });
    } else {
      setFormData({
        parceiro_id: "",
        indicador_id: "",
        data_inicio: new Date(),
        duracao_dias: 60,
        valor_comissao_indicador: 0,
        status: "ATIVA",
        elegivel_renovacao: true,
        observacoes: "",
      });
    }
  }, [parceria, open]);

  const fetchParceiros = async () => {
    const { data } = await supabase
      .from("parceiros")
      .select("id, nome, cpf")
      .eq("status", "ativo")
      .order("nome");
    setParceiros(data || []);
  };

  const fetchIndicadores = async () => {
    const { data } = await supabase
      .from("indicadores_referral")
      .select("id, nome")
      .in("status", ["ATIVO", "TOP_VIP"])
      .order("nome");
    setIndicadores(data || []);
  };

  const handleSubmit = async () => {
    if (!formData.parceiro_id) {
      toast({ title: "Selecione um parceiro", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Check if there's an indication for this partner
      let indicacaoId = null;
      if (formData.indicador_id) {
        // Create indication if selected
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
        indicacao_id: indicacaoId,
        data_inicio: format(formData.data_inicio, "yyyy-MM-dd"),
        duracao_dias: formData.duracao_dias,
        valor_comissao_indicador: formData.valor_comissao_indicador,
        status: formData.status,
        elegivel_renovacao: formData.elegivel_renovacao,
        observacoes: formData.observacoes || null,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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

          {!parceria && (
            <div className="space-y-2">
              <Label htmlFor="indicador">Indicador (opcional)</Label>
              <Select
                value={formData.indicador_id}
                onValueChange={(value) => setFormData({ ...formData, indicador_id: value })}
                disabled={isViewMode}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o indicador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sem indicação</SelectItem>
                  {indicadores.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de Início</Label>
              <DatePicker
                value={format(formData.data_inicio, "yyyy-MM-dd")}
                onChange={(date) => setFormData({ ...formData, data_inicio: new Date(date) })}
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="comissao">Comissão do Indicador (R$)</Label>
              <Input
                id="comissao"
                type="number"
                value={formData.valor_comissao_indicador}
                onChange={(e) => setFormData({ ...formData, valor_comissao_indicador: parseFloat(e.target.value) || 0 })}
                disabled={isViewMode}
                min={0}
                step={0.01}
              />
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
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="elegivel">Elegível para Renovação</Label>
            <Switch
              id="elegivel"
              checked={formData.elegivel_renovacao}
              onCheckedChange={(checked) => setFormData({ ...formData, elegivel_renovacao: checked })}
              disabled={isViewMode}
            />
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
