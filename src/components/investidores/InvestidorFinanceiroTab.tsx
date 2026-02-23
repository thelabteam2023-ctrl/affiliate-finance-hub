import { useState, useEffect } from "react";
import { format } from "date-fns";
import { parseLocalDateTime } from "@/utils/dateUtils";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Download, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface InvestidorFinanceiroTabProps {
  investidorId: string;
  investidorNome: string;
}

interface Transacao {
  id: string;
  data_transacao: string;
  tipo_transacao: string;
  tipo_moeda: string;
  moeda: string;
  coin?: string;
  valor: number;
  valor_usd?: number;
  cotacao?: number;
  descricao?: string;
  origem_tipo?: string;
  destino_tipo?: string;
}

const formatCurrency = (value: number, currency: "BRL" | "USD" = "BRL") => {
  return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  }).format(value);
};

export function InvestidorFinanceiroTab({
  investidorId,
  investidorNome,
}: InvestidorFinanceiroTabProps) {
  const [loading, setLoading] = useState(false);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
  const [dataInicio, setDataInicio] = useState<Date | undefined>(undefined);
  const [dataFim, setDataFim] = useState<Date | undefined>(undefined);

  const fetchTransacoes = async () => {
    if (!investidorId) return;

    setLoading(true);
    try {
      let query = supabase
        .from("cash_ledger")
        .select("*")
        .eq("investidor_id", investidorId)
        .order("data_transacao", { ascending: false });

      if (dataInicio) {
        query = query.gte("data_transacao", dataInicio.toISOString());
      }
      if (dataFim) {
        query = query.lte("data_transacao", dataFim.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      let filtered = data || [];
      
      if (tipoFiltro !== "todos") {
        if (tipoFiltro === "APORTE") {
          filtered = filtered.filter(
            (t) => t.tipo_transacao === "APORTE_FINANCEIRO" && t.destino_tipo === "CAIXA_OPERACIONAL"
          );
        } else if (tipoFiltro === "LIQUIDACAO") {
          filtered = filtered.filter(
            (t) => t.tipo_transacao === "APORTE_FINANCEIRO" && t.origem_tipo === "CAIXA_OPERACIONAL"
          );
        }
      }

      setTransacoes(filtered);
    } catch (error: any) {
      toast.error("Erro ao carregar extrato", { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (investidorId) {
      fetchTransacoes();
    }
  }, [investidorId, tipoFiltro, dataInicio, dataFim]);

  const getTipoLabel = (transacao: Transacao) => {
    if (transacao.tipo_transacao === "APORTE_FINANCEIRO") {
      if (transacao.destino_tipo === "CAIXA_OPERACIONAL") {
        return { label: "Aporte", color: "text-emerald-500", icon: TrendingUp };
      } else {
        return { label: "Liquidação", color: "text-blue-500", icon: TrendingDown };
      }
    }
    return { label: transacao.tipo_transacao, color: "text-muted-foreground", icon: TrendingUp };
  };

  const exportCSV = () => {
    const headers = ["Data", "Tipo", "Moeda", "Valor", "Valor USD", "Cotação", "Descrição"];
    const rows = transacoes.map((t) => {
      const tipo = getTipoLabel(t);
      return [
        format(parseLocalDateTime(t.data_transacao), "dd/MM/yyyy HH:mm"),
        tipo.label,
        t.tipo_moeda === "CRYPTO" ? t.coin : t.moeda,
        t.valor.toString(),
        t.valor_usd?.toString() || "",
        t.cotacao?.toString() || "",
        t.descricao || "",
      ].join(";");
    });

    const csv = [headers.join(";"), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `extrato_${investidorNome.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd")}.csv`;
    link.click();
  };

  // Calculate totals
  const totais = transacoes.reduce(
    (acc, t) => {
      const tipo = getTipoLabel(t);
      if (tipo.label === "Aporte") {
        if (t.tipo_moeda === "FIAT") {
          acc.aportesFiat += t.valor;
        } else {
          acc.aportesCrypto += t.valor_usd || 0;
        }
      } else if (tipo.label === "Liquidação") {
        if (t.tipo_moeda === "FIAT") {
          acc.liquidacoesFiat += t.valor;
        } else {
          acc.liquidacoesCrypto += t.valor_usd || 0;
        }
      }
      return acc;
    },
    { aportesFiat: 0, liquidacoesFiat: 0, aportesCrypto: 0, liquidacoesCrypto: 0 }
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 pb-3 border-b border-border/50">
        <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="APORTE">Aportes</SelectItem>
            <SelectItem value="LIQUIDACAO">Liquidações</SelectItem>
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("w-[120px] justify-start text-left font-normal", !dataInicio && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-3 w-3" />
              {dataInicio ? format(dataInicio, "dd/MM/yy") : "Início"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dataInicio} onSelect={setDataInicio} locale={ptBR} />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("w-[120px] justify-start text-left font-normal", !dataFim && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-3 w-3" />
              {dataFim ? format(dataFim, "dd/MM/yy") : "Fim"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dataFim} onSelect={setDataFim} locale={ptBR} />
          </PopoverContent>
        </Popover>

        {(dataInicio || dataFim) && (
          <Button variant="ghost" size="sm" onClick={() => { setDataInicio(undefined); setDataFim(undefined); }}>
            Limpar
          </Button>
        )}

        <div className="flex-1" />

        <Button variant="outline" size="sm" onClick={exportCSV} disabled={transacoes.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1" />
          CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-[10px] text-muted-foreground uppercase">Aportes FIAT</p>
          <p className="text-base font-bold font-mono text-emerald-500">{formatCurrency(totais.aportesFiat, "BRL")}</p>
        </div>
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <p className="text-[10px] text-muted-foreground uppercase">Liquidações FIAT</p>
          <p className="text-base font-bold font-mono text-blue-500">{formatCurrency(totais.liquidacoesFiat, "BRL")}</p>
        </div>
        <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
          <p className="text-[10px] text-muted-foreground uppercase">Aportes Crypto</p>
          <p className="text-base font-bold font-mono text-violet-500">{formatCurrency(totais.aportesCrypto, "USD")}</p>
        </div>
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-[10px] text-muted-foreground uppercase">Liquidações Crypto</p>
          <p className="text-base font-bold font-mono text-amber-500">{formatCurrency(totais.liquidacoesCrypto, "USD")}</p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="max-h-[300px] overflow-auto rounded-md border">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
        ) : transacoes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma transação encontrada</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Data</TableHead>
                <TableHead className="w-[90px]">Tipo</TableHead>
                <TableHead className="w-[70px]">Moeda</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">USD</TableHead>
                <TableHead>Descrição</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transacoes.map((t) => {
                const tipo = getTipoLabel(t);
                const Icon = tipo.icon;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-[11px]">
                      {format(parseLocalDateTime(t.data_transacao), "dd/MM/yy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Icon className={cn("h-3 w-3", tipo.color)} />
                        <span className={cn("text-[11px] font-medium", tipo.color)}>{tipo.label}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[9px] px-1.5">
                        {t.tipo_moeda === "CRYPTO" ? t.coin : t.moeda}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-[11px]">
                      {t.tipo_moeda === "CRYPTO" 
                        ? `${t.valor.toFixed(4)} ${t.coin}`
                        : formatCurrency(t.valor, t.moeda as "BRL" | "USD")
                      }
                    </TableCell>
                    <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                      {t.valor_usd ? formatCurrency(t.valor_usd, "USD") : "—"}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground max-w-[120px] truncate">
                      {t.descricao || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground">
        {transacoes.length} transação(ões) encontrada(s)
      </div>
    </div>
  );
}
