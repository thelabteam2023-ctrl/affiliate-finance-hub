import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { validateCPF } from "@/lib/validators";

interface InvestidorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "view" | "edit" | "create";
  investidor?: any;
  onSuccess: () => void;
}

export function InvestidorDialog({ open, onOpenChange, mode, investidor, onSuccess }: InvestidorDialogProps) {
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [status, setStatus] = useState("ativo");
  const [observacoes, setObservacoes] = useState("");
  const [cpfValidation, setCpfValidation] = useState<{ valid: boolean; message: string } | null>(null);
  const [cpfLoading, setCpfLoading] = useState(false);

  useEffect(() => {
    if (investidor) {
      setNome(investidor.nome || "");
      setCpf(investidor.cpf || "");
      setStatus(investidor.status || "ativo");
      setObservacoes(investidor.observacoes || "");
    } else {
      setNome("");
      setCpf("");
      setStatus("ativo");
      setObservacoes("");
    }
    setCpfValidation(null);
  }, [investidor, open]);

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

      const { data, error } = await supabase
        .from("investidores")
        .select("id")
        .eq("user_id", user.id)
        .eq("cpf", cleanCPF)
        .neq("id", investidor?.id || "");

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

      if (mode === "create") {
        const { error } = await supabase.from("investidores").insert([investidorData]);
        if (error) throw error;
        toast.success("Investidor criado com sucesso");
      } else if (mode === "edit") {
        const { error } = await supabase
          .from("investidores")
          .update(investidorData)
          .eq("id", investidor.id);
        if (error) throw error;
        toast.success("Investidor atualizado com sucesso");
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

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome Completo *</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={isViewMode}
              placeholder="Nome do investidor"
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
        </div>

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
