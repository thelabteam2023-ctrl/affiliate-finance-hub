import { ResumoGrupoDetalhesModal } from "@/components/financeiro/ResumoGrupoDetalhesModal";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLocalDate } from "@/lib/dateUtils";
import { getGrupoInfo } from "@/lib/despesaGrupos";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Edit, Trash2 } from "lucide-react";
import { DespesaAdministrativaDialog } from "@/components/financeiro/DespesaAdministrativaDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowRight, Info, Coins, Wallet, Building2, CreditCard, User } from "lucide-react";

interface DespesaAdministrativa {
  id: string;
  categoria: string;
  grupo?: string;
  descricao: string | null;
  valor: number;
  data_despesa: string;
  status: string;
  _fromLedger?: boolean;
  operador_id?: string | null;
  operadores?: { nome: string } | null;
  origem_tipo?: string | null;
  origem_caixa_operacional?: boolean | null;
  origem_parceiro_id?: string | null;
  origem_conta_bancaria_id?: string | null;
  origem_wallet_id?: string | null;
  tipo_moeda?: string | null;
  coin?: string | null;
  qtd_coin?: number | null;
  cotacao?: number | null;
}

interface Props {
  despesasAdmin: DespesaAdministrativa[];
  totalDespesasAdmin: number;
  totalPagamentosOperadores: number;
  formatCurrency: (value: number, currency?: string) => string;
  onRefresh: () => void;
  dataInicio?: string | null;
  dataFim?: string | null;
  contasBancarias?: any[];
  walletsCrypto?: any[];
}

