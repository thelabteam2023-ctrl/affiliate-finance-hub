import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Calendar, Wallet, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OperadorVinculado {
  id: string;
  operador_id: string;
  funcao: string | null;
  data_entrada: string;
  data_saida: string | null;
  status: string;
  frequencia_conciliacao: string | null;
  modelo_pagamento: string;
  valor_fixo: number | null;
  percentual: number | null;
  base_calculo: string | null;
  resumo_acordo: string | null;
  operador: {
    nome: string;
    cpf: string;
    status: string;
  } | null;
}

interface VisualizarOperadoresDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  projetoNome: string;
}

export function VisualizarOperadoresDialog({
  open,
  onOpenChange,
  projetoId,
  projetoNome,
}: VisualizarOperadoresDialogProps) {
  const [operadores, setOperadores] = useState<OperadorVinculado[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && projetoId) {
      fetchOperadores();
    }
  }, [open, projetoId]);

  const fetchOperadores = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("operador_projetos")
        .select(`
          id,
          operador_id,
          funcao,
          data_entrada,
          data_saida,
          status,
          frequencia_conciliacao,
          modelo_pagamento,
          valor_fixo,
          percentual,
          base_calculo,
          resumo_acordo,
          operador:operadores(nome, cpf, status)
        `)
        .eq("projeto_id", projetoId)
        .order("data_entrada", { ascending: false });

      if (error) throw error;
      setOperadores((data as any) || []);
    } catch (error: any) {
      console.error("Erro ao buscar operadores:", error);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ATIVO":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "INATIVO":
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      case "SUSPENSO":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const getModeloLabel = (modelo: string) => {
    switch (modelo) {
      case "FIXO": return "Fixo";
      case "PORCENTAGEM": return "Porcentagem";
      case "HIBRIDO": return "Híbrido";
      case "ESCALONADO": return "Escalonado";
      default: return modelo;
    }
  };

  const getFrequenciaLabel = (freq: string | null) => {
    switch (freq) {
      case "SEMANAL": return "Semanal";
      case "QUINZENAL": return "Quinzenal";
      case "MENSAL": return "Mensal";
      default: return "Não definida";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Operadores - {projetoNome}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : operadores.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum operador vinculado a este projeto.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {operadores.map((op) => (
                <Card key={op.id} className="border-border/50">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold">{op.operador?.nome || "Operador"}</h4>
                        {op.funcao && (
                          <p className="text-sm text-muted-foreground">{op.funcao}</p>
                        )}
                      </div>
                      <Badge className={getStatusColor(op.status)}>
                        {op.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>Entrada: {format(new Date(op.data_entrada), "dd/MM/yyyy", { locale: ptBR })}</span>
                      </div>
                      
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>Conciliação: {getFrequenciaLabel(op.frequencia_conciliacao)}</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-border/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Modelo: {getModeloLabel(op.modelo_pagamento)}</span>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        {op.valor_fixo && op.valor_fixo > 0 && (
                          <Badge variant="outline" className="text-xs">
                            Fixo: {formatCurrency(op.valor_fixo)}
                          </Badge>
                        )}
                        {op.percentual && op.percentual > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {op.percentual}%
                          </Badge>
                        )}
                        {op.base_calculo && (
                          <Badge variant="outline" className="text-xs">
                            Base: {op.base_calculo === "LUCRO_BRUTO" ? "Lucro Bruto" : "Lucro Líquido"}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {op.resumo_acordo && (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <p className="text-xs text-muted-foreground mb-1">Resumo do Acordo:</p>
                        <p className="text-sm bg-muted/50 p-2 rounded-md">{op.resumo_acordo}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
