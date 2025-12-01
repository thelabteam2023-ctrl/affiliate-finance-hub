import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Filter, Calendar, ArrowRight, AlertCircle, Info } from "lucide-react";
import { format, subDays } from "date-fns";

interface HistoricoMovimentacoesProps {
  transacoes: any[];
  parceiros: { [key: string]: string };
  contas: { [key: string]: string };
  wallets: { [key: string]: string };
  bookmakers: { [key: string]: string };
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
}: HistoricoMovimentacoesProps) {
  const handlePeriodoRapido = (dias: number | null) => {
    if (dias === null) {
      // Todo o período - remove os filtros de data
      setDataInicio(undefined);
      setDataFim(undefined);
    } else {
      // Define o período baseado nos dias
      setDataInicio(subDays(new Date(), dias));
      setDataFim(new Date());
    }
  };

  const getPeriodoAtivo = () => {
    if (!dataInicio && !dataFim) return "todos";
    
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
                  <SelectItem value="APORTE_FINANCEIRO">Aporte & Liquidação</SelectItem>
                  <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
                  <SelectItem value="DEPOSITO">Depósito</SelectItem>
                  <SelectItem value="SAQUE">Saque</SelectItem>
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
                    <span className="text-sm text-muted-foreground">
                      {getOrigemLabel(transacao)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-primary" />
                    <span className="text-sm text-muted-foreground">
                      {getDestinoLabel(transacao)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="font-medium">
                    {transacao.tipo_moeda === "FIAT"
                      ? formatCurrency(transacao.valor, transacao.moeda)
                      : `${transacao.qtd_coin} ${transacao.coin}`}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {format(new Date(transacao.data_transacao), "dd/MM/yyyy")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(transacao.data_transacao), "HH:mm")}
                    </div>
                  </div>
                  {transacao.descricao && transacao.descricao.trim() !== '' && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button className="p-1 hover:bg-muted rounded-md transition-colors">
                            <Info className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs">
                          <p className="text-sm whitespace-pre-wrap">{transacao.descricao}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </>
  );
}
