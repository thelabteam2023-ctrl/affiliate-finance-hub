import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface TransacaoDialogProps {
  open: boolean;
  onClose: () => void;
  bookmaker: {
    id: string;
    nome: string;
    saldo_atual: number;
    moeda: string;
  };
}

export default function TransacaoDialog({ open, onClose, bookmaker }: TransacaoDialogProps) {
  const [loading, setLoading] = useState(false);
  const [tipo, setTipo] = useState("deposito");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [referenciaExterna, setReferenciaExterna] = useState("");
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const valorNum = parseFloat(valor);
      if (isNaN(valorNum) || valorNum <= 0) {
        throw new Error("Valor deve ser maior que zero");
      }

      const saldoAnterior = Number(bookmaker.saldo_atual);
      let saldoNovo = saldoAnterior;

      // Calculate new balance based on transaction type
      if (tipo === "deposito" || tipo === "ganho" || tipo === "bonus") {
        saldoNovo = saldoAnterior + valorNum;
      } else if (tipo === "retirada" || tipo === "aposta") {
        saldoNovo = saldoAnterior - valorNum;
        if (saldoNovo < 0) {
          throw new Error("Saldo insuficiente para esta operação");
        }
      } else if (tipo === "ajuste") {
        // Ajuste manual pode ser positivo ou negativo
        saldoNovo = saldoAnterior + valorNum;
      }

      const { error } = await supabase
        .from("transacoes_bookmakers")
        .insert({
          bookmaker_id: bookmaker.id,
          tipo,
          valor: valorNum,
          saldo_anterior: saldoAnterior,
          saldo_novo: saldoNovo,
          descricao: descricao || null,
          referencia_externa: referenciaExterna || null,
        });

      if (error) throw error;

      toast({
        title: "Transação registrada",
        description: `${getTipoLabel(tipo)} de ${formatCurrency(valorNum, bookmaker.moeda)} realizada com sucesso.`,
      });

      // Reset form
      setValor("");
      setDescricao("");
      setReferenciaExterna("");
      setTipo("deposito");
      
      onClose();
    } catch (error: any) {
      toast({
        title: "Erro ao registrar transação",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTipoLabel = (tipo: string): string => {
    const labels: Record<string, string> = {
      deposito: "Depósito",
      retirada: "Retirada",
      aposta: "Aposta",
      ganho: "Ganho",
      ajuste: "Ajuste",
      bonus: "Bônus",
    };
    return labels[tipo] || tipo;
  };

  const formatCurrency = (value: number, currency: string) => {
    const currencySymbols: Record<string, string> = {
      BRL: "R$",
      USD: "$",
      EUR: "€",
      USDT: "₮",
      BTC: "₿",
      ETH: "Ξ",
    };
    return `${currencySymbols[currency] || ""} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Transação - {bookmaker.nome}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Saldo atual: {formatCurrency(Number(bookmaker.saldo_atual), bookmaker.moeda)}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="tipo">Tipo de Transação *</Label>
            <select
              id="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background"
              disabled={loading}
            >
              <option value="deposito">Depósito</option>
              <option value="retirada">Retirada</option>
              <option value="aposta">Aposta</option>
              <option value="ganho">Ganho</option>
              <option value="bonus">Bônus</option>
              <option value="ajuste">Ajuste Manual</option>
            </select>
          </div>

          <div>
            <Label htmlFor="valor">Valor ({bookmaker.moeda}) *</Label>
            <Input
              id="valor"
              type="number"
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0.00"
              required
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes sobre esta transação..."
              rows={3}
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="referenciaExterna">Referência Externa</Label>
            <Input
              id="referenciaExterna"
              value={referenciaExterna}
              onChange={(e) => setReferenciaExterna(e.target.value)}
              placeholder="ID da transação, comprovante, etc"
              disabled={loading}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
