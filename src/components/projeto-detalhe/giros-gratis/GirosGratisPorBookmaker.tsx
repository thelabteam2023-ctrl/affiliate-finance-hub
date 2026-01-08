import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Building2, TrendingUp, Hash } from "lucide-react";
import { GirosGratisPorBookmaker as BookmakerStats } from "@/types/girosGratis";

interface GirosGratisPorBookmakerProps {
  data: BookmakerStats[];
  formatCurrency: (value: number) => string;
}

export function GirosGratisPorBookmaker({ data, formatCurrency }: GirosGratisPorBookmakerProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Análise por Casa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[150px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum dado para exibir</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxRetorno = Math.max(...data.map(b => b.total_retorno));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Análise por Casa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.map((bookmaker, index) => {
          const progressValue = maxRetorno > 0 ? (bookmaker.total_retorno / maxRetorno) * 100 : 0;
          const isPositive = bookmaker.total_retorno >= 0;

          return (
            <div key={bookmaker.bookmaker_id} className="space-y-2">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  {bookmaker.logo_url ? (
                    <AvatarImage src={bookmaker.logo_url} alt={bookmaker.bookmaker_nome} />
                  ) : (
                    <AvatarFallback className="text-xs">
                      {bookmaker.bookmaker_nome.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate">
                      <p className="text-sm font-medium truncate">{bookmaker.bookmaker_nome}</p>
                      {bookmaker.parceiro_nome && (
                        <p className="text-xs text-muted-foreground truncate">{bookmaker.parceiro_nome}</p>
                      )}
                    </div>
                    <Badge 
                      variant={isPositive ? "default" : "destructive"} 
                      className="shrink-0"
                    >
                      {formatCurrency(bookmaker.total_retorno)}
                    </Badge>
                  </div>
                </div>
              </div>
              
              <Progress value={Math.abs(progressValue)} className="h-1.5" />
              
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  <span>{bookmaker.total_giros} giros</span>
                </div>
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  <span>Média: {formatCurrency(bookmaker.media_retorno)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
