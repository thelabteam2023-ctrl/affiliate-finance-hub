import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Users, DollarSign, Calendar, ChevronDown, ChevronUp, AlertTriangle, Clock, Target, Zap } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { VincularOperadorDialog } from "@/components/projetos/VincularOperadorDialog";
import { EntregasSection } from "@/components/entregas/EntregasSection";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  frequencia_entrega: string | null;
  tipo_meta: string | null;
  meta_valor: number | null;
  meta_percentual: number | null;
  status: string;
  // Campos do acordo de ciclo
  tipo_gatilho: string | null;
  metrica_acumuladora: string | null;
  meta_volume: number | null;
  periodo_minimo_dias: number | null;
  periodo_maximo_dias: number | null;
  operador?: {
    nome: string;
    cpf: string;
  };
  entregas_count?: number;
  has_active_entrega?: boolean;
}

export function ProjetoOperadoresTab({ projetoId }: ProjetoOperadoresTabProps) {
  const [operadores, setOperadores] = useState<OperadorProjeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [vincularDialogOpen, setVincularDialogOpen] = useState(false);
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
          operador:operadores (nome, cpf)
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

  const getTipoGatilhoInfo = (tipo: string | null) => {
    switch (tipo) {
      case "TEMPO": return { label: "Por Tempo", icon: Clock, color: "text-blue-400" };
      case "VOLUME": return { label: "Por Volume", icon: Target, color: "text-purple-400" };
      case "HIBRIDO": return { label: "Híbrido", icon: Zap, color: "text-amber-400" };
      default: return null;
    }
  };

  const getMetricaLabel = (metrica: string | null) => {
    switch (metrica) {
      case "LUCRO": return "Lucro";
      case "VOLUME_APOSTADO": return "Volume Apostado";
      default: return metrica;
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
      {/* KPIs de Operadores */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Operadores Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{operadoresAtivos}</div>
            <p className="text-xs text-muted-foreground">
              {operadores.length} total vinculados
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Custo Fixo Mensal</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalPagamentos)}</div>
            <p className="text-xs text-muted-foreground">
              Soma dos valores fixos
            </p>
          </CardContent>
        </Card>
      </div>

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
            <span className="font-medium text-yellow-400">Atenção: Operadores sem entrega ativa</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {operadoresSemEntrega.map(op => op.operador?.nome).join(", ")} não possuem entrega em andamento. 
            Crie novas entregas para dar continuidade às operações.
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
                    <Badge className={getStatusColor(op.status)}>
                      {op.status}
                    </Badge>
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
                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span>{getModeloLabel(op.modelo_pagamento)}</span>
                      {op.frequencia_entrega && op.modelo_pagamento !== "POR_ENTREGA" && (
                        <span className="text-xs text-muted-foreground">
                          ({getFrequenciaLabel(op.frequencia_entrega)})
                        </span>
                      )}
                    </div>
                    {op.valor_fixo && op.valor_fixo > 0 && (
                      <div className="text-sm text-emerald-500">
                        {formatCurrency(op.valor_fixo)} / mês
                      </div>
                    )}
                    {op.percentual && op.percentual > 0 && (
                      <div className="text-sm text-emerald-500">
                        {op.percentual}% {op.base_calculo && `sobre ${op.base_calculo.replace(/_/g, " ").toLowerCase()}`}
                      </div>
                    )}
                    {/* Meta para POR_ENTREGA */}
                    {op.modelo_pagamento === "POR_ENTREGA" && op.tipo_meta && (
                      <div className="text-sm text-emerald-500">
                        Meta: {op.tipo_meta === "VALOR_FIXO" && op.meta_valor
                          ? formatCurrency(op.meta_valor)
                          : op.tipo_meta === "PERCENTUAL" && op.meta_percentual
                          ? `${op.meta_percentual}% sobre ${op.base_calculo?.replace(/_/g, " ").toLowerCase() || "lucro"}`
                          : "Não definida"}
                      </div>
                    )}
                  </div>

                  {/* Informações do Acordo de Ciclo */}
                  {op.tipo_gatilho && (
                    <div className="space-y-2 pt-2 border-t border-border/50">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Acordo de Ciclo</p>
                      {(() => {
                        const gatilhoInfo = getTipoGatilhoInfo(op.tipo_gatilho);
                        if (!gatilhoInfo) return null;
                        const IconComponent = gatilhoInfo.icon;
                        return (
                          <div className="flex items-center gap-2 text-sm">
                            <IconComponent className={`h-4 w-4 ${gatilhoInfo.color}`} />
                            <span className={gatilhoInfo.color}>{gatilhoInfo.label}</span>
                          </div>
                        );
                      })()}
                      {op.metrica_acumuladora && (
                        <div className="text-sm text-muted-foreground">
                          Métrica: <span className="text-foreground">{getMetricaLabel(op.metrica_acumuladora)}</span>
                        </div>
                      )}
                      {op.meta_volume && op.meta_volume > 0 && (
                        <div className="text-sm text-muted-foreground">
                          Meta Volume: <span className="text-primary">{formatCurrency(op.meta_volume)}</span>
                        </div>
                      )}
                      {op.tipo_gatilho !== "VOLUME" && (
                        <div className="text-sm text-muted-foreground">
                          Período: <span className="text-foreground">
                            {op.periodo_minimo_dias || 7}-{op.periodo_maximo_dias || 30} dias
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Seção de Entregas */}
                  <Collapsible open={isExpanded} onOpenChange={() => toggleCardExpanded(op.id)}>
                    <div className="border-t pt-3">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between">
                          <span className="flex items-center gap-2">
                            Entregas
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
                          frequenciaEntrega={op.frequencia_entrega || "MENSAL"}
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
    </div>
  );
}
