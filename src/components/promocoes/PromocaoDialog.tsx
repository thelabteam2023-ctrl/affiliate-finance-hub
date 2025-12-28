import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { format } from "date-fns";

interface PromocaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promocao: any | null;
  isViewMode: boolean;
}

export function PromocaoDialog({ open, onOpenChange, promocao, isViewMode }: PromocaoDialogProps) {
  const { toast } = useToast();
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    descricao: "",
    data_inicio: new Date(),
    data_fim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    meta_parceiros: 5,
    valor_bonus: 1000,
    status: "ATIVA",
  });

  useEffect(() => {
    if (promocao) {
      setFormData({
        nome: promocao.nome || "",
        descricao: promocao.descricao || "",
        data_inicio: promocao.data_inicio ? new Date(promocao.data_inicio) : new Date(),
        data_fim: promocao.data_fim ? new Date(promocao.data_fim) : new Date(),
        meta_parceiros: promocao.meta_parceiros || 5,
        valor_bonus: promocao.valor_bonus || 1000,
        status: promocao.status || "ATIVA",
      });
    } else {
      setFormData({
        nome: "",
        descricao: "",
        data_inicio: new Date(),
        data_fim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        meta_parceiros: 5,
        valor_bonus: 1000,
        status: "ATIVA",
      });
    }
  }, [promocao, open]);

  const handleSubmit = async () => {
    if (!formData.nome.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    if (formData.meta_parceiros < 1) {
      toast({ title: "Meta deve ser pelo menos 1 parceiro", variant: "destructive" });
      return;
    }
    if (formData.valor_bonus <= 0) {
      toast({ title: "Valor do bônus deve ser maior que zero", variant: "destructive" });
      return;
    }
    if (formData.data_fim <= formData.data_inicio) {
      toast({ title: "Data fim deve ser posterior à data início", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      if (!workspaceId) throw new Error("Workspace não disponível");

      const payload = {
        user_id: user.id,
        workspace_id: workspaceId,
        nome: formData.nome,
        descricao: formData.descricao || null,
        data_inicio: format(formData.data_inicio, "yyyy-MM-dd"),
        data_fim: format(formData.data_fim, "yyyy-MM-dd"),
        meta_parceiros: formData.meta_parceiros,
        valor_bonus: formData.valor_bonus,
        status: formData.status,
      };

      if (promocao?.id) {
        const { error } = await supabase
          .from("promocoes_indicacao")
          .update(payload)
          .eq("id", promocao.id);
        if (error) throw error;
        toast({ title: "Promoção atualizada com sucesso" });
      } else {
        const { error } = await supabase
          .from("promocoes_indicacao")
          .insert(payload);
        if (error) throw error;
        toast({ title: "Promoção criada com sucesso" });
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
            {isViewMode ? "Visualizar Promoção" : promocao ? "Editar Promoção" : "Nova Promoção"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome da Promoção *</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              disabled={isViewMode}
              placeholder="Ex: Promoção de Natal"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              disabled={isViewMode}
              placeholder="Descreva as regras da promoção"
              rows={3}
            />
          </div>

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
              <Label>Data de Fim</Label>
              <DatePicker
                value={format(formData.data_fim, "yyyy-MM-dd")}
                onChange={(date) => setFormData({ ...formData, data_fim: new Date(date) })}
                disabled={isViewMode}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="meta">Meta de Parceiros</Label>
              <Input
                id="meta"
                type="number"
                value={formData.meta_parceiros}
                onChange={(e) => setFormData({ ...formData, meta_parceiros: parseInt(e.target.value) || 1 })}
                disabled={isViewMode}
                min={1}
              />
              <p className="text-xs text-muted-foreground">
                Número de parceiros para atingir a meta
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bonus">Valor do Bônus (R$)</Label>
              <Input
                id="bonus"
                type="number"
                value={formData.valor_bonus}
                onChange={(e) => setFormData({ ...formData, valor_bonus: parseFloat(e.target.value) || 0 })}
                disabled={isViewMode}
                min={0}
                step={0.01}
              />
              <p className="text-xs text-muted-foreground">
                Bônus pago ao atingir a meta
              </p>
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
                <SelectItem value="ENCERRADA">Encerrada</SelectItem>
                <SelectItem value="CANCELADA">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!isViewMode && (
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? "Salvando..." : promocao ? "Salvar Alterações" : "Criar Promoção"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
