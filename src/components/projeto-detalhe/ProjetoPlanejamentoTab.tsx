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
          className="flex-1 h-full min-h-0 planning-module-container"
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
