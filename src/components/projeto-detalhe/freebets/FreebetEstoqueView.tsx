import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Package,
  Gift,
  Clock,
  AlertTriangle,
  Building2,
  LayoutGrid,
  List,
  Plus,
  CheckCircle2,
  XCircle,
  Timer,
  Lock,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useFreebetEstoque, FreebetRecebidaCompleta, BookmakerEstoque, EstoqueMetrics } from "@/hooks/useFreebetEstoque";

interface FreebetEstoqueViewProps {
  projetoId: string;
  formatCurrency: (value: number) => string;
  dateRange: { start: Date; end: Date } | null;
  onAddFreebet?: (bookmakerId?: string) => void;
}

// Status badge helper
function getStatusBadge(status: string, utilizada: boolean) {
  if (utilizada) {
    return (
      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
        Utilizada
      </Badge>
    );
  }

  switch (status) {
    case "LIBERADA":
      return (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
          Liberada
        </Badge>
      );
    case "PENDENTE":
      return (
        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
          <Clock className="h-2.5 w-2.5 mr-0.5" />
          Pendente
        </Badge>
      );
    case "NAO_LIBERADA":
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
          <XCircle className="h-2.5 w-2.5 mr-0.5" />
          Não Liberada
        </Badge>
      );
    default:
      return null;
  }
}

// Expiration warning badge
function getExpirationBadge(diasParaExpirar: number | null) {
  if (diasParaExpirar === null) return null;
  
  if (diasParaExpirar <= 0) {
    return (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
        Expirada
      </Badge>
    );
  }
  
  if (diasParaExpirar <= 3) {
    return (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
        <Timer className="h-2.5 w-2.5 mr-0.5" />
        {diasParaExpirar}d
      </Badge>
    );
  }
  
  if (diasParaExpirar <= 7) {
    return (
      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
        <Timer className="h-2.5 w-2.5 mr-0.5" />
        {diasParaExpirar}d
      </Badge>
    );
  }
  
  return null;
}

