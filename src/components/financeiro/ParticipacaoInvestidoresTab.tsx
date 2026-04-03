import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, Users, CheckCircle2, Clock, TrendingUp, Plus, Gift,
  Hourglass, X, Filter, ChevronDown, ChevronUp, DollarSign,
} from "lucide-react";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
import { ptBR } from "date-fns/locale";
import { PagamentoParticipacaoDialog } from "@/components/projetos/PagamentoParticipacaoDialog";
import { ParticipacaoManualDialog } from "./ParticipacaoManualDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Participacao {
  id: string;
  projeto_id: string;
  ciclo_id: string;
  investidor_id: string;
  percentual_aplicado: number;
  base_calculo: string;
  lucro_base: number;
  valor_participacao: number;
  status: string;
  data_apuracao: string;
  data_pagamento: string | null;
  observacoes: string | null;
  tipo_participacao?: string;
  participacao_referencia_id?: string | null;
  projetos?: { nome: string; status?: string } | null;
  investidores?: { nome: string } | null;
  projeto_ciclos?: {
    numero_ciclo: number;
    status: string;
    data_inicio?: string;
    data_fim_prevista?: string;
  } | null;
}

interface Investidor {
  id: string;
  nome: string;
}

interface ParticipacaoInvestidoresTabProps {
  formatCurrency: (value: number, currency?: string) => string;
  onRefresh?: () => void;
  investidorFiltroId?: string;
}