function toTitleCase(str: string): string {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => {
      if (["de", "da", "do", "dos", "das", "e"].includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function FinanceiroDespesasTab({ 
  despesasAdmin, 
  totalDespesasAdmin, 
  totalPagamentosOperadores, 
  formatCurrency, 
  onRefresh, 
  dataInicio, 
  dataFim,
  contasBancarias = [],
  walletsCrypto = []
}: Props) {
  const totalGeralAdmin = despesasAdmin.reduce((acc, d) => acc + d.valor, 0);
  const { toast } = useToast();
  const [despesaAdminDialogOpen, setDespesaAdminDialogOpen] = useState(false);
  const [editingDespesa, setEditingDespesa] = useState<DespesaAdministrativa | null>(null);
  const [selectedGrupo, setSelectedGrupo] = useState<string | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<DespesaAdministrativa | null>(null);
  const [transactionDetailsOpen, setTransactionDetailsOpen] = useState(false);

  const getOrigemInfo = (transacao: DespesaAdministrativa) => {
    if (transacao.origem_caixa_operacional || transacao.origem_tipo === "CAIXA_OPERACIONAL") {
      if (transacao.tipo_moeda === "CRYPTO") {
        return { label: "Caixa Operacional", sublabel: `Crypto (${transacao.coin})`, icon: Coins };
      }
      return { label: "Caixa Operacional", sublabel: "FIAT (BRL)", icon: Wallet };
    }
    
    if (transacao.origem_conta_bancaria_id) {
      const conta = contasBancarias.find((c) => c.id === transacao.origem_conta_bancaria_id);
      if (conta) {
        const titular = conta.titular || conta.parceiro_nome;
        return { 
          label: conta.banco, 
          sublabel: titular ? `Titular: ${titular}` : "Titular não identificado", 
          icon: CreditCard 
        };
      }
      return { label: "Conta Bancária", sublabel: "", icon: CreditCard };
    }
    
    if (transacao.origem_wallet_id) {
      const wallet = walletsCrypto.find((w) => w.id === transacao.origem_wallet_id);
      if (wallet) {
        return { label: wallet.label || wallet.exchange, sublabel: wallet.parceiro_nome || "", icon: Coins };
      }
      return { label: "Wallet Crypto", sublabel: "", icon: Coins };
    }
    
    return { label: "Não especificado", sublabel: "", icon: Building2 };
  };

  const getDestinoInfo = (transacao: DespesaAdministrativa) => {
    if (transacao.grupo === 'RECURSOS_HUMANOS' || transacao.operador_id) {
      return { label: transacao.operadores?.nome || "Operador", sublabel: "RH / Pagamento", icon: User };
    }
    return { label: "Despesa Externa", sublabel: transacao.categoria, icon: Building2 };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Despesas Administrativas</h2>
          <p className="text-sm text-muted-foreground">Gerencie as despesas do escritório</p>
        </div>
        <Button onClick={() => { setEditingDespesa(null); setDespesaAdminDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Despesa
        </Button>
      </div>

      {/* Resumo por Grupo */}
      <Card>
        <CardHeader><CardTitle className="text-base">Resumo por Grupo</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(
              despesasAdmin.reduce((acc, d) => { const grupo = d.grupo || "OUTROS"; acc[grupo] = (acc[grupo] || 0) + d.valor; return acc; }, {} as Record<string, number>)
            ).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([grupo, valor]) => {
              const grupoInfo = getGrupoInfo(grupo);
              const IconComponent = grupoInfo.icon;
              return (
                <button
                  key={grupo}
                  onClick={() => {
                    setSelectedGrupo(grupo);
                    setDetailsModalOpen(true);
                  }}
                  className="flex items-center justify-between w-full p-2 hover:bg-muted/50 rounded-lg transition-colors group"
                >
                  <span className="text-sm flex items-center gap-2">
                    <IconComponent className="h-4 w-4 group-hover:scale-110 transition-transform" />
                    <span className="group-hover:underline underline-offset-4">{grupoInfo.label}</span>
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground font-normal">
                      {totalGeralAdmin > 0 ? (((valor as number) / totalGeralAdmin) * 100).toFixed(1) : 0}%
                    </span>
                    <span className="font-medium text-orange-500">{formatCurrency(valor as number)}</span>
                  </div>
                </button>
              );
            })}
            {despesasAdmin.length > 0 && (
              <>
                <div className="pt-3 border-t flex items-center justify-between font-bold text-lg">
                  <span>Total Geral</span>
                  <span className="text-orange-500">{formatCurrency(despesasAdmin.reduce((acc, d) => acc + d.valor, 0))}</span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Histórico de Transações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Histórico de Transações</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className={despesasAdmin.length >= 5 ? "max-h-[400px] overflow-y-auto" : ""}>
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-background shadow-sm">
                  <tr className="bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium border-b">Data</th>
                    <th className="text-left py-3 px-4 font-medium border-b">Grupo</th>
                    <th className="text-left py-3 px-4 font-medium border-b">Descrição / Fluxo</th>
                    <th className="text-right py-3 px-4 font-medium border-b">Valor</th>
                    <th className="text-center py-3 px-4 font-medium border-b">Status</th>
                    <th className="text-center py-3 px-4 font-medium border-b">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {despesasAdmin.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhuma despesa administrativa cadastrada
                      </td>
                    </tr>
                  ) : (
                    [...despesasAdmin]
                      .sort((a, b) => parseLocalDate(b.data_despesa).getTime() - parseLocalDate(a.data_despesa).getTime())
                      .map((despesa) => {
                        const grupoInfo = getGrupoInfo(despesa.grupo || "OUTROS");
                        const IconComponent = grupoInfo.icon;
                        return (
                          <tr key={despesa.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-3 px-4 w-[120px]">
                              {format(parseLocalDate(despesa.data_despesa), "dd/MM/yyyy", { locale: ptBR })}
                            </td>
                            <td className="py-3 px-4">
                              <ShadcnTooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className={`whitespace-nowrap ${grupoInfo.color}`}>
                                    <IconComponent className="h-3 w-3 mr-1" />
                                    {grupoInfo.label}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">{grupoInfo.description}</p>
                                  {despesa.categoria && despesa.categoria !== grupoInfo.label && (
                                    <p className="text-xs text-muted-foreground mt-1">Categoria original: {despesa.categoria}</p>
                                  )}
                                </TooltipContent>
                              </ShadcnTooltip>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground max-w-[300px] truncate">
                              <div className="flex items-center gap-2">
                                <div className="flex-1">
                                  {despesa.operadores?.nome && (
                                    <div className="text-foreground font-medium mb-0.5">
                                      {toTitleCase(despesa.operadores.nome)}
                                    </div>
                                  )}
                                  <div className="text-xs">{despesa.descricao || "—"}</div>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  onClick={() => {
                                    setSelectedTransaction(despesa);
                                    setTransactionDetailsOpen(true);
                                  }}
                                >
                                  <Info className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-medium text-orange-500 min-w-[100px]">{formatCurrency(despesa.valor)}</td>
                            <td className="py-3 px-4 text-center w-[120px]">
                              <Badge variant={despesa.status === "CONFIRMADO" ? "default" : "secondary"} className="text-xs">{despesa.status}</Badge>
                            </td>
                            <td className="py-3 px-4 w-[80px]">
                              {despesa._fromLedger ? (
                                <span className="text-xs text-muted-foreground">via operador</span>
                              ) : (
                                <div className="flex items-center justify-center gap-2">
                                  <button onClick={() => { setEditingDespesa(despesa); setDespesaAdminDialogOpen(true); }} className="text-muted-foreground hover:text-foreground transition-colors" title="Editar">
                                    <Edit className="h-4 w-4" />
                                  </button>
                                  <button onClick={async () => {
                                    if (confirm("Tem certeza que deseja excluir esta despesa?")) {
                                      const { error } = await supabase.from("despesas_administrativas").delete().eq("id", despesa.id);
                                      if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); }
                                      else { toast({ title: "Despesa excluída" }); onRefresh(); }
                                    }
                                  }} className="text-muted-foreground hover:text-destructive transition-colors" title="Excluir">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <DespesaAdministrativaDialog
        open={despesaAdminDialogOpen}
        onOpenChange={setDespesaAdminDialogOpen}
        despesa={editingDespesa}
        onSuccess={() => onRefresh()}
      />

      {selectedGrupo && (
        <ResumoGrupoDetalhesModal
          open={detailsModalOpen}
          onOpenChange={setDetailsModalOpen}
          grupo={selectedGrupo}
          despesas={despesasAdmin.filter(d => (d.grupo || "OUTROS") === selectedGrupo)}
          totalGeralFinanceiro={totalGeralAdmin}
          formatCurrency={formatCurrency}
        />
      )}

      <Dialog open={transactionDetailsOpen} onOpenChange={setTransactionDetailsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Detalhes da Transação</DialogTitle>
          </DialogHeader>
          {selectedTransaction && (() => {
            const origem = getOrigemInfo(selectedTransaction);
            const destino = getDestinoInfo(selectedTransaction);
            const OrigemIcon = origem.icon;
            const DestinoIcon = destino.icon;
            const isCrypto = selectedTransaction.tipo_moeda === "CRYPTO";
            const grupoInfo = getGrupoInfo(selectedTransaction.grupo || "OUTROS");
            const GrupoIcon = grupoInfo.icon;

            return (
              <div className="space-y-6 py-4">
                <div className="flex flex-col items-center gap-4 p-4 bg-muted/30 rounded-xl border border-border/50">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex flex-col items-center gap-2 flex-1">
                      <div className="p-2 bg-background rounded-full border shadow-sm">
                        <OrigemIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Origem</span>
                      <span className="text-sm font-bold text-center">{origem.label}</span>
                      <span className="text-[10px] text-muted-foreground">{origem.sublabel}</span>
                    </div>

                    <div className="flex flex-col items-center px-2">
                      <ArrowRight className="h-5 w-5 text-primary animate-pulse" />
                    </div>

                    <div className="flex flex-col items-center gap-2 flex-1">
                      <div className="p-2 bg-background rounded-full border shadow-sm">
                        <DestinoIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Destino</span>
                      <span className="text-sm font-bold text-center">{destino.label}</span>
                      <span className="text-[10px] text-muted-foreground">{destino.sublabel}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-muted/20 rounded-lg">
                    <span className="text-sm text-muted-foreground">Grupo / Categoria</span>
                    <Badge variant="outline" className={grupoInfo.color}>
                      <GrupoIcon className="h-3 w-3 mr-1" />
                      {grupoInfo.label}
                    </Badge>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-muted/20 rounded-lg">
                    <span className="text-sm text-muted-foreground">Valor</span>
                    <span className="text-lg font-bold text-orange-500">
                      {formatCurrency(selectedTransaction.valor)}
                    </span>
                  </div>

                  {isCrypto && (
                    <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Coins className="h-4 w-4 text-amber-500" />
                        <span className="text-xs font-bold text-amber-600 uppercase">Detalhes Crypto</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Moeda</p>
                          <p className="font-medium">{selectedTransaction.coin}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Quantidade</p>
                          <p className="font-medium">{selectedTransaction.qtd_coin?.toFixed(6)}</p>
                        </div>
                        <div className="col-span-2 pt-1 border-t border-amber-500/10">
                          <p className="text-muted-foreground">Cotação</p>
                          <p className="font-medium">${selectedTransaction.cotacao?.toFixed(4)} USD</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedTransaction.descricao && (
                    <div className="p-3 bg-muted/20 rounded-lg">
                      <span className="text-xs text-muted-foreground block mb-1">Descrição</span>
                      <p className="text-sm">{selectedTransaction.descricao}</p>
                    </div>
                  )}

                  <div className="flex justify-between items-center p-3 bg-muted/20 rounded-lg">
                    <span className="text-sm text-muted-foreground">Data</span>
                    <span className="text-sm font-medium">
                      {format(parseLocalDate(selectedTransaction.data_despesa), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
