import { useParceiroFinanceiroConsolidado } from "@/hooks/useParceiroFinanceiroConsolidado";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, DollarSign, ArrowDownToLine, ArrowUpFromLine, Target, Building2, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface ParceiroDetalhesPanelProps {
  parceiroId: string | null;
}

export function ParceiroDetalhesPanel({ parceiroId }: ParceiroDetalhesPanelProps) {
  const { data, loading, error } = useParceiroFinanceiroConsolidado(parceiroId);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (!parceiroId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <User className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">Selecione um parceiro</p>
        <p className="text-sm">Escolha um parceiro na lista para ver os detalhes</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        Erro ao carregar dados: {error || "Dados não encontrados"}
      </div>
    );
  }

  const totalSaldoBookmakers = data.bookmakers.reduce((sum, b) => sum + b.saldo_atual, 0);
  const bookmarkersAtivos = data.bookmakers.filter(b => b.status === "ativo").length;
  const bookmakersLimitados = data.bookmakers.filter(b => b.status === "limitada").length;

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <User className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">{data.parceiro_nome}</h2>
            <p className="text-sm text-muted-foreground">
              {data.bookmakers.length} casa{data.bookmakers.length !== 1 ? "s" : ""} vinculada{data.bookmakers.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* KPIs Consolidados */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border bg-gradient-surface">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                  <ArrowDownToLine className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Depositado</p>
                  <p className="text-xl font-bold">{formatCurrency(data.total_depositado)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-gradient-surface">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <ArrowUpFromLine className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Sacado</p>
                  <p className="text-xl font-bold">{formatCurrency(data.total_sacado)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-gradient-surface">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg",
                  data.lucro_prejuizo >= 0 ? "bg-success/10" : "bg-destructive/10"
                )}>
                  {data.lucro_prejuizo >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-success" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-destructive" />
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Resultado Líquido</p>
                  <p className={cn(
                    "text-xl font-bold",
                    data.lucro_prejuizo >= 0 ? "text-success" : "text-destructive"
                  )}>
                    {formatCurrency(data.lucro_prejuizo)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-gradient-surface">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                  <Target className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total de Apostas</p>
                  <p className="text-xl font-bold">{data.qtd_apostas_total.toLocaleString("pt-BR")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info adicional */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-border bg-gradient-surface">
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Saldo em Bookmakers</p>
              <p className="text-lg font-bold text-primary">{formatCurrency(totalSaldoBookmakers)}</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-gradient-surface">
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Casas Ativas</p>
              <p className="text-lg font-bold text-success">{bookmarkersAtivos}</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-gradient-surface">
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Casas Limitadas</p>
              <p className="text-lg font-bold text-warning">{bookmakersLimitados}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabela por Casa de Apostas */}
        <Card className="border-border bg-gradient-surface">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Desempenho por Casa de Apostas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.bookmakers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma casa de apostas vinculada
              </div>
            ) : (
              <div className="space-y-2">
                {/* Header */}
                <div className="grid grid-cols-6 gap-3 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
                  <div className="col-span-2">Casa</div>
                  <div className="text-right">Depositado</div>
                  <div className="text-right">Sacado</div>
                  <div className="text-right">Resultado</div>
                  <div className="text-right">Apostas</div>
                </div>

                {/* Rows */}
                {data.bookmakers.map((bm) => (
                  <div
                    key={bm.bookmaker_id}
                    className="grid grid-cols-6 gap-3 px-3 py-3 rounded-lg hover:bg-muted/30 transition-colors items-center"
                  >
                    <div className="col-span-2 flex items-center gap-3">
                      {bm.logo_url ? (
                        <img
                          src={bm.logo_url}
                          alt={bm.bookmaker_nome}
                          className="h-8 w-8 rounded object-contain bg-white p-0.5"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-sm">{bm.bookmaker_nome}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 py-0 mt-0.5",
                            bm.status === "ativo"
                              ? "border-success/50 text-success"
                              : bm.status === "limitada"
                              ? "border-warning/50 text-warning"
                              : "border-muted-foreground/50 text-muted-foreground"
                          )}
                        >
                          {bm.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      {formatCurrency(bm.total_depositado)}
                    </div>
                    <div className="text-right text-sm">
                      {formatCurrency(bm.total_sacado)}
                    </div>
                    <div className={cn(
                      "text-right text-sm font-medium",
                      bm.lucro_prejuizo >= 0 ? "text-success" : "text-destructive"
                    )}>
                      {formatCurrency(bm.lucro_prejuizo)}
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      {bm.qtd_apostas.toLocaleString("pt-BR")}
                    </div>
                  </div>
                ))}

                {/* Totais */}
                <div className="grid grid-cols-6 gap-3 px-3 py-3 border-t border-border mt-2 font-medium">
                  <div className="col-span-2 text-sm">Total</div>
                  <div className="text-right text-sm">{formatCurrency(data.total_depositado)}</div>
                  <div className="text-right text-sm">{formatCurrency(data.total_sacado)}</div>
                  <div className={cn(
                    "text-right text-sm",
                    data.lucro_prejuizo >= 0 ? "text-success" : "text-destructive"
                  )}>
                    {formatCurrency(data.lucro_prejuizo)}
                  </div>
                  <div className="text-right text-sm">{data.qtd_apostas_total.toLocaleString("pt-BR")}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
