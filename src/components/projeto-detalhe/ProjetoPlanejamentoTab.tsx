import { useState, useMemo } from "react";
import { 
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
import { format, parseISO, startOfDay } from "date-fns";
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

  // 4. Filtragem por Sub-aba (Abertas vs Histórico)
  const filteredData = useMemo(() => {
    return campanhas.map(c => {
      const resolved = resolveCampanhaData(c);
      const status = getStatus(c, resolved.isPending);
      return { ...c, ...resolved, derivedStatus: status };
    }).filter(c => {
      // Filtro de Sub-aba
      if (subTab === "abertas") {
        return c.derivedStatus !== "concluido";
      } else {
        return c.derivedStatus === "concluido";
      }
    }).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  }, [campanhas, celulasAgendadas, perfis, ips, subTab]);

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
    if (filteredData.length === 0) return null; // OperationsHistoryModule lida com empty states

    if (viewMode === "list") {
      return (
        <div className="space-y-3">
          {filteredData.map((camp) => (
            <Card
              key={camp.id}
              className={cn(
                "group relative overflow-hidden transition-all border-l-4",
                camp.derivedStatus === "concluido" && "border-l-[#00FF66] bg-[#00FF66]/5",
                camp.derivedStatus === "atrasado" && "border-l-destructive bg-destructive/5",
                camp.derivedStatus === "pendente" && "border-l-[#FFD700] bg-[#FFD700]/5",
                camp.derivedStatus === "planejado" && "border-l-primary/50 bg-primary/5"
              )}
            >
              <div className="p-3 flex flex-col sm:flex-row items-center gap-4">
                <div className="flex flex-col items-center justify-center min-w-[60px] border-r pr-4 text-muted-foreground">
                  <span className="text-[10px] uppercase font-bold">{format(parseISO(camp.scheduled_date), "EEE", { locale: ptBR })}</span>
                  <span className="text-xl font-black">{format(parseISO(camp.scheduled_date), "dd")}</span>
                </div>

                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <BookmakerLogo
                    logoUrl={logoMap[camp.bookmaker_catalogo_id || ""] || null}
                    alt={camp.bookmaker_nome}
                    size="h-9 w-9"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate">{camp.bookmaker_nome}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <User className="h-3 w-3" />
                      <span className="truncate">
                        {camp.parceiro_snapshot?.nome || (camp.perfil ? perfilDisplayName(camp.perfil) : "Sem parceiro")}
                        {camp.perfil && (
                          <span className="ml-1.5 opacity-70">
                            (CPF {planningPerfilCpfIndex(perfis, camp.perfil.id)})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm px-4 border-l">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase opacity-60">Valor</span>
                    <span className="font-bold">{formatMoney(camp.deposit_amount, camp.currency)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase opacity-60">Status</span>
                    <button 
                      onClick={() => handleToggleStatus(camp as any)}
                      className={cn(
                        "font-bold text-xs hover:opacity-80 transition-all",
                        camp.derivedStatus === "concluido" ? "text-emerald-500" : camp.derivedStatus === "atrasado" ? "text-destructive" : "text-amber-500"
                      )}
                    >
                      {camp.derivedStatus === "concluido" ? "FEITO" : camp.derivedStatus === "atrasado" ? "ATRASADO" : "PENDENTE"}
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
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
    <div className="space-y-4">
      <OperationsHistoryModule
        projetoId={projetoId}
        title="Histórico de Planejamento"
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
        maxHeight="calc(100vh - 350px)"
      />
    </div>
  );
}
