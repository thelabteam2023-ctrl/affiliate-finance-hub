import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowRight, Info, AlertCircle, Coins, Wallet, Building2, CreditCard, User } from "lucide-react";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
import { getGrupoInfo } from "@/lib/despesaGrupos";
import { ptBR } from "date-fns/locale";

interface TransacaoHistorico {
  id: string;
  categoria: string;
  grupo?: string;
  descricao: string | null;
  valor: number;
  data_despesa: string;
  status: string;
  tipo_moeda: string | null;
  coin: string | null;
  qtd_coin: number | null;
  cotacao: number | null;
  origem_tipo: string | null;
  origem_caixa_operacional: boolean | null;
  origem_parceiro_id: string | null;
  origem_conta_bancaria_id: string | null;
  origem_wallet_id: string | null;
  destino_tipo?: string | null;
  destino_nome?: string | null;
}

interface Parceiro {
  id: string;
  nome: string;
}

interface ContaBancaria {
  id: string;
  banco: string;
  titular: string;
  parceiro_id: string;
}

interface Wallet {
  id: string;
  exchange: string;
  parceiro_id: string;
}

interface Operador {
  id: string;
  nome: string;
}

interface HistoricoDespesasAdminProps {
  formatCurrency: (value: number, currency?: string) => string;
}

