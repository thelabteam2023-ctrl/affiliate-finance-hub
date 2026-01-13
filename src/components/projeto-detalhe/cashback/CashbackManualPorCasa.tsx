import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, DollarSign } from "lucide-react";
import { CashbackManualPorBookmaker } from "@/types/cashback-manual";

interface CashbackManualPorCasaProps {
  data: CashbackManualPorBookmaker[];
  formatCurrency: (value: number) => string;
}

export function CashbackManualPorCasa({ data, formatCurrency }: CashbackManualPorCasaProps) {
  if (data.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">
            Nenhum cashback por casa
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Os dados aparecerão após lançar cashbacks
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.map((item) => (
        <Card key={item.bookmaker_id} className="overflow-hidden">
          <div className="flex items-stretch">
            <div className="w-1 bg-emerald-500" />
            <div className="flex-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {item.bookmaker_nome}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-emerald-500">
                      {formatCurrency(item.totalRecebido)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.totalLancamentos} lançamento{item.totalLancamentos !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {item.bookmaker_moeda}
                  </Badge>
                </div>
              </CardContent>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
