import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowRight, Info, AlertCircle, Coins, Wallet, Building2, CreditCard, ArrowDownRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DespesaAdminTransacao {
  id: string;
  categoria: string;
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

interface HistoricoDespesasAdminProps {
  formatCurrency: (value: number, currency?: string) => string;
}

export function HistoricoDespesasAdmin({ formatCurrency }: HistoricoDespesasAdminProps) {
  const [despesas, setDespesas] = useState<DespesaAdminTransacao[]>([]);
  const [parceiros, setParceiros] = useState<Record<string, string>>({});
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [despesasRes, parceirosRes, contasRes, walletsRes] = await Promise.all([
        supabase
          .from("despesas_administrativas")
          .select("*")
          .order("data_despesa", { ascending: false })
          .limit(50),
        supabase.from("parceiros").select("id, nome"),
        supabase.from("contas_bancarias").select("id, banco, titular, parceiro_id"),
        supabase.from("wallets_crypto").select("id, exchange, parceiro_id"),
      ]);

      if (despesasRes.data) setDespesas(despesasRes.data);
      if (parceirosRes.data) {
        const map: Record<string, string> = {};
        parceirosRes.data.forEach((p) => {
          map[p.id] = p.nome;
        });
        setParceiros(map);
      }
      if (contasRes.data) setContasBancarias(contasRes.data);
      if (walletsRes.data) setWallets(walletsRes.data);
    } catch (error) {
      console.error("Erro ao carregar histórico:", error);
    } finally {
      setLoading(false);
    }
  };

  const getOrigemInfo = (despesa: DespesaAdminTransacao) => {
    if (despesa.origem_caixa_operacional) {
      if (despesa.tipo_moeda === "CRYPTO") {
        return { label: "Caixa Operacional", sublabel: `Crypto (${despesa.coin})`, icon: Coins };
      }
      return { label: "Caixa Operacional", sublabel: "FIAT (BRL)", icon: Wallet };
    }
    
    if (despesa.origem_conta_bancaria_id) {
      const conta = contasBancarias.find((c) => c.id === despesa.origem_conta_bancaria_id);
      if (conta) {
        return { label: conta.banco, sublabel: conta.titular, icon: CreditCard };
      }
      return { label: "Conta Bancária", sublabel: "", icon: CreditCard };
    }
    
    if (despesa.origem_wallet_id) {
      const wallet = wallets.find((w) => w.id === despesa.origem_wallet_id);
      if (wallet) {
        const parceiroNome = parceiros[wallet.parceiro_id] || "";
        return { label: wallet.exchange, sublabel: parceiroNome, icon: Coins };
      }
      return { label: "Wallet Crypto", sublabel: "", icon: Coins };
    }
    
    return { label: "Não especificado", sublabel: "", icon: Building2 };
  };

  const getDestinoLabel = (despesa: DespesaAdminTransacao) => {
    // Despesas administrativas são saídas - destino é externo
    return "Despesa Externa";
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
        <p className="text-sm text-muted-foreground">Detalhamento das despesas com origem e moeda utilizada</p>
      </CardHeader>
      <CardContent>
        {despesas.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhuma despesa registrada</p>
          </div>
        ) : (
          <div className="space-y-2">
            {despesas.map((despesa) => {
              const origemInfo = getOrigemInfo(despesa);
              const OrigemIcon = origemInfo.icon;
              const isCrypto = despesa.tipo_moeda === "CRYPTO";
              
              return (
                <div
                  key={despesa.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex items-center gap-2">
                      <OrigemIcon className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{origemInfo.label}</span>
                        {origemInfo.sublabel && (
                          <span className="text-xs text-muted-foreground">{origemInfo.sublabel}</span>
                        )}
                      </div>
                    </div>
                    
                    <ArrowRight className="h-4 w-4 text-primary" />
                    
                    <div className="flex flex-col">
                      <Badge variant="outline" className="w-fit">{despesa.categoria}</Badge>
                      {despesa.descricao && (
                        <span className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate">
                          {despesa.descricao}
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
                                  <span className="font-medium">Moeda:</span> {despesa.coin}
                                </p>
                                <p className="text-muted-foreground">
                                  <span className="font-medium">Quantidade:</span> {despesa.qtd_coin?.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
                                </p>
                                <p className="text-muted-foreground">
                                  <span className="font-medium">Cotação USD:</span> ${despesa.cotacao?.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
                                </p>
                                <p className="text-xs text-muted-foreground/70 mt-2 pt-2 border-t border-border/30">
                                  Cálculo: {despesa.qtd_coin?.toFixed(4)} {despesa.coin} × ${despesa.cotacao?.toFixed(4)} = {formatCurrency(despesa.valor)}
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
                        <div className="flex flex-col items-end">
                          <span>- {despesa.qtd_coin?.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {despesa.coin}</span>
                          <span className="text-xs text-muted-foreground">≈ {formatCurrency(despesa.valor)}</span>
                        </div>
                      ) : (
                        <span>- {formatCurrency(despesa.valor)}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {format(parseISO(despesa.data_despesa), "dd/MM/yyyy", { locale: ptBR })}
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
