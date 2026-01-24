import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  DollarSign,
  Target,
  Filter,
  CalendarDays,
  Search,
  UserPlus,
  Truck,
  ArrowRight,
  Loader2,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useHistoricoCaptacao,
  type CaptacaoRecord,
  type HistoricoCaptacaoFilters,
} from "@/hooks/useHistoricoCaptacao";

interface HistoricoCaptacaoDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HistoricoCaptacaoDrawer({
  open,
  onOpenChange,
}: HistoricoCaptacaoDrawerProps) {
  const {
    loading,
    records,
    responsaveis,
    filters,
    setFilters,
    kpis,
    comparativoPorOrigem,
    refresh,
  } = useHistoricoCaptacao();

  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatPercent = (value: number | null) => {
    if (value === null) return "-";
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  };

  const getOrigemBadge = (origem: string) => {
    switch (origem) {
      case "INDICADOR":
        return (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
            <UserPlus className="h-3 w-3 mr-1" />
            Indicador
          </Badge>
        );
      case "FORNECEDOR":
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
            <Truck className="h-3 w-3 mr-1" />
            Fornecedor
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/30">
            <ArrowRight className="h-3 w-3 mr-1" />
            Direto
          </Badge>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ATIVA":
        return <Badge variant="default" className="bg-emerald-500/20 text-emerald-400 border-0">Ativa</Badge>;
      case "ENCERRADA":
        return <Badge variant="secondary">Encerrada</Badge>;
      case "EM_ENCERRAMENTO":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500">Em encerramento</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getRoiBadge = (roi: number | null, status: "positivo" | "negativo" | "neutro") => {
    if (roi === null) {
      return (
        <div className="flex items-center gap-1 text-muted-foreground">
          <Minus className="h-3 w-3" />
          <span>-</span>
        </div>
      );
    }

    if (status === "positivo") {
      return (
        <div className="flex items-center gap-1 text-emerald-500">
          <TrendingUp className="h-3 w-3" />
          <span className="font-medium">{formatPercent(roi)}</span>
        </div>
      );
    }

    if (status === "negativo") {
      return (
        <div className="flex items-center gap-1 text-red-500">
          <TrendingDown className="h-3 w-3" />
          <span className="font-medium">{formatPercent(roi)}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1 text-muted-foreground">
        <Minus className="h-3 w-3" />
        <span>{formatPercent(roi)}</span>
      </div>
    );
  };

  // Filter by search term
  const displayRecords = records.filter((r) =>
    r.parceiroNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.responsavelNome?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFilterChange = (key: keyof HistoricoCaptacaoFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      periodo: { from: null, to: null },
      origemTipo: null,
      responsavelId: null,
      roiStatus: "todos",
      statusParceiro: null,
    });
  };

  const hasActiveFilters =
    filters.origemTipo ||
    filters.responsavelId ||
    filters.roiStatus !== "todos" ||
    filters.statusParceiro ||
    filters.periodo.from ||
    filters.periodo.to;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Histórico de Captação
              </SheetTitle>
              <SheetDescription>
                Análise detalhada de todas as aquisições de parceiros
              </SheetDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="bg-card/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Users className="h-4 w-4" />
                    <span className="text-xs">Captações</span>
                  </div>
                  <p className="text-2xl font-bold">{kpis.totalCaptacoes}</p>
                </CardContent>
              </Card>

              <Card className="bg-card/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <DollarSign className="h-4 w-4" />
                    <span className="text-xs">Investido</span>
                  </div>
                  <p className="text-2xl font-bold">{formatCurrency(kpis.custoTotalAquisicao)}</p>
                </CardContent>
              </Card>

              <Card className="bg-card/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs">Lucro Gerado</span>
                  </div>
                  <p className={`text-2xl font-bold ${kpis.lucroTotalGerado >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {formatCurrency(kpis.lucroTotalGerado)}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Target className="h-4 w-4" />
                    <span className="text-xs">ROI Geral</span>
                  </div>
                  <p className={`text-2xl font-bold ${kpis.roiMedio >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {formatPercent(kpis.roiMedio)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Comparativo por Origem */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Comparativo por Origem</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(comparativoPorOrigem).length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nenhum dado de captação encontrado</p>
                    <p className="text-xs mt-1">Verifique os filtros ou aguarde novas captações</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {Object.entries(comparativoPorOrigem).map(([origem, data]) => (
                      <div
                        key={origem}
                        className="p-3 rounded-lg border bg-muted/30 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          {getOrigemBadge(origem)}
                          <span className="text-sm text-muted-foreground">{data.count} parceiros</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Investido</p>
                            <p className="font-medium">{formatCurrency(data.custo)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Lucro</p>
                            <p className={`font-medium ${data.lucro >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                              {formatCurrency(data.lucro)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t">
                          <span className="text-xs text-muted-foreground">ROI</span>
                          {getRoiBadge(data.roi, data.roi > 0 ? "positivo" : data.roi < 0 ? "negativo" : "neutro")}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar parceiro ou responsável..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Button
                variant={showFilters ? "secondary" : "outline"}
                onClick={() => setShowFilters(!showFilters)}
                className="gap-2"
              >
                <Filter className="h-4 w-4" />
                Filtros
                {hasActiveFilters && (
                  <Badge variant="default" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                    !
                  </Badge>
                )}
              </Button>
            </div>

            {/* Filtros expandidos */}
            {showFilters && (
              <Card className="bg-muted/30 border-dashed">
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Período */}
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Período</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start gap-2 font-normal">
                            <CalendarDays className="h-4 w-4" />
                            {filters.periodo.from && filters.periodo.to
                              ? `${format(filters.periodo.from, "dd/MM/yy")} - ${format(filters.periodo.to, "dd/MM/yy")}`
                              : "Selecionar"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="range"
                            selected={{
                              from: filters.periodo.from || undefined,
                              to: filters.periodo.to || undefined,
                            }}
                            onSelect={(range) =>
                              handleFilterChange("periodo", {
                                from: range?.from || null,
                                to: range?.to || null,
                              })
                            }
                            locale={ptBR}
                            numberOfMonths={2}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Origem */}
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Origem</label>
                      <Select
                        value={filters.origemTipo || "todos"}
                        onValueChange={(v) => handleFilterChange("origemTipo", v === "todos" ? null : v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todas</SelectItem>
                          <SelectItem value="INDICADOR">Indicador</SelectItem>
                          <SelectItem value="FORNECEDOR">Fornecedor</SelectItem>
                          <SelectItem value="DIRETO">Direto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Responsável */}
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Responsável</label>
                      <Select
                        value={filters.responsavelId || "todos"}
                        onValueChange={(v) => handleFilterChange("responsavelId", v === "todos" ? null : v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos</SelectItem>
                          {responsaveis.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.nome} ({r.tipo === "INDICADOR" ? "Ind." : "Forn."})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* ROI */}
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">ROI</label>
                      <Select
                        value={filters.roiStatus}
                        onValueChange={(v: "positivo" | "negativo" | "todos") =>
                          handleFilterChange("roiStatus", v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos</SelectItem>
                          <SelectItem value="positivo">ROI Positivo</SelectItem>
                          <SelectItem value="negativo">ROI Negativo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFilters}
                      className="mt-3"
                    >
                      Limpar filtros
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Tabela */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : displayRecords.length === 0 ? (
              <Card className="py-12">
                <CardContent className="text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>Nenhuma captação encontrada</p>
                  {hasActiveFilters && (
                    <Button variant="link" onClick={clearFilters} className="mt-2">
                      Limpar filtros
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parceiro</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                      <TableHead className="text-right">Lucro</TableHead>
                      <TableHead className="text-right">ROI</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRecords.map((record) => (
                      <TableRow key={record.parceriaId}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{record.parceiroNome}</p>
                            {record.responsavelNome && (
                              <p className="text-xs text-muted-foreground">
                                via {record.responsavelNome}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getOrigemBadge(record.origemTipo)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(record.dataEntrada), "dd/MM/yyyy", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger className="cursor-help">
                                {formatCurrency(record.custoAquisicao)}
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="space-y-1 text-xs">
                                  {record.valorIndicador > 0 && (
                                    <p>Indicador: {formatCurrency(record.valorIndicador)}</p>
                                  )}
                                  {record.valorParceiro > 0 && (
                                    <p>Parceiro: {formatCurrency(record.valorParceiro)}</p>
                                  )}
                                  {record.valorFornecedor > 0 && (
                                    <p>Fornecedor: {formatCurrency(record.valorFornecedor)}</p>
                                  )}
                                  {record.comissoesPagas > 0 && (
                                    <p>Comissões: {formatCurrency(record.comissoesPagas)}</p>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={record.lucroGerado >= 0 ? "text-emerald-500" : "text-red-500"}>
                            {formatCurrency(record.lucroGerado)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {getRoiBadge(record.roi, record.roiStatus)}
                        </TableCell>
                        <TableCell>{getStatusBadge(record.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}

            {/* Sumário inferior */}
            {displayRecords.length > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg">
                <span>
                  Mostrando {displayRecords.length} de {records.length} captações
                </span>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                    {kpis.captacoesPositivas} positivas
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingDown className="h-3 w-3 text-red-500" />
                    {kpis.captacoesNegativas} negativas
                  </span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
