import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Filter, Calendar, ArrowRight, AlertCircle } from "lucide-react";
import { format } from "date-fns";

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
  getTipoLabel: (tipo: string) => string;
  getTipoColor: (tipo: string) => string;
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
        <div className="flex items-center gap-4 mt-4">
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
                  <Badge className={getTipoColor(transacao.tipo_transacao)}>
                    {getTipoLabel(transacao.tipo_transacao)}
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
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </>
  );
}
