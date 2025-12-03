import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Gift, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface PagamentoBonusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicador: {
    id: string;
    nome: string;
    valorBonus: number;
  } | null;
  parceriaId?: string;
  onSuccess: () => void;
}

export function PagamentoBonusDialog({
  open,
  onOpenChange,
  indicador,
  parceriaId,
  onSuccess,
}: PagamentoBonusDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dataPagamento, setDataPagamento] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [valor, setValor] = useState<number>(indicador?.valorBonus || 0);
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    if (indicador) {
      setValor(indicador.valorBonus);
    }
  }, [indicador]);

  const handleSubmit = async () => {
    if (!indicador) return;

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Get parceria_id if not provided
      let finalParceriaId = parceriaId;
      if (!finalParceriaId) {
        const { data: parceria } = await supabase
          .from("parcerias")
          .select("id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        
        if (!parceria) {
          // Create a placeholder parceria for bonus tracking
          const { data: newParceria, error: parceriaError } = await supabase
            .from("parcerias")
            .insert({
              user_id: user.id,
              parceiro_id: (await supabase.from("parceiros").select("id").eq("user_id", user.id).limit(1).single()).data?.id,
              status: "ATIVA",
              duracao_dias: 60,
            })
            .select("id")
            .single();
          
          if (parceriaError) throw parceriaError;
          finalParceriaId = newParceria.id;
        } else {
          finalParceriaId = parceria.id;
        }
      }

      // Create bonus payment record
      const { error } = await supabase.from("movimentacoes_indicacao").insert({
        user_id: user.id,
        indicador_id: indicador.id,
        parceria_id: finalParceriaId,
        tipo: "BONUS_INDICADOR",
        valor: valor,
        moeda: "BRL",
        data_movimentacao: dataPagamento,
        descricao: descricao || `Pagamento de bônus para ${indicador.nome}`,
        status: "CONFIRMADO",
      });

      if (error) throw error;

      toast({
        title: "Bônus registrado",
        description: `Pagamento de R$ ${valor.toFixed(2)} registrado para ${indicador.nome}`,
      });

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast({
        title: "Erro ao registrar bônus",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setDataPagamento(format(new Date(), "yyyy-MM-dd"));
    setValor(indicador?.valorBonus || 0);
    setDescricao("");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Registrar Pagamento de Bônus
          </DialogTitle>
        </DialogHeader>

        {indicador && (
          <div className="space-y-4">
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Indicador</p>
              <p className="font-medium">{indicador.nome}</p>
            </div>

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Valor do Bônus</Label>
                <Input
                  type="number"
                  value={valor}
                  onChange={(e) => setValor(parseFloat(e.target.value) || 0)}
                  min={0}
                  step={0.01}
                />
                <p className="text-xs text-muted-foreground">
                  Valor acordado: {formatCurrency(indicador.valorBonus)}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Data do Pagamento</Label>
                <DatePicker
                  value={dataPagamento}
                  onChange={setDataPagamento}
                />
              </div>

              <div className="space-y-2">
                <Label>Observações (opcional)</Label>
                <Textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Adicione observações sobre o pagamento..."
                  rows={3}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !indicador}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
