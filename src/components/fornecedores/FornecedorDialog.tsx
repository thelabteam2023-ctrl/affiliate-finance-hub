import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCPF } from "@/lib/validators";

interface FornecedorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fornecedor: any | null;
  isViewMode: boolean;
}

export function FornecedorDialog({ open, onOpenChange, fornecedor, isViewMode }: FornecedorDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    documento: "",
    tipo_documento: "CPF",
    telefone: "",
    email: "",
    status: "ATIVO",
    observacoes: "",
  });

  useEffect(() => {
    if (fornecedor) {
      setFormData({
        nome: fornecedor.nome || "",
        documento: fornecedor.documento || "",
        tipo_documento: fornecedor.tipo_documento || "CPF",
        telefone: fornecedor.telefone || "",
        email: fornecedor.email || "",
        status: fornecedor.status || "ATIVO",
        observacoes: fornecedor.observacoes || "",
      });
    } else {
      setFormData({
        nome: "",
        documento: "",
        tipo_documento: "CPF",
        telefone: "",
        email: "",
        status: "ATIVO",
        observacoes: "",
      });
    }
  }, [fornecedor, open]);

  const handleDocumentoChange = (value: string) => {
    if (formData.tipo_documento === "CPF") {
      setFormData({ ...formData, documento: formatCPF(value) });
    } else {
      // CNPJ format: XX.XXX.XXX/XXXX-XX
      const cleaned = value.replace(/\D/g, "");
      let formatted = cleaned;
      if (cleaned.length > 2) formatted = cleaned.slice(0, 2) + "." + cleaned.slice(2);
      if (cleaned.length > 5) formatted = formatted.slice(0, 6) + "." + cleaned.slice(5);
      if (cleaned.length > 8) formatted = formatted.slice(0, 10) + "/" + cleaned.slice(8);
      if (cleaned.length > 12) formatted = formatted.slice(0, 15) + "-" + cleaned.slice(12, 14);
      setFormData({ ...formData, documento: formatted });
    }
  };

  const handleSubmit = async () => {
    if (!formData.nome.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const payload = {
        user_id: user.id,
        nome: formData.nome,
        documento: formData.documento || null,
        tipo_documento: formData.tipo_documento,
        telefone: formData.telefone || null,
        email: formData.email || null,
        status: formData.status,
        observacoes: formData.observacoes || null,
      };

      if (fornecedor?.id) {
        const { error } = await supabase
          .from("fornecedores")
          .update(payload)
          .eq("id", fornecedor.id);
        if (error) throw error;
        toast({ title: "Fornecedor atualizado com sucesso" });
      } else {
        const { error } = await supabase
          .from("fornecedores")
          .insert(payload);
        if (error) throw error;
        toast({ title: "Fornecedor criado com sucesso" });
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
            {isViewMode ? "Visualizar Fornecedor" : fornecedor ? "Editar Fornecedor" : "Novo Fornecedor"}
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
              placeholder="Nome do fornecedor"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tipo_documento">Tipo</Label>
              <Select
                value={formData.tipo_documento}
                onValueChange={(value) => setFormData({ ...formData, tipo_documento: value, documento: "" })}
                disabled={isViewMode}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CPF">CPF</SelectItem>
                  <SelectItem value="CNPJ">CNPJ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="documento">Documento</Label>
              <Input
                id="documento"
                value={formData.documento}
                onChange={(e) => handleDocumentoChange(e.target.value)}
                disabled={isViewMode}
                placeholder={formData.tipo_documento === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"}
                maxLength={formData.tipo_documento === "CPF" ? 14 : 18}
              />
            </div>
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
              placeholder="Observações sobre o fornecedor"
              rows={3}
            />
          </div>

          {!isViewMode && (
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? "Salvando..." : fornecedor ? "Salvar Alterações" : "Criar Fornecedor"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
