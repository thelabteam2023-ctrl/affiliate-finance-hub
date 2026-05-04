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
   ChevronUp
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
   perfilDisplayName
 } from "@/hooks/usePlanningData";
 import { format, parseISO, isPast, isToday, startOfDay } from "date-fns";
 import { ptBR } from "date-fns/locale";
 import { cn } from "@/lib/utils";
 import { CampanhaDialog } from "./CampanhaDialog";
 import { BookmakerLogo } from "@/components/ui/bookmaker-logo";
 import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
 
 export function PlanejamentoList() {
   const [searchTerm, setSearchTerm] = useState("");
   const [statusFilter, setStatusFilter] = useState<string>("all");
   const [selectedYear] = useState(new Date().getFullYear());
   const [selectedMonth] = useState(new Date().getMonth() + 1);
   
   // Para fins de simplificação, estamos buscando o mês atual. 
   // Em um cenário real, poderíamos ter um seletor de mês/ano mais robusto.
   const { data: campanhas = [], isLoading } = usePlanningCampanhas(selectedYear, selectedMonth);
   const { data: perfis = [] } = usePlanningPerfis();
   const logoMap = useBookmakerLogoMap();
 
   const [editingCampanha, setEditingCampanha] = useState<PlanningCampanha | null>(null);
   const [isDialogOpen, setIsDialogOpen] = useState(false);
 
   const isCampanhaPending = (c: PlanningCampanha) => {
     return !c.parceiro_id || !c.ip_id || !c.wallet_id || Number(c.deposit_amount) <= 0;
   };
 
   const getStatus = (c: PlanningCampanha) => {
     if (c.is_account_created) return "concluido";
     
     const campDate = startOfDay(parseISO(c.scheduled_date));
     const today = startOfDay(new Date());
     
     if (isCampanhaPending(c)) {
       if (campDate < today) return "atrasado";
       return "pendente";
     }
     
     return "planejado";
   };
 
   const filteredCampanhas = useMemo(() => {
     return campanhas.filter(c => {
       const matchesSearch = 
         c.bookmaker_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
         (c.parceiro_snapshot?.nome || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
         (c.notes || "").toLowerCase().includes(searchTerm.toLowerCase());
       
       const status = getStatus(c);
       const matchesStatus = statusFilter === "all" || status === statusFilter;
       
       return matchesSearch && matchesStatus;
     }).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
   }, [campanhas, searchTerm, statusFilter]);
 
   const formatMoney = (v: number, currency: string) => {
     return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);
   };
 
   if (isLoading) {
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
         </div>
 
         <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
           <CalendarIcon className="h-4 w-4" />
           {format(new Date(selectedYear, selectedMonth - 1), "MMMM 'de' yyyy", { locale: ptBR })}
           <Badge variant="outline" className="ml-2 font-mono">
             {filteredCampanhas.length} registros
           </Badge>
         </div>
       </div>
 
       {/* Lista de Histórico */}
       <div className="flex-1 overflow-auto p-4">
         {filteredCampanhas.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
             <Filter className="h-12 w-12 opacity-20" />
             <p>Nenhum registro encontrado para os filtros selecionados.</p>
           </div>
         ) : (
           <div className="grid gap-3">
             {filteredCampanhas.map((camp) => {
               const status = getStatus(camp);
               const dateObj = parseISO(camp.scheduled_date);
               
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
                     {/* Data */}
                     <div className="flex flex-col items-center justify-center min-w-[60px] py-1 px-2 rounded-lg bg-background border shadow-sm">
                       <span className="text-[10px] uppercase font-bold text-muted-foreground">
                         {format(dateObj, "EEE", { locale: ptBR })}
                       </span>
                       <span className="text-xl font-bold leading-none">
                         {format(dateObj, "dd")}
                       </span>
                     </div>
 
                     {/* Casa e Info Principal */}
                     <div className="flex items-center gap-3 flex-1 min-w-0">
                       <BookmakerLogo 
                         logoUrl={logoMap[camp.bookmaker_catalogo_id || ""] || null} 
                         alt={camp.bookmaker_nome}
                         size="h-12 w-12"
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
                         </div>
                         <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                           <div className="flex items-center gap-1.5">
                             <User className="h-3.5 w-3.5" />
                             <span>{camp.parceiro_snapshot?.nome || "Sem parceiro"}</span>
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
                       <div className="flex flex-col gap-1">
                         <span className="text-[10px] uppercase tracking-wider font-semibold opacity-60">IP / Proxy</span>
                         <div className="flex items-center gap-1.5 text-foreground">
                           <MapPin className="h-3.5 w-3.5 text-primary/70" />
                           {camp.ip_id ? "IP Vinculado" : "Pendente"}
                         </div>
                       </div>
                       <div className="flex flex-col gap-1">
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
                         className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                         onClick={() => {
                           setEditingCampanha(camp);
                           setIsDialogOpen(true);
                         }}
                       >
                         <Pencil className="h-4 w-4" />
                       </Button>
                     </div>
                   </div>
 
                   {/* Efeito de brilho sutil para os selos */}
                   {status === "concluido" && (
                     <div className="absolute top-0 right-0 p-1">
                       <div className="h-2 w-2 rounded-full bg-[#00FF66] shadow-[0_0_8px_#00FF66]" />
                     </div>
                   )}
                   {status === "atrasado" && (
                     <div className="absolute top-0 right-0 p-1">
                       <div className="h-2 w-2 rounded-full bg-destructive shadow-[0_0_8px_red]" />
                     </div>
                   )}
                   {status === "pendente" && (
                     <div className="absolute top-0 right-0 p-1">
                       <div className="h-2 w-2 rounded-full bg-[#FFD700] shadow-[0_0_8px_#FFD700]" />
                     </div>
                   )}
                 </Card>
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