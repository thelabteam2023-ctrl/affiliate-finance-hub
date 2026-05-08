 import { useState, useMemo } from "react";
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
    Trash2,
    ChevronDown,
    ChevronUp,
    ChevronLeft,
    ChevronRight,
    Copy
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
   Table,
   TableBody,
   TableCell,
   TableHead,
  TableHeader,
  TableRow,
 } from "@/components/ui/table";
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
    useProjetos, useParceirosLite,
    PlanningPerfil,
    useUpsertCampanha,
    usePlanningExtras,
    useDeletePlanningExtra,
    PlanningExtra
 } from "@/hooks/usePlanningData";
 import { PlanningExtraDialog } from "./PlanningExtraDialog";
 import { useCelulasAgendadasPorCampanhas } from "@/hooks/usePlanoCelulasDisponiveis";
 import { format, parseISO, isPast, isToday, startOfDay } from "date-fns";
 import { ptBR } from "date-fns/locale";
 import { cn } from "@/lib/utils";
 import { CampanhaDialog } from "./CampanhaDialog";
 import { BookmakerLogo } from "@/components/ui/bookmaker-logo";
import { toast } from "sonner";
  import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
  import { PlanningProgressBar } from "./progress/PlanningProgressBar";
   import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
   import { useMultiCurrencyConversion } from "@/hooks/useMultiCurrencyConversion";
  import { TooltipProvider } from "@/components/ui/tooltip";
 
 export function PlanejamentoList() {
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [projetoFilter, setProjetoFilter] = useState<string>("all");
    const today = new Date();
    const [selectedYear, setSelectedYear] = useState(today.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
   
   // Para fins de simplificação, estamos buscando o mês atual. 
   // Em um cenário real, poderíamos ter um seletor de mês/ano mais robusto.
    const { data: campanhas = [], isLoading: campanhasLoading } = usePlanningCampanhas(selectedYear, selectedMonth);
    const { data: extras = [], isLoading: extrasLoading } = usePlanningExtras(selectedYear, selectedMonth);
    const [isExtraDialogOpen, setIsExtraDialogOpen] = useState(false);
    const [editingExtra, setEditingExtra] = useState<PlanningExtra | null>(null);
    const [displayCurrency, setDisplayCurrency] = useState<"BRL" | "USD">("BRL");
    const campanhaIds = useMemo(() => campanhas.map(c => c.id), [campanhas]);
    const { data: celulasAgendadas = [], isLoading: celulasLoading } = useCelulasAgendadasPorCampanhas(campanhaIds);
   const { data: perfis = [] } = usePlanningPerfis();
   const { data: ips = [] } = usePlanningIps();
    const { data: projetos = [] } = useProjetos();
    const { data: parceiros = [] } = useParceirosLite();
    const updateCampanha = useUpsertCampanha();
    const logoMap = useBookmakerLogoMap();
    
    // Hook para conversão multi-moeda centralizada
    const { convertToConsolidation } = useProjetoCurrency(undefined);
 
   const [editingCampanha, setEditingCampanha] = useState<PlanningCampanha | null>(null);
   const [isDialogOpen, setIsDialogOpen] = useState(false);
 
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

      // Simplificação do resolveScopedIpId do calendário
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
 
  const handleToggleStatus = async (camp: PlanningCampanha) => {
    const { celula } = resolveCampanhaData(camp);
    
    try {
      // Quando o status é "Atrasado", ele é derivado de (isPending && campDate < today).
      // Ao clicar para alternar, o usuário quer marcar como concluído (is_account_created: true).
      // Repassamos TODOS os campos existentes para garantir que a atualização no Supabase seja bem-sucedida.
      
      // Se a campanha não tem o ID da casa mas a célula tem, recuperamos para evitar erros de constraint
      const bookmakerId = camp.bookmaker_catalogo_id || celula?.bookmaker_catalogo_id;
      
      const payload = {
        ...camp,
        bookmaker_catalogo_id: bookmakerId,
        is_account_created: !camp.is_account_created,
        // Se estava marcado como 'feito' e o usuário desmarcou, volta para 'planned' (ou derivado)
        status: !camp.is_account_created ? 'done' : 'planned'
      };

      await updateCampanha.mutateAsync(payload);
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
    }
  };

  const handleCopyProxy = (proxy: string) => {
    navigator.clipboard.writeText(proxy);
    toast.success("Proxy copiado para a área de transferência!");
  };

  const filteredItems = useMemo(() => {
    const projectCampanhas = campanhas
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
      });

    const projectExtras = extras
      .filter((e) => {
        // Se tem data, incluímos no fluxo temporal (unificado)
        // Se não tem data, ele será mostrado na seção separada "Extras Operacionais (Sem Data)"
        if (!e.scheduled_date) return false;
        
        const matchesProjeto = projetoFilter === "all" || e.projeto_id === projetoFilter;
        const matchesSearch =
          e.bookmaker_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (e.notes || "").toLowerCase().includes(searchTerm.toLowerCase());
        const status = e.status === "done" ? "concluido" : (e.status === "pending" ? "pendente" : (e.status === "atrasado" ? "atrasado" : "planejado"));
        const matchesStatus = statusFilter === "all" || status === statusFilter;
        return matchesSearch && matchesStatus && matchesProjeto;
      });

    const unified = [
      ...projectCampanhas.map(c => ({ ...c, ui_type: 'campanha' })),
      ...projectExtras.map(e => ({ ...e, ui_type: 'extra' }))
    ];

    return unified.sort((a, b) => {
        const dateCompare = (a.scheduled_date || "").localeCompare(b.scheduled_date || "");
        if (dateCompare !== 0) return dateCompare;
        return (a.created_at || "").localeCompare(b.created_at || "");
    });
  }, [campanhas, extras, searchTerm, statusFilter, projetoFilter, celulasAgendadas, perfis, ips]);

  const groupedByDay = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredItems.forEach((c: any) => {
      if (!groups[c.scheduled_date]) groups[c.scheduled_date] = [];
      groups[c.scheduled_date].push(c);
    });
    return groups;
  }, [filteredItems]);

   const sortedDates = useMemo(() => {
     const allDates = new Set(Object.keys(groupedByDay));
     return Array.from(allDates).sort();
   }, [groupedByDay, extras]);
 
    const { convert, formatCurrency } = useMultiCurrencyConversion();

    const formatMoney = (v: number, currency: string) => {
      if (displayCurrency === "BRL") {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);
      }
      const valUSD = convert(v, currency, "USD");
      return formatCurrency(valUSD, "USD");
    };
 
    if (campanhasLoading || celulasLoading || extrasLoading) {
      return <div className="p-8 text-center text-muted-foreground">Carregando histórico...</div>;
    }


    return (
      <TooltipProvider>
      <div className="flex flex-col h-full bg-background overflow-hidden">
       {/* Header com Filtros */}
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

            <div className="flex flex-col gap-1 flex-1 min-w-[150px] sm:flex-none sm:w-[200px]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground ml-1">Projeto</span>
              <Select value={projetoFilter} onValueChange={setProjetoFilter}>
                <SelectTrigger className="h-10 px-3 flex items-center gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="truncate">
                      <SelectValue placeholder="Projeto" />
                    </div>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Projetos</SelectItem>
                  {projetos.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
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
             <Badge variant="outline" className="font-mono gap-1.5 px-2.5 py-1 bg-muted/30">
               <span className="text-primary font-black">{filteredItems.length}</span>
               <span className="opacity-60 text-[10px] uppercase tracking-tighter font-bold">Registros</span>
             </Badge>
          </div>
       </div>
 
       {/* Lista de Histórico */}
       <div className="flex-1 overflow-auto p-4 scroll-smooth space-y-4">
         <div className="max-w-5xl mx-auto">
           <PlanningProgressBar 
             campanhas={filteredItems} 
             extras={extras}
             year={selectedYear} 
             month={selectedMonth} 
             convertToConsolidation={convertToConsolidation}
             displayCurrency={displayCurrency}
             onDisplayCurrencyChange={setDisplayCurrency}
             onAddExtra={() => {
               setEditingExtra(null);
               setIsExtraDialogOpen(true);
             }}
           />
          <PlanningExtraDialog 
            open={isExtraDialogOpen}
            onOpenChange={setIsExtraDialogOpen}
            extra={editingExtra}
            projetoId={projetoFilter !== "all" ? projetoFilter : undefined}
          />
         </div>

          {filteredItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Filter className="h-12 w-12 opacity-20" />
            <p>Nenhum registro encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <div className="space-y-8 max-w-5xl mx-auto">
            {extras.filter(e => {
              if (e.scheduled_date) return false;
              const matchesProjeto = projetoFilter === "all" || e.projeto_id === projetoFilter;
              const matchesSearch = e.bookmaker_nome.toLowerCase().includes(searchTerm.toLowerCase()) || (e.notes || "").toLowerCase().includes(searchTerm.toLowerCase());
              const status = e.status === "done" ? "concluido" : (e.status === "pending" ? "pendente" : (e.status === "atrasado" ? "atrasado" : "planejado"));
              const matchesStatus = statusFilter === "all" || status === statusFilter;
              return matchesProjeto && matchesSearch && matchesStatus;
            }).length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-2">
                  <Badge variant="outline" className="bg-blue-500/5 text-blue-500 border-blue-500/20 font-black tracking-widest text-[10px] uppercase">
                    Extras Operacionais (Sem Data)
                  </Badge>
                  <div className="h-px flex-1 bg-border/50" />
                </div>
                <div className="grid gap-3">
                  {extras.filter(e => {
                    if (e.scheduled_date) return false;
                    const matchesProjeto = projetoFilter === "all" || e.projeto_id === projetoFilter;
                    const matchesSearch = e.bookmaker_nome.toLowerCase().includes(searchTerm.toLowerCase()) || (e.notes || "").toLowerCase().includes(searchTerm.toLowerCase());
                    const status = e.status === "done" ? "concluido" : (e.status === "pending" ? "pendente" : (e.status === "atrasado" ? "atrasado" : "planejado"));
                    const matchesStatus = statusFilter === "all" || status === statusFilter;
                    return matchesProjeto && matchesSearch && matchesStatus;
                  }).map((extra) => (
                    <Card
                      key={extra.id}
                      onClick={() => {
                        setEditingExtra(extra);
                        setIsExtraDialogOpen(true);
                      }}
                      className="group relative overflow-hidden transition-all hover:shadow-md border-l-4 border-l-blue-500 bg-blue-500/5 cursor-pointer"
                    >
                      <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold shrink-0">
                            EX
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-sm truncate">{extra.bookmaker_nome}</h3>
                              <Badge variant="secondary" className="text-[10px] h-4 bg-blue-500/10 text-blue-500 border-blue-500/20 font-bold">EXTRA</Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <User className="h-3 w-3" />
                              <span className="truncate">
                                {perfis.find(p => p.id === extra.perfil_id)?.label_custom || perfis.find(p => p.parceiro_id === extra.parceiro_id)?.parceiro?.nome || "Sem parceiro"}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                          <div className="text-right">
                            <div className="font-bold text-sm text-blue-500">
                              {formatMoney(extra.deposit_amount, extra.currency)}
                            </div>
                            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">
                              Extra A-Temporal
                            </div>
                          </div>
                          <div className={cn(
                            "h-8 px-3 rounded-full flex items-center gap-1.5 text-[10px] font-bold border",
                            extra.status === "done" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-warning/10 border-warning/20 text-warning"
                          )}>
                            {extra.status === "done" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                            {extra.status === "done" ? "CONCLUÍDO" : "PENDENTE"}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {sortedDates.map((dateStr) => {
               const camps = groupedByDay[dateStr] || [];
               const dayExtras = extras.filter(e => e.scheduled_date === dateStr);
               const dateObj = parseISO(dateStr);
              const isDateToday = isToday(dateObj);

              return (
                <div key={dateStr} className="relative pl-8 md:pl-0">
                  {/* Linha do Tempo Visual */}
                  <div className="absolute left-[15px] md:left-[108px] top-0 bottom-0 w-px bg-border hidden sm:block" />

                  <div className="flex flex-col md:flex-row gap-4 md:gap-8">
                    {/* Data Fixa à Esquerda */}
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

           {/* Lista de Campanhas do Dia (incluindo Extras) */}
                    <div className="flex-1 grid gap-3 pb-4">
              {camps.map((camp: any) => {
                        const isExtra = camp.ui_type === 'extra';
                        
                        let perfil, linkedIp, isPending, celula, bookmakerCatalogoId, status, cpfIndex, displayName, displayValue;
                        
                        if (isExtra) {
                          const extra = camp;
                          perfil = perfis.find(p => p.id === extra.perfil_id);
                          linkedIp = ips.find(i => i.id === extra.ip_id);
                          isPending = extra.status === 'pending';
                          status = extra.status === 'done' ? 'concluido' : (extra.status === 'atrasado' ? 'atrasado' : 'pendente');
                          bookmakerCatalogoId = extra.bookmaker_catalogo_id;
                          cpfIndex = perfil ? planningPerfilCpfIndex(perfis, perfil.id) : null;
                          displayName = perfil ? perfilDisplayName(perfil) : (extra.parceiro_id ? (parceiros.find(p => p.id === extra.parceiro_id)?.nome || "Parceiro") : "Sem parceiro");
                          displayValue = formatMoney(extra.deposit_amount, extra.currency);
                        } else {
                          const res = resolveCampanhaData(camp);
                          perfil = res.perfil; linkedIp = res.linkedIp; isPending = res.isPending; celula = res.celula; bookmakerCatalogoId = res.bookmakerCatalogoId;
                          status = getStatus(camp, isPending);
                          cpfIndex = celula?.cpf_index || (perfil ? planningPerfilCpfIndex(perfis, perfil.id) : null);
                          displayName = celula?.parceiro_id 
                                            ? (perfis.find(p => p.parceiro_id === celula.parceiro_id)?.parceiro?.nome || "Carregando...")
                                            : (camp.parceiro_snapshot?.nome || (perfil ? perfilDisplayName(perfil) : "Sem parceiro"));
                          displayValue = camp.deposit_amount > 0 
                                            ? formatMoney(camp.deposit_amount, camp.currency)
                                            : celula?.deposito_sugerido 
                                              ? formatMoney(celula.deposito_sugerido, celula.moeda || "BRL")
                                              : formatMoney(0, "BRL");
                        }

                        return (
                          <Card
                            key={camp.id}
                            className={cn(
                              "group relative overflow-hidden transition-all hover:shadow-md border-l-4",
                              isExtra && "border-dashed border-opacity-60",
                              status === "concluido" && "border-l-[#00FF66] bg-[#00FF66]/5",
                              status === "atrasado" && "border-l-destructive bg-destructive/5",
                              status === "pendente" && "border-l-[#FFD700] bg-[#FFD700]/5",
                              status === "planejado" && "border-l-primary/50 bg-primary/5"
                            )}
                            onClick={() => {
                              if (isExtra) {
                                 setEditingExtra(camp as PlanningExtra);
                                setIsExtraDialogOpen(true);
                              }
                            }}
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
                                    {isExtra && <Badge variant="secondary" className="text-[10px] h-4 bg-primary/10 text-primary border-primary/20 font-bold">EXTRA</Badge>}
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
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleCopyProxy(linkedIp.ip_address);
                                            }}
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
                                      if (isExtra) {
                                         setEditingExtra(camp as PlanningExtra);
                                        setIsExtraDialogOpen(true);
                                      } else {
                                        handleToggleStatus(camp);
                                      }
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
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isExtra) {
                                       setEditingExtra(camp as PlanningExtra);
                                      setIsExtraDialogOpen(true);
                                    } else {
                                      setEditingCampanha(camp);
                                      setIsDialogOpen(true);
                                    }
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
      </TooltipProvider>
    );
  }