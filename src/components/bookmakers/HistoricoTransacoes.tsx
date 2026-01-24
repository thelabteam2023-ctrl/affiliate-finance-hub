import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, TrendingDown, DollarSign, Award, Settings } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLocalDateTime } from "@/utils/dateUtils";

interface Transacao {
  id: string;
  tipo: string;
  valor: number;
  saldo_anterior: number;
  saldo_novo: number;
  descricao: string | null;
  referencia_externa: string | null;
  data_transacao: string;
}

interface HistoricoTransacoesProps {
  open: boolean;
  onClose: () => void;
  bookmaker: {
    id: string;
    nome: string;
    moeda: string;
  };
}

export default function HistoricoTransacoes({ open, onClose, bookmaker }: HistoricoTransacoesProps) {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchTransacoes();
    }
  }, [open, bookmaker.id]);

  const fetchTransacoes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("transacoes_bookmakers")
        .select("*")
        .eq("bookmaker_id", bookmaker.id)
        .order("data_transacao", { ascending: false })
        .limit(50);

      if (error) throw error;
      setTransacoes(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar histórico",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case "deposito":
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case "retirada":
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      case "aposta":
        return <DollarSign className="h-4 w-4 text-blue-600" />;
      case "ganho":
        return <Award className="h-4 w-4 text-green-600" />;
      case "bonus":
        return <Award className="h-4 w-4 text-purple-600" />;
      case "ajuste":
        return <Settings className="h-4 w-4 text-orange-600" />;
      default:
        return <DollarSign className="h-4 w-4" />;
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

  const getTipoColor = (tipo: string): "default" | "secondary" | "destructive" => {
    if (tipo === "deposito" || tipo === "ganho" || tipo === "bonus") return "default";
    if (tipo === "retirada" || tipo === "aposta") return "destructive";
    return "secondary";
  };

  const formatCurrency = (value: number) => {
    const currencySymbols: Record<string, string> = {
      BRL: "R$",
      USD: "$",
      EUR: "€",
      USDT: "₮",
      BTC: "₿",
      ETH: "Ξ",
    };
    const symbol = currencySymbols[bookmaker.moeda] || "";
    const formatted = value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${symbol} ${formatted}`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico de Transações - {bookmaker.nome}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Carregando histórico...
          </div>
        ) : transacoes.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            Nenhuma transação registrada ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {transacoes.map((transacao) => (
              <div
                key={transacao.id}
                className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="mt-1">{getTipoIcon(transacao.tipo)}</div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={getTipoColor(transacao.tipo)}>
                      {getTipoLabel(transacao.tipo)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(parseLocalDateTime(transacao.data_transacao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  
                  {transacao.descricao && (
                    <p className="text-sm text-muted-foreground mb-1">{transacao.descricao}</p>
                  )}
                  
                  {transacao.referencia_externa && (
                    <p className="text-xs text-muted-foreground">
                      Ref: {transacao.referencia_externa}
                    </p>
                  )}
                  
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span>Anterior: {formatCurrency(Number(transacao.saldo_anterior))}</span>
                    <span>→</span>
                    <span>Novo: {formatCurrency(Number(transacao.saldo_novo))}</span>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className={`text-lg font-bold ${
                    transacao.tipo === "deposito" || transacao.tipo === "ganho" || transacao.tipo === "bonus"
                      ? "text-green-600"
                      : "text-red-600"
                  }`}>
                    {transacao.tipo === "deposito" || transacao.tipo === "ganho" || transacao.tipo === "bonus" ? "+" : "-"}
                    {formatCurrency(Number(transacao.valor))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