export function HistoricoDespesasAdmin({ formatCurrency }: HistoricoDespesasAdminProps) {
  const [transacoes, setTransacoes] = useState<TransacaoHistorico[]>([]);
  const [parceiros, setParceiros] = useState<Record<string, string>>({});
  const [operadores, setOperadores] = useState<Record<string, string>>({});
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [despesasRes, pagamentosOperadorRes, parceirosRes, operadoresRes, contasRes, walletsRes] = await Promise.all([
        supabase
          .from("despesas_administrativas")
          .select("*")
          .eq("status", "CONFIRMADO")
          .order("data_despesa", { ascending: false })
          .limit(50),
        supabase
          .from("cash_ledger")
          .select("*")
          .eq("tipo_transacao", "PAGTO_OPERADOR")
          .eq("status", "CONFIRMADO")
          .order("data_transacao", { ascending: false })
          .limit(50),
        supabase.from("parceiros").select("id, nome"),
        supabase.from("operadores").select("id, nome"),
        supabase.from("contas_bancarias").select("id, banco, titular, parceiro_id"),
        supabase.from("wallets_crypto").select("id, exchange, parceiro_id"),
      ]);

      // Map parceiros
      const parceirosMap: Record<string, string> = {};
      if (parceirosRes.data) {
        parceirosRes.data.forEach((p) => {
          parceirosMap[p.id] = p.nome;
        });
      }
      setParceiros(parceirosMap);

      // Map operadores
      const operadoresMap: Record<string, string> = {};
      if (operadoresRes.data) {
        operadoresRes.data.forEach((o) => {
          operadoresMap[o.id] = o.nome;
        });
      }
      setOperadores(operadoresMap);

      if (contasRes.data) setContasBancarias(contasRes.data);
      if (walletsRes.data) setWallets(walletsRes.data);

      // Normalize despesas administrativas
      const despesasNormalized: TransacaoHistorico[] = (despesasRes.data || []).map((d) => ({
        id: d.id,
        categoria: d.categoria,
        descricao: d.descricao,
        valor: d.valor,
        data_despesa: d.data_despesa,
        status: d.status,
        tipo_moeda: d.tipo_moeda,
        coin: d.coin,
        qtd_coin: d.qtd_coin,
        cotacao: d.cotacao,
        origem_tipo: d.origem_tipo,
        origem_caixa_operacional: d.origem_caixa_operacional,
        origem_parceiro_id: d.origem_parceiro_id,
        origem_conta_bancaria_id: d.origem_conta_bancaria_id,
        origem_wallet_id: d.origem_wallet_id,
        destino_tipo: "EXTERNO",
        destino_nome: null,
      }));

      // Normalize pagamentos de operador
      const pagamentosNormalized: TransacaoHistorico[] = (pagamentosOperadorRes.data || []).map((p) => ({
        id: p.id,
        categoria: "OPERADORES",
        descricao: p.descricao,
        valor: p.valor,
        data_despesa: p.data_transacao,
        status: p.status,
        tipo_moeda: p.tipo_moeda,
        coin: p.coin,
        qtd_coin: p.qtd_coin,
        cotacao: p.cotacao,
        origem_tipo: p.origem_tipo,
        origem_caixa_operacional: p.origem_tipo === "CAIXA_OPERACIONAL",
        origem_parceiro_id: p.origem_parceiro_id,
        origem_conta_bancaria_id: p.origem_conta_bancaria_id,
        origem_wallet_id: p.origem_wallet_id,
        destino_tipo: "OPERADOR",
        destino_nome: p.operador_id ? operadoresMap[p.operador_id] || "Operador" : null,
      }));

      // Combine and sort by date
      const allTransacoes = [...despesasNormalized, ...pagamentosNormalized].sort(
        (a, b) => new Date(b.data_despesa).getTime() - new Date(a.data_despesa).getTime()
      );

      setTransacoes(allTransacoes);
    } catch (error) {
      console.error("Erro ao carregar histórico:", error);
    } finally {
      setLoading(false);
    }
  };

  const getOrigemInfo = (transacao: TransacaoHistorico) => {
    if (transacao.origem_caixa_operacional || transacao.origem_tipo === "CAIXA_OPERACIONAL") {
      if (transacao.tipo_moeda === "CRYPTO") {
        return { label: "Caixa Operacional", sublabel: `Crypto (${transacao.coin})`, icon: Coins };
      }
      return { label: "Caixa Operacional", sublabel: "FIAT (BRL)", icon: Wallet };
    }
    
    if (transacao.origem_conta_bancaria_id) {
      const conta = contasBancarias.find((c) => c.id === transacao.origem_conta_bancaria_id);
      if (conta) {
        return { label: conta.banco, sublabel: conta.titular, icon: CreditCard };
      }
      return { label: "Conta Bancária", sublabel: "", icon: CreditCard };
    }
    
    if (transacao.origem_wallet_id) {
      const wallet = wallets.find((w) => w.id === transacao.origem_wallet_id);
      if (wallet) {
        const parceiroNome = parceiros[wallet.parceiro_id] || "";
        return { label: wallet.exchange, sublabel: parceiroNome, icon: Coins };
      }
      return { label: "Wallet Crypto", sublabel: "", icon: Coins };
    }
    
    return { label: "Não especificado", sublabel: "", icon: Building2 };
  };

  const getDestinoInfo = (transacao: TransacaoHistorico) => {
    if (transacao.destino_tipo === "OPERADOR" && transacao.destino_nome) {
      return { label: transacao.destino_nome, sublabel: "Operador", icon: User };
    }
    return { label: "Despesa Externa", sublabel: "", icon: Building2 };
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Transações</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico de Transações</CardTitle>
        <p className="text-sm text-muted-foreground">Detalhamento das despesas com origem, destino e moeda utilizada</p>
      </CardHeader>
      <CardContent>
        {transacoes.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhuma despesa registrada</p>
          </div>
        ) : (
          <div className={`space-y-2 ${transacoes.length >= 5 ? "max-h-[400px] overflow-y-auto pr-2" : ""}`}>
            {transacoes.map((transacao) => {
              const origemInfo = getOrigemInfo(transacao);
              const destinoInfo = getDestinoInfo(transacao);
              const OrigemIcon = origemInfo.icon;
              const DestinoIcon = destinoInfo.icon;
              const isCrypto = transacao.tipo_moeda === "CRYPTO";
              
              return (
                <div
                  key={transacao.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    {/* Origem */}
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <OrigemIcon className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{origemInfo.label}</span>
                        {origemInfo.sublabel && (
                          <span className="text-xs text-muted-foreground">{origemInfo.sublabel}</span>
                        )}
                      </div>
                    </div>
                    
                    <ArrowRight className="h-4 w-4 text-primary flex-shrink-0" />
                    
                    {/* Destino */}
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <DestinoIcon className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{destinoInfo.label}</span>
                        {destinoInfo.sublabel && (
                          <span className="text-xs text-muted-foreground">{destinoInfo.sublabel}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col ml-4">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const grupoInfo = getGrupoInfo((transacao as any).grupo || "OUTROS");
                          return (
                            <Badge variant="outline" className={`w-fit ${grupoInfo.color}`}>
                              <span className="mr-1">{grupoInfo.icon}</span>
                              {grupoInfo.label}
                            </Badge>
                          );
                        })()}
                        {isCrypto && (
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
                            <Coins className="h-3 w-3 mr-1" />
                            CRYPTO
                          </Badge>
                        )}
                      </div>
                      {transacao.descricao && (
                        <span className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate">
                          {transacao.descricao}
                        </span>
                      )}
                    </div>
                    
                    {isCrypto && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <button className="p-1 hover:bg-muted rounded-md transition-colors">
                            <Info className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Detalhes da Transação Crypto</DialogTitle>
                          </DialogHeader>
                          <div className="py-4 space-y-4">
                            <div className="space-y-2">
                              <h4 className="font-medium text-sm">Informações Crypto</h4>
                              <div className="space-y-1 text-sm">
                                <p className="text-muted-foreground">
                                  <span className="font-medium">Moeda:</span> {transacao.coin}
                                </p>
                                <p className="text-muted-foreground">
                                  <span className="font-medium">Quantidade:</span> {transacao.qtd_coin?.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
                                </p>
                                <p className="text-muted-foreground">
                                  <span className="font-medium">Cotação USD:</span> ${transacao.cotacao?.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
                                </p>
                                <p className="text-xs text-muted-foreground/70 mt-2 pt-2 border-t border-border/30">
                                  Cálculo: {transacao.qtd_coin?.toFixed(4)} {transacao.coin} × ${transacao.cotacao?.toFixed(4)} = {formatCurrency(transacao.valor)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="text-destructive font-bold">
                      {isCrypto ? (
                        <div className="flex flex-col items-end gap-0.5">
                          {/* Valor principal em BRL (valor da despesa) */}
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-[10px] px-1 py-0">
                              CRYPTO
                            </Badge>
                            <span>- {formatCurrency(transacao.valor)}</span>
                          </div>
                          {/* Valor pago em crypto (referência) */}
                          <span className="text-xs text-muted-foreground">
                            Pago: {transacao.qtd_coin?.toFixed(4)} {transacao.coin}
                          </span>
                          {/* Cotação usada */}
                          <span className="text-[10px] text-muted-foreground/70">
                            (Cotação: {transacao.cotacao?.toFixed(4)})
                          </span>
                        </div>
                      ) : (
                        <span>- {formatCurrency(transacao.valor)}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {format(parseLocalDate(transacao.data_despesa), "dd/MM/yyyy", { locale: ptBR })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
