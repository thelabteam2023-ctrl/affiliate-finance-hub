import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, Users, CheckCircle2, Plus, Gift, Hourglass, X,
  Filter, ChevronDown, ChevronUp, TrendingUp, Download, Inbox,
} from "lucide-react";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
import { ptBR } from "date-fns/locale";
import { PagamentoParticipacaoDialog } from "@/components/projetos/PagamentoParticipacaoDialog";
import { ParticipacaoManualDialog } from "./ParticipacaoManualDialog";
import { useCotacoes } from "@/hooks/useCotacoes";
import { getMoedaSymbol } from "@/types/projeto";
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
  projetos?: { nome: string; status?: string; moeda_consolidacao?: string | null } | null;
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
  const { convertToBRL } = useCotacoes();
  const [loading, setLoading] = useState(true);
  const [participacoes, setParticipacoes] = useState<Participacao[]>([]);
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [selectedParticipacao, setSelectedParticipacao] = useState<Participacao | null>(null);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [view, setView] = useState<"pendentes" | "historico">("pendentes");
  const [expandedInvestidores, setExpandedInvestidores] = useState<Record<string, boolean>>({});
  const [tipoFilter, setTipoFilter] = useState<string>("todos");

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
          projetos(nome, status, moeda_consolidacao),
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

  // Helpers
  const getMoeda = (p: Participacao) => (p.projetos?.moeda_consolidacao || "BRL").toUpperCase();
  const toBRL = (p: Participacao) => convertToBRL(Number(p.valor_participacao) || 0, getMoeda(p));
  const fmtBRL = (v: number) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtNative = (v: number, moeda: string) =>
    `${getMoedaSymbol(moeda)} ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

  const toggleInvestidor = (id: string) => {
    setExpandedInvestidores(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Filters
  const participacoesFiltradas = useMemo(() => {
    let arr = participacoes;
    if (filtroInvestidor) arr = arr.filter(p => p.investidor_id === filtroInvestidor);
    if (tipoFilter !== "todos") {
      if (tipoFilter === "NORMAL") arr = arr.filter(p => !p.tipo_participacao || p.tipo_participacao === "NORMAL");
      else arr = arr.filter(p => p.tipo_participacao === tipoFilter);
    }
    return arr;
  }, [participacoes, filtroInvestidor, tipoFilter]);

  // Classificação semântica (status agregado)
  const isAguardando = (p: Participacao) =>
    p.status === "AGUARDANDO_CICLO" ||
    (p.status === "A_PAGAR" && p.projeto_ciclos?.status === "EM_ANDAMENTO");
  const isPronto = (p: Participacao) =>
    p.status === "A_PAGAR" && p.projeto_ciclos?.status !== "EM_ANDAMENTO";
  const isPago = (p: Participacao) => p.status === "PAGO";

  const pendentes = participacoesFiltradas.filter(p => isAguardando(p) || isPronto(p));
  const pagas = participacoesFiltradas.filter(isPago);

  // Totais consolidados em BRL (multimoeda corrigida)
  const totalPendenteBRL = pendentes.reduce((acc, p) => acc + toBRL(p), 0);
  const totalProntoBRL = pendentes.filter(isPronto).reduce((acc, p) => acc + toBRL(p), 0);
  const totalAguardandoBRL = pendentes.filter(isAguardando).reduce((acc, p) => acc + toBRL(p), 0);

  const now = new Date();
  const mesAtualKey = format(now, "yyyy-MM");
  const pagasMesAtual = pagas.filter(p => {
    if (!p.data_pagamento) return false;
    try { return format(parseLocalDate(p.data_pagamento), "yyyy-MM") === mesAtualKey; } catch { return false; }
  });
  const totalPagoMesBRL = pagasMesAtual.reduce((acc, p) => acc + toBRL(p), 0);
  const totalPagoTudoBRL = pagas.reduce((acc, p) => acc + toBRL(p), 0);

  // Agrupamento por investidor (apenas pendências)
  const pendentesPorInvestidor = useMemo(() => {
    const map = new Map<string, { nome: string; itens: Participacao[]; totalBRL: number }>();
    pendentes.forEach(p => {
      const id = p.investidor_id;
      const nome = p.investidores?.nome || "—";
      if (!map.has(id)) map.set(id, { nome, itens: [], totalBRL: 0 });
      const g = map.get(id)!;
      g.itens.push(p);
      g.totalBRL += toBRL(p);
    });
    return Array.from(map.entries())
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => b.totalBRL - a.totalBRL);
  }, [pendentes, convertToBRL]);

  const getBaseCalculoLabel = (base: string) =>
    base === "LUCRO_BRUTO" ? "Lucro Bruto" : "Lucro Líquido";

  // Export CSV
  const exportCSV = () => {
    const rows = view === "pendentes" ? pendentes : pagas;
    const header = [
      "Investidor", "Projeto", "Ciclo", "Data Apuração", "Data Pagamento",
      "Moeda", "Valor Original", "Valor BRL", "Base", "%", "Tipo", "Status",
    ];
    const lines = rows.map(p => {
      const moeda = getMoeda(p);
      return [
        p.investidores?.nome || "",
        p.projetos?.nome || "",
        p.projeto_ciclos?.numero_ciclo ?? "",
        p.data_apuracao ? format(parseLocalDate(p.data_apuracao), "yyyy-MM-dd") : "",
        p.data_pagamento ? format(parseLocalDate(p.data_pagamento), "yyyy-MM-dd") : "",
        moeda,
        (Number(p.valor_participacao) || 0).toFixed(2),
        toBRL(p).toFixed(2),
        getBaseCalculoLabel(p.base_calculo),
        `${p.percentual_aplicado}%`,
        p.tipo_participacao || "NORMAL",
        p.status,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `participacoes-${view}-${format(now, "yyyyMMdd-HHmm")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select
            value={filtroInvestidor || "todos"}
            onValueChange={(value) => {
              if (value === "todos") handleLimparFiltro();
              else setFiltroInvestidor(value);
            }}
          >
            <SelectTrigger className="w-[240px] h-9 text-sm">
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
          <Select value={tipoFilter} onValueChange={setTipoFilter}>
            <SelectTrigger className="w-[150px] h-9 text-sm">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="NORMAL">Normal</SelectItem>
              <SelectItem value="BONUS">Bônus</SelectItem>
              <SelectItem value="AJUSTE_POSITIVO">Ajuste positivo</SelectItem>
            </SelectContent>
          </Select>
          {(filtroInvestidor || tipoFilter !== "todos") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { handleLimparFiltro(); setTipoFilter("todos"); }}
              className="h-8 px-2 text-muted-foreground"
            >
              <X className="h-3.5 w-3.5 mr-1" /> Limpar
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="h-8">
            <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar CSV
          </Button>
          <Button onClick={() => setManualDialogOpen(true)} size="sm" className="h-8">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Nova Participação
          </Button>
        </div>
      </div>

      {/* ── KPI Strip (2 cards consolidados em BRL) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Hourglass className="h-4 w-4 text-amber-400" />
              <span className="text-xs text-muted-foreground">Pendente (consolidado em BRL)</span>
            </div>
            <Badge variant="secondary" className="text-[10px]">{pendentes.length}</Badge>
          </div>
          <p className="text-2xl font-bold text-amber-400 tabular-nums">{fmtBRL(totalPendenteBRL)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {fmtBRL(totalProntoBRL)} prontos p/ pagar
            <span className="text-muted-foreground/40"> · </span>
            {fmtBRL(totalAguardandoBRL)} aguardando ciclo
          </p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground">Pago este mês</span>
            </div>
            <Badge variant="secondary" className="text-[10px]">{pagasMesAtual.length}</Badge>
          </div>
          <p className="text-2xl font-bold text-emerald-400 tabular-nums">{fmtBRL(totalPagoMesBRL)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Total histórico: {fmtBRL(totalPagoTudoBRL)} ({pagas.length} pagamentos)
          </p>
        </div>
      </div>

      {/* ── Segmented control: Pendências / Histórico ── */}
      <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
        <button
          onClick={() => setView("pendentes")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            view === "pendentes" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Pendências ({pendentes.length})
        </button>
        <button
          onClick={() => setView("historico")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            view === "historico" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Histórico ({pagas.length})
        </button>
      </div>

      {/* ── Conteúdo ── */}
      {view === "pendentes" ? (
        pendentesPorInvestidor.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-10 w-10 text-muted-foreground/40" />}
            title="Nenhuma participação pendente"
            subtitle="Quando um ciclo for fechado, as participações dos investidores aparecerão aqui."
          />
        ) : (
          <div className="space-y-2">
            {pendentesPorInvestidor.map((g) => {
              const expanded = expandedInvestidores[g.id] !== false; // default open
              const prontosDoGrupo = g.itens.filter(isPronto);
              return (
                <Card key={g.id} className="overflow-hidden">
                  <button
                    onClick={() => toggleInvestidor(g.id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                        {g.nome.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="text-sm font-medium truncate">{g.nome}</p>
                        <p className="text-[11px] text-muted-foreground">{g.itens.length} ciclo(s) pendente(s)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-amber-400 tabular-nums">{fmtBRL(g.totalBRL)}</p>
                        {prontosDoGrupo.length > 0 && (
                          <p className="text-[10px] text-muted-foreground">{prontosDoGrupo.length} pronto(s) p/ pagar</p>
                        )}
                      </div>
                      {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>
                  {expanded && (
                    <CardContent className="pt-0 pb-3 px-3 space-y-2">
                      {g.itens.map((p) => (
                        <ParticipacaoRow
                          key={p.id}
                          p={p}
                          moeda={getMoeda(p)}
                          valorBRL={toBRL(p)}
                          fmtBRL={fmtBRL}
                          fmtNative={fmtNative}
                          getBaseCalculoLabel={getBaseCalculoLabel}
                          getTipoBadge={getTipoBadge}
                          isAguardando={isAguardando(p)}
                          action={isPronto(p) ? (
                            <Button size="sm" className="h-7 text-xs px-3" onClick={() => handlePagar(p)}>
                              Pagar
                            </Button>
                          ) : (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px]">
                              Aguardando ciclo
                            </Badge>
                          )}
                        />
                      ))}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )
      ) : (
        pagas.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-10 w-10 text-muted-foreground/40" />}
            title="Nenhum pagamento realizado"
            subtitle="Os pagamentos concluídos aparecerão aqui ordenados por data."
          />
        ) : (
          <Card>
            <CardContent className="p-3 space-y-2">
              {pagas
                .slice()
                .sort((a, b) => new Date(b.data_pagamento || b.data_apuracao).getTime() - new Date(a.data_pagamento || a.data_apuracao).getTime())
                .map((p) => (
                  <ParticipacaoRow
                    key={p.id}
                    p={p}
                    moeda={getMoeda(p)}
                    valorBRL={toBRL(p)}
                    fmtBRL={fmtBRL}
                    fmtNative={fmtNative}
                    getBaseCalculoLabel={getBaseCalculoLabel}
                    getTipoBadge={getTipoBadge}
                    showDate="pagamento"
                    isAguardando={false}
                  />
                ))}
            </CardContent>
          </Card>
        )
      )}

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

function ParticipacaoRow({
  p,
  moeda,
  valorBRL,
  fmtBRL,
  fmtNative,
  getBaseCalculoLabel,
  getTipoBadge,
  action,
  showDate,
  isAguardando,
}: {
  p: Participacao;
  moeda: string;
  valorBRL: number;
  fmtBRL: (v: number) => string;
  fmtNative: (v: number, moeda: string) => string;
  getBaseCalculoLabel: (base: string) => string;
  getTipoBadge: (tipo?: string) => React.ReactNode;
  action?: React.ReactNode;
  showDate?: "pagamento";
  isAguardando: boolean;
}) {
  const valueColor = showDate === "pagamento"
    ? "text-emerald-400"
    : isAguardando ? "text-blue-400" : "text-amber-400";

  const dateStr = showDate === "pagamento" && p.data_pagamento
    ? format(parseLocalDate(p.data_pagamento), "dd/MM/yyyy", { locale: ptBR })
    : format(parseLocalDate(p.data_apuracao), "dd/MM/yyyy", { locale: ptBR });

  const isMultimoeda = moeda !== "BRL";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/10 px-3 py-2.5 hover:bg-muted/20 transition-colors">
      {/* Left: Info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{p.projetos?.nome || "—"}</span>
            {getTipoBadge(p.tipo_participacao)}
            {isMultimoeda && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 bg-muted/40 border-border/60">{moeda}</Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground flex-wrap">
            <span>Ciclo #{p.projeto_ciclos?.numero_ciclo || "—"}</span>
            <span className="text-muted-foreground/40">•</span>
            <span>{dateStr}</span>
            {showDate === "pagamento" && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                Pago
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Center: Breakdown */}
      <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
        <div className="text-right min-w-[110px]">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {getBaseCalculoLabel(p.base_calculo)}
          </p>
          <p className="text-sm tabular-nums">{fmtNative(p.lucro_base, moeda)}</p>
        </div>
        <div className="text-center min-w-[48px]">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">%</p>
          <Badge variant="secondary" className="text-xs tabular-nums">{p.percentual_aplicado}%</Badge>
        </div>
      </div>

      {/* Right: Value + Action */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right min-w-[130px]">
          <p className={`text-sm font-bold tabular-nums ${valueColor}`}>
            {fmtNative(p.valor_participacao, moeda)}
          </p>
          {isMultimoeda && (
            <p className="text-[10px] text-muted-foreground tabular-nums">≈ {fmtBRL(valorBRL)}</p>
          )}
        </div>
        {action}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-border rounded-xl bg-muted/10">
      <div className="mb-3">{icon}</div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1 max-w-md">{subtitle}</p>}
    </div>
  );
}
