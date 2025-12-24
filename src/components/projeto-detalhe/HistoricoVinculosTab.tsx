import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  History,
  Building2,
  User,
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingUp,
  TrendingDown,
  Calendar,
  CheckCircle2,
  ShieldAlert,
  XCircle,
} from "lucide-react";

interface HistoricoVinculosTabProps {
  projetoId: string;
}

interface HistoricoVinculo {
  id: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  data_vinculacao: string;
  data_desvinculacao: string | null;
  status_final: string | null;
  total_depositado: number;
  total_sacado: number;
  lucro_operacional: number;
}

export function HistoricoVinculosTab({ projetoId }: HistoricoVinculosTabProps) {
  const [historico, setHistorico] = useState<HistoricoVinculo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistorico();
  }, [projetoId]);

  const fetchHistorico = async () => {
    try {
      setLoading(true);

      // Buscar histórico de vínculos
      const { data: historicoData, error: historicoError } = await supabase
        .from("projeto_bookmaker_historico")
        .select("*")
        .eq("projeto_id", projetoId)
        .order("data_vinculacao", { ascending: false });

      if (historicoError) throw historicoError;

      if (!historicoData || historicoData.length === 0) {
        setHistorico([]);
        return;
      }

      // Buscar dados financeiros para cada bookmaker
      const bookmakerIds = historicoData.map((h) => h.bookmaker_id);

      // Depósitos (cash_ledger onde destino_bookmaker_id é uma das bookmakers)
      const { data: depositos } = await supabase
        .from("cash_ledger")
        .select("destino_bookmaker_id, valor")
        .eq("tipo_transacao", "DEPOSITO")
        .eq("status", "CONFIRMADO")
        .in("destino_bookmaker_id", bookmakerIds);

      // Saques (cash_ledger onde origem_bookmaker_id é uma das bookmakers)
      const { data: saques } = await supabase
        .from("cash_ledger")
        .select("origem_bookmaker_id, valor")
        .eq("tipo_transacao", "SAQUE")
        .eq("status", "CONFIRMADO")
        .in("origem_bookmaker_id", bookmakerIds);

      // Lucro de apostas usando apostas_unificada
      const { data: apostasData } = await supabase
        .from("apostas_unificada")
        .select("bookmaker_id, lucro_prejuizo")
        .eq("projeto_id", projetoId)
        .eq("status", "LIQUIDADA")
        .not("bookmaker_id", "is", null)
        .in("bookmaker_id", bookmakerIds);

      // Agregar dados por bookmaker
      const depositosMap: Record<string, number> = {};
      const saquesMap: Record<string, number> = {};
      const lucroMap: Record<string, number> = {};

      // Agregar depósitos
      depositos?.forEach((d) => {
        depositosMap[d.destino_bookmaker_id] =
          (depositosMap[d.destino_bookmaker_id] || 0) + Number(d.valor);
      });

      // Agregar saques
      saques?.forEach((s) => {
        saquesMap[s.origem_bookmaker_id] =
          (saquesMap[s.origem_bookmaker_id] || 0) + Number(s.valor);
      });

      // Agregar lucro de apostas
      apostasData?.forEach((a) => {
        if (a.bookmaker_id) {
          lucroMap[a.bookmaker_id] =
            (lucroMap[a.bookmaker_id] || 0) + Number(a.lucro_prejuizo || 0);
        }
      });

      // Montar dados do histórico
      const mappedHistorico: HistoricoVinculo[] = historicoData.map((h) => ({
        id: h.id,
        bookmaker_id: h.bookmaker_id,
        bookmaker_nome: h.bookmaker_nome,
        parceiro_id: h.parceiro_id,
        parceiro_nome: h.parceiro_nome,
        data_vinculacao: h.data_vinculacao,
        data_desvinculacao: h.data_desvinculacao,
        status_final: h.status_final,
        total_depositado: depositosMap[h.bookmaker_id] || 0,
        total_sacado: saquesMap[h.bookmaker_id] || 0,
        lucro_operacional: lucroMap[h.bookmaker_id] || 0,
      }));

      setHistorico(mappedHistorico);
    } catch (error: any) {
      console.error("Erro ao carregar histórico:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return `R$ ${value.toFixed(2).replace(".", ",")}`;
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd/MM/yyyy", { locale: ptBR });
  };

  const getStatusBadge = (status: string | null, isActive: boolean) => {
    if (isActive) {
      return (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Em Uso
        </Badge>
      );
    }

    switch (status?.toUpperCase()) {
      case "ATIVO":
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Devolvido Ativo
          </Badge>
        );
      case "LIMITADA":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            <ShieldAlert className="h-3 w-3 mr-1" />
            Devolvido Limitada
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
            <XCircle className="h-3 w-3 mr-1" />
            Devolvido
          </Badge>
        );
    }
  };

  // KPIs
  const totalHistorico = historico.length;
  const vinculosDevolvidos = historico.filter((h) => h.data_desvinculacao !== null).length;
  const vinculosAtivos = historico.filter((h) => h.data_desvinculacao === null).length;
  const lucroAcumulado = historico.reduce((acc, h) => acc + h.lucro_operacional, 0);
  const depositoTotal = historico.reduce((acc, h) => acc + h.total_depositado, 0);
  const saqueTotal = historico.reduce((acc, h) => acc + h.total_sacado, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Histórico</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHistorico}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-emerald-400">{vinculosAtivos} em uso</span>
              {" · "}
              <span className="text-muted-foreground">{vinculosDevolvidos} devolvidos</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Depositado</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">
              {formatCurrency(depositoTotal)}
            </div>
            <p className="text-xs text-muted-foreground">
              Valor total depositado nas casas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sacado</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {formatCurrency(saqueTotal)}
            </div>
            <p className="text-xs text-muted-foreground">
              Valor total sacado das casas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lucro Acumulado</CardTitle>
            {lucroAcumulado >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-400" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                lucroAcumulado >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {lucroAcumulado >= 0 ? "+" : ""}
              {formatCurrency(lucroAcumulado)}
            </div>
            <p className="text-xs text-muted-foreground">
              Lucro total das operações
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Histórico */}
      {historico.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <History className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhum histórico</h3>
              <p className="text-muted-foreground">
                O histórico de vínculos aparecerá aqui
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Timeline de Vínculos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[500px]">
              <div className="divide-y divide-border">
                {historico.map((item) => {
                  const isActive = item.data_desvinculacao === null;
                  const resultadoCaixa = item.total_sacado - item.total_depositado;

                  return (
                    <div
                      key={item.id}
                      className={`p-4 ${isActive ? "bg-emerald-500/5" : ""}`}
                    >
                      <div className="flex items-center gap-4">
                        {/* Ícone */}
                        <div
                          className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isActive ? "bg-emerald-500/20" : "bg-muted"
                          }`}
                        >
                          <Building2
                            className={`h-5 w-5 ${
                              isActive ? "text-emerald-400" : "text-muted-foreground"
                            }`}
                          />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.bookmaker_nome}</span>
                            {getStatusBadge(item.status_final, isActive)}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {item.parceiro_nome || "Sem parceiro"}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(item.data_vinculacao)}
                              {item.data_desvinculacao && (
                                <> → {formatDate(item.data_desvinculacao)}</>
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Depósitos */}
                        <div className="text-right flex-shrink-0 min-w-[90px]">
                          <p className="text-xs text-muted-foreground">Depositado</p>
                          <p className="font-medium text-blue-400">
                            {formatCurrency(item.total_depositado)}
                          </p>
                        </div>

                        {/* Saques */}
                        <div className="text-right flex-shrink-0 min-w-[90px]">
                          <p className="text-xs text-muted-foreground">Sacado</p>
                          <p className="font-medium text-emerald-400">
                            {formatCurrency(item.total_sacado)}
                          </p>
                        </div>

                        {/* Resultado Caixa */}
                        <div className="text-right flex-shrink-0 min-w-[90px]">
                          <p className="text-xs text-muted-foreground">Resultado Caixa</p>
                          <p
                            className={`font-semibold ${
                              resultadoCaixa >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {resultadoCaixa >= 0 ? "+" : ""}
                            {formatCurrency(resultadoCaixa)}
                          </p>
                        </div>

                        {/* Lucro Operacional */}
                        <div className="text-right flex-shrink-0 min-w-[100px]">
                          <p className="text-xs text-muted-foreground">Lucro Operacional</p>
                          <p
                            className={`font-semibold ${
                              item.lucro_operacional >= 0
                                ? "text-emerald-400"
                                : "text-red-400"
                            }`}
                          >
                            {item.lucro_operacional >= 0 ? "+" : ""}
                            {formatCurrency(item.lucro_operacional)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}