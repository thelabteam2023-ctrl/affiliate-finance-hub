import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";

interface Transacao {
  id: string;
  data_transacao: string;
  tipo_transacao: string;
  moeda: string;
  valor: number;
  descricao: string | null;
  nome_investidor: string;
}

export function HistoricoInvestidor() {
  const [investidorSelecionado, setInvestidorSelecionado] = useState<string>("");
  const [investidores, setInvestidores] = useState<string[]>([]);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInvestidores();
  }, []);

  useEffect(() => {
    if (investidorSelecionado) {
      fetchTransacoes();
    }
  }, [investidorSelecionado]);

  const fetchInvestidores = async () => {
    try {
      const { data, error } = await supabase
        .from("cash_ledger")
        .select("nome_investidor")
        .in("tipo_transacao", ["APORTE", "LIQUIDACAO"])
        .not("nome_investidor", "is", null)
        .eq("status", "CONFIRMADO");

      if (error) throw error;

      const uniqueInvestidores = Array.from(
        new Set(data?.map((t) => t.nome_investidor).filter(Boolean) as string[])
      ).sort();

      setInvestidores(uniqueInvestidores);
      
      if (uniqueInvestidores.length > 0 && !investidorSelecionado) {
        setInvestidorSelecionado(uniqueInvestidores[0]);
      }
    } catch (error: any) {
      console.error("Erro ao buscar investidores:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransacoes = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from("cash_ledger")
        .select("*")
        .eq("nome_investidor", investidorSelecionado)
        .in("tipo_transacao", ["APORTE", "LIQUIDACAO"])
        .eq("status", "CONFIRMADO")
        .order("data_transacao", { ascending: false });

      if (error) throw error;

      setTransacoes(data || []);
    } catch (error: any) {
      console.error("Erro ao buscar transações:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number, currency: string) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency,
    }).format(value);
  };

  const getTotals = () => {
    return transacoes.reduce(
      (acc, t) => {
        if (t.tipo_transacao === "APORTE") {
          acc.totalAportes += t.valor;
        } else if (t.tipo_transacao === "LIQUIDACAO") {
          acc.totalLiquidacoes += t.valor;
        }
        return acc;
      },
      { totalAportes: 0, totalLiquidacoes: 0 }
    );
  };

  const totals = getTotals();
  const saldoAtual = totals.totalAportes - totals.totalLiquidacoes;

  return (
    <>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Histórico por Investidor</CardTitle>
          <Select value={investidorSelecionado} onValueChange={setInvestidorSelecionado}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Selecione o investidor" />
            </SelectTrigger>
            <SelectContent>
              {investidores.map((inv) => (
                <SelectItem key={inv} value={inv}>
                  {inv}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center text-muted-foreground">Carregando...</div>
        ) : investidores.length === 0 ? (
          <div className="text-center text-muted-foreground">
            Nenhum investidor com transações registradas
          </div>
        ) : (
          <div className="space-y-4">
            {/* Totalizadores */}
            <div className="grid gap-4 md:grid-cols-3 p-4 rounded-lg bg-muted/30 border border-border/50">
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Total Aportes</div>
                <div className="text-lg font-bold text-emerald-400">
                  {formatCurrency(totals.totalAportes, "BRL")}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Total Liquidações</div>
                <div className="text-lg font-bold text-amber-400">
                  {formatCurrency(totals.totalLiquidacoes, "BRL")}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Saldo</div>
                <div className={`text-lg font-bold ${saldoAtual >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {formatCurrency(saldoAtual, "BRL")}
                </div>
              </div>
            </div>

            {/* Histórico */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">
                {transacoes.length} transações
              </h4>
              {transacoes.length === 0 ? (
                <div className="text-center text-muted-foreground py-4">
                  Nenhuma transação encontrada
                </div>
              ) : (
                transacoes.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-card/30 border border-border/50 hover:bg-card/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className={
                          t.tipo_transacao === "APORTE"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        }
                      >
                        {t.tipo_transacao === "APORTE" ? "Aporte" : "Liquidação"}
                      </Badge>
                      <div>
                        <div className="text-sm font-medium">
                          {t.tipo_transacao === "APORTE" ? "Investidor Externo" : "Caixa Operacional"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(t.data_transacao), "dd/MM/yyyy HH:mm")}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">
                          {t.tipo_transacao === "APORTE" ? "Caixa Operacional" : "Investidor Externo"}
                        </div>
                        {t.descricao && (
                          <div className="text-xs text-muted-foreground">{t.descricao}</div>
                        )}
                      </div>
                    </div>
                    <div className={`text-right font-bold ${
                      t.tipo_transacao === "APORTE" ? "text-emerald-400" : "text-amber-400"
                    }`}>
                      {formatCurrency(t.valor, t.moeda)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </CardContent>
    </>
  );
}