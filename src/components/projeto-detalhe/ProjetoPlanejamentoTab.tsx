 import { useState, useMemo, useRef, useEffect } from "react";
 import { 
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar as CalendarIcon,
  Filter,
  Building2,
  User,
  MapPin,
  Wallet,
  Pencil,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Target
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  PlanningCampanha, 
  usePlanningCampanhas, 
  usePlanningPerfis,
  perfilDisplayName,
  usePlanningIps,
  planningPerfilCpfIndex,
  useProjetos,
  useUpsertCampanha,
  PlanningPerfil
} from "@/hooks/usePlanningData";
import { usePlanningRealtimeSync } from "@/hooks/usePlanningRealtimeSync";
import { useCelulasAgendadasPorCampanhas } from "@/hooks/usePlanoCelulasDisponiveis";
import { format, parseISO, isToday, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { BookmakerLogo } from "@/components/ui/bookmaker-logo";
import { toast } from "sonner";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { CampanhaDialog } from "../planejamento/CampanhaDialog";

interface ProjetoPlanejamentoTabProps {
  projetoId: string;
  refreshTrigger?: number;
}

export function ProjetoPlanejamentoTab({ projetoId }: ProjetoPlanejamentoTabProps) {
  // Ativa a sincronização em tempo real para o planejamento dentro do projeto
  usePlanningRealtimeSync();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [projetoFilter, setProjetoFilter] = useState<string>(projetoId);
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);

  const { data: allCampanhas = [], isLoading: campanhasLoading } = usePlanningCampanhas(selectedYear, selectedMonth);
  const campanhas = useMemo(() => allCampanhas, [allCampanhas]);
  const campanhaIds = useMemo(() => campanhas.map(c => c.id), [campanhas]);
  const { data: celulasAgendadas = [], isLoading: celulasLoading } = useCelulasAgendadasPorCampanhas(campanhaIds);
  const { data: perfis = [] } = usePlanningPerfis();
  const { data: ips = [] } = usePlanningIps();
  const { data: projetos = [] } = useProjetos();
  const updateCampanha = useUpsertCampanha();
  const logoMap = useBookmakerLogoMap();

  const [editingCampanha, setEditingCampanha] = useState<PlanningCampanha | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // 3. Helpers de Resolução (Lógica espelhada do PlanejamentoList)
  const resolveCampanhaData = (c: PlanningCampanha) => {
    const celula = celulasAgendadas.find(cel => cel.campanha_id === c.id);
    const perfil = perfis.find(p => 
      (c.parceiro_id && p.parceiro_id === c.parceiro_id) || 
      (celula?.perfil_planejamento_id && p.id === celula.perfil_planejamento_id) ||
      (celula?.parceiro_id && p.parceiro_id === celula.parceiro_id)
    );
    const parceiroId = c.parceiro_id || perfil?.parceiro_id || celula?.parceiro_id;
    const perfilId = perfil?.id || celula?.perfil_planejamento_id;
    const bookmakerCatalogoId = c.bookmaker_catalogo_id || (celula as any)?.bookmaker_catalogo_id;
    const linkedIp = ips.find(i => i.id === c.ip_id) || 
                    (perfilId && bookmakerCatalogoId ? ips.find(i => i.perfil_planejamento_id === perfilId && i.bookmaker_catalogo_id === bookmakerCatalogoId) : null) ||
                    (parceiroId && bookmakerCatalogoId ? ips.find(i => {
                      const ipPerfil = perfis.find(p => p.id === i.perfil_planejamento_id);
                      return ipPerfil?.parceiro_id === parceiroId && i.bookmaker_catalogo_id === bookmakerCatalogoId;
                    }) : null) ||
                    (bookmakerCatalogoId ? ips.find(i => i.bookmaker_catalogo_id === bookmakerCatalogoId && !i.perfil_planejamento_id) : null);
    const isPending = !parceiroId && !perfilId || !linkedIp || !c.wallet_id || Number(c.deposit_amount) <= 0;
    return { perfil, linkedIp, isPending, parceiroId, celula, bookmakerCatalogoId };
  };

  const getStatus = (c: PlanningCampanha, isPending: boolean) => {
    if (c.is_account_created) return "concluido";
    const campDate = startOfDay(parseISO(c.scheduled_date));
    const todayDate = startOfDay(new Date());
    if (isPending) {
      if (campDate < todayDate) return "atrasado";
      return "pendente";
    }
    return "planejado";
  };

  const formatMoney = (v: number, currency: string) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);
  };

  const handleCopyProxy = (proxy: string) => {
    navigator.clipboard.writeText(proxy);
    toast.success("Proxy copiado!");
  };

  const handleToggleStatus = async (camp: PlanningCampanha) => {
    try {
      const payload = {
        ...camp,
        is_account_created: !camp.is_account_created,
        status: !camp.is_account_created ? 'done' : 'planned'
      };
      await updateCampanha.mutateAsync(payload);
      toast.success("Status atualizado!");
    } catch (error) {
      console.error("Erro status:", error);
    }
  };

  const filteredData = useMemo(() => {
    return campanhas
      .filter((c) => {
        const matchesProjeto = projetoFilter === "all" || c.projeto_id === projetoFilter;
        const matchesSearch =
          c.bookmaker_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (c.parceiro_snapshot?.nome || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (c.notes || "").toLowerCase().includes(searchTerm.toLowerCase());
        const { isPending } = resolveCampanhaData(c);
        const status = getStatus(c, isPending);
        const matchesStatus = statusFilter === "all" || status === statusFilter;
        return matchesSearch && matchesStatus && matchesProjeto;
      })
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  }, [campanhas, searchTerm, statusFilter, projetoFilter, celulasAgendadas, perfis, ips]);

  const groupedByDay = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredData.forEach(c => {
      if (!groups[c.scheduled_date]) groups[c.scheduled_date] = [];
      groups[c.scheduled_date].push(c);
    });
    return groups;
  }, [filteredData]);

  const sortedDates = useMemo(() => {
    return Object.keys(groupedByDay).sort();
  }, [groupedByDay]);

  const scrollManual = (direction: 'up' | 'down') => {
    const scrollArea = document.querySelector('.planning-list-scroll');
    if (scrollArea) {
      const amount = direction === 'up' ? -300 : 300;
      scrollArea.scrollBy({ top: amount, behavior: 'smooth' });
    }
  };

  const scrollToToday = () => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const element = document.getElementById(`date-group-${todayStr}`);
    const scrollArea = document.querySelector('.planning-list-scroll');
    if (element && scrollArea) {
      const containerRect = scrollArea.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const relativeTop = elementRect.top - containerRect.top + scrollArea.scrollTop;
      scrollArea.scrollTo({ top: relativeTop - 16, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (!campanhasLoading && !celulasLoading && filteredData.length > 0) {
      const timer = setTimeout(scrollToToday, 500);
      return () => clearTimeout(timer);
    }
  }, [campanhasLoading, celulasLoading]);

  if (campanhasLoading || celulasLoading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando planejamento...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      {/* Header com Filtros (Espelhado do PlanejamentoList) */}
      <div className="p-4 border-b flex flex-col lg:flex-row gap-4 items-start lg:items-end justify-between bg-card/50">
        <div className="flex flex-wrap items-end gap-3 w-full lg:w-auto">
          <div className="flex flex-col gap-1 flex-1 min-w-[200px] lg:w-80 lg:flex-none">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground ml-1">Busca</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Casa, parceiro ou notas..."
                className="pl-9 h-10 border-muted-foreground/20 focus:border-primary"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-[150px] sm:flex-none sm:w-[180px]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground ml-1">Status</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 px-3 flex items-center gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="truncate">
                    <SelectValue placeholder="Status" />
                  </div>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="concluido">Feito (Conta Criada)</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="atrasado">Atrasado</SelectItem>
                <SelectItem value="planejado">Planejado</SelectItem>
              </SelectContent>
            </Select>
          </div>

        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground font-medium">
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7" 
              onClick={() => {
                if (selectedMonth === 1) {
                  setSelectedMonth(12);
                  setSelectedYear(selectedYear - 1);
                } else {
                  setSelectedMonth(selectedMonth - 1);
                }
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 min-w-[140px] justify-center">
              <CalendarIcon className="h-4 w-4" />
              <span className="capitalize">
                {format(new Date(selectedYear, selectedMonth - 1), "MMMM 'de' yyyy", { locale: ptBR })}
              </span>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={() => {
                if (selectedMonth === 12) {
                  setSelectedMonth(1);
                  setSelectedYear(selectedYear + 1);
                } else {
                  setSelectedMonth(selectedMonth + 1);
                }
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Badge variant="outline" className="font-mono">
            {filteredData.length} registros
          </Badge>
        </div>
      </div>

      {/* Lista com Navegação Flutuante */}
      <div className="flex-1 overflow-auto p-4 scroll-smooth planning-list-scroll relative">
        {filteredData.length > 0 && (
          <div className="sticky top-1/2 -translate-y-1/2 z-50 h-0 w-0">
            <div className="flex flex-col gap-2 absolute left-1 md:left-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="rounded-full shadow-lg border border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/15 hover:border-white/20 transition-all h-10 w-10 text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      scrollManual('up');
                    }}
                  >
                    <ChevronUp className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Subir</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="rounded-full shadow-xl border border-white/20 bg-white/10 backdrop-blur-md hover:bg-white/20 transition-all h-12 w-12 text-white hover:scale-105 active:scale-95"
                    onClick={(e) => {
                      e.stopPropagation();
                      scrollToToday();
                    }}
                  >
                    <Target className="h-6 w-6" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Hoje</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="rounded-full shadow-lg border border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/15 hover:border-white/20 transition-all h-10 w-10 text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      scrollManual('down');
                    }}
                  >
                    <ChevronDown className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Descer</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        {filteredData.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Filter className="h-12 w-12 opacity-20" />
            <p>Nenhum registro encontrado.</p>
          </div>
        ) : (
          <div className="space-y-8 max-w-5xl mx-auto">
            {sortedDates.map((dateStr) => {
              const camps = groupedByDay[dateStr];
              const dateObj = parseISO(dateStr);
              const isDateToday = isToday(dateObj);

              return (
                <div key={dateStr} id={`date-group-${dateStr}`} className="relative pl-8 md:pl-0 scroll-mt-4">
                  <div className="absolute left-[15px] md:left-[108px] top-0 bottom-0 w-px bg-border hidden sm:block" />
                  <div className="flex flex-col md:flex-row gap-4 md:gap-8">
                    <div className="md:w-20 shrink-0 md:text-right pt-1 sticky top-0 bg-background z-10 py-2 md:py-0">
                      <div className={cn(
                        "flex flex-row md:flex-col items-center md:items-end gap-2",
                        isDateToday ? "text-primary" : "text-muted-foreground"
                      )}>
                        <span className="text-xs uppercase font-bold tracking-wider">
                          {format(dateObj, "EEE", { locale: ptBR })}
                        </span>
                        <span className={cn(
                          "text-2xl font-black leading-none",
                          isDateToday && "text-primary scale-110 transition-transform"
                        )}>
                          {format(dateObj, "dd")}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 grid gap-3 pb-4">
                      {camps.map((camp) => {
                        const { perfil, linkedIp, isPending, celula, bookmakerCatalogoId } = resolveCampanhaData(camp);
                        const status = getStatus(camp, isPending);
                        const cpfIndex = (celula as any)?.cpf_index || (perfil ? planningPerfilCpfIndex(perfis, perfil.id) : null);
                        const displayName = (celula as any)?.parceiro_id 
                                          ? (perfis.find(p => p.parceiro_id === (celula as any).parceiro_id)?.parceiro?.nome || "Carregando...")
                                          : (camp.parceiro_snapshot?.nome || (perfil ? perfilDisplayName(perfil) : "Sem parceiro"));
                        const displayValue = camp.deposit_amount > 0 
                                          ? formatMoney(camp.deposit_amount, camp.currency)
                                          : (celula as any)?.deposito_sugerido 
                                            ? formatMoney((celula as any).deposito_sugerido, (celula as any).moeda || "BRL")
                                            : "R$ 0,00";

                        return (
                          <Card
                            key={camp.id}
                            className={cn(
                              "group relative overflow-hidden transition-all hover:shadow-md border-l-4",
                              status === "concluido" && "border-l-[#00FF66] bg-[#00FF66]/5",
                              status === "atrasado" && "border-l-destructive bg-destructive/5",
                              status === "pendente" && "border-l-[#FFD700] bg-[#FFD700]/5",
                              status === "planejado" && "border-l-primary/50 bg-primary/5"
                            )}
                          >
                            <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <BookmakerLogo
                                  logoUrl={logoMap[bookmakerCatalogoId || ""] || null}
                                  alt={camp.bookmaker_nome || "Casa"}
                                  size="h-10 w-10"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-base truncate">{camp.bookmaker_nome || "Sem Nome"}</h3>
                                    {status === "concluido" && (
                                      <Badge className="bg-[#00FF66] hover:bg-[#00FF66]/80 text-[#00331a] text-[10px] h-5 font-bold border-none shadow-sm">
                                        FEITO
                                      </Badge>
                                    )}
                                    {status === "atrasado" && (
                                      <Badge variant="destructive" className="text-[10px] h-5 font-bold border-none shadow-sm">
                                        ATRASADO
                                      </Badge>
                                    )}
                                    {status === "pendente" && (
                                      <Badge className="bg-[#FFD700] hover:bg-[#FFD700]/80 text-[#332b00] text-[10px] h-5 font-bold border-none shadow-sm">
                                        PENDENTE
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1.5">
                                      <User className="h-3.5 w-3.5" />
                                      <span className="truncate">
                                        {displayName}
                                        {cpfIndex && (
                                          <span 
                                            className="ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm border"
                                            style={{
                                              backgroundColor: perfil?.cor ? `${perfil.cor}26` : 'hsl(var(--primary)/0.1)',
                                              borderColor: perfil?.cor || 'hsl(var(--primary))',
                                              color: perfil?.cor || 'hsl(var(--primary))'
                                            }}
                                          >
                                            CPF {cpfIndex}
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                                      <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                                      {displayValue}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="hidden lg:flex items-center gap-6 px-4 border-x text-sm text-muted-foreground">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] uppercase tracking-wider font-semibold opacity-60">IP / Proxy</span>
                                  <div className="flex items-center gap-1.5 text-foreground">
                                    <MapPin className="h-3.5 w-3.5 text-primary/70" />
                                    {linkedIp ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span 
                                            className="max-w-[120px] truncate cursor-pointer hover:text-primary transition-colors flex items-center gap-1 group/proxy"
                                            onClick={() => handleCopyProxy(linkedIp.ip_address)}
                                          >
                                            {linkedIp.label}
                                            <Copy className="h-3 w-3 opacity-0 group-hover/proxy:opacity-100 transition-opacity" />
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          <div className="flex flex-col gap-1">
                                            <p className="text-xs font-mono font-medium">{linkedIp.ip_address}</p>
                                            <p className="text-[10px] text-muted-foreground">Clique para copiar</p>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    ) : (
                                      <span className="max-w-[120px] truncate">Pendente</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col gap-0.5 min-w-[110px]">
                                  <span className="text-[10px] uppercase tracking-wider font-semibold opacity-60">Status</span>
                                  <div 
                                    className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-all active:scale-95 group/status"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleStatus(camp);
                                    }}
                                  >
                                    {status === "concluido" ? (
                                      <span className="flex items-center gap-1 text-[#00FF66] font-bold">
                                        <CheckCircle2 className="h-3.5 w-3.5 fill-[#00FF66]/20" /> Concluído
                                      </span>
                                    ) : (
                                      <span className={cn(
                                        "flex items-center gap-1 font-bold",
                                        status === "atrasado" ? "text-destructive" : "text-[#FFD700]"
                                      )}>
                                        <Clock className="h-3.5 w-3.5" /> 
                                        {status === "atrasado" ? "Atrasado" : "Pendente"}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-colors"
                                  onClick={() => {
                                    setEditingCampanha(camp);
                                    setIsDialogOpen(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isDialogOpen && (
        <CampanhaDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          scheduledDate={editingCampanha?.scheduled_date || ""}
          campanha={editingCampanha}
          campanhasDoMes={campanhas}
        />
      )}
    </div>
  );
}
