 import { useState, useMemo, useRef, useEffect } from "react";
 import { 
   ChevronUp,
   ChevronDown,
   Target,
  CheckCircle2, 
  Clock, 
  Calendar as CalendarIcon, 
  Filter,
  User,
  MapPin,
  Wallet,
  Copy,
  History,
  LayoutGrid,
  List,
  Pencil
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  useUpsertCampanha
} from "@/hooks/usePlanningData";
import { useCelulasAgendadasPorCampanhas } from "@/hooks/usePlanoCelulasDisponiveis";
import { format, parseISO, startOfDay, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { BookmakerLogo } from "@/components/ui/bookmaker-logo";
import { toast } from "sonner";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { OperationsHistoryModule } from "./operations";
import { useTabFilters } from "@/hooks/useTabFilters";
import { useOperationsHistory } from "./operations/useOperationsHistory";
import { CampanhaDialog } from "../planejamento/CampanhaDialog";

interface ProjetoPlanejamentoTabProps {
  projetoId: string;
  refreshTrigger?: number;
}

export function ProjetoPlanejamentoTab({ projetoId, refreshTrigger = 0 }: ProjetoPlanejamentoTabProps) {
  // 1. Estados de Navegação e Filtros LOCAIS (Padrão OperationsHistoryModule)
  const { subTab, setSubTab, viewMode, setViewMode } = useOperationsHistory({
    storageKey: `planejamento-${projetoId}`,
    initialSubTab: "abertas",
    initialViewMode: "list"
  });

  const tabFilters = useTabFilters({
    tabId: "planejamento",
    projetoId,
    defaultPeriod: "mes_atual",
    persist: true
  });

  // 2. Fetch de Dados
  // Pegamos o ano/mês do range de filtros para a query de campanhas
  const selectedDate = tabFilters.dateRange?.start || new Date();
  const selectedYear = selectedDate.getFullYear();
  const selectedMonth = selectedDate.getMonth() + 1;

  const { data: allCampanhas = [], isLoading: campanhasLoading } = usePlanningCampanhas(selectedYear, selectedMonth);
  
  // Filtrar apenas para este projeto
  const campanhas = useMemo(() => 
    allCampanhas.filter(c => c.projeto_id === projetoId), 
    [allCampanhas, projetoId]
  );

  const campanhaIds = useMemo(() => campanhas.map(c => c.id), [campanhas]);
  const { data: celulasAgendadas = [], isLoading: celulasLoading } = useCelulasAgendadasPorCampanhas(campanhaIds);
  const { data: perfis = [] } = usePlanningPerfis();
  const { data: ips = [] } = usePlanningIps();
  const updateCampanha = useUpsertCampanha();
  const logoMap = useBookmakerLogoMap();
  const [editingCampanha, setEditingCampanha] = useState<PlanningCampanha | null>(null);
   const [isDialogOpen, setIsDialogOpen] = useState(false);
 
    // Container para scroll manual via setas
    const scrollManual = (direction: 'up' | 'down') => {
      // Buscamos o viewport do Radix que está dentro do OperationsHistoryModule
      const scrollArea = document.querySelector('.planning-module-container [data-radix-scroll-area-viewport]');
      if (scrollArea) {
        const amount = direction === 'up' ? -300 : 300;
        scrollArea.scrollBy({ top: amount, behavior: 'smooth' });
      }
    };

    // Ajuste no scrollToToday para buscar dentro do container correto
    const scrollToToday = () => {
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const element = document.getElementById(`date-group-${todayStr}`);
      const scrollArea = document.querySelector('.planning-module-container [data-radix-scroll-area-viewport]');
      
      if (element && scrollArea) {
        // Calculamos a posição relativa ao topo do viewport
        const containerRect = scrollArea.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const relativeTop = elementRect.top - containerRect.top + scrollArea.scrollTop;
        
        scrollArea.scrollTo({ top: relativeTop - 16, behavior: 'smooth' });
      } else if (!element) {
        const nextAvailable = sortedDates.find(date => date >= todayStr);
        if (nextAvailable && scrollArea) {
          const nextEl = document.getElementById(`date-group-${nextAvailable}`);
          if (nextEl) {
            const containerRect = scrollArea.getBoundingClientRect();
            const elementRect = nextEl.getBoundingClientRect();
            const relativeTop = elementRect.top - containerRect.top + scrollArea.scrollTop;
            scrollArea.scrollTo({ top: relativeTop - 16, behavior: 'smooth' });
          }
        }
      }
    };

    // Scroll automático inicial
    useEffect(() => {
      if (!campanhasLoading && !celulasLoading && filteredData.length > 0) {
        const timer = setTimeout(scrollToToday, 500);
        return () => clearTimeout(timer);
      }
    }, [campanhasLoading, celulasLoading, subTab, viewMode]);

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
    const today = startOfDay(new Date());
    if (isPending) {
      if (campDate < today) return "atrasado";
      return "pendente";
    }
    return "planejado";
  };

  const formatMoney = (v: number, currency: string) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);
  };

   const handleCopyProxy = (proxy: string) => {
     navigator.clipboard.writeText(proxy);
     toast.success("Proxy copiado para a área de transferência!");
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

   // 4. Filtragem por Sub-aba (Abertas vs Histórico) e Filtros Dimensionais
   const filteredData = useMemo(() => {
     return campanhas
       .map((c) => {
         const resolved = resolveCampanhaData(c);
         const status = getStatus(c, resolved.isPending);
         return { ...c, ...resolved, derivedStatus: status };
       })
       .filter((c) => {
         // 4a. Filtro de Sub-aba (Abertas vs Histórico)
         if (subTab === "abertas") {
           if (c.derivedStatus === "concluido") return false;
         } else {
           if (c.derivedStatus !== "concluido") return false;
         }
 
         // 4b. Filtro de Status (Atrasados, etc) - Se houver filtros de resultado aplicados
         if (tabFilters.resultados.length > 0) {
           // Mapear Status do Planejamento para o padrão de ResultadoFilter
           // "atrasado" -> "RED" (ou equivalente para filtro de atrasados)
           // No planejamento o usuário pediu filtro de "atrasados"
           const statusMap: Record<string, string> = {
             concluido: "GREEN",
             atrasado: "RED",
             pendente: "PENDENTE",
             planejado: "VOID",
           };
           const currentStatusAsResult = statusMap[c.derivedStatus];
           if (!tabFilters.resultados.includes(currentStatusAsResult as any)) return false;
         }
 
         // 4c. Filtros Dimensionais (Casas / Parceiros)
         if (tabFilters.bookmakerIds.length > 0) {
           const campAsAny = c as any;
           if (!tabFilters.bookmakerIds.includes(c.bookmaker_catalogo_id || "")) {
             // Tenta pelo ID interno também se disponível
             if (!tabFilters.bookmakerIds.includes(campAsAny.bookmaker_id || "")) return false;
           }
         }
 
         if (tabFilters.parceiroIds.length > 0) {
           if (!tabFilters.parceiroIds.includes(c.parceiroId || "")) return false;
         }
 
         return true;
       })
       .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
   }, [campanhas, celulasAgendadas, perfis, ips, subTab, tabFilters.resultados, tabFilters.bookmakerIds, tabFilters.parceiroIds]);

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

  // Contagens para o header do módulo
  const counts = useMemo(() => {
    const all = campanhas.map(c => {
      const resolved = resolveCampanhaData(c);
      return getStatus(c, resolved.isPending);
    });
    return {
      open: all.filter(s => s !== "concluido").length,
      history: all.filter(s => s === "concluido").length
    };
  }, [campanhas, celulasAgendadas, perfis, ips]);

  const renderContent = () => {
    if (filteredData.length === 0) return null;

     if (viewMode === "list") {
       return (
          <div className="space-y-8 max-w-5xl mx-auto py-4 relative min-h-full">
            {/* Navegação Flutuante Lateral - Agora Sticky e no lado Esquerdo (próximo às datas) */}
            <div className="sticky top-1/2 -translate-y-1/2 z-50 h-0 w-0">
              <div className="flex flex-col gap-2 absolute left-1 md:left-2">
                {filteredData.length > 0 && (
                  <>
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
                      <TooltipContent side="right" className="bg-background/95 backdrop-blur-sm border-white/10">Subir</TooltipContent>
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
                      <TooltipContent side="right" className="bg-background/95 backdrop-blur-sm border-white/10">Ir para Hoje</TooltipContent>
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
                      <TooltipContent side="right" className="bg-background/95 backdrop-blur-sm border-white/10">Descer</TooltipContent>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
 
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
                      const { perfil, linkedIp, celula, bookmakerCatalogoId } = camp;
                      const status = camp.derivedStatus;
                      
                      const cpfIndex = (celula as any)?.cpf_index || (perfil ? planningPerfilCpfIndex(perfis, perfil.id) : null);
                      const displayName = (celula as any)?.parceiro_id 
                                        ? (perfis.find(p => p.parceiro_id === (celula as any).parceiro_id)?.parceiro?.nome || "Carregando...")
                                        : (camp.parceiro_snapshot?.nome || 
                                          (perfil ? perfilDisplayName(perfil) : "Sem parceiro"));

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
                                   <div className="flex items-center gap-1.5 font-medium text-foreground" title={camp.deposit_amount === 0 ? "Valor sugerido pela célula" : "Valor depositado"}>
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
                                      <TooltipContent side="top" className="bg-popover border-border shadow-md">
                                        <div className="flex flex-col gap-1">
                                          <p className="text-xs font-mono font-medium">{linkedIp.ip_address}</p>
                                          <p className="text-[10px] text-muted-foreground">Clique para copiar o proxy</p>
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
                                   handleToggleStatus(camp as any);
                                 }}
                                 title="Clique para alternar o status"
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
                                  setEditingCampanha(camp as any);
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
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredData.map((camp) => (
          <Card key={camp.id} className="p-3 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookmakerLogo logoUrl={logoMap[camp.bookmaker_catalogo_id || ""] || null} alt={camp.bookmaker_nome} size="h-7 w-7" />
                <span className="font-bold text-sm truncate">{camp.bookmaker_nome}</span>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {format(parseISO(camp.scheduled_date), "dd/MM")}
              </Badge>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                <span className="truncate">{camp.parceiro_snapshot?.nome || (camp.perfil ? perfilDisplayName(camp.perfil) : "—")}</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium">
                <Wallet className="h-3 w-3" />
                {formatMoney(camp.deposit_amount, camp.currency)}
              </div>
            </div>

            <Button 
              size="sm" 
              className="w-full h-7 text-xs" 
              variant={camp.derivedStatus === "concluido" ? "secondary" : "default"}
              onClick={() => handleToggleStatus(camp as any)}
            >
              {camp.derivedStatus === "concluido" ? "Desmarcar FEITO" : "Marcar FEITO"}
            </Button>
          </Card>
        ))}
      </div>
    );
  };

    return (
      <div className="h-full flex flex-col min-h-0 relative">
        <OperationsHistoryModule
         projetoId={projetoId}
         title="Planejamento de Campanhas"
         tabFilters={tabFilters}
         openCount={counts.open}
         historyCount={counts.history}
         viewMode={viewMode}
         onViewModeChange={setViewMode}
         subTab={subTab}
         onSubTabChange={setSubTab}
         openContent={renderContent()}
         historyContent={renderContent()}
         emptyOpenMessage="Nenhum planejamento pendente para este projeto"
         emptyHistoryMessage="Nenhum planejamento concluído neste projeto"
         className="flex-1 h-full min-h-0"
         id="planning-scroll-container"
       />
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