export function ParticipacaoInvestidoresTab({ formatCurrency, onRefresh, investidorFiltroId }: ParticipacaoInvestidoresTabProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [participacoes, setParticipacoes] = useState<Participacao[]>([]);
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [selectedParticipacao, setSelectedParticipacao] = useState<Participacao | null>(null);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    aguardando: true,
    pendentes: true,
    pagas: false,
  });

  const [investidores, setInvestidores] = useState<Investidor[]>([]);
  const [filtroInvestidor, setFiltroInvestidor] = useState<string | null>(investidorFiltroId || null);

  useEffect(() => {
    fetchData();
    fetchInvestidores();
  }, []);

  useEffect(() => {
    if (investidorFiltroId) {
      setFiltroInvestidor(investidorFiltroId);
    }
  }, [investidorFiltroId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("participacao_ciclos")
        .select(`
          *,
          projetos(nome, status),
          investidores(nome),
          projeto_ciclos(numero_ciclo, status, data_inicio, data_fim_prevista)
        `)
        .order("data_apuracao", { ascending: false });

      if (error) throw error;

      const now = new Date();
      const filtered = (data || []).filter((p: any) => {
        // Excluir projetos arquivados/finalizados
        const projetoStatus = p.projetos?.status;
        if (projetoStatus === "ARQUIVADO" || projetoStatus === "FINALIZADO") return false;

        // Excluir ciclos futuros (data_inicio no futuro)
        if (p.projeto_ciclos?.data_inicio) {
          const dataInicio = new Date(p.projeto_ciclos.data_inicio + "T00:00:00");
          if (dataInicio > now) return false;
        }

        return true;
      });
      setParticipacoes(filtered);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar participações",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTipoBadge = (tipo?: string) => {
    switch (tipo) {
      case "AJUSTE_POSITIVO":
        return (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5">
            <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
            Ajuste
          </Badge>
        );
      case "BONUS":
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] px-1.5">
            <Gift className="h-2.5 w-2.5 mr-0.5" />
            Bônus
          </Badge>
        );
      default:
        return null;
    }
  };

  const fetchInvestidores = async () => {
    try {
      const { data, error } = await supabase
        .from("investidores")
        .select("id, nome")
        .order("nome");

      if (error) throw error;
      setInvestidores(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar investidores:", error);
    }
  };

  const handleLimparFiltro = () => {
    setFiltroInvestidor(null);
    navigate("/financeiro?tab=participacoes", { replace: true });
  };

  const investidorFiltradoNome = useMemo(() => {
    if (!filtroInvestidor) return null;
    return investidores.find(i => i.id === filtroInvestidor)?.nome || null;
  }, [filtroInvestidor, investidores]);

  const handlePagar = (participacao: Participacao) => {
    setSelectedParticipacao(participacao);
    setPagamentoDialogOpen(true);
  };

  const handlePagamentoSuccess = () => {
    fetchData();
    onRefresh?.();
  };

  const handleManualSuccess = () => {
    fetchData();
    onRefresh?.();
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Filters
  const participacoesFiltradas = useMemo(() => {
    if (!filtroInvestidor) return participacoes;
    return participacoes.filter(p => p.investidor_id === filtroInvestidor);
  }, [participacoes, filtroInvestidor]);

  const aguardando = participacoesFiltradas.filter(p =>
    p.status === "AGUARDANDO_CICLO" ||
    (p.status === "A_PAGAR" && p.projeto_ciclos?.status === "EM_ANDAMENTO")
  );
  const pendentes = participacoesFiltradas.filter(p =>
    p.status === "A_PAGAR" &&
    p.projeto_ciclos?.status !== "EM_ANDAMENTO"
  );
  const pagas = participacoesFiltradas.filter(p => p.status === "PAGO");
  const reconhecidas = participacoesFiltradas.filter(p => p.status === "RECONHECIDO");
  const historico = [...pagas, ...reconhecidas].sort((a, b) => 
    new Date(b.data_apuracao).getTime() - new Date(a.data_apuracao).getTime()
  );

  const totalAguardando = aguardando.reduce((acc, p) => acc + p.valor_participacao, 0);
  const totalPendente = pendentes.reduce((acc, p) => acc + p.valor_participacao, 0);
  const totalPago = pagas.reduce((acc, p) => acc + p.valor_participacao, 0);
  const totalReconhecido = reconhecidas.reduce((acc, p) => acc + p.valor_participacao, 0);

  const getBaseCalculoLabel = (_base: string) => {
    return "Lucro Líquido";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select
            value={filtroInvestidor || "todos"}
            onValueChange={(value) => {
              if (value === "todos") handleLimparFiltro();
              else setFiltroInvestidor(value);
            }}
          >
            <SelectTrigger className="w-[280px] h-9 text-sm">
              <SelectValue placeholder="Filtrar investidor" />
            </SelectTrigger>
            <SelectContent className="min-w-[280px] max-h-[320px]">
              <SelectItem value="todos" className="py-2.5">
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">Todos os investidores</span>
                </div>
              </SelectItem>
              {investidores.map((inv) => (
                <SelectItem key={inv.id} value={inv.id} className="py-2.5">
                  <span className="font-medium">{inv.nome}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtroInvestidor && (
            <Button variant="ghost" size="sm" onClick={handleLimparFiltro} className="h-8 px-2 text-muted-foreground">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <Button onClick={() => setManualDialogOpen(true)} size="sm" className="h-8">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Nova Participação
        </Button>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          icon={<Hourglass className="h-4 w-4" />}
          label="Aguardando"
          value={formatCurrency(totalAguardando)}
          count={aguardando.length}
          color="blue"
        />
        <KPICard
          icon={<Clock className="h-4 w-4" />}
          label="Pronto p/ Pagar"
          value={formatCurrency(totalPendente)}
          count={pendentes.length}
          color="amber"
        />
        <KPICard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Pago"
          value={formatCurrency(totalPago)}
          count={pagas.length}
          color="emerald"
        />
        <KPICard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Total Ativo"
          value={formatCurrency(totalAguardando + totalPendente + totalPago)}
          count={participacoesFiltradas.length}
          color="primary"
        />
      </div>

      {/* ── Aguardando Fechamento ── */}
      <CollapsibleSection
        title="Aguardando Fechamento"
        count={aguardando.length}
        icon={<Hourglass className="h-4 w-4 text-blue-400" />}
        expanded={expandedSections.aguardando}
        onToggle={() => toggleSection("aguardando")}
        accentColor="blue"
      >
        {aguardando.length === 0 ? (
          <EmptyState text="Nenhuma participação aguardando fechamento" />
        ) : (
          <div className="space-y-2">
            {aguardando.map((p) => (
              <ParticipacaoRow
                key={p.id}
                p={p}
                formatCurrency={formatCurrency}
                getBaseCalculoLabel={getBaseCalculoLabel}
                getTipoBadge={getTipoBadge}
                accentColor="blue"
              />
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* ── Prontas para Pagamento ── */}
      <CollapsibleSection
        title="Prontas para Pagamento"
        count={pendentes.length}
        icon={<DollarSign className="h-4 w-4 text-amber-400" />}
        expanded={expandedSections.pendentes}
        onToggle={() => toggleSection("pendentes")}
        accentColor="amber"
      >
        {pendentes.length === 0 ? (
          <EmptyState text="Nenhuma participação pendente" />
        ) : (
          <div className="space-y-2">
            {pendentes.map((p) => (
              <ParticipacaoRow
                key={p.id}
                p={p}
                formatCurrency={formatCurrency}
                getBaseCalculoLabel={getBaseCalculoLabel}
                getTipoBadge={getTipoBadge}
                accentColor="amber"
                action={
                  <Button size="sm" className="h-7 text-xs px-3" onClick={() => handlePagar(p)}>
                    Pagar
                  </Button>
                }
              />
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* ── Histórico ── */}
      <CollapsibleSection
        title="Histórico de Pagamentos"
        count={historico.length}
        icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
        expanded={expandedSections.pagas}
        onToggle={() => toggleSection("pagas")}
        accentColor="emerald"
      >
        {historico.length === 0 ? (
          <EmptyState text="Nenhum pagamento realizado" />
        ) : (
          <div className="space-y-2">
            {historico.map((p) => (
              <ParticipacaoRow
                key={p.id}
                p={p}
                formatCurrency={formatCurrency}
                getBaseCalculoLabel={getBaseCalculoLabel}
                getTipoBadge={getTipoBadge}
                accentColor="emerald"
                showDate="pagamento"
              />
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Dialogs */}
      {selectedParticipacao && (
        <PagamentoParticipacaoDialog
          open={pagamentoDialogOpen}
          onOpenChange={setPagamentoDialogOpen}
          participacao={{
            id: selectedParticipacao.id,
            valor_participacao: selectedParticipacao.valor_participacao,
            projeto_id: selectedParticipacao.projeto_id,
            ciclo_id: selectedParticipacao.ciclo_id,
            investidor_id: selectedParticipacao.investidor_id,
            percentual_aplicado: selectedParticipacao.percentual_aplicado,
            base_calculo: selectedParticipacao.base_calculo,
            lucro_base: selectedParticipacao.lucro_base,
            data_apuracao: selectedParticipacao.data_apuracao,
            investidor_nome: selectedParticipacao.investidores?.nome || "Investidor",
            projeto_nome: selectedParticipacao.projetos?.nome || "Projeto",
            ciclo_numero: selectedParticipacao.projeto_ciclos?.numero_ciclo || 1,
          }}
          onSuccess={handlePagamentoSuccess}
        />
      )}

      <ParticipacaoManualDialog
        open={manualDialogOpen}
        onOpenChange={setManualDialogOpen}
        onSuccess={handleManualSuccess}
      />
    </div>
  );
}

/* ── Sub-components ── */

function KPICard({
  icon,
  label,
  value,
  count,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  count: number;
  color: "blue" | "amber" | "emerald" | "primary";
}) {
  const colorMap = {
    blue: { bg: "bg-blue-500/8", text: "text-blue-400", icon: "text-blue-400" },
    amber: { bg: "bg-amber-500/8", text: "text-amber-400", icon: "text-amber-400" },
    emerald: { bg: "bg-emerald-500/8", text: "text-emerald-400", icon: "text-emerald-400" },
    primary: { bg: "bg-primary/8", text: "text-foreground", icon: "text-primary" },
  };
  const c = colorMap[color];

  return (
    <div className={`rounded-xl border border-border/50 ${c.bg} p-3`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={c.icon}>{icon}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-lg font-bold ${c.text}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{count} participação(ões)</p>
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  icon,
  expanded,
  onToggle,
  accentColor,
  children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  accentColor: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{title}</span>
          <Badge variant="secondary" className="text-xs h-5 px-1.5">{count}</Badge>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <CardContent className="pt-0 pb-3 px-3">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

function ParticipacaoRow({
  p,
  formatCurrency,
  getBaseCalculoLabel,
  getTipoBadge,
  accentColor,
  action,
  showDate,
}: {
  p: Participacao;
  formatCurrency: (v: number) => string;
  getBaseCalculoLabel: (base: string) => string;
  getTipoBadge: (tipo?: string) => React.ReactNode;
  accentColor: string;
  action?: React.ReactNode;
  showDate?: "pagamento";
}) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-400",
    amber: "text-amber-400",
    emerald: "text-emerald-400",
  };
  const valueColor = colorMap[accentColor] || "text-foreground";

  const dateStr = showDate === "pagamento" && p.data_pagamento
    ? format(parseLocalDate(p.data_pagamento), "dd/MM/yyyy", { locale: ptBR })
    : format(parseLocalDate(p.data_apuracao), "dd/MM/yyyy", { locale: ptBR });

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/10 px-3 py-2.5 hover:bg-muted/20 transition-colors">
      {/* Left: Info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{p.investidores?.nome || "—"}</span>
            {getTipoBadge(p.tipo_participacao)}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground flex-wrap">
            <span className="truncate">{p.projetos?.nome || "—"}</span>
            <span className="text-muted-foreground/40">•</span>
            <span>Ciclo #{p.projeto_ciclos?.numero_ciclo || "—"}</span>
            <span className="text-muted-foreground/40">•</span>
            <span>{dateStr}</span>
          </div>
        </div>
      </div>

      {/* Center: Breakdown */}
      <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
        <div className="text-right min-w-[110px]">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {getBaseCalculoLabel(p.base_calculo)}
          </p>
          <p className="text-sm tabular-nums">{formatCurrency(p.lucro_base)}</p>
        </div>
        <div className="text-center min-w-[48px]">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">%</p>
          <Badge variant="secondary" className="text-xs tabular-nums">{p.percentual_aplicado}%</Badge>
        </div>
      </div>

      {/* Right: Value + Action */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right min-w-[120px]">
          <p className={`text-sm font-bold tabular-nums ${valueColor}`}>
            {formatCurrency(p.valor_participacao)}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums md:hidden">
            {p.percentual_aplicado}% de {formatCurrency(p.lucro_base)}
          </p>
        </div>
        {action}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-6 text-sm text-muted-foreground">
      {text}
    </div>
  );
}
