import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, User, Users, ChevronRight } from "lucide-react";
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
  const [selectedCasa, setSelectedCasa] = useState<CashbackManualPorBookmaker | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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

  const handleOpenBreakdown = (casa: CashbackManualPorBookmaker) => {
    setSelectedCasa(casa);
    setSheetOpen(true);
  };

  return (
    <>
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
                        
                        {/* Parceiro único ou botão para ver breakdown */}
                        {hasManyPartners ? (
                          <button
                            onClick={() => handleOpenBreakdown(item)}
                            className="text-xs text-muted-foreground flex items-center gap-1 mt-1 hover:text-foreground transition-colors group"
                          >
                            <Users className="h-3 w-3 flex-shrink-0" />
                            <span>{item.parceiros.length} parceiros</span>
                            <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
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

      {/* Sheet com breakdown por parceiro */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader className="pb-4">
            <div className="flex items-center gap-3">
              {selectedCasa?.logo_url && (
                <Avatar className="h-10 w-10 rounded-md">
                  <AvatarImage 
                    src={selectedCasa.logo_url} 
                    alt={selectedCasa.bookmaker_nome} 
                    className="object-contain"
                  />
                  <AvatarFallback className="rounded-md bg-muted text-sm">
                    {selectedCasa?.bookmaker_nome.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
              <div>
                <SheetTitle className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {selectedCasa?.bookmaker_nome}
                </SheetTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Breakdown por parceiro
                </p>
              </div>
            </div>
          </SheetHeader>

          {selectedCasa && (
            <div className="space-y-4">
              {/* Resumo total */}
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total recebido</p>
                    <p className="text-2xl font-bold text-emerald-500">
                      {formatWithCurrency(selectedCasa.totalRecebido, selectedCasa.bookmaker_moeda)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Lançamentos</p>
                    <p className="text-lg font-semibold">{selectedCasa.totalLancamentos}</p>
                  </div>
                </div>
              </div>

              {/* Lista de parceiros */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  {selectedCasa.parceiros.length} parceiro{selectedCasa.parceiros.length !== 1 ? 's' : ''}
                </p>
                <ScrollArea className="h-[calc(100vh-320px)]">
                  <div className="space-y-2 pr-4">
                    {selectedCasa.parceiros.map((parceiro, idx) => (
                      <div 
                        key={parceiro.parceiro_id || `parceiro-${idx}`}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                            <User className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {parceiro.parceiro_nome || "Sem vínculo"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {parceiro.totalLancamentos} lançamento{parceiro.totalLancamentos !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <p className="font-semibold text-emerald-500 whitespace-nowrap">
                          {formatWithCurrency(parceiro.totalRecebido, selectedCasa.bookmaker_moeda)}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
