import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiSummaryBar } from "@/components/ui/kpi-summary-bar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectCurrencyFormat } from "@/hooks/useProjectCurrencyFormat";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowDownRight, ArrowUpRight, Scale, FileText, Calendar } from "lucide-react";

interface HistoricoConciliacoesTabProps {
  projetoId: string;
}

interface ConciliacaoRecord {
  id: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  saldo_anterior: number;
  saldo_novo: number;
  diferenca: number;
  observacoes: string | null;
  created_at: string;
  moeda: string;
}

export function HistoricoConciliacoesTab({ projetoId }: HistoricoConciliacoesTabProps) {
  const [conciliacoes, setConciliacoes] = useState<ConciliacaoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { formatCurrency } = useProjectCurrencyFormat();

  useEffect(() => {
    fetchConciliacoes();
  }, [projetoId]);

  const fetchConciliacoes = async () => {
    try {
      setLoading(true);

      // Fetch conciliações from bookmaker_balance_audit
      const { data: auditData, error: auditError } = await supabase
        .from("bookmaker_balance_audit")
        .select(`
          id,
          bookmaker_id,
          saldo_anterior,
          saldo_novo,
          observacoes,
          created_at,
          bookmakers!bookmaker_balance_audit_bookmaker_id_fkey (
            nome,
            moeda
          )
        `)
        .eq("origem", "CONCILIACAO_VINCULO")
        .eq("referencia_id", projetoId)
        .eq("referencia_tipo", "projeto")
        .order("created_at", { ascending: false });

      if (auditError) throw auditError;

      const mapped: ConciliacaoRecord[] = (auditData || []).map((item: any) => ({
        id: item.id,
        bookmaker_id: item.bookmaker_id,
        bookmaker_nome: item.bookmakers?.nome || "Casa desconhecida",
        saldo_anterior: Number(item.saldo_anterior),
        saldo_novo: Number(item.saldo_novo),
        diferenca: Number(item.saldo_novo) - Number(item.saldo_anterior),
        observacoes: item.observacoes,
        created_at: item.created_at,
        moeda: item.bookmakers?.moeda || "BRL",
      }));

      setConciliacoes(mapped);
    } catch (error: any) {
      console.error("Erro ao carregar conciliações:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // Calcular totais
  const totals = conciliacoes.reduce(
    (acc, c) => {
      if (c.diferenca > 0) {
        acc.positivo += c.diferenca;
      } else {
        acc.negativo += c.diferenca;
      }
      acc.total += c.diferenca;
      return acc;
    },
    { positivo: 0, negativo: 0, total: 0 }
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (conciliacoes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Scale className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">Nenhuma conciliação registrada</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Conciliações são registradas automaticamente quando você libera vínculos com
            diferença entre o saldo do sistema e o saldo real informado.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs - Faixa compacta */}
      <KpiSummaryBar
        items={[
          {
            label: "Total de Ajustes",
            value: conciliacoes.length,
            subtitle: <span className="text-muted-foreground">conciliações realizadas</span>,
          },
          {
            label: "Ajustes Positivos",
            value: `+${formatCurrency(totals.positivo, "BRL")}`,
            valueClassName: "text-emerald-500",
          },
          {
            label: "Ajustes Negativos",
            value: formatCurrency(totals.negativo, "BRL"),
            valueClassName: "text-red-500",
          },
        ]}
      />

      {/* Card de resultado líquido */}
      <Card className={totals.total >= 0 ? "border-emerald-500/30" : "border-red-500/30"}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${totals.total >= 0 ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                {totals.total >= 0 ? (
                  <ArrowUpRight className="h-5 w-5 text-emerald-500" />
                ) : (
                  <ArrowDownRight className="h-5 w-5 text-red-500" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">Impacto Líquido das Conciliações</p>
                <p className="text-xs text-muted-foreground">
                  Soma de todos os ajustes aplicados ao lucro do projeto
                </p>
              </div>
            </div>
            <div className={`text-2xl font-bold ${totals.total >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {totals.total >= 0 ? "+" : ""}{formatCurrency(totals.total, "BRL")}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de conciliações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Histórico Detalhado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {conciliacoes.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-full ${c.diferenca >= 0 ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                    {c.diferenca >= 0 ? (
                      <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{c.bookmaker_nome}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(c.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right text-xs text-muted-foreground">
                    <p>Sistema: {formatCurrency(c.saldo_anterior, c.moeda)}</p>
                    <p>Real: {formatCurrency(c.saldo_novo, c.moeda)}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`min-w-[90px] justify-center ${
                      c.diferenca >= 0
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                        : "bg-red-500/15 border-red-500/40 text-red-400"
                    }`}
                  >
                    {c.diferenca >= 0 ? "+" : ""}{formatCurrency(c.diferenca, c.moeda)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
