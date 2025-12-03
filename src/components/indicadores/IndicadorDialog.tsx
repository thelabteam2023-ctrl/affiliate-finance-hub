import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { validateCPF, formatCPF } from "@/lib/validators";

interface IndicadorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicador: any | null;
  isViewMode: boolean;
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

  useEffect(() => {
    if (indicador) {
      setFormData({
        nome: indicador.nome || "",
        cpf: indicador.cpf || "",
        telefone: indicador.telefone || "",
        email: indicador.email || "",
        status: indicador.status || "ATIVO",
        observacoes: "",
      });
    } else {
      setFormData({
        nome: "",
        cpf: "",
        telefone: "",
        email: "",
        status: "ATIVO",
        observacoes: "",
      });
    }
    setCpfError("");
  }, [indicador, open]);

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

      if (indicador?.indicador_id) {
        const { error } = await supabase
          .from("indicadores_referral")
          .update(payload)
          .eq("id", indicador.indicador_id);
        if (error) throw error;
        toast({ title: "Indicador atualizado com sucesso" });
      } else {
        const { error } = await supabase
          .from("indicadores_referral")
          .insert(payload);
        if (error) throw error;
        toast({ title: "Indicador criado com sucesso" });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isViewMode ? "Visualizar Indicador" : indicador ? "Editar Indicador" : "Novo Indicador"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              disabled={isViewMode}
              placeholder="Nome completo"
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                value={formData.telefone}
                onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                disabled={isViewMode}
                placeholder="(00) 00000-0000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={isViewMode}
                placeholder="email@exemplo.com"
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
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ATIVO">Ativo</SelectItem>
                <SelectItem value="TOP_VIP">Top VIP</SelectItem>
                <SelectItem value="EM_OBSERVACAO">Em Observação</SelectItem>
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
              rows={3}
            />
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
