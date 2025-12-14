import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Plus, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Play,
  Pause,
  TrendingUp,
  TrendingDown,
  RotateCcw
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CicloDialog } from "./CicloDialog";

interface Ciclo {
  id: string;
  numero_ciclo: number;
  data_inicio: string;
  data_fim_prevista: string;
  data_fim_real: string | null;
  status: string;
  lucro_bruto: number;
  lucro_liquido: number;
  observacoes: string | null;
}

interface ProjetoCiclosTabProps {
  projetoId: string;
}

export function ProjetoCiclosTab({ projetoId }: ProjetoCiclosTabProps) {
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCiclo, setSelectedCiclo] = useState<Ciclo | null>(null);

  useEffect(() => {
    fetchCiclos();
  }, [projetoId]);

  const fetchCiclos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("projeto_ciclos")
        .select("*")
        .eq("projeto_id", projetoId)
        .order("numero_ciclo", { ascending: false });

      if (error) throw error;
      setCiclos(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar ciclos: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCiclo = () => {
    setSelectedCiclo(null);
    setDialogOpen(true);
  };

  const handleEditCiclo = (ciclo: Ciclo) => {
    setSelectedCiclo(ciclo);
    setDialogOpen(true);
  };

  const handleFecharCiclo = async (ciclo: Ciclo) => {
    try {
      // Calcular lucros do período
      const { data: apostas, error: apostasError } = await supabase
        .from("apostas")
        .select("lucro_prejuizo")
        .eq("projeto_id", projetoId)
        .gte("data_aposta", ciclo.data_inicio)
        .lte("data_aposta", ciclo.data_fim_prevista)
        .eq("status", "FINALIZADA");

      if (apostasError) throw apostasError;

      const lucroBruto = (apostas || []).reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0);

      const { error } = await supabase
        .from("projeto_ciclos")
        .update({
          status: "FECHADO",
          data_fim_real: new Date().toISOString().split("T")[0],
          lucro_bruto: lucroBruto,
          lucro_liquido: lucroBruto, // Será ajustado após deduzir custos
        })
        .eq("id", ciclo.id);

      if (error) throw error;
      toast.success("Ciclo fechado com sucesso!");
      fetchCiclos();
    } catch (error: any) {
      toast.error("Erro ao fechar ciclo: " + error.message);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "EM_ANDAMENTO":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><Play className="h-3 w-3 mr-1" />Em Andamento</Badge>;
      case "FECHADO":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Fechado</Badge>;
      case "CANCELADO":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="h-3 w-3 mr-1" />Cancelado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getDiasRestantes = (dataFim: string) => {
    const fim = new Date(dataFim);
    const hoje = new Date();
    return differenceInDays(fim, hoje);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Ciclos do Projeto</h3>
          <p className="text-sm text-muted-foreground">
            Períodos de apuração financeira para pagamento de operadores
          </p>
        </div>
        <Button onClick={handleCreateCiclo}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Ciclo
        </Button>
      </div>

      {ciclos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h4 className="text-lg font-medium mb-2">Nenhum ciclo criado</h4>
            <p className="text-muted-foreground text-center mb-4">
              Crie o primeiro ciclo para iniciar a apuração financeira
            </p>
            <Button onClick={handleCreateCiclo}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro Ciclo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {ciclos.map((ciclo) => {
            const diasRestantes = getDiasRestantes(ciclo.data_fim_prevista);
            const isAtrasado = ciclo.status === "EM_ANDAMENTO" && diasRestantes < 0;

            return (
              <Card key={ciclo.id} className={isAtrasado ? "border-amber-500/50" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold">
                        {ciclo.numero_ciclo}
                      </div>
                      <div>
                        <CardTitle className="text-base">Ciclo {ciclo.numero_ciclo}</CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(ciclo.data_inicio), "dd/MM/yyyy", { locale: ptBR })} - {format(new Date(ciclo.data_fim_prevista), "dd/MM/yyyy", { locale: ptBR })}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(ciclo.status)}
                      {ciclo.status === "EM_ANDAMENTO" && (
                        <Badge variant="outline" className={isAtrasado ? "text-amber-400 border-amber-500/50" : ""}>
                          <Clock className="h-3 w-3 mr-1" />
                          {isAtrasado ? `${Math.abs(diasRestantes)} dias atrasado` : `${diasRestantes} dias restantes`}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Lucro Bruto</p>
                      <p className={`text-lg font-semibold ${ciclo.lucro_bruto >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {ciclo.lucro_bruto >= 0 ? <TrendingUp className="h-4 w-4 inline mr-1" /> : <TrendingDown className="h-4 w-4 inline mr-1" />}
                        {formatCurrency(ciclo.lucro_bruto)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Lucro Líquido</p>
                      <p className={`text-lg font-semibold ${ciclo.lucro_liquido >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {formatCurrency(ciclo.lucro_liquido)}
                      </p>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {ciclo.status === "EM_ANDAMENTO" && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => handleEditCiclo(ciclo)}>
                            Editar
                          </Button>
                          <Button size="sm" onClick={() => handleFecharCiclo(ciclo)}>
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Fechar Ciclo
                          </Button>
                        </>
                      )}
                      {ciclo.status === "FECHADO" && (
                        <Button variant="ghost" size="sm" onClick={() => handleEditCiclo(ciclo)}>
                          Ver Detalhes
                        </Button>
                      )}
                    </div>
                  </div>
                  {ciclo.observacoes && (
                    <p className="text-sm text-muted-foreground mt-2 pt-2 border-t">
                      {ciclo.observacoes}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CicloDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projetoId={projetoId}
        ciclo={selectedCiclo}
        proximoNumero={ciclos.length > 0 ? Math.max(...ciclos.map(c => c.numero_ciclo)) + 1 : 1}
        onSuccess={fetchCiclos}
      />
    </div>
  );
}
