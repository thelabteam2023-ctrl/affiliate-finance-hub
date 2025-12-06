import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Filter, Calendar, ArrowRight, AlertCircle, Info, Clock, CheckCircle2, XCircle } from "lucide-react";
import { format, subDays, startOfDay, endOfDay, isToday } from "date-fns";

// Helper para renderizar badge de status
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

interface HistoricoMovimentacoesProps {
  transacoes: any[];
  parceiros: { [key: string]: string };
  contas: { [key: string]: string };
  contasBancarias: ContaBancaria[];
  wallets: { [key: string]: string };
  walletsDetalhes: WalletDetalhe[];
  bookmakers: { [key: string]: { nome: string; status: string } };
  loading: boolean;
  filtroTipo: string;
  setFiltroTipo: (tipo: string) => void;
  dataInicio: Date | undefined;
  setDataInicio: (date: Date | undefined) => void;
  dataFim: Date | undefined;
  setDataFim: (date: Date | undefined) => void;
  getTransacoesFiltradas: () => any[];
  getTipoLabel: (tipo: string, transacao?: any) => string;
  getTipoColor: (tipo: string, transacao?: any) => string;
  getOrigemLabel: (transacao: any) => string;
  getDestinoLabel: (transacao: any) => string;
  formatCurrency: (value: number, currency: string) => string;
  onConfirmarSaque?: (transacao: any) => void;
}

