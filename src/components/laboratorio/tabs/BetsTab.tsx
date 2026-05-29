import { useState, useMemo } from "react";
import { RawBet, Resultado, ODD_RANGES } from "@/hooks/useValueBetLabData";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { Search, ChevronLeft, ChevronRight, Filter } from "lucide-react";

interface BetsTabProps {
  bets: RawBet[];
}

const PAGE_SIZE = 50;

export function BetsTab({ bets }: BetsTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMarket, setFilterMarket] = useState("all");
  const [filterResult, setFilterResult] = useState("all");
  const [filterRange, setFilterRange] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  const markets = useMemo(() => Array.from(new Set(bets.map(b => b.mercado || 'Outros'))).sort(), [bets]);

  const filteredBets = useMemo(() => {
    return bets.filter(bet => {
      const matchesSearch = searchTerm === "" || 
        bet.evento?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        bet.selecao?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesMarket = filterMarket === "all" || (bet.mercado || 'Outros') === filterMarket;
      const matchesResult = filterResult === "all" || bet.resultado === filterResult;
      
      const matchesRange = filterRange === "all" || (() => {
        const range = ODD_RANGES.find(r => bet.odd && bet.odd >= r.min && bet.odd <= r.max);
        return range?.label === filterRange;
      })();

      return matchesSearch && matchesMarket && matchesResult && matchesRange;
    });
  }, [bets, searchTerm, filterMarket, filterResult, filterRange]);

  const totals = useMemo(() => {
    const stake = filteredBets.reduce((acc, b) => acc + (b.stake_consolidado || 0), 0);
    const profit = filteredBets.reduce((acc, b) => acc + (b.pl_consolidado || 0), 0);
    const roi = stake > 0 ? (profit / stake) * 100 : 0;
    return { stake, profit, roi };
  }, [filteredBets]);

  const paginatedBets = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredBets.slice(start, start + PAGE_SIZE);
  }, [filteredBets, currentPage]);

  const totalPages = Math.ceil(filteredBets.length / PAGE_SIZE);

  const getResultColor = (res: Resultado | null) => {
    switch(res) {
      case 'GREEN': return "bg-green-500/20 text-green-500 border-green-500/30";
      case 'MEIO_GREEN': return "bg-teal-500/20 text-teal-400 border-teal-500/30";
      case 'MEIO_RED': return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case 'RED': return "bg-red-500/20 text-red-500 border-red-500/30";
      default: return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Totais Dinâmicos */}
      <div className="flex gap-4">
        <div className="bg-card/40 border border-border/40 px-6 py-3 rounded-xl">
          <p className="text-[10px] font-bold text-muted-foreground uppercase">Stake Filtrada</p>
          <p className="text-lg font-black tabular-nums">R$ {totals.stake.toLocaleString('pt-BR')}</p>
        </div>
        <div className="bg-card/40 border border-border/40 px-6 py-3 rounded-xl">
          <p className="text-[10px] font-bold text-muted-foreground uppercase">Lucro Filtrado</p>
          <p className={cn("text-lg font-black tabular-nums", totals.profit >= 0 ? "text-green-500" : "text-red-500")}>
            R$ {totals.profit.toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="bg-card/40 border border-border/40 px-6 py-3 rounded-xl">
          <p className="text-[10px] font-bold text-muted-foreground uppercase">ROI Filtrado</p>
          <p className={cn("text-lg font-black tabular-nums", totals.roi >= 0 ? "text-green-400" : "text-red-400")}>
            {totals.roi.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-muted/20 p-4 rounded-xl border border-border/20">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Evento ou Seleção..." 
            className="pl-10 bg-card border-border/40"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filterMarket} onValueChange={setFilterMarket}>
          <SelectTrigger className="bg-card border-border/40">
            <SelectValue placeholder="Mercado" />
          </SelectTrigger>
          <SelectContent className="bg-card">
            <SelectItem value="all">Todos os Mercados</SelectItem>
            {markets.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterResult} onValueChange={setFilterResult}>
          <SelectTrigger className="bg-card border-border/40">
            <SelectValue placeholder="Resultado" />
          </SelectTrigger>
          <SelectContent className="bg-card">
            <SelectItem value="all">Todos os Resultados</SelectItem>
            <SelectItem value="GREEN">GREEN</SelectItem>
            <SelectItem value="MEIO_GREEN">MEIO GREEN</SelectItem>
            <SelectItem value="MEIO_RED">MEIO RED</SelectItem>
            <SelectItem value="RED">RED</SelectItem>
            <SelectItem value="VOID">VOID</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterRange} onValueChange={setFilterRange}>
          <SelectTrigger className="bg-card border-border/40">
            <SelectValue placeholder="Faixa de Odd" />
          </SelectTrigger>
          <SelectContent className="bg-card">
            <SelectItem value="all">Todas as Faixas</SelectItem>
            {ODD_RANGES.map(r => <SelectItem key={r.label} value={r.label}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="bg-card/40 border border-border/40 rounded-xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider">Data</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider">Esporte / Mercado</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider">Evento / Seleção</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">Odd</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">Stake</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">Lucro</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider text-center">Res</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedBets.map((bet) => (
              <TableRow key={bet.id} className="group hover:bg-muted/20 transition-colors">
                <TableCell className="text-[11px] text-muted-foreground tabular-nums">
                  {format(parseISO(bet.data_aposta), 'dd/MM/yy HH:mm')}
                </TableCell>
                <TableCell className="space-y-0.5">
                  <p className="text-[10px] font-bold text-primary uppercase">{bet.esporte}</p>
                  <p className="text-xs font-medium text-foreground">{bet.mercado}</p>
                </TableCell>
                <TableCell className="space-y-0.5">
                  <p className="text-xs font-bold text-foreground truncate max-w-[250px]">{bet.evento}</p>
                  <p className="text-[11px] text-muted-foreground italic">{bet.selecao}</p>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-black tabular-nums">{bet.odd?.toFixed(2)}</span>
                    <span className="text-[9px] text-muted-foreground uppercase font-bold">
                      {ODD_RANGES.find(r => bet.odd && bet.odd >= r.min && bet.odd <= r.max)?.label || 'Outras'}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs">
                  R$ {bet.stake_consolidado?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className={cn(
                  "text-right tabular-nums font-bold text-xs",
                  (bet.pl_consolidado || 0) >= 0 ? "text-green-500" : "text-red-500"
                )}>
                  R$ {bet.pl_consolidado?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className={cn("text-[10px] font-black h-5 px-1.5", getResultColor(bet.resultado))}>
                    {bet.resultado?.replace('MEIO_', '1/2 ')}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border/40 flex items-center justify-between bg-muted/10">
            <p className="text-xs text-muted-foreground">
              Mostrando {paginatedBets.length} de {filteredBets.length} apostas
            </p>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-bold px-4">Página {currentPage} de {totalPages}</span>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}