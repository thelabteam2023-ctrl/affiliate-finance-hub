import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Building2, User, Users } from "lucide-react";
import { CashbackManualPorBookmaker } from "@/types/cashback-manual";

// Mapa de símbolos de moeda
const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$",
  USD: "$",
  EUR: "€",
  GBP: "£",
  USDT: "$",
};

const formatWithCurrency = (value: number, moeda: string): string => {
  const symbol = CURRENCY_SYMBOLS[moeda?.toUpperCase()] || moeda || "R$";
  return `${symbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

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
    <TooltipProvider>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((item, index) => {
          const hasManyPartners = item.parceiros.length > 1;
          const uniqueKey = item.bookmaker_catalogo_id || `${item.bookmaker_nome}-${index}`;
          
          return (
            <Card key={uniqueKey} className="overflow-hidden">
              <div className="flex items-stretch">
                <div className="w-1 bg-emerald-500" />
                <div className="flex-1">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 rounded-md">
                        <AvatarImage 
                          src={item.logo_url || undefined} 
                          alt={item.bookmaker_nome} 
                          className="object-contain"
                        />
                        <AvatarFallback className="rounded-md bg-muted text-xs">
                          {item.bookmaker_nome.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{item.bookmaker_nome}</span>
                        </CardTitle>
                        
                        {/* Mostrar parceiros - com tooltip se houver mais de 1 */}
                        {hasManyPartners ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 cursor-help hover:text-foreground transition-colors">
                                <Users className="h-3 w-3 flex-shrink-0" />
                                <span>{item.parceiros.length} parceiros</span>
                              </p>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              <div className="space-y-2 py-1">
                                <p className="text-xs font-medium text-muted-foreground mb-2">Breakdown por parceiro:</p>
                                {item.parceiros.map((p, pIndex) => (
                                  <div key={p.parceiro_id || `parceiro-${pIndex}`} className="flex items-center justify-between gap-4 text-xs">
                                    <span className="flex items-center gap-1.5 truncate">
                                      <User className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                      <span className="truncate">{p.parceiro_nome || "Sem vínculo"}</span>
                                    </span>
                                    <span className="font-medium text-emerald-500 whitespace-nowrap">
                                      {formatWithCurrency(p.totalRecebido, item.bookmaker_moeda)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : item.parceiros[0]?.parceiro_nome ? (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <User className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{item.parceiros[0].parceiro_nome}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-2xl font-bold text-emerald-500">
                          {formatWithCurrency(item.totalRecebido, item.bookmaker_moeda)}
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
          );
        })}
      </div>
    </TooltipProvider>
  );
}
