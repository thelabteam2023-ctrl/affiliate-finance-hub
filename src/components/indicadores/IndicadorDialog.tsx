import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { validateCPF, formatCPF } from "@/lib/validators";
import { Handshake, Target } from "lucide-react";

interface IndicadorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicador: any | null;
  isViewMode: boolean;
}

interface AcordoData {
  id?: string;
  orcamento_por_parceiro: number;
  meta_parceiros: number | null;
  valor_bonus: number | null;
  ativo: boolean;
}

export function IndicadorDialog({ open, onOpenChange, indicador, isViewMode }: IndicadorDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    cpf: "",
    telefone: "",
    email: "",
    status: "ATIVO",
    observacoes: "",
  });
  const [cpfError, setCpfError] = useState("");
  
  // Acordo state
  const [acordoEnabled, setAcordoEnabled] = useState(false);
  const [acordoData, setAcordoData] = useState<AcordoData>({
    orcamento_por_parceiro: 0,
    meta_parceiros: null,
    valor_bonus: null,
    ativo: true,
  });

  useEffect(() => {
    if (open) {
      if (indicador) {
        setFormData({
          nome: indicador.nome || "",
          cpf: indicador.cpf || "",
          telefone: indicador.telefone || "",
          email: indicador.email || "",
          status: indicador.status || "ATIVO",
          observacoes: "",
        });
        fetchAcordo(indicador.indicador_id);
      } else {
        setFormData({
          nome: "",
          cpf: "",
          telefone: "",
          email: "",
          status: "ATIVO",
          observacoes: "",
        });
        setAcordoEnabled(false);
        setAcordoData({
          orcamento_por_parceiro: 0,
          meta_parceiros: null,
          valor_bonus: null,
          ativo: true,
        });
      }
      setCpfError("");
    }
  }, [indicador, open]);

  const fetchAcordo = async (indicadorId: string) => {
    const { data } = await supabase
      .from("indicador_acordos")
      .select("*")
      .eq("indicador_id", indicadorId)
      .eq("ativo", true)
      .maybeSingle();

    if (data) {
      setAcordoEnabled(true);
      setAcordoData({
        id: data.id,
        orcamento_por_parceiro: data.orcamento_por_parceiro,
        meta_parceiros: data.meta_parceiros,
        valor_bonus: data.valor_bonus,
        ativo: data.ativo,
      });
    } else {
      setAcordoEnabled(false);
      setAcordoData({
        orcamento_por_parceiro: 0,
        meta_parceiros: null,
        valor_bonus: null,
        ativo: true,
      });
    }
  };

  const handleCPFChange = (value: string) => {
    const formatted = formatCPF(value);
    setFormData({ ...formData, cpf: formatted });
    
    if (formatted.length === 14) {
      if (!validateCPF(formatted)) {
        setCpfError("CPF inválido");
      } else {
        setCpfError("");
        validateCPFUnique(formatted);
      }
    } else {
      setCpfError("");
    }
  };

  const validateCPFUnique = async (cpf: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let query = supabase
      .from("indicadores_referral")
      .select("id")
      .eq("cpf", cpf)
      .eq("user_id", user.id);

    if (indicador?.indicador_id) {
      query = query.neq("id", indicador.indicador_id);
    }

    const { data } = await query;
    if (data && data.length > 0) {
      setCpfError("CPF já cadastrado");
    }
  };

  const handleSubmit = async () => {
    if (!formData.nome.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    if (!formData.cpf.trim() || !validateCPF(formData.cpf)) {
      toast({ title: "CPF inválido", variant: "destructive" });
      return;
    }
    if (cpfError) {
      toast({ title: cpfError, variant: "destructive" });
      return;
    }
    if (acordoEnabled && acordoData.orcamento_por_parceiro <= 0) {
      toast({ title: "Orçamento por parceiro deve ser maior que zero", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const payload = {
        user_id: user.id,
        nome: formData.nome,
        cpf: formData.cpf,
        telefone: formData.telefone || null,
        email: formData.email || null,
        status: formData.status,
        observacoes: formData.observacoes || null,
      };

      let indicadorId = indicador?.indicador_id;

      if (indicadorId) {
        const { error } = await supabase
          .from("indicadores_referral")
          .update(payload)
          .eq("id", indicadorId);
        if (error) throw error;
      } else {
        const { data: newIndicador, error } = await supabase
          .from("indicadores_referral")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        indicadorId = newIndicador.id;
      }

      // Handle acordo
      if (acordoEnabled) {
        const acordoPayload = {
          user_id: user.id,
          indicador_id: indicadorId,
          orcamento_por_parceiro: acordoData.orcamento_por_parceiro,
          meta_parceiros: acordoData.meta_parceiros || null,
          valor_bonus: acordoData.valor_bonus || null,
          ativo: true,
        };

        if (acordoData.id) {
          const { error } = await supabase
            .from("indicador_acordos")
            .update(acordoPayload)
            .eq("id", acordoData.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("indicador_acordos")
            .insert(acordoPayload);
          if (error) throw error;
        }
      } else if (acordoData.id) {
        // Deactivate existing acordo
        await supabase
          .from("indicador_acordos")
          .update({ ativo: false })
          .eq("id", acordoData.id);
      }

      toast({ title: indicador ? "Indicador atualizado com sucesso" : "Indicador criado com sucesso" });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isViewMode ? "Visualizar Indicador" : indicador ? "Editar Indicador" : "Novo Indicador"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Personal Info */}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value.toUpperCase() })}
              disabled={isViewMode}
              placeholder="Nome completo"
              className="uppercase"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cpf">CPF *</Label>
            <Input
              id="cpf"
              value={formData.cpf}
              onChange={(e) => handleCPFChange(e.target.value)}
              disabled={isViewMode}
              placeholder="000.000.000-00"
              maxLength={14}
            />
            {cpfError && <p className="text-sm text-destructive">{cpfError}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value })}
              disabled={isViewMode}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ATIVO">Ativo</SelectItem>
                <SelectItem value="INATIVO">Inativo</SelectItem>
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
              placeholder="Observações sobre o indicador"
              rows={2}
            />
          </div>

          {/* Acordo de Comissão */}
          <Separator />
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Handshake className="h-5 w-5 text-primary" />
                <Label className="text-base font-semibold">Acordo de Comissão</Label>
              </div>
              <Switch
                checked={acordoEnabled}
                onCheckedChange={setAcordoEnabled}
                disabled={isViewMode}
              />
            </div>

            {acordoEnabled && (
              <div className="space-y-4 p-4 rounded-lg bg-muted/50">
                <div className="space-y-2">
                  <Label htmlFor="orcamento">Orçamento por Parceiro (R$) *</Label>
                  <Input
                    id="orcamento"
                    type="number"
                    value={acordoData.orcamento_por_parceiro}
                    onChange={(e) => setAcordoData({ ...acordoData, orcamento_por_parceiro: parseFloat(e.target.value) || 0 })}
                    disabled={isViewMode}
                    min={0}
                    step={0.01}
                    placeholder="Ex: 500.00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Valor disponível para o indicador negociar com cada parceiro
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="meta" className="flex items-center gap-1">
                      <Target className="h-3 w-3" /> Meta de Parceiros
                    </Label>
                    <Input
                      id="meta"
                      type="number"
                      value={acordoData.meta_parceiros || ""}
                      onChange={(e) => setAcordoData({ ...acordoData, meta_parceiros: parseInt(e.target.value) || null })}
                      disabled={isViewMode}
                      min={1}
                      placeholder="Ex: 10"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bonus">Bônus da Meta (R$)</Label>
                    <Input
                      id="bonus"
                      type="number"
                      value={acordoData.valor_bonus || ""}
                      onChange={(e) => setAcordoData({ ...acordoData, valor_bonus: parseFloat(e.target.value) || null })}
                      disabled={isViewMode}
                      min={0}
                      step={0.01}
                      placeholder="Ex: 1000.00"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Se definir meta e bônus, o indicador receberá o bônus ao atingir a meta de parceiros
                </p>
              </div>
            )}
          </div>

          {!isViewMode && (
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? "Salvando..." : indicador ? "Salvar Alterações" : "Criar Indicador"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
