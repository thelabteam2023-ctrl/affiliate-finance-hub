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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Calendar, Wallet, TrendingUp, RefreshCcw, Target, Clock, CheckCircle2, AlertCircle } from "lucide-react";
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

interface Investidor {
  id: string;
  nome: string;
  cpf: string;
  status: string;
}

interface ProjetoInvestidor {
  investidor_id: string | null;
  percentual_investidor: number;
  base_calculo_investidor: string;
  investidor?: Investidor | null;
}

interface Ciclo {
  id: string;
  numero_ciclo: number;
  data_inicio: string;
  data_fim_prevista: string;
  data_fim_real: string | null;
  status: string;
  tipo_gatilho: string;
  meta_volume: number | null;
  valor_acumulado: number;
  lucro_bruto: number | null;
  lucro_liquido: number | null;
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
  const [activeTab, setActiveTab] = useState("operadores");
  const [operadores, setOperadores] = useState<OperadorVinculado[]>([]);
  const [projetoInvestidor, setProjetoInvestidor] = useState<ProjetoInvestidor | null>(null);
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && projetoId) {
      fetchData();
    }
  }, [open, projetoId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch operadores
      const { data: opData, error: opError } = await supabase
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

      if (opError) throw opError;
      setOperadores((opData as any) || []);

      // Fetch projeto with investidor
      const { data: projData, error: projError } = await supabase
        .from("projetos")
        .select(`
          investidor_id,
          percentual_investidor,
          base_calculo_investidor,
          investidor:investidores(id, nome, cpf, status)
        `)
        .eq("id", projetoId)
        .single();

      if (!projError && projData) {
        setProjetoInvestidor(projData as any);
      }

      // Fetch ciclos
      const { data: ciclosData, error: ciclosError } = await supabase
        .from("projeto_ciclos")
        .select("*")
        .eq("projeto_id", projetoId)
        .order("numero_ciclo", { ascending: false });

      if (!ciclosError) {
        setCiclos(ciclosData || []);
      }

    } catch (error: any) {
      console.error("Erro ao buscar dados:", error);
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
      case "ativo":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "INATIVO":
      case "inativo":
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      case "SUSPENSO":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "EM_ANDAMENTO":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "FECHADO":
      case "CONCLUIDO":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
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

  const getBaseCalculoLabel = (base: string) => {
    switch (base) {
      case "LUCRO_BRUTO": return "Lucro Bruto";
      case "LUCRO_LIQUIDO": return "Lucro Líquido";
      case "FATURAMENTO": return "Faturamento";
      case "APORTE": return "Aporte";
      default: return base;
    }
  };

  const getGatilhoLabel = (gatilho: string) => {
    switch (gatilho) {
      case "TEMPO": return "Por Tempo";
      case "VOLUME": return "Por Volume";
      case "HIBRIDO": return "Híbrido";
      default: return gatilho;
    }
  };

  const getCicloStatusLabel = (status: string) => {
    switch (status) {
      case "EM_ANDAMENTO": return "Em Andamento";
      case "FECHADO": return "Fechado";
      case "CONCLUIDO": return "Concluído";
      default: return status;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Visão Geral - {projetoNome}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="operadores" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Operadores
            </TabsTrigger>
            <TabsTrigger value="investidor" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Investidor
            </TabsTrigger>
            <TabsTrigger value="ciclos" className="flex items-center gap-2">
              <RefreshCcw className="h-4 w-4" />
              Ciclos
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="max-h-[55vh] pr-4 mt-4">
            {/* Tab Operadores */}
            <TabsContent value="operadores">
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
                        </div>

                        <div className="mt-3 pt-3 border-t border-border/50">
                          <div className="flex items-center gap-2 mb-2">
                            <Wallet className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Modelo: {getModeloLabel(op.modelo_pagamento)}</span>
                          </div>
                          
                          <div className="flex flex-wrap gap-2">
                            {op.valor_fixo && op.valor_fixo > 0 && (
                              <Badge className="bg-primary/20 text-primary border-primary/30">
                                Fixo: {formatCurrency(op.valor_fixo)}
                              </Badge>
                            )}
                            {op.percentual && op.percentual > 0 && (
                              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                                {op.percentual}%
                              </Badge>
                            )}
                            {op.base_calculo && (
                              <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30">
                                Base: {getBaseCalculoLabel(op.base_calculo)}
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
            </TabsContent>

            {/* Tab Investidor */}
            <TabsContent value="investidor">
              {loading ? (
                <Skeleton className="h-32 w-full" />
              ) : !projetoInvestidor?.investidor_id ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum investidor vinculado a este projeto.</p>
                </div>
              ) : (
                <Card className="border-border/50">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h4 className="font-semibold text-lg">{projetoInvestidor.investidor?.nome || "Investidor"}</h4>
                        <p className="text-sm text-muted-foreground">
                          CPF: {projetoInvestidor.investidor?.cpf}
                        </p>
                      </div>
                      <Badge className={getStatusColor(projetoInvestidor.investidor?.status || "")}>
                        {projetoInvestidor.investidor?.status === "ativo" ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">Participação</p>
                        <p className="text-xl font-bold text-primary">{projetoInvestidor.percentual_investidor}%</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">Base de Cálculo</p>
                        <p className="text-lg font-semibold">
                          {getBaseCalculoLabel(projetoInvestidor.base_calculo_investidor || "LUCRO_LIQUIDO")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Tab Ciclos */}
            <TabsContent value="ciclos">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : ciclos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <RefreshCcw className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum ciclo criado para este projeto.</p>
                  <p className="text-sm mt-2">Crie um ciclo na página de detalhes do projeto.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {ciclos.map((ciclo) => (
                    <Card key={ciclo.id} className="border-border/50">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-lg font-bold">
                              #{ciclo.numero_ciclo}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {getGatilhoLabel(ciclo.tipo_gatilho)}
                            </span>
                          </div>
                          <Badge className={getStatusColor(ciclo.status)}>
                            {getCicloStatusLabel(ciclo.status)}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>
                              {format(new Date(ciclo.data_inicio), "dd/MM/yy", { locale: ptBR })} - {" "}
                              {ciclo.data_fim_real 
                                ? format(new Date(ciclo.data_fim_real), "dd/MM/yy", { locale: ptBR })
                                : format(new Date(ciclo.data_fim_prevista), "dd/MM/yy", { locale: ptBR }) + " (prev)"
                              }
                            </span>
                          </div>
                          {ciclo.meta_volume && ciclo.meta_volume > 0 && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Target className="h-4 w-4" />
                              <span>Meta: {formatCurrency(ciclo.meta_volume)}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {ciclo.valor_acumulado > 0 && (
                            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                              Acumulado: {formatCurrency(ciclo.valor_acumulado)}
                            </Badge>
                          )}
                          {ciclo.lucro_liquido !== null && ciclo.lucro_liquido !== 0 && (
                            <Badge className={ciclo.lucro_liquido >= 0 
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                              : "bg-red-500/20 text-red-400 border-red-500/30"
                            }>
                              Lucro: {formatCurrency(ciclo.lucro_liquido)}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}