import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiSummaryBar } from "@/components/ui/kpi-summary-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Users, DollarSign, Calendar, ChevronDown, ChevronUp, AlertTriangle, FileText, Pencil } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { VincularOperadorDialog } from "@/components/projetos/VincularOperadorDialog";
import { EditarAcordoOperadorDialog } from "@/components/projetos/EditarAcordoOperadorDialog";
import { EntregasSection } from "@/components/entregas/EntregasSection";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  frequencia_conciliacao: string | null;
  dias_intervalo_conciliacao: number | null;
  proxima_conciliacao: string | null;
  resumo_acordo: string | null;
  tipo_meta: string | null;
  meta_valor: number | null;
  meta_percentual: number | null;
  status: string;
  meta_volume: number | null;
  operador?: {
    id: string;
    nome: string;
    cpf: string;
    auth_user_id?: string | null;
  };
  entregas_count?: number;
  has_active_entrega?: boolean;
}

export function ProjetoOperadoresTab({ projetoId }: ProjetoOperadoresTabProps) {
  const [operadores, setOperadores] = useState<OperadorProjeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [vincularDialogOpen, setVincularDialogOpen] = useState(false);
  const [editarAcordoDialogOpen, setEditarAcordoDialogOpen] = useState(false);
  const [selectedOperadorProjeto, setSelectedOperadorProjeto] = useState<OperadorProjeto | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

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
          operador:operadores (
            id,
            nome,
            cpf,
            auth_user_id
          )
        `)
        .eq("projeto_id", projetoId)
        .order("data_entrada", { ascending: false });

      if (error) throw error;

      // Fetch entregas count for each operador_projeto
      const operadoresWithEntregas = await Promise.all(
        (data || []).map(async (op) => {
          const { data: entregas, error: entregasError } = await supabase
            .from("entregas")
            .select("id, status")
            .eq("operador_projeto_id", op.id);

          return {
            ...op,
            entregas_count: entregas?.length || 0,
            has_active_entrega: entregas?.some(e => e.status === "EM_ANDAMENTO") || false,
          };
        })
      );

      setOperadores(operadoresWithEntregas);
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

  const getFrequenciaLabel = (freq: string | null) => {
    switch (freq) {
      case "SEMANAL": return "Semanal";
      case "QUINZENAL": return "Quinzenal";
      case "MENSAL": return "Mensal";
      default: return "Mensal";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ATIVO": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "INATIVO": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const toggleCardExpanded = (id: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCards(newExpanded);
  };

  const handleEditarAcordo = (op: OperadorProjeto) => {
    setSelectedOperadorProjeto(op);
    setEditarAcordoDialogOpen(true);
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

  const operadoresSemEntrega = operadores.filter(op => op.status === "ATIVO" && !op.has_active_entrega && op.entregas_count > 0);

  const totalPagamentos = operadores.reduce((acc, op) => acc + (op.valor_fixo || 0), 0);
  const operadoresAtivos = operadores.filter(op => op.status === "ATIVO").length;

  return (
    <div className="space-y-4">
      {/* KPIs - Faixa compacta */}
      <KpiSummaryBar
        items={[
          {
            label: "Operadores Ativos",
            value: operadoresAtivos,
            tooltip: (
              <div className="space-y-1.5">
                <p className="font-semibold text-foreground">Operadores</p>
                <div className="space-y-0.5">
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" /> Ativos</span>
                    <span className="font-semibold text-foreground">{operadoresAtivos}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground" /> Inativos</span>
                    <span className="font-semibold text-foreground">{operadores.length - operadoresAtivos}</span>
                  </div>
                </div>
                <div className="border-t border-border/50 pt-1 flex justify-between gap-4">
                  <span className="font-semibold">Total</span>
                  <span className="font-semibold text-foreground">{operadores.length}</span>
                </div>
              </div>
            ),
            subtitle: <span className="text-muted-foreground">{operadores.length} total vinculados</span>,
          },
          {
            label: "Custo Fixo (Referência)",
            value: formatCurrency(totalPagamentos),
            tooltip: (
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Custo Fixo de Referência</p>
                <p className="text-muted-foreground">Soma dos valores fixos dos acordos com operadores. Não representa pagamentos efetivos.</p>
              </div>
            ),
            subtitle: <span className="text-muted-foreground">Soma dos valores de referência</span>,
          },
        ]}
      />

      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Operadores Vinculados</h3>
        <Button onClick={() => setVincularDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Vincular Operador
        </Button>
      </div>

      {/* Alerta de operadores sem entrega ativa */}
      {operadoresSemEntrega.length > 0 && (
        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            <span className="font-medium text-yellow-400">Atenção: Operadores sem período de conciliação ativo</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {operadoresSemEntrega.map(op => op.operador?.nome).join(", ")} não possuem período em andamento. 
            Crie novos períodos para gerar relatórios de performance.
          </p>
        </div>
      )}

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
          {operadores.map((op) => {
            const isExpanded = expandedCards.has(op.id);
            const needsAttention = op.status === "ATIVO" && !op.has_active_entrega && op.entregas_count > 0;

            return (
              <Card key={op.id} className={needsAttention ? "border-yellow-500/30" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${needsAttention ? 'bg-yellow-500/10' : 'bg-primary/10'}`}>
                        <Users className={`h-5 w-5 ${needsAttention ? 'text-yellow-400' : 'text-primary'}`} />
                      </div>
                      <div>
                        <CardTitle className="text-base">{op.operador?.nome}</CardTitle>
                        {op.funcao && (
                          <p className="text-sm text-muted-foreground">{op.funcao}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEditarAcordo(op)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Editar Acordo</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Badge className={getStatusColor(op.status)}>
                        {op.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>
                        Desde {format(new Date(op.data_entrada), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                    
                    {/* Frequência de Conciliação */}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Conciliação:</span>
                      <span>{getFrequenciaLabel(op.frequencia_conciliacao)}</span>
                    </div>

                    {/* Resumo do acordo se existir */}
                    {op.resumo_acordo && (
                      <div className="p-2 rounded bg-muted/50 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3 inline mr-1" />
                        {op.resumo_acordo.length > 80 
                          ? `${op.resumo_acordo.substring(0, 80)}...` 
                          : op.resumo_acordo}
                      </div>
                    )}

                    {/* Referência do Acordo (badge indicativo) */}
                    {(op.valor_fixo || op.percentual) && (
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-xs">
                          <FileText className="h-3 w-3 mr-1" />
                          Ref: {getModeloLabel(op.modelo_pagamento)}
                        </Badge>
                        {op.valor_fixo && op.valor_fixo > 0 && (
                          <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">
                            {formatCurrency(op.valor_fixo)}
                          </Badge>
                        )}
                        {op.percentual && op.percentual > 0 && (
                          <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">
                            {op.percentual}%
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Seção de Períodos de Conciliação */}
                  <Collapsible open={isExpanded} onOpenChange={() => toggleCardExpanded(op.id)}>
                    <div className="border-t pt-3">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between">
                          <span className="flex items-center gap-2">
                            Períodos de Conciliação
                            {needsAttention && (
                              <AlertTriangle className="h-3 w-3 text-yellow-400" />
                            )}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3">
                        <EntregasSection
                          operadorProjetoId={op.id}
                          operadorNome={op.operador?.nome || ""}
                          modeloPagamento={op.modelo_pagamento}
                          valorFixo={op.valor_fixo || 0}
                          percentual={op.percentual || 0}
                          frequenciaEntrega={op.frequencia_conciliacao || "MENSAL"}
                          expanded={isExpanded}
                        />
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <VincularOperadorDialog
        open={vincularDialogOpen}
        onOpenChange={setVincularDialogOpen}
        projetoId={projetoId}
        onSuccess={fetchOperadores}
      />

      <EditarAcordoOperadorDialog
        open={editarAcordoDialogOpen}
        onOpenChange={setEditarAcordoDialogOpen}
        operadorProjeto={selectedOperadorProjeto}
        onSuccess={fetchOperadores}
      />
    </div>
  );
}