export function HistoricoMovimentacoes({
  loading,
  filtroTipo,
  setFiltroTipo,
  dataInicio,
  setDataInicio,
  dataFim,
  setDataFim,
  getTransacoesFiltradas,
  getTipoLabel,
  getTipoColor,
  getOrigemLabel,
  getDestinoLabel,
  formatCurrency,
  contasBancarias,
  parceiros,
  walletsDetalhes,
  bookmakers,
  onConfirmarSaque,
}: HistoricoMovimentacoesProps) {
  const handlePeriodoRapido = (dias: number | null) => {
    if (dias === null) {
      // Todo o período - remove os filtros de data
      setDataInicio(undefined);
      setDataFim(undefined);
    } else if (dias === 0) {
      // Hoje - define início e fim como hoje
      setDataInicio(startOfDay(new Date()));
      setDataFim(endOfDay(new Date()));
    } else {
      // Define o período baseado nos dias
      setDataInicio(subDays(new Date(), dias));
      setDataFim(new Date());
    }
  };

  const getPeriodoAtivo = () => {
    if (!dataInicio && !dataFim) return "todos";
    
    // Check if it's today
    if (dataInicio && dataFim && isToday(dataInicio) && isToday(dataFim)) {
      return "hoje";
    }
    
    const hoje = new Date();
    const diffDays = dataInicio ? Math.floor((hoje.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24)) : null;
    
    if (diffDays === 7) return "7dias";
    if (diffDays === 30) return "30dias";
    return "custom";
  };

  return (
    <>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Histórico de Movimentações</CardTitle>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              {getTransacoesFiltradas().length} transações no período
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-4 mt-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="w-[200px]">
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
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[140px] justify-start text-left">
                    {dataInicio ? format(dataInicio, "dd/MM/yyyy") : "Data início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dataInicio}
                    onSelect={setDataInicio}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              <span className="text-muted-foreground">até</span>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[140px] justify-start text-left">
                    {dataFim ? format(dataFim, "dd/MM/yyyy") : "Data fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dataFim}
                    onSelect={setDataFim}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Pills de Período Rápido */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Período:</span>
            <Button
              variant={getPeriodoAtivo() === "hoje" ? "default" : "outline"}
              size="sm"
              onClick={() => handlePeriodoRapido(0)}
              className="h-7 px-3 text-xs"
            >
              Hoje
            </Button>
            <Button
              variant={getPeriodoAtivo() === "7dias" ? "default" : "outline"}
              size="sm"
              onClick={() => handlePeriodoRapido(7)}
              className="h-7 px-3 text-xs"
            >
              Últimos 7 dias
            </Button>
            <Button
              variant={getPeriodoAtivo() === "30dias" ? "default" : "outline"}
              size="sm"
              onClick={() => handlePeriodoRapido(30)}
              className="h-7 px-3 text-xs"
            >
              Últimos 30 dias
            </Button>
            <Button
              variant={getPeriodoAtivo() === "todos" ? "default" : "outline"}
              size="sm"
              onClick={() => handlePeriodoRapido(null)}
              className="h-7 px-3 text-xs"
            >
              Todo o período
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : getTransacoesFiltradas().length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhuma transação encontrada no período</p>
          </div>
        ) : (
          <div className="space-y-2">
            {getTransacoesFiltradas().map((transacao) => (
              <div
                key={transacao.id}
                className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  <Badge className={getTipoColor(transacao.tipo_transacao, transacao)}>
                    {getTipoLabel(transacao.tipo_transacao, transacao)}
                  </Badge>
                  <div className="flex items-center gap-2 flex-1">
                    <div className="flex items-center gap-2">
                       {transacao.tipo_transacao === "APORTE_FINANCEIRO" && transacao.destino_tipo === "CAIXA_OPERACIONAL" ? (
                        <div className="flex flex-col">
                          <span className="text-sm text-muted-foreground">Investidor</span>
                          <span className="text-xs text-muted-foreground/70">
                            {transacao.nome_investidor?.split(' ').slice(0, 2).join(' ') || 'Não informado'}
                          </span>
                        </div>
                      ) : transacao.origem_tipo === "PARCEIRO_CONTA" && transacao.origem_conta_bancaria_id ? (
                        <div className="flex flex-col">
                          <span className="text-sm text-muted-foreground">
                            {contasBancarias.find(c => c.id === transacao.origem_conta_bancaria_id)?.banco || 'Conta Bancária'}
                          </span>
                          <span className="text-xs text-muted-foreground/70">
                            {contasBancarias.find(c => c.id === transacao.origem_conta_bancaria_id)?.titular || ''}
                          </span>
                        </div>
                      ) : transacao.origem_tipo === "PARCEIRO_WALLET" && transacao.origem_wallet_id ? (
                        <div className="flex flex-col">
                          <span className="text-sm text-muted-foreground">
                            {walletsDetalhes.find(w => w.id === transacao.origem_wallet_id)?.exchange || 'Wallet'}
                          </span>
                          <span className="text-xs text-muted-foreground/70">
                            {parceiros[transacao.origem_parceiro_id!] || ''}
                          </span>
                        </div>
                      ) : transacao.origem_tipo === "BOOKMAKER" && transacao.origem_bookmaker_id ? (
                        <div className="flex flex-col">
                          <span 
                            className={`text-sm text-muted-foreground transition-colors cursor-default ${
                              bookmakers[transacao.origem_bookmaker_id]?.status === "LIMITADA" 
                                ? "hover:text-red-500" 
                                : ""
                            }`}
                            title={bookmakers[transacao.origem_bookmaker_id]?.status === "LIMITADA" 
                              ? "⚠️ Casa limitada - Saque necessário" 
                              : undefined}
                          >
                            {bookmakers[transacao.origem_bookmaker_id]?.nome || 'Bookmaker'}
                          </span>
                          <span className="text-xs text-muted-foreground/70">
                            {parceiros[transacao.origem_parceiro_id!] || ''}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {getOrigemLabel(transacao)}
                        </span>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-primary" />
                    <div className="flex items-center gap-2">
                      {transacao.tipo_transacao === "APORTE_FINANCEIRO" && transacao.origem_tipo === "CAIXA_OPERACIONAL" ? (
                        <div className="flex flex-col">
                          <span className="text-sm text-muted-foreground">Investidor</span>
                          <span className="text-xs text-muted-foreground/70">
                            {transacao.nome_investidor?.split(' ').slice(0, 2).join(' ') || 'Não informado'}
                          </span>
                        </div>
                      ) : transacao.tipo_transacao === "APORTE_FINANCEIRO" && transacao.destino_tipo === "CAIXA_OPERACIONAL" ? (
                        <>
                          <span className="text-sm text-muted-foreground">Caixa Operacional</span>
                          {((transacao.descricao && transacao.descricao.trim() !== '') || transacao.tipo_moeda === "CRYPTO") && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <button className="p-1 hover:bg-muted rounded-md transition-colors">
                                  <Info className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                </button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Detalhes da Transação</DialogTitle>
                                </DialogHeader>
                                <div className="py-4 space-y-4">
                                   {transacao.tipo_moeda === "CRYPTO" && (
                                    <div className="space-y-2 pb-4 border-b border-border/50">
                                      <h4 className="font-medium text-sm">Informações Crypto</h4>
                                      <div className="space-y-1 text-sm">
                                        <p className="text-muted-foreground">
                                          <span className="font-medium">Moeda:</span> {transacao.coin}
                                        </p>
                                        <p className="text-muted-foreground">
                                          <span className="font-medium">Quantidade:</span> {transacao.qtd_coin}
                                        </p>
                                        {transacao.destino_wallet_id && (
                                          <>
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Endereço Destino:</span>{" "}
                                              <span className="font-mono text-xs break-all">
                                                {walletsDetalhes.find(w => w.id === transacao.destino_wallet_id)?.endereco || 'N/A'}
                                              </span>
                                            </p>
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Rede:</span>{" "}
                                              {walletsDetalhes.find(w => w.id === transacao.destino_wallet_id)?.network || 'N/A'}
                                            </p>
                                          </>
                                        )}
                                        <p className="text-muted-foreground">
                                          <span className="font-medium">Valor (USD):</span> ${transacao.valor_usd?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                        <p className="text-muted-foreground">
                                          <span className="font-medium">Cotação (USD):</span> ${transacao.cotacao?.toLocaleString('pt-BR', { minimumFractionDigits: 8, maximumFractionDigits: 8 })}
                                        </p>
                                        <p className="text-xs text-muted-foreground/70 mt-2 pt-2 border-t border-border/30">
                                          Cálculo: {transacao.cotacao?.toFixed(8)} × {transacao.qtd_coin} = ${transacao.valor_usd?.toFixed(2)}
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                  {transacao.descricao && transacao.descricao.trim() !== '' && (
                                    <div className="space-y-2">
                                      <h4 className="font-medium text-sm">Observações</h4>
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{transacao.descricao}</p>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                        </>
                      ) : transacao.destino_tipo === "CAIXA_OPERACIONAL" ? (
                        <>
                          <span className="text-sm text-muted-foreground">Caixa Operacional</span>
                          {((transacao.descricao && transacao.descricao.trim() !== '') || transacao.tipo_moeda === "CRYPTO") && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <button className="p-1 hover:bg-muted rounded-md transition-colors">
                                  <Info className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                </button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Detalhes da Transação</DialogTitle>
                                </DialogHeader>
                                <div className="py-4 space-y-4">
                                   {transacao.tipo_moeda === "CRYPTO" && (
                                    <div className="space-y-2 pb-4 border-b border-border/50">
                                      <h4 className="font-medium text-sm">Informações Crypto</h4>
                                      <div className="space-y-1 text-sm">
                                        <p className="text-muted-foreground">
                                          <span className="font-medium">Moeda:</span> {transacao.coin}
                                        </p>
                                        <p className="text-muted-foreground">
                                          <span className="font-medium">Quantidade:</span> {transacao.qtd_coin}
                                        </p>
                                        {transacao.destino_wallet_id && (
                                          <>
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Endereço Destino:</span>{" "}
                                              <span className="font-mono text-xs break-all">
                                                {walletsDetalhes.find(w => w.id === transacao.destino_wallet_id)?.endereco || 'N/A'}
                                              </span>
                                            </p>
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Rede:</span>{" "}
                                              {walletsDetalhes.find(w => w.id === transacao.destino_wallet_id)?.network || 'N/A'}
                                            </p>
                                          </>
                                        )}
                                        <p className="text-muted-foreground">
                                          <span className="font-medium">Valor (USD):</span> ${transacao.valor_usd?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                        <p className="text-muted-foreground">
                                          <span className="font-medium">Cotação (USD):</span> ${transacao.cotacao?.toLocaleString('pt-BR', { minimumFractionDigits: 8, maximumFractionDigits: 8 })}
                                        </p>
                                        <p className="text-xs text-muted-foreground/70 mt-2 pt-2 border-t border-border/30">
                                          Cálculo: {transacao.cotacao?.toFixed(8)} × {transacao.qtd_coin} = ${transacao.valor_usd?.toFixed(2)}
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                  {transacao.descricao && transacao.descricao.trim() !== '' && (
                                    <div className="space-y-2">
                                      <h4 className="font-medium text-sm">Observações</h4>
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{transacao.descricao}</p>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                        </>
                      ) : (
                        <>
                          {transacao.tipo_transacao === "APORTE_FINANCEIRO" && transacao.origem_tipo === "CAIXA_OPERACIONAL" ? (
                            <div className="flex flex-col">
                              <span className="text-sm text-muted-foreground">Investidor</span>
                              <span className="text-xs text-muted-foreground/70">
                                {transacao.nome_investidor?.split(' ').slice(0, 2).join(' ') || 'Não informado'}
                              </span>
                            </div>
                          ) : transacao.destino_tipo === "PARCEIRO_CONTA" && transacao.destino_conta_bancaria_id ? (
                            <div className="flex flex-col">
                              <span className="text-sm text-muted-foreground">
                                {contasBancarias.find(c => c.id === transacao.destino_conta_bancaria_id)?.banco || 'Conta Bancária'}
                              </span>
                              <span className="text-xs text-muted-foreground/70">
                                {contasBancarias.find(c => c.id === transacao.destino_conta_bancaria_id)?.titular || ''}
                              </span>
                            </div>
                          ) : transacao.destino_tipo === "PARCEIRO_WALLET" && transacao.destino_wallet_id ? (
                            <div className="flex items-center gap-2">
                              <div className="flex flex-col">
                                <span className="text-sm text-muted-foreground">
                                  {walletsDetalhes.find(w => w.id === transacao.destino_wallet_id)?.exchange || 'Wallet'}
                                </span>
                                <span className="text-xs text-muted-foreground/70">
                                  {parceiros[transacao.destino_parceiro_id!] || ''}
                                </span>
                              </div>
                              {((transacao.descricao && transacao.descricao.trim() !== '') || transacao.tipo_moeda === "CRYPTO") && (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <button className="p-1 hover:bg-muted rounded-md transition-colors">
                                      <Info className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                    </button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Detalhes da Transação</DialogTitle>
                                    </DialogHeader>
                                    <div className="py-4 space-y-4">
                                      {transacao.tipo_moeda === "CRYPTO" && (
                                        <div className="space-y-2 pb-4 border-b border-border/50">
                                          <h4 className="font-medium text-sm">Informações Crypto</h4>
                                          <div className="space-y-1 text-sm">
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Moeda:</span> {transacao.coin}
                                            </p>
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Quantidade:</span> {transacao.qtd_coin}
                                            </p>
                                            {transacao.destino_wallet_id && (
                                              <>
                                                <p className="text-muted-foreground">
                                                  <span className="font-medium">Endereço Destino:</span>{" "}
                                                  <span className="font-mono text-xs break-all">
                                                    {walletsDetalhes.find(w => w.id === transacao.destino_wallet_id)?.endereco || 'N/A'}
                                                  </span>
                                                </p>
                                                <p className="text-muted-foreground">
                                                  <span className="font-medium">Rede:</span>{" "}
                                                  {walletsDetalhes.find(w => w.id === transacao.destino_wallet_id)?.network || 'N/A'}
                                                </p>
                                              </>
                                            )}
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Valor (USD):</span> ${transacao.valor_usd?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Cotação (USD):</span> ${transacao.cotacao?.toLocaleString('pt-BR', { minimumFractionDigits: 8, maximumFractionDigits: 8 })}
                                            </p>
                                            <p className="text-xs text-muted-foreground/70 mt-2 pt-2 border-t border-border/30">
                                              Cálculo: {transacao.cotacao?.toFixed(8)} × {transacao.qtd_coin} = ${transacao.valor_usd?.toFixed(2)}
                                            </p>
                                          </div>
                                        </div>
                                      )}
                                      {transacao.descricao && transacao.descricao.trim() !== '' && (
                                        <div className="space-y-2">
                                          <h4 className="font-medium text-sm">Observações</h4>
                                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{transacao.descricao}</p>
                                        </div>
                                      )}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              )}
                            </div>
                          ) : transacao.destino_tipo === "BOOKMAKER" && transacao.destino_bookmaker_id ? (
                            <div className="flex items-center gap-2">
                              <div className="flex flex-col">
                                <span 
                                  className={`text-sm text-muted-foreground transition-colors cursor-default ${
                                    bookmakers[transacao.destino_bookmaker_id]?.status === "LIMITADA" 
                                      ? "hover:text-red-500" 
                                      : ""
                                  }`}
                                  title={bookmakers[transacao.destino_bookmaker_id]?.status === "LIMITADA" 
                                    ? "⚠️ Casa limitada - Saque necessário" 
                                    : undefined}
                                >
                                  {bookmakers[transacao.destino_bookmaker_id]?.nome || 'Bookmaker'}
                                </span>
                                <span className="text-xs text-muted-foreground/70">
                                  {parceiros[transacao.destino_parceiro_id!] || ''}
                                </span>
                              </div>
                              {((transacao.descricao && transacao.descricao.trim() !== '') || transacao.tipo_moeda === "CRYPTO") && (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <button className="p-1 hover:bg-muted rounded-md transition-colors">
                                      <Info className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                    </button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Detalhes da Transação</DialogTitle>
                                    </DialogHeader>
                                    <div className="py-4 space-y-4">
                                      {transacao.tipo_moeda === "CRYPTO" && (
                                        <div className="space-y-2 pb-4 border-b border-border/50">
                                          <h4 className="font-medium text-sm">Informações Crypto</h4>
                                          <div className="space-y-1 text-sm">
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Moeda:</span> {transacao.coin}
                                            </p>
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Quantidade:</span> {transacao.qtd_coin}
                                            </p>
                                            {transacao.destino_wallet_id && (
                                              <>
                                                <p className="text-muted-foreground">
                                                  <span className="font-medium">Endereço Destino:</span>{" "}
                                                  <span className="font-mono text-xs break-all">
                                                    {walletsDetalhes.find(w => w.id === transacao.destino_wallet_id)?.endereco || 'N/A'}
                                                  </span>
                                                </p>
                                                <p className="text-muted-foreground">
                                                  <span className="font-medium">Rede:</span>{" "}
                                                  {walletsDetalhes.find(w => w.id === transacao.destino_wallet_id)?.network || 'N/A'}
                                                </p>
                                              </>
                                            )}
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Valor (USD):</span> ${transacao.valor_usd?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Cotação (USD):</span> ${transacao.cotacao?.toLocaleString('pt-BR', { minimumFractionDigits: 8, maximumFractionDigits: 8 })}
                                            </p>
                                            <p className="text-xs text-muted-foreground/70 mt-2 pt-2 border-t border-border/30">
                                              Cálculo: {transacao.cotacao?.toFixed(8)} × {transacao.qtd_coin} = ${transacao.valor_usd?.toFixed(2)}
                                            </p>
                                          </div>
                                        </div>
                                      )}
                                      {transacao.descricao && transacao.descricao.trim() !== '' && (
                                        <div className="space-y-2">
                                          <h4 className="font-medium text-sm">Observações</h4>
                                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{transacao.descricao}</p>
                                        </div>
                                      )}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              )}
                            </div>
                          ) : transacao.destino_tipo === "PARCEIRO_CONTA" && transacao.destino_conta_bancaria_id ? (
                            <div className="flex items-center gap-2">
                              <div className="flex flex-col">
                                <span className="text-sm text-muted-foreground">
                                  {contasBancarias.find(c => c.id === transacao.destino_conta_bancaria_id)?.banco || 'Conta Bancária'}
                                </span>
                                <span className="text-xs text-muted-foreground/70">
                                  {contasBancarias.find(c => c.id === transacao.destino_conta_bancaria_id)?.titular || ''}
                                </span>
                              </div>
                              {((transacao.descricao && transacao.descricao.trim() !== '') || transacao.tipo_moeda === "CRYPTO") && (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <button className="p-1 hover:bg-muted rounded-md transition-colors">
                                      <Info className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                    </button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Detalhes da Transação</DialogTitle>
                                    </DialogHeader>
                                    <div className="py-4 space-y-4">
                                      {transacao.tipo_moeda === "CRYPTO" && (
                                        <div className="space-y-2 pb-4 border-b border-border/50">
                                          <h4 className="font-medium text-sm">Informações Crypto</h4>
                                          <div className="space-y-1 text-sm">
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Moeda:</span> {transacao.coin}
                                            </p>
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Quantidade:</span> {transacao.qtd_coin}
                                            </p>
                                            {transacao.destino_wallet_id && (
                                              <>
                                                <p className="text-muted-foreground">
                                                  <span className="font-medium">Endereço Destino:</span>{" "}
                                                  <span className="font-mono text-xs break-all">
                                                    {walletsDetalhes.find(w => w.id === transacao.destino_wallet_id)?.endereco || 'N/A'}
                                                  </span>
                                                </p>
                                                <p className="text-muted-foreground">
                                                  <span className="font-medium">Rede:</span>{" "}
                                                  {walletsDetalhes.find(w => w.id === transacao.destino_wallet_id)?.network || 'N/A'}
                                                </p>
                                              </>
                                            )}
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Valor (USD):</span> ${transacao.valor_usd?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Cotação (USD):</span> ${transacao.cotacao?.toLocaleString('pt-BR', { minimumFractionDigits: 8, maximumFractionDigits: 8 })}
                                            </p>
                                            <p className="text-xs text-muted-foreground/70 mt-2 pt-2 border-t border-border/30">
                                              Cálculo: {transacao.cotacao?.toFixed(8)} × {transacao.qtd_coin} = ${transacao.valor_usd?.toFixed(2)}
                                            </p>
                                          </div>
                                        </div>
                                      )}
                                      {transacao.descricao && transacao.descricao.trim() !== '' && (
                                        <div className="space-y-2">
                                          <h4 className="font-medium text-sm">Observações</h4>
                                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{transacao.descricao}</p>
                                        </div>
                                      )}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              )}
                            </div>
                          ) : (
                            <>
                              <span className="text-sm text-muted-foreground">
                                {getDestinoLabel(transacao)}
                              </span>
                              {((transacao.descricao && transacao.descricao.trim() !== '') || transacao.tipo_moeda === "CRYPTO") && (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <button className="p-1 hover:bg-muted rounded-md transition-colors">
                                      <Info className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                    </button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Detalhes da Transação</DialogTitle>
                                    </DialogHeader>
                                    <div className="py-4 space-y-4">
                                      {transacao.tipo_moeda === "CRYPTO" && (
                                        <div className="space-y-2 pb-4 border-b border-border/50">
                                          <h4 className="font-medium text-sm">Informações Crypto</h4>
                                          <div className="space-y-1 text-sm">
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Moeda:</span> {transacao.coin}
                                            </p>
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Quantidade:</span> {transacao.qtd_coin}
                                            </p>
                                            {transacao.destino_wallet_id && (
                                              <>
                                                <p className="text-muted-foreground">
                                                  <span className="font-medium">Endereço Destino:</span>{" "}
                                                  <span className="font-mono text-xs break-all">
                                                    {walletsDetalhes.find(w => w.id === transacao.destino_wallet_id)?.endereco || 'N/A'}
                                                  </span>
                                                </p>
                                                <p className="text-muted-foreground">
                                                  <span className="font-medium">Rede:</span>{" "}
                                                  {walletsDetalhes.find(w => w.id === transacao.destino_wallet_id)?.network || 'N/A'}
                                                </p>
                                              </>
                                            )}
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Valor (USD):</span> ${transacao.valor_usd?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-muted-foreground">
                                              <span className="font-medium">Cotação (USD):</span> ${transacao.cotacao?.toLocaleString('pt-BR', { minimumFractionDigits: 8, maximumFractionDigits: 8 })}
                                            </p>
                                            <p className="text-xs text-muted-foreground/70 mt-2 pt-2 border-t border-border/30">
                                              Cálculo: {transacao.cotacao?.toFixed(8)} × {transacao.qtd_coin} = ${transacao.valor_usd?.toFixed(2)}
                                            </p>
                                          </div>
                                        </div>
                                      )}
                                      {transacao.descricao && transacao.descricao.trim() !== '' && (
                                        <div className="space-y-2">
                                          <h4 className="font-medium text-sm">Observações</h4>
                                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{transacao.descricao}</p>
                                        </div>
                                      )}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-medium">
                    {transacao.tipo_moeda === "FIAT"
                      ? formatCurrency(transacao.valor, transacao.moeda)
                      : `${transacao.qtd_coin} ${transacao.coin}`}
                  </div>
                  {/* Status Badge para SAQUE */}
                  {transacao.tipo_transacao === "SAQUE" && transacao.status && transacao.status !== "CONFIRMADO" && (
                    getStatusBadge(transacao.status)
                  )}
                  {/* Botão de ação para saques pendentes */}
                  {transacao.tipo_transacao === "SAQUE" && transacao.status === "PENDENTE" && onConfirmarSaque && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onConfirmarSaque(transacao)}
                      className="h-7 px-2 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Confirmar
                    </Button>
                  )}
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {format(new Date(transacao.data_transacao), "dd/MM/yyyy")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(transacao.data_transacao), "HH:mm")}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </>
  );
}
