import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Building2, ShieldCheck, AlertTriangle, HelpCircle } from "lucide-react";
import { format } from "date-fns";
import {
  type GlobalLimitationStats,
  STRATEGIC_PROFILE_CONFIG,
  LIMITATION_TYPE_LABELS,
  CONFIDENCE_CONFIG,
  type LimitationType,
  type StrategicProfile,
  type ConfidenceScore,
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

interface LimitationGlobalRankingTableProps {
  stats: GlobalLimitationStats[];
}

const confidenceIcons: Record<ConfidenceScore, typeof ShieldCheck> = {
  HIGH: ShieldCheck,
  MEDIUM: AlertTriangle,
  LOW: HelpCircle,
};

export function LimitationGlobalRankingTable({ stats }: LimitationGlobalRankingTableProps) {
  const sorted = [...stats].sort((a, b) => b.total_events - a.total_events);

  if (sorted.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        Nenhum dado de limitação global disponível.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border/50 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Bookmaker</TableHead>
            <TableHead className="text-center">Eventos</TableHead>
            <TableHead className="text-center">Vínculos</TableHead>
            <TableHead className="text-center">Projetos</TableHead>
            <TableHead className="text-center">Média Apostas</TableHead>
            <TableHead className="text-center w-[180px]">Distribuição</TableHead>
            <TableHead className="text-center">Perfil Global</TableHead>
            <TableHead className="text-center">Confiança</TableHead>
            <TableHead className="text-right">Última</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((s) => {
            const profileConfig = STRATEGIC_PROFILE_CONFIG[s.strategic_profile as StrategicProfile] || STRATEGIC_PROFILE_CONFIG.low_data;
            const confConfig = CONFIDENCE_CONFIG[s.confidence_score as ConfidenceScore] || CONFIDENCE_CONFIG.LOW;
            const ConfIcon = confidenceIcons[s.confidence_score as ConfidenceScore] || HelpCircle;

            return (
              <TableRow key={s.bookmaker_catalogo_id}>
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

                {/* Projetos */}
                <TableCell className="text-center text-sm">
                  {s.total_projects}
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
                          Early (1-5): {s.early_count} ({s.early_pct}%)
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-yellow-500" />
                          Mid (6-10): {s.mid_count} ({s.mid_pct}%)
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-blue-500" />
                          Late (10+): {s.late_count} ({s.late_pct}%)
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

                {/* Confiança */}
                <TableCell className="text-center">
                  <Badge
                    variant="outline"
                    className={`text-xs border-transparent gap-1 ${confConfig.bgColor} ${confConfig.color}`}
                  >
                    <ConfIcon className="h-3 w-3" />
                    {confConfig.label}
                  </Badge>
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
  );
}
