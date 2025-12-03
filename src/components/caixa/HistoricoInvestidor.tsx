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
  origem_tipo: string | null;
  destino_tipo: string | null;
  tipo_moeda: string;
  moeda: string;
  coin: string | null;
  valor: number;
  valor_usd: number | null;
  qtd_coin: number | null;
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
      // Buscar investidores usando APORTE_FINANCEIRO
      const { data, error } = await supabase
        .from("cash_ledger")
        .select("nome_investidor")
        .eq("tipo_transacao", "APORTE_FINANCEIRO")
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
      
      // Buscar transações usando APORTE_FINANCEIRO
      const { data, error } = await supabase
        .from("cash_ledger")
        .select("*")
        .eq("nome_investidor", investidorSelecionado)
        .eq("tipo_transacao", "APORTE_FINANCEIRO")
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

  // Determinar se é APORTE ou LIQUIDACAO pelo origem_tipo/destino_tipo
  const isAporte = (t: Transacao) => t.origem_tipo === "INVESTIDOR";
  const isLiquidacao = (t: Transacao) => t.destino_tipo === "INVESTIDOR";

  const getTotals = () => {
    return transacoes.reduce(
      (acc, t) => {
        const isCrypto = t.tipo_moeda === "CRYPTO";
        const valorUsd = t.valor_usd || t.valor;
        
        if (isAporte(t)) {
          if (isCrypto) {
            acc.totalAportesCryptoUsd += valorUsd;
          } else {
            acc.totalAportesFiat += t.valor;
          }
        } else if (isLiquidacao(t)) {
          if (isCrypto) {
            acc.totalLiquidacoesCryptoUsd += valorUsd;
          } else {
            acc.totalLiquidacoesFiat += t.valor;
          }
        }
        return acc;
      },
      { totalAportesFiat: 0, totalAportesCryptoUsd: 0, totalLiquidacoesFiat: 0, totalLiquidacoesCryptoUsd: 0 }
    );
  };

  const totals = getTotals();
  const saldoFiat = totals.totalAportesFiat - totals.totalLiquidacoesFiat;
  const saldoCryptoUsd = totals.totalAportesCryptoUsd - totals.totalLiquidacoesCryptoUsd;

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
            {/* Totalizadores FIAT */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <div className="text-xs text-muted-foreground mb-3 font-medium">FIAT (BRL)</div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Total Aportes</div>
                  <div className="text-lg font-bold text-emerald-400">
                    {formatCurrency(totals.totalAportesFiat, "BRL")}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Total Liquidações</div>
                  <div className="text-lg font-bold text-amber-400">
                    {formatCurrency(totals.totalLiquidacoesFiat, "BRL")}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Saldo</div>
                  <div className={`text-lg font-bold ${saldoFiat >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatCurrency(saldoFiat, "BRL")}
                  </div>
                </div>
              </div>
            </div>

            {/* Totalizadores CRYPTO */}
            {(totals.totalAportesCryptoUsd > 0 || totals.totalLiquidacoesCryptoUsd > 0) && (
              <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                <div className="text-xs text-muted-foreground mb-3 font-medium">CRYPTO (USD)</div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">Total Aportes</div>
                    <div className="text-lg font-bold text-emerald-400">
                      {formatCurrency(totals.totalAportesCryptoUsd, "USD")}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">Total Liquidações</div>
                    <div className="text-lg font-bold text-amber-400">
                      {formatCurrency(totals.totalLiquidacoesCryptoUsd, "USD")}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">Saldo</div>
                    <div className={`text-lg font-bold ${saldoCryptoUsd >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {formatCurrency(saldoCryptoUsd, "USD")}
                    </div>
                  </div>
                </div>
              </div>
            )}

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
                transacoes.map((t) => {
                  const isAporteT = isAporte(t);
                  const isCrypto = t.tipo_moeda === "CRYPTO";
                  
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-card/30 border border-border/50 hover:bg-card/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className={
                            isAporteT
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                              : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                          }
                        >
                          {isAporteT ? "Aporte" : "Liquidação"}
                        </Badge>
                        {isCrypto && (
                          <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                            {t.coin}
                          </Badge>
                        )}
                        <div>
                          <div className="text-sm font-medium">
                            {isAporteT ? "Investidor Externo" : "Caixa Operacional"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(t.data_transacao), "dd/MM/yyyy HH:mm")}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">
                            {isAporteT ? "Caixa Operacional" : "Investidor Externo"}
                          </div>
                          {t.descricao && (
                            <div className="text-xs text-muted-foreground">{t.descricao}</div>
                          )}
                        </div>
                      </div>
                      <div className={`text-right font-bold ${
                        isAporteT ? "text-emerald-400" : "text-amber-400"
                      }`}>
                        {isCrypto ? (
                          <div className="space-y-0.5">
                            <div className="font-mono text-sm">{t.qtd_coin?.toFixed(4)} {t.coin}</div>
                            <div className="text-xs text-muted-foreground">
                              ≈ {formatCurrency(t.valor_usd || t.valor, "USD")}
                            </div>
                          </div>
                        ) : (
                          formatCurrency(t.valor, t.moeda)
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </CardContent>
    </>
  );
}
