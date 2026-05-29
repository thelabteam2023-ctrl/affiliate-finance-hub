import { useState, useMemo } from "react";
import { MarketStats, ODD_RANGES } from "@/hooks/useValueBetLabData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface OddRangesTabProps {
  markets: Record<string, MarketStats>;
}

export function OddRangesTab({ markets }: OddRangesTabProps) {
  const [selectedMarket, setSelectedMarket] = useState<string>("all");
  const marketNames = Object.keys(markets).sort();

  const data = useMemo(() => {
    const combined: Record<string, any> = {};
    
    // Initialize ranges
    ODD_RANGES.forEach(r => {
      combined[r.label] = { total: 0, validas: 0, stake: 0, profit: 0, greens: 0, reds: 0 };
    });
    combined['Outras'] = { total: 0, validas: 0, stake: 0, profit: 0, greens: 0, reds: 0 };
    combined['N/A'] = { total: 0, validas: 0, stake: 0, profit: 0, greens: 0, reds: 0 };

    if (selectedMarket === "all") {
      Object.values(markets).forEach(m => {
        Object.entries(m.oddRanges).forEach(([label, metrics]) => {
          if (!combined[label]) combined[label] = { total: 0, validas: 0, stake: 0, profit: 0, greens: 0, reds: 0 };
          combined[label].total += metrics.total;
          combined[label].validas += metrics.validas;
          combined[label].stake += metrics.stake;
          combined[label].profit += metrics.profit;
          combined[label].greens += metrics.greens;
          combined[label].reds += metrics.reds;
        });
      });
    } else if (markets[selectedMarket]) {
      Object.entries(markets[selectedMarket].oddRanges).forEach(([label, metrics]) => {
        combined[label] = { ...metrics };
      });
    }

    return Object.entries(combined).map(([label, metrics]) => ({
      label,
      ...metrics,
      roi: metrics.stake > 0 ? (metrics.profit / metrics.stake) * 100 : 0,
      winRate: metrics.validas > 0 ? ((metrics.greens + metrics.meioGreens * 0.5 || 0) / metrics.validas) * 100 : 0,
    })).filter(r => r.total > 0);
  }, [markets, selectedMarket]);

  const bestRange = useMemo(() => {
    return data
      .filter(r => r.total >= 3)
      .sort((a, b) => b.roi - a.roi)[0];
  }, [data]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Segmentação por Faixa de Odd</h2>
          <p className="text-xs text-muted-foreground">Identifique o intervalo de cotação com melhor performance.</p>
        </div>
        <Select value={selectedMarket} onValueChange={setSelectedMarket}>
          <SelectTrigger className="w-[250px] bg-card/50">
            <SelectValue placeholder="Selecione um mercado" />
          </SelectTrigger>
          <SelectContent className="bg-card">
            <SelectItem value="all">Todos os Mercados</SelectItem>
            {marketNames.map(name => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table area */}
        <Card className="lg:col-span-2 bg-card/40 border-border/40 overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider">Faixa</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-center">Apostas</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">Stake</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">Lucro</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">ROI</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">Win Rate</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-center">G / R</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.label} className="group hover:bg-muted/20 transition-colors">
                  <TableCell className="font-bold flex items-center gap-2">
                    {row.label}
                    {bestRange && row.label === bestRange.label && (
                      <Badge className="bg-green-500 hover:bg-green-600 text-[9px] font-black h-4 px-1 leading-none uppercase">Melhor</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center font-medium">{row.total}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    R$ {row.stake.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums font-bold", row.profit >= 0 ? "text-green-500" : "text-red-500")}>
                    R$ {row.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums font-black", row.roi >= 0 ? "text-green-400" : "text-red-400")}>
                    {row.roi.toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {row.winRate.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-1">
                      <span className="text-green-500 text-[10px] font-bold">{row.greens}</span>
                      <span className="text-muted-foreground/30">/</span>
                      <span className="text-red-500 text-[10px] font-bold">{row.reds}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Chart area */}
        <Card className="bg-card/40 border-border/40">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">ROI por Faixa (%)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#333" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#888' }} />
                  <YAxis hide />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                    formatter={(value: number) => [`${value.toFixed(2)}%`, 'ROI']}
                  />
                  <Bar dataKey="roi" radius={[4, 4, 0, 0]}>
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.roi >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}