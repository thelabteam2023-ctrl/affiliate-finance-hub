import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Handshake, Calendar, AlertTriangle, Clock } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
import { ptBR } from "date-fns/locale";

interface ProjetoParceriasTabProps {
  projetoId: string;
}

interface Parceria {
  id: string;
  status: string;
  data_inicio: string;
  data_fim_prevista: string | null;
  duracao_dias: number;
  elegivel_renovacao: boolean | null;
  parceiro_nome: string | null;
  parceiro_cpf: string | null;
  dias_restantes: number | null;
  nivel_alerta: string | null;
}

export function ProjetoParceriasTab({ projetoId }: ProjetoParceriasTabProps) {
  const [parcerias, setParcerias] = useState<Parceria[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchParcerias();
  }, [projetoId]);

  const fetchParcerias = async () => {
    try {
      setLoading(true);
      // For now, we fetch all partnerships with alert status
      // In the future, this can be filtered by project if we add projeto_id to parcerias
      const { data, error } = await supabase
        .from("v_parcerias_alerta")
        .select("*")
        .order("dias_restantes", { ascending: true });

      if (error) throw error;
      setParcerias(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar parcerias: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getAlertColor = (nivel: string | null) => {
    switch (nivel) {
      case "VENCIDA": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "ALERTA": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "ATENCAO": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "OK": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ATIVA": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "EM_ENCERRAMENTO": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "ENCERRADA": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      case "RENOVADA": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  if (parcerias.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-10">
            <Handshake className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">Nenhuma parceria encontrada</h3>
            <p className="text-muted-foreground">
              As parcerias são gerenciadas no módulo de Programa de Indicação
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Alertas de Vencimento */}
      {parcerias.filter(p => p.nivel_alerta === "ALERTA" || p.nivel_alerta === "VENCIDA").length > 0 && (
        <Card className="border-orange-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-orange-400">
              <AlertTriangle className="h-5 w-5" />
              Parcerias Próximas do Vencimento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {parcerias
                .filter(p => p.nivel_alerta === "ALERTA" || p.nivel_alerta === "VENCIDA")
                .map((parceria) => (
                  <div key={parceria.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                    <span>{parceria.parceiro_nome}</span>
                    <Badge className={getAlertColor(parceria.nivel_alerta)}>
                      {parceria.dias_restantes !== null ? 
                        (parceria.dias_restantes <= 0 ? "Vencida" : `${parceria.dias_restantes} dias`) : 
                        "N/A"}
                    </Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grid de Parcerias */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {parcerias.map((parceria) => (
          <Card key={parceria.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Handshake className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{parceria.parceiro_nome}</CardTitle>
                    <p className="text-sm text-muted-foreground">{parceria.parceiro_cpf}</p>
                  </div>
                </div>
                <Badge className={getStatusColor(parceria.status)}>
                  {parceria.status.replace("_", " ")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    Início: {format(parseLocalDate(parceria.data_inicio), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
                {parceria.data_fim_prevista && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>
                      Fim: {format(parseLocalDate(parceria.data_fim_prevista), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm text-muted-foreground">Dias restantes</span>
                  <Badge className={getAlertColor(parceria.nivel_alerta)}>
                    {parceria.dias_restantes !== null ? 
                      (parceria.dias_restantes <= 0 ? "Vencida" : `${parceria.dias_restantes} dias`) : 
                      "N/A"}
                  </Badge>
                </div>
                {parceria.elegivel_renovacao && (
                  <div className="text-xs text-emerald-500">
                    ✓ Elegível para renovação
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}