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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { DatePicker } from "@/components/ui/date-picker";
import { addDays, format } from "date-fns";

interface EntregaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operadorProjetoId: string;
  modeloPagamento: string;
  frequenciaEntrega?: string;
  saldoInicial?: number;
  onSuccess: () => void;
}

const FREQUENCIAS = [
  { value: "SEMANAL", label: "Semanal", days: 7 },
  { value: "QUINZENAL", label: "Quinzenal", days: 15 },
  { value: "MENSAL", label: "Mensal", days: 30 },
];

export function EntregaDialog({
  open,
  onOpenChange,
  operadorProjetoId,
  modeloPagamento,
  frequenciaEntrega = "MENSAL",
  saldoInicial = 0,
  onSuccess,
}: EntregaDialogProps) {
  const [loading, setLoading] = useState(false);
  const [nextNumero, setNextNumero] = useState(1);
  
  const getDefaultDataFim = () => {
    const freq = FREQUENCIAS.find(f => f.value === frequenciaEntrega);
    return format(addDays(new Date(), freq?.days || 30), "yyyy-MM-dd");
  };

  const [formData, setFormData] = useState({
    data_inicio: format(new Date(), "yyyy-MM-dd"),
    data_fim_prevista: getDefaultDataFim(),
    descricao: "",
  });

  useEffect(() => {
    if (open) {
      fetchNextNumero();
      setFormData({
        data_inicio: format(new Date(), "yyyy-MM-dd"),
        data_fim_prevista: getDefaultDataFim(),
        descricao: "",
      });
    }
  }, [open, operadorProjetoId, frequenciaEntrega]);

  const fetchNextNumero = async () => {
    const { data, error } = await supabase
      .from("entregas")
      .select("numero_entrega")
      .eq("operador_projeto_id", operadorProjetoId)
      .order("numero_entrega", { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      setNextNumero(data[0].numero_entrega + 1);
    } else {
      setNextNumero(1);
    }
  };

  const handleSave = async () => {
    if (!formData.data_fim_prevista) {
      toast.error("Informe a data de fim do período");
      return;
    }

    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Buscar workspace do usuário
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", session.session.user.id)
        .limit(1)
        .maybeSingle();

      const workspaceId = workspaceMember?.workspace_id || null;

      const { error } = await supabase.from("entregas").insert({
        user_id: session.session.user.id,
        workspace_id: workspaceId,
        operador_projeto_id: operadorProjetoId,
        numero_entrega: nextNumero,
        descricao: formData.descricao || null,
        data_inicio: formData.data_inicio,
        data_fim_prevista: formData.data_fim_prevista,
        tipo_gatilho: "PERIODO",
        saldo_inicial: saldoInicial,
        status: "EM_ANDAMENTO",
      });

      if (error) throw error;

      toast.success("Período de conciliação criado com sucesso");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao criar período: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const freqLabel = FREQUENCIAS.find(f => f.value === frequenciaEntrega)?.label || "Mensal";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Período de Conciliação #{nextNumero}</DialogTitle>
          <DialogDescription>
            Crie um novo período para gerar relatórios de performance. Frequência: {freqLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {saldoInicial > 0 && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-sm text-emerald-400">
                <strong>Saldo Inicial:</strong> {formatCurrency(saldoInicial)} (excedente do período anterior)
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              placeholder="Ex: Período de janeiro, Primeira quinzena..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de Início</Label>
              <DatePicker
                value={formData.data_inicio}
                onChange={(date) => setFormData({ ...formData, data_inicio: date })}
              />
            </div>

            <div className="space-y-2">
              <Label>Data de Fim</Label>
              <DatePicker
                value={formData.data_fim_prevista}
                onChange={(date) => setFormData({ ...formData, data_fim_prevista: date })}
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-xs text-muted-foreground">
              ℹ️ Ao final do período, você receberá um alerta para avaliar a performance e decidir 
              sobre o pagamento ao operador. O pagamento será registrado manualmente.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Criando..." : "Criar Período"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
