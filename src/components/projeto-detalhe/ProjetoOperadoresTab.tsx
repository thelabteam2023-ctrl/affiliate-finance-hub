import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Users, DollarSign, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { VincularOperadorDialog } from "@/components/projetos/VincularOperadorDialog";

interface ProjetoOperadoresTabProps {
  projetoId: string;
}

interface OperadorProjeto {
  id: string;
  operador_id: string;
  funcao: string | null;
  data_entrada: string;
  data_saida: string | null;
  modelo_pagamento: string;
  valor_fixo: number | null;
  percentual: number | null;
  base_calculo: string | null;
  status: string;
  operador?: {
    nome: string;
    cpf: string;
  };
}

export function ProjetoOperadoresTab({ projetoId }: ProjetoOperadoresTabProps) {
  const [operadores, setOperadores] = useState<OperadorProjeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [vincularDialogOpen, setVincularDialogOpen] = useState(false);

  useEffect(() => {
    fetchOperadores();
  }, [projetoId]);

  const fetchOperadores = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("operador_projetos")
        .select(`
          *,
          operador:operadores (nome, cpf)
        `)
        .eq("projeto_id", projetoId)
        .order("data_entrada", { ascending: false });

      if (error) throw error;
      setOperadores(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar operadores: " + error.message);
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

  const getModeloLabel = (modelo: string) => {
    switch (modelo) {
      case "FIXO_MENSAL": return "Fixo Mensal";
      case "PORCENTAGEM": return "Porcentagem";
      case "HIBRIDO": return "Híbrido";
      case "POR_ENTREGA": return "Por Entrega";
      case "COMISSAO_ESCALONADA": return "Comissão Escalonada";
      default: return modelo;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ATIVO": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "INATIVO": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Operadores Vinculados</h3>
        <Button onClick={() => setVincularDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Vincular Operador
        </Button>
      </div>

      {operadores.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhum operador vinculado</h3>
              <p className="text-muted-foreground">
                Vincule operadores para gerenciar a equipe do projeto
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {operadores.map((op) => (
            <Card key={op.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{op.operador?.nome}</CardTitle>
                      {op.funcao && (
                        <p className="text-sm text-muted-foreground">{op.funcao}</p>
                      )}
                    </div>
                  </div>
                  <Badge className={getStatusColor(op.status)}>
                    {op.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Desde {format(new Date(op.data_entrada), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span>{getModeloLabel(op.modelo_pagamento)}</span>
                  </div>
                  {op.valor_fixo && (
                    <div className="text-sm text-emerald-500">
                      {formatCurrency(op.valor_fixo)} / mês
                    </div>
                  )}
                  {op.percentual && (
                    <div className="text-sm text-emerald-500">
                      {op.percentual}% {op.base_calculo && `sobre ${op.base_calculo.replace("_", " ").toLowerCase()}`}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <VincularOperadorDialog
        open={vincularDialogOpen}
        onOpenChange={setVincularDialogOpen}
        projetoId={projetoId}
        onSuccess={fetchOperadores}
      />
    </div>
  );
}