import { useMemo, useState, useCallback } from "react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Filter, ArrowRight, AlertCircle, Info, Clock, CheckCircle2, XCircle, Building2, Wallet, Search, X } from "lucide-react";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { format, startOfDay, endOfDay } from "date-fns";
import { usePagination } from "@/hooks/usePagination";
import { SimplePagination } from "@/components/ui/simple-pagination";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { parseLocalDateTime } from "@/utils/dateUtils";
import { DashboardPeriodFilterBar } from "@/components/shared/DashboardPeriodFilterBar";
import { DashboardPeriodFilter, getDashboardDateRange } from "@/types/dashboardFilters";
const PAGE_SIZE = 50;

const getStatusBadge = (status: string) => {
  switch (status) {
    case "PENDENTE":
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 gap-1">
          <Clock className="h-3 w-3" />
          Pendente
        </Badge>
      );
    case "CONFIRMADO":
      return (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Confirmado
        </Badge>
      );
    case "RECUSADO":
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1">
          <XCircle className="h-3 w-3" />
          Recusado
        </Badge>
      );
    default:
      return null;
  }
};

interface ContaBancaria {
  id: string;
  banco: string;
  titular: string;
}

interface WalletDetalhe {
  id: string;
  exchange: string;
  endereco: string;
  network: string;
  parceiro_id: string;
}

interface LabelInfo {
  primary: string;
  secondary?: string;
}

interface HistoricoMovimentacoesProps {
  transacoes: any[];
  parceiros: { [key: string]: string };
  contas: { [key: string]: string };
  contasBancarias: ContaBancaria[];
  wallets: { [key: string]: string };
  walletsDetalhes: WalletDetalhe[];
  bookmakers: { [key: string]: { nome: string; status: string; projeto_id?: string } };
  loading: boolean;
  filtroTipo: string;
  setFiltroTipo: (tipo: string) => void;
  filtroProjeto: string;
  setFiltroProjeto: (projeto: string) => void;
  filtroParceiro: string;
  setFiltroParceiro: (parceiro: string) => void;
  projetos: Array<{ id: string; nome: string }>;
  parceirosLista: Array<{ id: string; nome: string }>;
  dataInicio: Date | undefined;
  setDataInicio: (date: Date | undefined) => void;
  dataFim: Date | undefined;
  setDataFim: (date: Date | undefined) => void;
  getTransacoesFiltradas: () => any[];
  getTipoLabel: (tipo: string, transacao?: any) => string;
  getTipoColor: (tipo: string, transacao?: any) => string;
  getOrigemLabel: (transacao: any) => string;
  getDestinoLabel: (transacao: any) => string;
  getOrigemInfo?: (transacao: any) => LabelInfo;
  getDestinoInfo?: (transacao: any) => LabelInfo;
  formatCurrency: (value: number, currency: string) => string;
  onConfirmarSaque?: (transacao: any) => void;
}

