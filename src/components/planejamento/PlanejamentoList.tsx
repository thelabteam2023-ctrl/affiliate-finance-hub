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
    ChevronRight
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
   PlanningCampanha, 
   usePlanningCampanhas, 
   usePlanningPerfis,
  perfilDisplayName,
  usePlanningIps,
   planningPerfilCpfIndex,
   useProjetos,
   PlanningPerfil
 } from "@/hooks/usePlanningData";
 import { useCelulasAgendadasPorCampanhas } from "@/hooks/usePlanoCelulasDisponiveis";
 import { format, parseISO, isPast, isToday, startOfDay } from "date-fns";
 import { ptBR } from "date-fns/locale";
 import { cn } from "@/lib/utils";
 import { CampanhaDialog } from "./CampanhaDialog";
 import { BookmakerLogo } from "@/components/ui/bookmaker-logo";
 import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
 
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
    const campanhaIds = useMemo(() => campanhas.map(c => c.id), [campanhas]);
    const { data: celulasAgendadas = [], isLoading: celulasLoading } = useCelulasAgendadasPorCampanhas(campanhaIds);
   const { data: perfis = [] } = usePlanningPerfis();
   const { data: ips = [] } = usePlanningIps();
   const { data: projetos = [] } = useProjetos();
   const logoMap = useBookmakerLogoMap();
 
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
      const bookmakerCatalogoId = c.bookmaker_catalogo_id || celula?.bookmaker_catalogo_id;

      // Simplificação do resolveScopedIpId do calendário
      const linkedIp = ips.find(i => i.id === c.ip_id) || 
                      (perfilId && bookmakerCatalogoId ? ips.find(i => i.perfil_planejamento_id === perfilId && i.bookmaker_catalogo_id === bookmakerCatalogoId) : null) ||
                      (parceiroId && bookmakerCatalogoId ? ips.find(i => {
                        const ipPerfil = perfis.find(p => p.id === i.perfil_planejamento_id);
                        return ipPerfil?.parceiro_id === parceiroId && i.bookmaker_catalogo_id === bookmakerCatalogoId;
                      }) : null) ||
                      (bookmakerCatalogoId ? ips.find(i => i.bookmaker_catalogo_id === bookmakerCatalogoId && !i.perfil_planejamento_id) : null);

      const isPending = !parceiroId && !perfilId || !linkedIp || !c.wallet_id || Number(c.deposit_amount) <= 0;
      
      return { perfil, linkedIp, isPending, parceiroId };
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
 
  const filteredCampanhas = useMemo(() => {
    return campanhas.filter(c => {
       const matchesProjeto = projetoFilter === "all" || c.projeto_id === projetoFilter;
      const matchesSearch = 
        c.bookmaker_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.parceiro_snapshot?.nome || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.notes || "").toLowerCase().includes(searchTerm.toLowerCase());
      
       const { isPending } = resolveCampanhaData(c);
       const status = getStatus(c, isPending);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      
       return matchesSearch && matchesStatus && matchesProjeto;
     }).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
   }, [campanhas, searchTerm, statusFilter, projetoFilter]);

  const groupedByDay = useMemo(() => {
    const groups: Record<string, PlanningCampanha[]> = {};
    filteredCampanhas.forEach(c => {
      if (!groups[c.scheduled_date]) groups[c.scheduled_date] = [];
      groups[c.scheduled_date].push(c);
    });
    return groups;
  }, [filteredCampanhas]);

  const sortedDates = useMemo(() => {
    return Object.keys(groupedByDay).sort();
  }, [groupedByDay]);
 
   const formatMoney = (v: number, currency: string) => {
     return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);
   };
 
    if (campanhasLoading || celulasLoading) {
     return <div className="p-8 text-center text-muted-foreground">Carregando histórico...</div>;
   }
 
   return (
     <div className="flex flex-col h-full bg-background overflow-hidden">
       {/* Header com Filtros */}
       <div className="p-4 border-b flex flex-col md:flex-row gap-4 items-center justify-between bg-card/50">
         <div className="flex items-center gap-3 w-full md:w-auto">
           <div className="relative flex-1 md:w-80">
             <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
             <Input
               placeholder="Buscar por casa, parceiro ou notas..."
               className="pl-9 h-9"
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
           </div>
           <Select value={statusFilter} onValueChange={setStatusFilter}>
             <SelectTrigger className="w-[180px] h-9">
               <Filter className="h-3.5 w-3.5 mr-2" />
               <SelectValue placeholder="Status" />
             </SelectTrigger>
             <SelectContent>
               <SelectItem value="all">Todos os Status</SelectItem>
               <SelectItem value="concluido">Feito (Conta Criada)</SelectItem>
               <SelectItem value="pendente">Pendente</SelectItem>
               <SelectItem value="atrasado">Atrasado</SelectItem>
               <SelectItem value="planejado">Planejado</SelectItem>
             </SelectContent>
           </Select>

           <Select value={projetoFilter} onValueChange={setProjetoFilter}>
             <SelectTrigger className="w-[200px] h-9">
               <Building2 className="h-3.5 w-3.5 mr-2" />
               <SelectValue placeholder="Projeto" />
             </SelectTrigger>
             <SelectContent>
               <SelectItem value="all">Todos os Projetos</SelectItem>
               {projetos.map(p => (
                 <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
               ))}
             </SelectContent>
           </Select>
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
              {filteredCampanhas.length} registros
            </Badge>
          </div>
       </div>
 
      {/* Lista de Histórico */}
      <div className="flex-1 overflow-auto p-4 scroll-smooth">
        {filteredCampanhas.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Filter className="h-12 w-12 opacity-20" />
            <p>Nenhum registro encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <div className="space-y-8 max-w-5xl mx-auto">
            {sortedDates.map((dateStr) => {
              const camps = groupedByDay[dateStr];
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

                    {/* Lista de Campanhas do Dia */}
                    <div className="flex-1 grid gap-3 pb-4">
                     {camps.map((camp) => {
                        const { perfil, linkedIp, isPending, parceiroId } = resolveCampanhaData(camp);
                        const status = getStatus(camp, isPending);
                        const displayName = camp.parceiro_snapshot?.nome || 
                                          (perfil ? perfilDisplayName(perfil) : "Sem parceiro");
                        const cpfIndex = perfil ? planningPerfilCpfIndex(perfis, perfil.id) : null;
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
                              {/* Casa e Info Principal */}
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <BookmakerLogo
                                  logoUrl={logoMap[camp.bookmaker_catalogo_id || ""] || null}
                                  alt={camp.bookmaker_nome}
                                  size="h-10 w-10"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-base truncate">{camp.bookmaker_nome}</h3>
                                    {status === "concluido" && (
                                      <Badge className="bg-[#00FF66] hover:bg-[#00FF66]/80 text-black text-[10px] h-5">
                                        FEITO
                                      </Badge>
                                    )}
                                    {status === "atrasado" && (
                                      <Badge variant="destructive" className="text-[10px] h-5 animate-pulse">
                                        ATRASADO
                                      </Badge>
                                    )}
                                    {status === "pendente" && (
                                      <Badge className="bg-[#FFD700] hover:bg-[#FFD700]/80 text-black text-[10px] h-5">
                                        PENDENTE
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1.5">
                                      <User className="h-3.5 w-3.5" />
                                      <span className="truncate">
                                        {displayName}
                                        {cpfIndex && <span className="ml-1.5 text-[10px] font-bold text-primary bg-primary/10 px-1 rounded">CPF {cpfIndex}</span>}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                                      <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                                      {formatMoney(camp.deposit_amount, camp.currency)}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Detalhes Técnicos (Desktop) */}
                              <div className="hidden lg:flex items-center gap-6 px-4 border-x text-sm text-muted-foreground">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] uppercase tracking-wider font-semibold opacity-60">IP / Proxy</span>
                                  <div className="flex items-center gap-1.5 text-foreground">
                                    <MapPin className="h-3.5 w-3.5 text-primary/70" />
                                    <span className="max-w-[120px] truncate">
                                      {linkedIp ? linkedIp.label : "Pendente"}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-0.5 min-w-[100px]">
                                  <span className="text-[10px] uppercase tracking-wider font-semibold opacity-60">Status</span>
                                  <div className="flex items-center gap-1.5">
                                    {status === "concluido" ? (
                                      <span className="flex items-center gap-1 text-[#00FF66] font-medium">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Concluído
                                      </span>
                                    ) : (
                                      <span className={cn(
                                        "flex items-center gap-1 font-medium",
                                        status === "atrasado" ? "text-destructive" : "text-[#FFD700]"
                                      )}>
                                        <Clock className="h-3.5 w-3.5" /> {status === "atrasado" ? "Atrasado" : "Pendente"}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Ações */}
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

                            {/* Indicadores de Status */}
                            <div className="absolute top-0 right-0 p-1 flex gap-1">
                              {status === "concluido" && (
                                <div className="h-2.5 w-2.5 rounded-full bg-[#00FF66] shadow-[0_0_12px_4px_rgba(0,255,102,0.6)] animate-pulse" title="Concluído" />
                              )}
                              {status === "atrasado" && (
                                <div className="h-2.5 w-2.5 rounded-full bg-destructive shadow-[0_0_12px_4px_rgba(239,68,68,0.6)] animate-pulse" title="Atrasado" />
                              )}
                              {status === "pendente" && (
                                <div className="h-2.5 w-2.5 rounded-full bg-[#FFD700] shadow-[0_0_12px_4px_rgba(255,215,0,0.6)] animate-pulse" title="Pendente" />
                              )}
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