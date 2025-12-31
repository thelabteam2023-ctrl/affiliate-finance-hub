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
  moeda: string;
  // Valores por moeda (BRL e USD separados)
  depositos_by_moeda: { BRL: number; USD: number };
  saques_by_moeda: { BRL: number; USD: number };
  lucro_by_moeda: { BRL: number; USD: number };
  // Totais consolidados em BRL
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

      // Taxa PTAX aproximada
      const USD_TO_BRL = 6.1;

      // Buscar histórico de vínculos
      const { data: historicoData, error: historicoError } = await supabase
        .from("projeto_bookmaker_historico")
        .select("*, bookmaker:bookmaker_id(moeda)")
        .eq("projeto_id", projetoId)
        .order("data_vinculacao", { ascending: false });

      if (historicoError) throw historicoError;

      if (!historicoData || historicoData.length === 0) {
        setHistorico([]);
        return;
      }

      // Buscar dados financeiros para cada bookmaker
      const bookmakerIds = historicoData.map((h) => h.bookmaker_id);

      // Depósitos com moeda
      const { data: depositos } = await supabase
        .from("cash_ledger")
        .select("destino_bookmaker_id, valor, moeda")
        .eq("tipo_transacao", "DEPOSITO")
        .eq("status", "CONFIRMADO")
        .in("destino_bookmaker_id", bookmakerIds);

      // Saques com moeda
      const { data: saques } = await supabase
        .from("cash_ledger")
        .select("origem_bookmaker_id, valor, moeda")
        .eq("tipo_transacao", "SAQUE")
        .eq("status", "CONFIRMADO")
        .in("origem_bookmaker_id", bookmakerIds);

      // Lucro de apostas com moeda
      const { data: apostasData } = await supabase
        .from("apostas_unificada")
        .select("bookmaker_id, lucro_prejuizo, lucro_prejuizo_brl_referencia, moeda_operacao")
        .eq("projeto_id", projetoId)
        .eq("status", "LIQUIDADA")
        .not("bookmaker_id", "is", null)
        .in("bookmaker_id", bookmakerIds);

      // Agregar dados por bookmaker COM BREAKDOWN POR MOEDA
      const depositosMap: Record<string, { BRL: number; USD: number; total: number }> = {};
      const saquesMap: Record<string, { BRL: number; USD: number; total: number }> = {};
      const lucroMap: Record<string, { BRL: number; USD: number; total: number }> = {};

      // Agregar depósitos
      depositos?.forEach((d) => {
        if (!depositosMap[d.destino_bookmaker_id]) {
          depositosMap[d.destino_bookmaker_id] = { BRL: 0, USD: 0, total: 0 };
        }
        const valor = Number(d.valor);
        const moeda = d.moeda || 'BRL';
        if (moeda === 'USD') {
          depositosMap[d.destino_bookmaker_id].USD += valor;
          depositosMap[d.destino_bookmaker_id].total += valor * USD_TO_BRL;
        } else {
          depositosMap[d.destino_bookmaker_id].BRL += valor;
          depositosMap[d.destino_bookmaker_id].total += valor;
        }
      });

      // Agregar saques
      saques?.forEach((s) => {
        if (!saquesMap[s.origem_bookmaker_id]) {
          saquesMap[s.origem_bookmaker_id] = { BRL: 0, USD: 0, total: 0 };
        }
        const valor = Number(s.valor);
        const moeda = s.moeda || 'BRL';
        if (moeda === 'USD') {
          saquesMap[s.origem_bookmaker_id].USD += valor;
          saquesMap[s.origem_bookmaker_id].total += valor * USD_TO_BRL;
        } else {
          saquesMap[s.origem_bookmaker_id].BRL += valor;
          saquesMap[s.origem_bookmaker_id].total += valor;
        }
      });

      // Agregar lucro de apostas
      apostasData?.forEach((a) => {
        if (!a.bookmaker_id) return;
        if (!lucroMap[a.bookmaker_id]) {
          lucroMap[a.bookmaker_id] = { BRL: 0, USD: 0, total: 0 };
        }
        const lucro = Number(a.lucro_prejuizo || 0);
        const moeda = a.moeda_operacao || 'BRL';
        if (moeda === 'USD') {
          lucroMap[a.bookmaker_id].USD += lucro;
          const valorBRL = a.lucro_prejuizo_brl_referencia ?? (lucro * USD_TO_BRL);
          lucroMap[a.bookmaker_id].total += valorBRL;
        } else {
          lucroMap[a.bookmaker_id].BRL += lucro;
          lucroMap[a.bookmaker_id].total += lucro;
        }
      });

      // Montar dados do histórico
      const mappedHistorico: HistoricoVinculo[] = historicoData.map((h: any) => ({
        id: h.id,
        bookmaker_id: h.bookmaker_id,
        bookmaker_nome: h.bookmaker_nome,
        parceiro_id: h.parceiro_id,
        parceiro_nome: h.parceiro_nome,
        data_vinculacao: h.data_vinculacao,
        data_desvinculacao: h.data_desvinculacao,
        status_final: h.status_final,
        moeda: h.bookmaker?.moeda || 'BRL',
        depositos_by_moeda: {
          BRL: depositosMap[h.bookmaker_id]?.BRL || 0,
          USD: depositosMap[h.bookmaker_id]?.USD || 0,
        },
        saques_by_moeda: {
          BRL: saquesMap[h.bookmaker_id]?.BRL || 0,
          USD: saquesMap[h.bookmaker_id]?.USD || 0,
        },
        lucro_by_moeda: {
          BRL: lucroMap[h.bookmaker_id]?.BRL || 0,
          USD: lucroMap[h.bookmaker_id]?.USD || 0,
        },
        total_depositado: depositosMap[h.bookmaker_id]?.total || 0,
        total_sacado: saquesMap[h.bookmaker_id]?.total || 0,
        lucro_operacional: lucroMap[h.bookmaker_id]?.total || 0,
      }));

      setHistorico(mappedHistorico);
    } catch (error: any) {
      console.error("Erro ao carregar histórico:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number, moeda: string = 'BRL') => {
    if (moeda === 'USD') {
      return `$ ${value.toFixed(2)}`;
    }
    return `R$ ${value.toFixed(2).replace(".", ",")}`;
  };

  const formatCurrencyBRL = (value: number) => {
    return `R$ ${value.toFixed(2).replace(".", ",")}`;
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd/MM/yyyy", { locale: ptBR });
  };

  // Helper para mostrar breakdown por moeda
  const renderCurrencyBreakdown = (brl: number, usd: number, consolidated: number, label: string, colorClass: string) => {
    const hasUSD = usd !== 0;
    const hasBRL = brl !== 0;
    
    return (
      <div className="text-right flex-shrink-0 min-w-[110px]">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-medium ${colorClass}`}>
          {formatCurrencyBRL(consolidated)}
        </p>
        {(hasUSD || (hasUSD && hasBRL)) && (
          <div className="flex justify-end gap-1 text-[10px] text-muted-foreground mt-0.5">
            {hasBRL && <span>R${brl.toFixed(0)}</span>}
            {hasBRL && hasUSD && <span>+</span>}
            {hasUSD && <span className="text-emerald-400">${usd.toFixed(2)}</span>}
          </div>
        )}
      </div>
    );
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
                        {renderCurrencyBreakdown(
                          item.depositos_by_moeda.BRL,
                          item.depositos_by_moeda.USD,
                          item.total_depositado,
                          "Depositado",
                          "text-blue-400"
                        )}

                        {/* Saques */}
                        {renderCurrencyBreakdown(
                          item.saques_by_moeda.BRL,
                          item.saques_by_moeda.USD,
                          item.total_sacado,
                          "Sacado",
                          "text-emerald-400"
                        )}

                        {/* Resultado Caixa - calculado por moeda */}
                        {(() => {
                          const resultadoBRL = item.saques_by_moeda.BRL - item.depositos_by_moeda.BRL;
                          const resultadoUSD = item.saques_by_moeda.USD - item.depositos_by_moeda.USD;
                          const resultadoTotal = item.total_sacado - item.total_depositado;
                          const colorClass = resultadoTotal >= 0 ? "text-emerald-400" : "text-red-400";
                          
                          return renderCurrencyBreakdown(
                            resultadoBRL,
                            resultadoUSD,
                            resultadoTotal,
                            "Resultado Caixa",
                            colorClass
                          );
                        })()}

                        {/* Lucro Operacional */}
                        {renderCurrencyBreakdown(
                          item.lucro_by_moeda.BRL,
                          item.lucro_by_moeda.USD,
                          item.lucro_operacional,
                          "Lucro Operacional",
                          item.lucro_operacional >= 0 ? "text-emerald-400" : "text-red-400"
                        )}
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