export function HistoricoMovimentacoes({
  loading,
  filtroTipo,
  setFiltroTipo,
  filtroProjeto,
  setFiltroProjeto,
  filtroParceiro,
  setFiltroParceiro,
  projetos,
  parceirosLista,
  dataInicio,
  setDataInicio,
  dataFim,
  setDataFim,
  getTransacoesFiltradas,
  getTipoLabel,
  getTipoColor,
  getOrigemLabel,
  getDestinoLabel,
  getOrigemInfo,
  getDestinoInfo,
  formatCurrency,
  contasBancarias,
  parceiros,
  walletsDetalhes,
  bookmakers,
  onConfirmarSaque,
}: HistoricoMovimentacoesProps) {
  const { getLogoUrl } = useBookmakerLogoMap();
  const [termoBusca, setTermoBusca] = useState("");
  
  // Get all filtered transactions
  const transacoesFiltradas = useMemo(() => getTransacoesFiltradas(), [getTransacoesFiltradas]);
  
  // Apply text search filter
  const transacoesComBusca = useMemo(() => {
    if (!termoBusca.trim()) return transacoesFiltradas;
    
    const termo = termoBusca.toLowerCase().trim();
    return transacoesFiltradas.filter((t) => {
      // Search in bookmaker names
      const origemBookmaker = t.origem_bookmaker_id ? bookmakers[t.origem_bookmaker_id]?.nome?.toLowerCase() : "";
      const destinoBookmaker = t.destino_bookmaker_id ? bookmakers[t.destino_bookmaker_id]?.nome?.toLowerCase() : "";
      
      // Search in partner names
      const origemParceiro = t.origem_parceiro_id ? parceiros[t.origem_parceiro_id]?.toLowerCase() : "";
      const destinoParceiro = t.destino_parceiro_id ? parceiros[t.destino_parceiro_id]?.toLowerCase() : "";
      
      // Search in wallet details
      const origemWallet = t.origem_wallet_id ? walletsDetalhes.find(w => w.id === t.origem_wallet_id) : null;
      const destinoWallet = t.destino_wallet_id ? walletsDetalhes.find(w => w.id === t.destino_wallet_id) : null;
      const walletOrigemStr = origemWallet ? `${origemWallet.exchange} ${origemWallet.endereco}`.toLowerCase() : "";
      const walletDestinoStr = destinoWallet ? `${destinoWallet.exchange} ${destinoWallet.endereco}`.toLowerCase() : "";
      
      // Search in bank account details
      const origemConta = t.origem_conta_bancaria_id ? contasBancarias.find(c => c.id === t.origem_conta_bancaria_id) : null;
      const destinoConta = t.destino_conta_bancaria_id ? contasBancarias.find(c => c.id === t.destino_conta_bancaria_id) : null;
      const contaOrigemStr = origemConta ? `${origemConta.banco} ${origemConta.titular}`.toLowerCase() : "";
      const contaDestinoStr = destinoConta ? `${destinoConta.banco} ${destinoConta.titular}`.toLowerCase() : "";
      
      // Search in description
      const descricao = t.descricao?.toLowerCase() || "";
      
      // Search in transaction type
      const tipoTransacao = t.tipo_transacao?.toLowerCase() || "";
      
      // Search in coin
      const coin = t.coin?.toLowerCase() || "";
      
      // Search in valor (formatted)
      const valorStr = t.valor?.toString() || "";
      
      return (
        origemBookmaker.includes(termo) ||
        destinoBookmaker.includes(termo) ||
        origemParceiro.includes(termo) ||
        destinoParceiro.includes(termo) ||
        walletOrigemStr.includes(termo) ||
        walletDestinoStr.includes(termo) ||
        contaOrigemStr.includes(termo) ||
        contaDestinoStr.includes(termo) ||
        descricao.includes(termo) ||
        tipoTransacao.includes(termo) ||
        coin.includes(termo) ||
        valorStr.includes(termo)
      );
    });
  }, [transacoesFiltradas, termoBusca, bookmakers, parceiros, walletsDetalhes, contasBancarias]);
  
  // Client-side pagination
  const pagination = usePagination(transacoesComBusca, { initialPageSize: PAGE_SIZE });

  // Period filter state
  const [periodFilter, setPeriodFilter] = useState<DashboardPeriodFilter>("tudo");
  
  const handlePeriodChange = useCallback((filter: DashboardPeriodFilter) => {
    setPeriodFilter(filter);
    const range = getDashboardDateRange(filter);
    setDataInicio(range.start ?? undefined);
    setDataFim(range.end ?? undefined);
    pagination.goToFirstPage();
  }, [setDataInicio, setDataFim, pagination]);

  const handleCustomRangeChange = useCallback((range: { start: Date; end: Date }) => {
    setDataInicio(range.start);
    setDataFim(endOfDay(range.end));
    pagination.goToFirstPage();
  }, [setDataInicio, setDataFim, pagination]);

  return (
    <>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Histórico de Movimentações</CardTitle>
          <div className="text-sm text-muted-foreground">
            {transacoesComBusca.length} transações {termoBusca ? "encontradas" : "no período"}
          </div>
        </div>
        <div className="space-y-4 mt-4">
          {/* Campo de busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por casa, parceiro, wallet, banco, descrição..."
              value={termoBusca}
              onChange={(e) => {
                setTermoBusca(e.target.value);
                pagination.goToFirstPage();
              }}
              className="pl-9 pr-9"
            />
            {termoBusca && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => {
                  setTermoBusca("");
                  pagination.goToFirstPage();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tipo de transação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos os tipos</SelectItem>
                  <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
                  <SelectItem value="DEPOSITO">Depósito</SelectItem>
                  <SelectItem value="SAQUE">Saque</SelectItem>
                  <SelectItem value="APORTE_FINANCEIRO">Aporte & Liquidação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filtroProjeto} onValueChange={setFiltroProjeto}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Projeto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos os projetos</SelectItem>
                  <SelectItem value="SEM_PROJETO">Sem projeto vinculado</SelectItem>
                  {projetos.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filtroParceiro} onValueChange={setFiltroParceiro}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Parceiro" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos os parceiros</SelectItem>
                  {parceirosLista
                    .sort((a, b) => a.nome.localeCompare(b.nome))
                    .map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>
            <DashboardPeriodFilterBar
              value={periodFilter}
              onChange={handlePeriodChange}
              customRange={periodFilter === "custom" && dataInicio && dataFim ? { start: dataInicio, end: dataFim } : undefined}
              onCustomRangeChange={handleCustomRangeChange}
              size="sm"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : transacoesFiltradas.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhuma transação encontrada no período</p>
          </div>
        ) : (
          <div className="space-y-3">
            <ScrollArea className="h-[500px]">
              <div className="space-y-2 pr-4">
                {pagination.paginatedItems.map((transacao) => (
                  <div key={transacao.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4 flex-1">
                  <Badge className={getTipoColor(transacao.tipo_transacao, transacao)}>
                    {getTipoLabel(transacao.tipo_transacao, transacao)}
                  </Badge>
                  <div className="flex items-center gap-2 flex-1">
                    {transacao.tipo_transacao === "SAQUE" ? (
                      <>
                        <div className="flex items-center gap-2">
                          {transacao.origem_bookmaker_id && bookmakers[transacao.origem_bookmaker_id] && (
                            <>
                              {(() => {
                                const bookmakerNome = bookmakers[transacao.origem_bookmaker_id]?.nome;
                                const logoUrl = getLogoUrl(bookmakerNome || '');
                                return logoUrl ? (
                                  <img src={logoUrl} alt={bookmakerNome} className="h-5 w-5 rounded object-contain bg-background" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                ) : (
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                );
                              })()}
                              <div className="flex flex-col">
                                <span className="text-sm text-muted-foreground">{bookmakers[transacao.origem_bookmaker_id]?.nome || 'Bookmaker'}</span>
                                {(() => {
                                  const origemInfo = getOrigemInfo ? getOrigemInfo(transacao) : null;
                                  return origemInfo?.secondary && (
                                    <span className="text-xs text-muted-foreground/70">{origemInfo.secondary}</span>
                                  );
                                })()}
                              </div>
                            </>
                          )}
                        </div>
                        <ArrowRight className="h-4 w-4 text-primary" />
                        <div className="flex items-center gap-2">
                          <Wallet className="h-4 w-4 text-muted-foreground" />
                          {(() => {
                            const destinoInfo = getDestinoInfo ? getDestinoInfo(transacao) : null;
                            const walletName = transacao.destino_wallet_id 
                              ? walletsDetalhes.find(w => w.id === transacao.destino_wallet_id)?.exchange || 'Wallet' 
                              : transacao.destino_conta_bancaria_id 
                                ? contasBancarias.find(c => c.id === transacao.destino_conta_bancaria_id)?.banco || 'Conta' 
                                : 'Destino';
                            return (
                              <div className="flex flex-col">
                                <span className="text-sm text-muted-foreground">{walletName}</span>
                                {destinoInfo?.secondary && (
                                  <span className="text-xs text-muted-foreground/70">{destinoInfo.secondary}</span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </>
                    ) : transacao.tipo_transacao === "DEPOSITO" ? (
                      <>
                        {/* Origem para depósito */}
                        <div className="flex items-center gap-2">
                          {transacao.origem_wallet_id ? (
                            <Wallet className="h-4 w-4 text-muted-foreground" />
                          ) : transacao.origem_conta_bancaria_id ? (
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          ) : null}
                          {(() => {
                            const origemInfo = getOrigemInfo ? getOrigemInfo(transacao) : { primary: getOrigemLabel(transacao) };
                            return (
                              <div className="flex flex-col">
                                <span className="text-sm text-muted-foreground">{origemInfo.primary}</span>
                                {origemInfo.secondary && (
                                  <span className="text-xs text-muted-foreground/70">{origemInfo.secondary}</span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        <ArrowRight className="h-4 w-4 text-primary" />
                        {/* Destino com logo da bookmaker */}
                        <div className="flex items-center gap-2">
                          {transacao.destino_bookmaker_id && bookmakers[transacao.destino_bookmaker_id] && (
                            <>
                              {(() => {
                                const bookmakerNome = bookmakers[transacao.destino_bookmaker_id]?.nome;
                                const logoUrl = getLogoUrl(bookmakerNome || '');
                                return logoUrl ? (
                                  <img src={logoUrl} alt={bookmakerNome} className="h-5 w-5 rounded object-contain bg-background" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                ) : (
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                );
                              })()}
                              <div className="flex flex-col">
                                <span className="text-sm text-muted-foreground">{bookmakers[transacao.destino_bookmaker_id]?.nome || 'Bookmaker'}</span>
                                {(() => {
                                  const destinoInfo = getDestinoInfo ? getDestinoInfo(transacao) : null;
                                  return destinoInfo?.secondary && (
                                    <span className="text-xs text-muted-foreground/70">{destinoInfo.secondary}</span>
                                  );
                                })()}
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Origem com nome secundário e possível logo */}
                        {(() => {
                          const origemInfo = getOrigemInfo ? getOrigemInfo(transacao) : { primary: getOrigemLabel(transacao) };
                          const isBookmaker = transacao.origem_tipo === "BOOKMAKER" && transacao.origem_bookmaker_id;
                          const bookmakerNome = isBookmaker ? bookmakers[transacao.origem_bookmaker_id]?.nome : null;
                          const logoUrl = isBookmaker ? getLogoUrl(bookmakerNome || '') : null;
                          return (
                            <div className="flex items-center gap-2">
                              {logoUrl && (
                                <img src={logoUrl} alt={bookmakerNome || ''} className="h-5 w-5 rounded object-contain bg-background" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                              )}
                              <div className="flex flex-col">
                                <span className="text-sm text-muted-foreground">{origemInfo.primary}</span>
                                {origemInfo.secondary && (
                                  <span className="text-xs text-muted-foreground/70">{origemInfo.secondary}</span>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        <ArrowRight className="h-4 w-4 text-primary flex-shrink-0" />
                        {/* Destino com nome secundário e possível logo */}
                        {(() => {
                          const destinoInfo = getDestinoInfo ? getDestinoInfo(transacao) : { primary: getDestinoLabel(transacao) };
                          const isBookmaker = transacao.destino_tipo === "BOOKMAKER" && transacao.destino_bookmaker_id;
                          const bookmakerNome = isBookmaker ? bookmakers[transacao.destino_bookmaker_id]?.nome : null;
                          const logoUrl = isBookmaker ? getLogoUrl(bookmakerNome || '') : null;
                          return (
                            <div className="flex items-center gap-2">
                              {logoUrl && (
                                <img src={logoUrl} alt={bookmakerNome || ''} className="h-5 w-5 rounded object-contain bg-background" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                              )}
                              <div className="flex flex-col">
                                <span className="text-sm text-muted-foreground">{destinoInfo.primary}</span>
                                {destinoInfo.secondary && (
                                  <span className="text-xs text-muted-foreground/70">{destinoInfo.secondary}</span>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        {transacao.descricao && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <button className="p-1 hover:bg-muted rounded-md"><Info className="h-4 w-4 text-muted-foreground" /></button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader><DialogTitle>Detalhes</DialogTitle></DialogHeader>
                              <p className="text-sm text-muted-foreground">{transacao.descricao}</p>
                            </DialogContent>
                          </Dialog>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    {transacao.tipo_moeda === "CRYPTO" ? (
                      <div className="flex flex-col items-end">
                        <div className="font-medium text-blue-400">${transacao.valor_usd?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0.00'} USD</div>
                        <div className="text-xs text-muted-foreground">{transacao.qtd_coin} {transacao.coin}</div>
                      </div>
                    ) : (
                      <div className="font-medium">{formatCurrency(transacao.valor, transacao.moeda)}</div>
                    )}
                  </div>
                  {transacao.tipo_transacao === "SAQUE" && transacao.status !== "CONFIRMADO" && getStatusBadge(transacao.status)}
                  {transacao.tipo_transacao === "SAQUE" && transacao.status === "PENDENTE" && onConfirmarSaque && (
                    <Button size="sm" variant="outline" onClick={() => onConfirmarSaque(transacao)} className="h-7 px-2 text-xs border-emerald-500/30 text-emerald-400">
                      <CheckCircle2 className="h-3 w-3 mr-1" />Atualizar Status
                    </Button>
                  )}
                  <div className="text-right min-w-[100px]">
                    {/* Para saques confirmados, mostrar data de solicitação e confirmação */}
                    {transacao.tipo_transacao === "SAQUE" && transacao.status === "CONFIRMADO" && transacao.data_confirmacao ? (
                      <div className="space-y-0.5">
                        <div className="text-xs text-muted-foreground">
                          Solicitado: {format(parseLocalDateTime(transacao.data_transacao), "dd/MM")}
                        </div>
                        <div className="text-sm font-medium text-emerald-400">
                          Recebido: {format(parseLocalDateTime(transacao.data_confirmacao), "dd/MM")}
                        </div>
                        {/* Lead time em dias */}
                        {(() => {
                          const solicitacao = parseLocalDateTime(transacao.data_transacao);
                          const confirmacao = parseLocalDateTime(transacao.data_confirmacao);
                          const diffMs = confirmacao.getTime() - solicitacao.getTime();
                          const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));
                          if (diffDias > 0) {
                            return (
                              <div className="text-[10px] text-muted-foreground">
                                {diffDias} {diffDias === 1 ? 'dia' : 'dias'} de espera
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    ) : (
                      <>
                        <div className="text-sm font-medium">{format(parseLocalDateTime(transacao.data_transacao), "dd/MM/yyyy")}</div>
                        <div className="text-xs text-muted-foreground">{format(parseLocalDateTime(transacao.data_transacao), "HH:mm")}</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
              </div>
            </ScrollArea>
            
            {/* Paginação */}
            {pagination.totalPages > 1 && (
              <SimplePagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                startIndex={pagination.startIndex}
                endIndex={pagination.endIndex}
                hasNextPage={pagination.hasNextPage}
                hasPrevPage={pagination.hasPrevPage}
                onNextPage={pagination.goToNextPage}
                onPrevPage={pagination.goToPrevPage}
                onFirstPage={pagination.goToFirstPage}
                onLastPage={pagination.goToLastPage}
                className="pt-3 border-t border-border/50"
              />
            )}
          </div>
        )}
      </CardContent>
    </>
  );
}
