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
import { Banknote, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface PagamentoComissaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parceria: {
    id: string;
    parceiroNome: string;
    indicadorNome: string;
    indicadorId: string;
    valorComissao: number;
  } | null;
  onSuccess: () => void;
}

export function PagamentoComissaoDialog({
  open,
  onOpenChange,
  parceria,
  onSuccess,
}: PagamentoComissaoDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dataPagamento, setDataPagamento] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [valor, setValor] = useState<number>(parceria?.valorComissao || 0);
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    if (parceria) {
      setValor(parceria.valorComissao);
    }
  }, [parceria]);

  const handleSubmit = async () => {
    if (!parceria) return;

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Create commission payment record
      const { error: movError } = await supabase.from("movimentacoes_indicacao").insert({
        user_id: user.id,
        indicador_id: parceria.indicadorId,
        parceria_id: parceria.id,
        tipo: "COMISSAO_INDICADOR",
        valor: valor,
        moeda: "BRL",
        data_movimentacao: dataPagamento,
        descricao: descricao || `Comissão por indicação de ${parceria.parceiroNome}`,
        status: "CONFIRMADO",
      });

      if (movError) throw movError;

      // Mark commission as paid on parceria
      const { error: parceriaError } = await supabase
        .from("parcerias")
        .update({ comissao_paga: true })
        .eq("id", parceria.id);

      if (parceriaError) throw parceriaError;

      toast({
        title: "Comissão registrada",
        description: `Pagamento de R$ ${valor.toFixed(2)} registrado para ${parceria.indicadorNome}`,
      });

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast({
        title: "Erro ao registrar comissão",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setDataPagamento(format(new Date(), "yyyy-MM-dd"));
    setValor(parceria?.valorComissao || 0);
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
            <Banknote className="h-5 w-5 text-primary" />
            Registrar Pagamento de Comissão
          </DialogTitle>
        </DialogHeader>

        {parceria && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground">Parceiro</p>
                <p className="font-medium text-sm">{parceria.parceiroNome}</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground">Indicador</p>
                <p className="font-medium text-sm">{parceria.indicadorNome}</p>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Valor da Comissão</Label>
                <Input
                  type="number"
                  value={valor}
                  onChange={(e) => setValor(parseFloat(e.target.value) || 0)}
                  min={0}
                  step={0.01}
                />
                <p className="text-xs text-muted-foreground">
                  Valor acordado: {formatCurrency(parceria.valorComissao)}
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
          <Button onClick={handleSubmit} disabled={loading || !parceria}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
