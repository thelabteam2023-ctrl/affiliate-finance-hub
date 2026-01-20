import { Card, CardContent } from "@/components/ui/card";
import { 
  Building2, 
  Gift, 
  Target
} from "lucide-react";
import { ProjectBonusAnalyticsSummary as SummaryType } from "@/hooks/useProjectBonusAnalytics";

interface ProjectBonusAnalyticsSummaryProps {
  summary: SummaryType;
}

export function ProjectBonusAnalyticsSummary({ summary }: ProjectBonusAnalyticsSummaryProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {/* Casas Analisadas */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.total_bookmakers}</p>
              <p className="text-xs text-muted-foreground">Casas com Bônus</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Total Bônus */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Gift className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.total_bonus_count}</p>
              <p className="text-xs text-muted-foreground">
                {summary.total_bonus_value_display}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Volume Total */}
      <Card className="col-span-2 md:col-span-1">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Target className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-lg font-bold truncate">{summary.total_stake_display}</p>
              <p className="text-xs text-muted-foreground">Volume Apostado</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
