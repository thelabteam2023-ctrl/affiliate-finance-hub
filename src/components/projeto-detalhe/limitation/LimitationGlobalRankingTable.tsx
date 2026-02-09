import { useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Building2, Clock, TrendingUp, TrendingDown, HelpCircle } from "lucide-react";
import { format } from "date-fns";
import {
  type GlobalLimitationStats,
  STRATEGIC_PROFILE_CONFIG,
  type StrategicProfile,
} from "@/hooks/useLimitationEvents";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BookmakerLimitationDetailModal } from "@/components/bookmakers/BookmakerLimitationDetailModal";

interface LimitationGlobalRankingTableProps {
  stats: GlobalLimitationStats[];
}

export function LimitationGlobalRankingTable({ stats }: LimitationGlobalRankingTableProps) {
  const [selectedBookmaker, setSelectedBookmaker] = useState<GlobalLimitationStats | null>(null);
  const sorted = [...stats].sort((a, b) => b.total_events - a.total_events);

  if (sorted.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        Nenhum dado de limitação global disponível.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Bookmaker</TableHead>
              <TableHead className="text-center">Eventos</TableHead>
              <TableHead className="text-center">Vínculos</TableHead>
              <TableHead className="text-center">Média Apostas</TableHead>
              <TableHead className="text-center w-[180px]">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center gap-1">
                        Distribuição
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[260px] p-3 text-xs space-y-1.5">
                      <p className="font-medium">Velocidade de limitação:</p>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        <span><strong>Rápida</strong> — limitou em até 5 apostas</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-yellow-500" />
                        <span><strong>Moderada</strong> — limitou entre 6-10 apostas</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                        <span><strong>Tardia</strong> — limitou após 10+ apostas</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="text-center">Perfil Global</TableHead>
              <TableHead className="text-right">Volume Total</TableHead>
              <TableHead className="text-right">Lucro/Prejuízo</TableHead>
              <TableHead className="text-center">Tempo Saque</TableHead>
              <TableHead className="text-right">Última</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((s) => {
              const profileConfig = STRATEGIC_PROFILE_CONFIG[s.strategic_profile as StrategicProfile] || STRATEGIC_PROFILE_CONFIG.low_data;

              return (
                <TableRow
                  key={s.bookmaker_catalogo_id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setSelectedBookmaker(s)}
                >
                  {/* Bookmaker */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        {s.logo_url ? <AvatarImage src={s.logo_url} /> : null}
                        <AvatarFallback className="text-[8px]">
                          <Building2 className="h-3 w-3" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm truncate max-w-[130px]">
                        {s.bookmaker_nome}
                      </span>
                    </div>
                  </TableCell>

                  {/* Eventos */}
                  <TableCell className="text-center font-semibold">
                    {s.total_events}
                  </TableCell>

                  {/* Vínculos */}
                  <TableCell className="text-center text-sm">
                    {s.total_vinculos}
                  </TableCell>

                  {/* Média */}
                  <TableCell className="text-center text-sm">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          {s.avg_bets_before_limitation}
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          Desvio padrão: {s.stddev_bets ?? "N/A"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>

                  {/* Distribuição */}
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex h-4 rounded-full overflow-hidden bg-muted/50">
                            {s.early_pct > 0 && (
                              <div className="bg-red-500/80 h-full" style={{ width: `${s.early_pct}%` }} />
                            )}
                            {s.mid_pct > 0 && (
                              <div className="bg-yellow-500/80 h-full" style={{ width: `${s.mid_pct}%` }} />
                            )}
                            {s.late_pct > 0 && (
                              <div className="bg-blue-500/80 h-full" style={{ width: `${s.late_pct}%` }} />
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="p-2 text-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                            Rápida (1-5): {s.early_count} ({s.early_pct}%)
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-yellow-500" />
                            Moderada (6-10): {s.mid_count} ({s.mid_pct}%)
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-blue-500" />
                            Tardia (10+): {s.late_count} ({s.late_pct}%)
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>

                  {/* Perfil */}
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={`text-xs border-transparent ${profileConfig.bgColor} ${profileConfig.color}`}
                    >
                      {profileConfig.label}
                    </Badge>
                  </TableCell>

                  {/* Volume Total */}
                  <TableCell className="text-right text-sm font-medium">
                    {(s.volume_total ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>

                  {/* Lucro/Prejuízo */}
                  <TableCell className="text-right text-sm font-medium">
                    {(() => {
                      const pl = s.lucro_prejuizo_total ?? 0;
                      const isPositive = pl > 0;
                      const isNegative = pl < 0;
                      return (
                        <span className={`flex items-center justify-end gap-1 ${isPositive ? "text-emerald-500" : isNegative ? "text-red-500" : "text-muted-foreground"}`}>
                          {isPositive && <TrendingUp className="h-3 w-3" />}
                          {isNegative && <TrendingDown className="h-3 w-3" />}
                          {pl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      );
                    })()}
                  </TableCell>

                  {/* Tempo Médio de Saque */}
                  <TableCell className="text-center">
                    {s.avg_withdrawal_days != null ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center justify-center gap-1 text-xs">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="font-medium">
                                {s.avg_withdrawal_days === 0
                                  ? "< 1d"
                                  : `${s.avg_withdrawal_days}d`}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">
                            Média de {s.total_confirmed_withdrawals} saque(s) confirmado(s)
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Última */}
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {format(new Date(s.last_limitation_at), "dd/MM/yy")}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {selectedBookmaker && (
        <BookmakerLimitationDetailModal
          open={!!selectedBookmaker}
          onOpenChange={(open) => !open && setSelectedBookmaker(null)}
          bookmakerCatalogoId={selectedBookmaker.bookmaker_catalogo_id}
          bookmakerNome={selectedBookmaker.bookmaker_nome}
          logoUrl={selectedBookmaker.logo_url}
        />
      )}
    </>
  );
}