export function FreebetEstoqueView({ projetoId, formatCurrency, dateRange, onAddFreebet }: FreebetEstoqueViewProps) {
  const [viewMode, setViewMode] = useState<"card" | "list">("list");
  
  const { freebets, bookmakersEstoque, metrics, loading } = useFreebetEstoque({
    projetoId,
    dataInicio: dateRange?.start,
    dataFim: dateRange?.end,
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  // Freebets disponíveis (liberadas e não utilizadas)
  const freebetsDisponiveis = freebets.filter(
    (fb) => fb.status === "LIBERADA" && !fb.utilizada
  );
  const freebetsPendentes = freebets.filter((fb) => fb.status === "PENDENTE");
  const freebetsUtilizadas = freebets.filter((fb) => fb.utilizada);

  return (
    <div className="space-y-6">
      {/* KPIs do Estoque */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Disponível</CardTitle>
            <Gift className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">
              {formatCurrency(metrics.saldoDisponivel)}
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.casasComFreebet} casa{metrics.casasComFreebet !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recebido</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.totalRecebido)}</div>
            <p className="text-xs text-muted-foreground">
              {freebets.filter((fb) => fb.status === "LIBERADA").length} freebet
              {freebets.filter((fb) => fb.status === "LIBERADA").length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Utilizado</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {formatCurrency(metrics.totalUtilizado)}
            </div>
            <p className="text-xs text-muted-foreground">
              {freebetsUtilizadas.length} utilizada{freebetsUtilizadas.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalPendentes}</div>
            <p className="text-xs text-muted-foreground">Aguardando liberação</p>
          </CardContent>
        </Card>

        <Card className={metrics.proximasExpirar > 0 ? "border-red-500/20 bg-red-500/5" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próx. Expirar</CardTitle>
            <AlertTriangle
              className={`h-4 w-4 ${metrics.proximasExpirar > 0 ? "text-red-400" : "text-muted-foreground"}`}
            />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.proximasExpirar > 0 ? "text-red-400" : ""}`}>
              {metrics.proximasExpirar}
            </div>
            <p className="text-xs text-muted-foreground">Nos próximos 7 dias</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disponíveis</CardTitle>
            <Gift className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{freebetsDisponiveis.length}</div>
            <p className="text-xs text-muted-foreground">Prontas para uso</p>
          </CardContent>
        </Card>
      </div>

      {/* Estoque por Casa */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Estoque por Casa</CardTitle>
              <Badge variant="secondary">{bookmakersEstoque.length} casas</Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode(viewMode === "list" ? "card" : "list")}
              className="h-8 w-8 p-0"
            >
              {viewMode === "list" ? (
                <LayoutGrid className="h-4 w-4" />
              ) : (
                <List className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {bookmakersEstoque.length === 0 ? (
            <div className="text-center py-12 border rounded-lg bg-muted/5">
              <Package className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhuma casa com saldo de freebet
              </p>
            </div>
          ) : viewMode === "list" ? (
            <div className="space-y-2">
              {bookmakersEstoque.map((bk) => (
                <div
                  key={bk.id}
                  className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  {bk.logo_url ? (
                    <img
                      src={bk.logo_url}
                      alt={bk.nome}
                      className="h-10 w-10 rounded-lg object-contain bg-white p-1"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                      <Building2 className="h-5 w-5" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{bk.nome}</p>
                    {bk.parceiro_nome && (
                      <p className="text-xs text-muted-foreground">{bk.parceiro_nome}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-6 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Saldo</p>
                      <p className="font-semibold text-amber-400">
                        {formatCurrency(bk.saldo_freebet)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Liberadas</p>
                      <p className="font-semibold text-emerald-400">{bk.freebets_liberadas}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Pendentes</p>
                      <p className="font-semibold text-amber-400">{bk.freebets_pendentes}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Expiração</p>
                      <p className="font-semibold text-sm">
                        {bk.proxima_expiracao
                          ? format(new Date(bk.proxima_expiracao), "dd/MM", { locale: ptBR })
                          : "-"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {bookmakersEstoque.map((bk) => (
                <Card key={bk.id} className="overflow-hidden border-amber-500/20">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      {bk.logo_url ? (
                        <img
                          src={bk.logo_url}
                          alt={bk.nome}
                          className="h-10 w-10 rounded-lg object-contain bg-white p-1"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                          <Building2 className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base truncate">{bk.nome}</CardTitle>
                        {bk.parceiro_nome && (
                          <p className="text-xs text-muted-foreground truncate">
                            {bk.parceiro_nome}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                      <p className="text-2xl font-bold text-amber-400">
                        {formatCurrency(bk.saldo_freebet)}
                      </p>
                      <p className="text-xs text-muted-foreground">Saldo Disponível</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-emerald-400">{bk.freebets_liberadas}</p>
                        <p className="text-[10px] text-muted-foreground">Liberadas</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-amber-400">{bk.freebets_pendentes}</p>
                        <p className="text-[10px] text-muted-foreground">Pendentes</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{bk.freebets_count}</p>
                        <p className="text-[10px] text-muted-foreground">Total</p>
                      </div>
                    </div>

                    {bk.proxima_expiracao && (
                      <div className="flex items-center justify-between text-xs p-2 rounded bg-muted/50">
                        <span className="text-muted-foreground">Próx. expiração:</span>
                        <span className="font-medium">
                          {format(new Date(bk.proxima_expiracao), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de Freebets Recebidas */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-amber-400" />
              <CardTitle className="text-base">Freebets Recebidas</CardTitle>
              <Badge variant="secondary">{freebets.length}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {freebets.length === 0 ? (
            <div className="text-center py-12 border rounded-lg bg-muted/5">
              <Gift className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhuma freebet registrada no período
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Casa</th>
                    <th className="text-right p-3 font-medium">Valor</th>
                    <th className="text-left p-3 font-medium">Motivo</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-center p-3 font-medium">Expiração</th>
                    <th className="text-left p-3 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {freebets.slice(0, 50).map((fb) => (
                    <tr key={fb.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {fb.logo_url ? (
                            <img
                              src={fb.logo_url}
                              alt={fb.bookmaker_nome}
                              className="h-6 w-6 rounded object-contain bg-white p-0.5"
                            />
                          ) : (
                            <Gift className="h-5 w-5 text-amber-400" />
                          )}
                          <span className="truncate max-w-[120px]">{fb.bookmaker_nome}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right font-medium text-amber-400">
                        {formatCurrency(fb.valor)}
                      </td>
                      <td className="p-3 max-w-[150px] truncate" title={fb.motivo}>
                        {fb.motivo}
                      </td>
                      <td className="p-3 text-center min-w-[140px]">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-[70px] flex justify-center flex-shrink-0">
                            {getStatusBadge(fb.status, fb.utilizada)}
                          </div>
                          <div className="w-5 flex-shrink-0">
                            {fb.tem_rollover && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-500/50 text-amber-600 dark:text-amber-400" title="Após uso, o lucro exigirá cumprimento de rollover">
                                <Lock className="h-2.5 w-2.5" />
                              </Badge>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {fb.data_validade ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(fb.data_validade), "dd/MM", { locale: ptBR })}
                            </span>
                            {getExpirationBadge(fb.diasParaExpirar)}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {format(new Date(fb.data_recebida), "dd/MM/yyyy", { locale: ptBR })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {freebets.length > 50 && (
                <p className="text-center text-xs text-muted-foreground py-2">
                  Mostrando 50 de {freebets.length} freebets
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
