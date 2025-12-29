import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layers, Calendar, CheckCircle2, Clock, AlertCircle, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Participacao {
  id: string;
  investidor_id: string;
  projeto_id: string;
  ciclo_id: string | null;
  percentual: number;
  valor_base: number;
  valor_participacao: number;
  status: string;
  data_apuracao: string;
  data_pagamento: string | null;
  observacoes: string | null;
  projeto_nome?: string;
  ciclo_numero?: number;
}

interface InvestidorParticipacoesListProps {
  investidorId: string;
}

const formatCurrency = (value: number, currency: "BRL" | "USD" = "BRL") => {
  return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  }).format(value);
};

const getStatusConfig = (status: string) => {
  const configs: Record<string, { label: string; icon: any; className: string }> = {
    PAGO: {
      label: "Pago",
      icon: CheckCircle2,
      className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    },
    A_PAGAR: {
      label: "A Pagar",
      icon: Clock,
      className: "bg-warning/10 text-warning border-warning/30",
    },
    AGUARDANDO: {
      label: "Aguardando",
      icon: Clock,
      className: "bg-muted/50 text-muted-foreground border-muted",
    },
    CANCELADO: {
      label: "Cancelado",
      icon: AlertCircle,
      className: "bg-destructive/10 text-destructive border-destructive/30",
    },
  };

  return configs[status] || {
    label: status,
    icon: Clock,
    className: "bg-muted/50 text-muted-foreground",
  };
};

export function InvestidorParticipacoesList({ investidorId }: InvestidorParticipacoesListProps) {
  const navigate = useNavigate();
  const [participacoes, setParticipacoes] = useState<Participacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [totais, setTotais] = useState({
    total: 0,
    pago: 0,
    pendente: 0,
  });

  useEffect(() => {
    fetchParticipacoes();
  }, [investidorId]);

  const fetchParticipacoes = async () => {
    setLoading(true);
    try {
      // Buscar participações do investidor
      const { data, error } = await supabase
        .from("participacao_ciclos")
        .select(`
          *,
          projeto:projetos(nome),
          ciclo:projeto_ciclos(numero_ciclo)
        `)
        .eq("investidor_id", investidorId)
        .order("data_apuracao", { ascending: false });

      if (error) throw error;

      const participacoesFormatadas = (data || []).map((p: any) => ({
        ...p,
        projeto_nome: p.projeto?.nome || "Projeto desconhecido",
        ciclo_numero: p.ciclo?.numero_ciclo || null,
      }));

      setParticipacoes(participacoesFormatadas);

      // Calcular totais
      const totalGeral = participacoesFormatadas.reduce(
        (sum, p) => sum + (p.valor_participacao || 0),
        0
      );
      const totalPago = participacoesFormatadas
        .filter((p) => p.status === "PAGO")
        .reduce((sum, p) => sum + (p.valor_participacao || 0), 0);
      const totalPendente = participacoesFormatadas
        .filter((p) => p.status === "A_PAGAR" || p.status === "AGUARDANDO")
        .reduce((sum, p) => sum + (p.valor_participacao || 0), 0);

      setTotais({
        total: totalGeral,
        pago: totalPago,
        pendente: totalPendente,
      });
    } catch (error) {
      console.error("Erro ao carregar participações:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (participacoes.length === 0) {
    return (
      <Card className="bg-card/50">
        <CardContent className="py-12 text-center">
          <Layers className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">
            Nenhuma participação em ciclos registrada.
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            As participações serão registradas conforme os ciclos dos projetos forem concluídos.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card/50">
          <CardContent className="py-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Total Apurado</p>
            <p className="text-lg font-bold font-mono mt-1">
              {formatCurrency(totais.total, "BRL")}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardContent className="py-3 text-center">
            <p className="text-[10px] text-emerald-600 uppercase">Pago</p>
            <p className="text-lg font-bold font-mono text-emerald-500 mt-1">
              {formatCurrency(totais.pago, "BRL")}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="py-3 text-center">
            <p className="text-[10px] text-warning uppercase">Pendente</p>
            <p className="text-lg font-bold font-mono text-warning mt-1">
              {formatCurrency(totais.pendente, "BRL")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Botão de navegação para gerenciar pagamentos */}
      {totais.pendente > 0 && (
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="py-3 flex items-center justify-between">
            <div className="text-sm">
              <span className="text-warning font-medium">
                {participacoes.filter(p => p.status === "A_PAGAR" || p.status === "AGUARDANDO").length}
              </span>
              <span className="text-muted-foreground"> participação(ões) pendente(s)</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-warning/30 text-warning hover:bg-warning/10"
              onClick={() => navigate(`/financeiro?tab=participacoes&investidor=${investidorId}`)}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Gerenciar Pagamentos
            </Button>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Lista de participações */}
      <div className="space-y-2">
        {participacoes.map((participacao) => {
          const statusConfig = getStatusConfig(participacao.status);
          const StatusIcon = statusConfig.icon;

          return (
            <Card key={participacao.id} className="bg-card/50">
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h4 className="font-medium text-sm truncate">
                        {participacao.projeto_nome}
                      </h4>
                      {participacao.ciclo_numero && (
                        <Badge variant="outline" className="text-[10px] h-5">
                          Ciclo {participacao.ciclo_numero}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(participacao.data_apuracao), "dd/MM/yyyy", {
                          locale: ptBR,
                        })}
                      </span>
                      <span className="text-primary font-medium">
                        {participacao.percentual}%
                      </span>
                      <span className="text-muted-foreground/70">
                        de {formatCurrency(participacao.valor_base, "BRL")}
                      </span>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="font-mono font-semibold text-base">
                      {formatCurrency(participacao.valor_participacao, "BRL")}
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] mt-1 ${statusConfig.className}`}
                    >
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {statusConfig.label}
                    </Badge>
                  </div>
                </div>

                {participacao.data_pagamento && participacao.status === "PAGO" && (
                  <div className="mt-2 pt-2 border-t border-border/30">
                    <p className="text-[10px] text-muted-foreground">
                      Pago em:{" "}
                      {format(new Date(participacao.data_pagamento), "dd/MM/yyyy", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
