import { useMemo, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Building2,
  Plus,
  Trash2,
  Settings2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  RotateCcw,
  Info,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  simularDistribuicao,
  type AutoSchedulerConfig,
  type SimulacaoResultado,
} from "@/lib/auto-scheduler";
import type { CelulaDisponivel } from "@/hooks/usePlanoCelulasDisponiveis";
import type { PlanningCampanha } from "@/hooks/usePlanningData";
import { useCotacoes } from "@/hooks/useCotacoes";

// Mesma palette CPF do calendário — 10 cores distintas (CPF 9 ≠ CPF 1, CPF 10 ≠ CPF 2)
const CPF_COLORS = [
  { bg: "hsl(45 95% 55% / 0.15)", border: "hsl(45 95% 55%)", text: "hsl(45 95% 65%)", dot: "hsl(45 95% 55%)" },   // 1 amarelo
  { bg: "hsl(142 70% 45% / 0.15)", border: "hsl(142 70% 45%)", text: "hsl(142 70% 55%)", dot: "hsl(142 70% 45%)" }, // 2 verde
  { bg: "hsl(217 90% 60% / 0.15)", border: "hsl(217 90% 60%)", text: "hsl(217 90% 70%)", dot: "hsl(217 90% 60%)" }, // 3 azul
  { bg: "hsl(0 80% 60% / 0.15)", border: "hsl(0 80% 60%)", text: "hsl(0 80% 70%)", dot: "hsl(0 80% 60%)" },         // 4 vermelho
  { bg: "hsl(280 70% 60% / 0.15)", border: "hsl(280 70% 60%)", text: "hsl(280 70% 70%)", dot: "hsl(280 70% 60%)" }, // 5 roxo
  { bg: "hsl(25 90% 55% / 0.15)", border: "hsl(25 90% 55%)", text: "hsl(25 90% 65%)", dot: "hsl(25 90% 55%)" },     // 6 laranja
  { bg: "hsl(180 70% 45% / 0.15)", border: "hsl(180 70% 45%)", text: "hsl(180 70% 55%)", dot: "hsl(180 70% 45%)" }, // 7 ciano
  { bg: "hsl(330 75% 60% / 0.15)", border: "hsl(330 75% 60%)", text: "hsl(330 75% 70%)", dot: "hsl(330 75% 60%)" }, // 8 pink
  { bg: "hsl(255 85% 70% / 0.18)", border: "hsl(255 85% 70%)", text: "hsl(255 85% 78%)", dot: "hsl(255 85% 70%)" }, // 9 lavanda/índigo (≠ amarelo)
  { bg: "hsl(160 60% 40% / 0.18)", border: "hsl(160 60% 40%)", text: "hsl(160 60% 55%)", dot: "hsl(160 60% 40%)" }, // 10 teal escuro (≠ verde)
];

function getCpfColor(idx: number | null | undefined) {
  if (!idx || idx < 1) return null;
  return CPF_COLORS[(idx - 1) % CPF_COLORS.length];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  celulas: CelulaDisponivel[];
  campanhasExistentes: PlanningCampanha[];
  year: number;
  month: number; // 1..12
}

const DEFAULT_CONFIG: AutoSchedulerConfig = {
  clonesPorDia: 3,
  maxCasasPorDia: 0,
  metaGanhoDia: 0,
  cooldownCasaDias: 3,
  cooldownCpfDias: 5,
  diaLimite: 25,
  minOutrasPorJanela: 1,
  janelaOutrasDias: 3,
  faixas: [],
  toleranciaFaixaPct: 10,
  regrasDiaSemana: [],
  seed: 1,
};

const DIAS_SEMANA: { value: number; label: string; short: string; label3: string }[] = [
  { value: 0, label: "Domingo", short: "D", label3: "Dom" },
  { value: 1, label: "Segunda", short: "S", label3: "Seg" },
  { value: 2, label: "Terça", short: "T", label3: "Ter" },
  { value: 3, label: "Quarta", short: "Q", label3: "Qua" },
  { value: 4, label: "Quinta", short: "Q", label3: "Qui" },
  { value: 5, label: "Sexta", short: "S", label3: "Sex" },
  { value: 6, label: "Sábado", short: "S", label3: "Sáb" },
];

export function SimulacaoDistribuicaoDialog({
  open,
  onOpenChange,
  celulas,
  campanhasExistentes,
  year,
  month,
}: Props) {
  const [config, setConfig] = useState<AutoSchedulerConfig>(DEFAULT_CONFIG);
  const [simulacao, setSimulacao] = useState<SimulacaoResultado | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [simYear, setSimYear] = useState(year);
  const [simMonth, setSimMonth] = useState(month);

  // Overrides manuais: celula.id -> novo dia (preservados entre recálculos)
  const [overrides, setOverrides] = useState<Map<string, number>>(new Map());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  // Drag de linha inteira: dia origem (swap entre dias)
  const [draggedDay, setDraggedDay] = useState<number | null>(null);

  // Reset de overrides ao trocar mês/abrir
  useEffect(() => {
    if (open) setOverrides(new Map());
  }, [open, simYear, simMonth]);

  // Cotações para conversão multimoeda → USD (modo simulação)
  const { cotacaoUSD, cotacaoEUR, cotacaoGBP, cotacaoMYR, cotacaoMXN, cotacaoARS, cotacaoCOP } = useCotacoes();

  /** Converte um valor da moeda original para USD usando cotações ativas. */
  const toUSD = (valor: number, moeda: string | null | undefined): number => {
    if (!valor || isNaN(valor)) return 0;
    const m = (moeda || "BRL").toUpperCase();
    if (m === "USD" || m === "USDT" || m === "USDC") return valor;
    if (cotacaoUSD <= 0) return valor; // proteção
    if (m === "BRL") return valor / cotacaoUSD;
    // Outras moedas: temos cotação X→BRL; convertemos via BRL → USD
    const xToBRL: Record<string, number> = {
      EUR: cotacaoEUR,
      GBP: cotacaoGBP,
      MYR: cotacaoMYR,
      MXN: cotacaoMXN,
      ARS: cotacaoARS,
      COP: cotacaoCOP,
    };
    const rate = xToBRL[m];
    if (rate && rate > 0) return (valor * rate) / cotacaoUSD;
    return valor; // fallback: assume já em USD
  };

  /** Formata número como USD compacto: $1,234.56 */
  const fmtUSD = (valor: number): string =>
    `$${valor.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Sync interno com props quando o dialog abre
  useEffect(() => {
    if (open) {
      setSimYear(year);
      setSimMonth(month);
    }
  }, [open, year, month]);

  useEffect(() => {
    if (!open) return;
    const r = simularDistribuicao({ celulas, campanhasExistentes, year: simYear, month: simMonth, config });
    setSimulacao(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, celulas, campanhasExistentes, simYear, simMonth]);

  const recalcular = () => {
    const novaSeed = Math.floor(Math.random() * 1_000_000) + 1;
    const novoConfig = { ...config, seed: novaSeed };
    setConfig(novoConfig);
    const r = simularDistribuicao({ celulas, campanhasExistentes, year: simYear, month: simMonth, config: novoConfig });
    setSimulacao(r);
  };

  const aplicarConfig = () => {
    const r = simularDistribuicao({ celulas, campanhasExistentes, year: simYear, month: simMonth, config });
    setSimulacao(r);
  };

  const mudarMes = (delta: number) => {
    let m = simMonth + delta;
    let y = simYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setSimMonth(m);
    setSimYear(y);
  };

  const NOMES_MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  // Aplica overrides manuais — cada agendamento pode ter sido movido pelo usuário
  // Também inclui células que estavam em "não couberam" mas foram arrastadas para um dia.
  const agendamentosFinais = useMemo(() => {
    if (!simulacao) return [];
    const base = simulacao.agendamentos.map((a) => {
      const novoDia = overrides.get(a.celula.id);
      if (novoDia && novoDia !== a.dia) {
        const mm = String(simMonth).padStart(2, "0");
        const dd = String(novoDia).padStart(2, "0");
        return { ...a, dia: novoDia, dateKey: `${simYear}-${mm}-${dd}` };
      }
      return a;
    });
    // Adiciona células não agendadas que receberam override (arrastadas para um dia)
    const idsAgendados = new Set(base.map((a) => a.celula.id));
    const extras = (simulacao.naoAgendadas ?? [])
      .filter((c) => overrides.has(c.id) && !idsAgendados.has(c.id))
      .map((c) => {
        const dia = overrides.get(c.id)!;
        const mm = String(simMonth).padStart(2, "0");
        const dd = String(dia).padStart(2, "0");
        return { celula: c, dia, dateKey: `${simYear}-${mm}-${dd}` };
      });
    return [...base, ...extras];
  }, [simulacao, overrides, simYear, simMonth]);

  const porDia = useMemo(() => {
    const map = new Map<number, typeof agendamentosFinais>();
    agendamentosFinais.forEach((a) => {
      if (!map.has(a.dia)) map.set(a.dia, []);
      map.get(a.dia)!.push(a);
    });
    return map;
  }, [agendamentosFinais]);

  // Células ainda "não couberam" (após overrides) — para o painel
  const naoAgendadasRestantes = useMemo(() => {
    if (!simulacao) return [];
    const idsAgendados = new Set(agendamentosFinais.map((a) => a.celula.id));
    return (simulacao.naoAgendadasDetalhe ?? []).filter((d) => !idsAgendados.has(d.celula.id));
  }, [simulacao, agendamentosFinais]);

  const dias = useMemo(() => {
    // Mostra TODOS os dias do mês (1..últimoDia), mesmo vazios, para permitir
    // arrastar manualmente células para qualquer dia (inclusive além do diaLimite).
    const ultimoDiaMes = new Date(simYear, simMonth, 0).getDate();
    const arr: number[] = [];
    for (let d = 1; d <= ultimoDiaMes; d++) arr.push(d);
    porDia.forEach((_, k) => {
      if (!arr.includes(k)) arr.push(k);
    });
    return arr.sort((a, b) => a - b);
  }, [porDia, simYear, simMonth]);

  // Detecta conflitos por agendamento (após overrides) — warnings, não bloqueia
  const conflitos = useMemo(() => {
    const conflitosPorId = new Map<string, string[]>();
    const cooldownCasa = config.cooldownCasaDias ?? 0;
    const cooldownCpf = config.cooldownCpfDias ?? 0;
    const isClone = (a: typeof agendamentosFinais[number]) =>
      (a.celula.grupo_nome || "").toLowerCase().includes("clone");

    // Index por dia → para detectar duplicatas no mesmo dia + cooldowns
    const porDiaCasa = new Map<string, number[]>(); // catalogoId -> dias
    const porDiaCpfClone = new Map<string, number[]>(); // cpfKey -> dias (só clones)
    const porDiaCasaSet = new Map<number, Set<string>>(); // dia -> set de catalogoIds

    agendamentosFinais.forEach((a) => {
      const k = a.celula.bookmaker_catalogo_id;
      if (!porDiaCasa.has(k)) porDiaCasa.set(k, []);
      porDiaCasa.get(k)!.push(a.dia);
      if (!porDiaCasaSet.has(a.dia)) porDiaCasaSet.set(a.dia, new Set());
      porDiaCasaSet.get(a.dia)!.add(k);
      if (isClone(a) && a.celula.cpf_index != null) {
        const ck = `cpf-${a.celula.cpf_index}`;
        if (!porDiaCpfClone.has(ck)) porDiaCpfClone.set(ck, []);
        porDiaCpfClone.get(ck)!.push(a.dia);
      }
    });

    agendamentosFinais.forEach((a) => {
      const issues: string[] = [];
      const k = a.celula.bookmaker_catalogo_id;
      // Casa duplicada no mesmo dia (>1)
      const diasCasa = porDiaCasa.get(k) ?? [];
      if (diasCasa.filter((d) => d === a.dia).length > 1) {
        issues.push("Casa duplicada no mesmo dia");
      }
      // Cooldown casa (apenas clones, conforme regra)
      if (isClone(a) && cooldownCasa > 0) {
        const proximo = diasCasa.find((d) => d !== a.dia && Math.abs(d - a.dia) <= cooldownCasa);
        if (proximo !== undefined) {
          issues.push(`Cooldown casa (${cooldownCasa}d) violado vs dia ${proximo}`);
        }
      }
      // Cooldown CPF clone
      if (isClone(a) && cooldownCpf > 0 && a.celula.cpf_index != null) {
        const ck = `cpf-${a.celula.cpf_index}`;
        const diasCpf = porDiaCpfClone.get(ck) ?? [];
        const proximo = diasCpf.find((d) => d !== a.dia && Math.abs(d - a.dia) <= cooldownCpf);
        if (proximo !== undefined) {
          issues.push(`Cooldown CPF ${a.celula.cpf_index} (${cooldownCpf}d) violado vs dia ${proximo}`);
        }
      }
      if (issues.length > 0) conflitosPorId.set(a.celula.id, issues);
    });
    return conflitosPorId;
  }, [agendamentosFinais, config]);

  const moverPara = (celulaId: string, novoDia: number) => {
    const last = new Date(simYear, simMonth, 0).getDate();
    if (novoDia < 1 || novoDia > last) return;
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(celulaId, novoDia);
      return next;
    });
  };

  /** Troca todas as casas do diaA pelas do diaB (swap completo). */
  const swapDias = (diaA: number, diaB: number) => {
    if (diaA === diaB) return;
    const last = new Date(simYear, simMonth, 0).getDate();
    if (diaA < 1 || diaA > last || diaB < 1 || diaB > last) return;
    const itensA = porDia.get(diaA) ?? [];
    const itensB = porDia.get(diaB) ?? [];
    setOverrides((prev) => {
      const next = new Map(prev);
      itensA.forEach((a) => next.set(a.celula.id, diaB));
      itensB.forEach((a) => next.set(a.celula.id, diaA));
      return next;
    });
  };

  const limparOverrides = () => setOverrides(new Map());

  const stats = simulacao?.estatisticas;
  const excedeu = stats ? stats.totalCelulas > stats.capacidadeMaxima : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[94vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Simulação de Distribuição
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Pré-visualize como as casas se distribuem no mês. A inserção no calendário continua manual.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Seletor de mês */}
              <div className="flex items-center gap-0.5 rounded-md border bg-background/50 px-1 py-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => mudarMes(-1)}
                  title="Mês anterior"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <div className="px-2 text-xs font-semibold tabular-nums min-w-[72px] text-center">
                  {NOMES_MES[simMonth - 1]} {simYear}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => mudarMes(1)}
                  title="Próximo mês"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              {overrides.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={limparOverrides}
                  title="Desfazer todos os movimentos manuais"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Resetar {overrides.size} mov.
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setSidebarOpen((v) => !v)}
              >
                <Settings2 className="h-3.5 w-3.5 mr-1" />
                {sidebarOpen ? "Ocultar config" : "Mostrar config"}
                {sidebarOpen ? (
                  <ChevronLeft className="h-3.5 w-3.5 ml-1" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                )}
              </Button>
              <Button onClick={recalcular} size="sm" className="h-8 text-xs">
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recalcular
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Layout split: sidebar + main */}
        <div className="flex-1 min-h-0 flex">
          {/* ============ MAIN — SIMULAÇÃO ============ */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Resumo compacto */}
            {stats && (
              <div className="px-5 py-2.5 border-b flex flex-wrap items-center gap-1.5 text-xs bg-muted/20">
                <Badge variant={stats.agendadas === stats.totalCelulas ? "default" : "secondary"}>
                  {stats.agendadas} / {stats.totalCelulas} agendadas
                </Badge>
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  Clones: {stats.totalClones}
                </Badge>
                <Badge variant="outline">Outras: {stats.totalOutras}</Badge>
                <Badge variant="outline">{stats.diasUsados} dias usados</Badge>
                <Badge variant="outline" title="Total convertido para USD pela cotação atual">
                  Σ depósito: {fmtUSD(
                    simulacao?.agendamentos.reduce(
                      (sum, a) => sum + toUSD(Number(a.celula.deposito_sugerido) || 0, a.celula.moeda),
                      0
                    ) ?? 0
                  )}
                </Badge>
                {stats.capacidadeMaxima > 0 && (
                  <Badge variant="outline">Cap. casas: {stats.capacidadeMaxima}</Badge>
                )}
                <Badge variant="outline">Cap. CPF clone: {stats.capacidadePorCpfClone}</Badge>
                {excedeu && (
                  <Badge variant="outline" className="border-warning text-warning">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Excede capacidade
                  </Badge>
                )}
              </div>
            )}

            {/* Faixas — removido a pedido */}
            {/* Calendário por dia — área principal */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
              {dias.length === 0 && (
                <p className="text-center text-xs text-muted-foreground italic py-12">
                  Nenhuma célula disponível para simular.
                </p>
              )}
              {dias.map((dia) => {
                const itens = porDia.get(dia) ?? [];
                const ganhoDia = itens.reduce(
                  (sum, a) => sum + toUSD(Number(a.celula.deposito_sugerido) || 0, a.celula.moeda),
                  0
                );
                const dow = new Date(simYear, simMonth - 1, dia).getDay();
                const dowLabel = DIAS_SEMANA[dow]?.label3 ?? "";
                const isWeekend = dow === 0 || dow === 6;
                return (
                  <div key={dia} className="flex gap-2 items-start">
                    <div
                      draggable
                      onDragStart={(e) => {
                        setDraggedDay(dia);
                        setDraggedId(null);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggedDay(null);
                        setDragOverDay(null);
                      }}
                      className={cn(
                        "shrink-0 w-16 text-right cursor-grab active:cursor-grabbing rounded-md px-1.5 py-1 transition-colors hover:bg-muted/40",
                        draggedDay === dia && "opacity-40 bg-primary/10"
                      )}
                      title="Arraste para trocar todas as casas deste dia com outro"
                    >
                      <div className="text-[10px] uppercase text-muted-foreground flex items-center justify-end gap-0.5">
                        <GripVertical className="h-2.5 w-2.5 opacity-50" />
                        Dia
                      </div>
                      <div className="flex items-baseline justify-end gap-1 leading-none">
                        <span className="text-lg font-bold tabular-nums">{dia}</span>
                        <span
                          className={cn(
                            "text-[10px] font-medium uppercase",
                            isWeekend ? "text-warning" : "text-muted-foreground"
                          )}
                        >
                          {dowLabel}
                        </span>
                      </div>
                      {ganhoDia > 0 && (
                        <div className="text-[9px] text-muted-foreground tabular-nums mt-0.5">
                          Σ {fmtUSD(ganhoDia)}
                        </div>
                      )}
                    </div>
                    <div
                      className={cn(
                        "flex-1 flex flex-wrap gap-1.5 p-1.5 rounded-md border bg-muted/20 min-h-[44px] transition-colors",
                        dragOverDay === dia &&
                          (draggedDay !== null
                            ? "ring-2 ring-warning border-warning/60 bg-warning/5"
                            : "ring-2 ring-primary border-primary/50 bg-primary/5")
                      )}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverDay !== dia) setDragOverDay(dia);
                      }}
                      onDragLeave={() => {
                        if (dragOverDay === dia) setDragOverDay(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverDay(null);
                        // Caso 1: swap de dia inteiro
                        if (draggedDay !== null) {
                          if (draggedDay !== dia) {
                            const a = (porDia.get(draggedDay) ?? []).length;
                            const b = (porDia.get(dia) ?? []).length;
                            swapDias(draggedDay, dia);
                            toast.success(`Dia ${draggedDay} ↔ Dia ${dia}`, {
                              description: `${a} ↔ ${b} casa(s) trocadas`,
                            });
                          }
                          setDraggedDay(null);
                          return;
                        }
                        // Caso 2: mover célula individual (agendada OU não-agendada)
                        if (!draggedId) return;
                        const ag = agendamentosFinais.find((x) => x.celula.id === draggedId);
                        if (ag) {
                          if (ag.dia === dia) {
                            setDraggedId(null);
                            return;
                          }
                          moverPara(draggedId, dia);
                          toast.success(`Movido para dia ${dia}`, {
                            description: ag.celula.bookmaker_nome,
                          });
                        } else {
                          // Célula vinda do painel "não couberam"
                          const naoAg = naoAgendadasRestantes.find((d) => d.celula.id === draggedId);
                          if (naoAg) {
                            moverPara(draggedId, dia);
                            toast.success(`Adicionado ao dia ${dia}`, {
                              description: naoAg.celula.bookmaker_nome,
                            });
                          }
                        }
                        setDraggedId(null);
                      }}
                    >
                      {itens.map((a) => {
                        const color = getCpfColor(a.celula.cpf_index);
                        const issues = conflitos.get(a.celula.id);
                        const moved = overrides.has(a.celula.id);
                        return (
                          <div
                            key={a.celula.id}
                            draggable
                            onDragStart={(e) => {
                              setDraggedId(a.celula.id);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => {
                              setDraggedId(null);
                              setDragOverDay(null);
                            }}
                            className={cn(
                              "flex items-center gap-1 px-1.5 py-1 rounded border text-[11px] cursor-grab active:cursor-grabbing transition-opacity",
                              draggedId === a.celula.id && "opacity-40",
                              issues && "ring-1 ring-warning/70"
                            )}
                            style={{
                              backgroundColor: color?.bg ?? "hsl(var(--card))",
                              borderColor: issues ? "hsl(var(--warning))" : color?.border ?? "hsl(var(--border))",
                            }}
                            title={
                              issues
                                ? `${a.celula.bookmaker_nome} • ${a.celula.grupo_nome}\n⚠ ${issues.join("\n⚠ ")}`
                                : `${a.celula.bookmaker_nome} • CPF ${a.celula.cpf_index ?? "?"} • ${a.celula.grupo_nome}${moved ? "\n(movido manualmente)" : ""}`
                            }
                          >
                            <GripVertical className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                            {a.celula.cpf_index ? (
                              <div
                                className="h-4 w-4 shrink-0 rounded flex items-center justify-center text-[9px] font-bold"
                                style={{ backgroundColor: color?.dot, color: "hsl(0 0% 10%)" }}
                              >
                                {a.celula.cpf_index}
                              </div>
                            ) : null}
                            {a.celula.bookmaker_logo ? (
                              <img
                                src={a.celula.bookmaker_logo}
                                alt=""
                                className="h-3.5 w-3.5 rounded object-contain shrink-0"
                              />
                            ) : (
                              <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                            )}
                            <span className="font-medium truncate max-w-[120px]">
                              {a.celula.bookmaker_nome}
                            </span>
                            {moved && (
                              <span className="text-[8px] px-1 rounded bg-primary/20 text-primary font-bold">M</span>
                            )}
                            {issues && (
                              <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Não agendadas — agrupadas por motivo (arrastáveis para qualquer dia) */}
              {naoAgendadasRestantes.length > 0 && (
                <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 p-2 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {naoAgendadasRestantes.length} célula(s) não couberam — arraste para um dia:
                  </div>
                  {(["cooldown_cpf", "cooldown_casa", "sem_capacidade", "outro"] as const).map(
                    (motivo) => {
                      const grupo = naoAgendadasRestantes.filter((d) => d.motivo === motivo);
                      if (grupo.length === 0) return null;
                      const label =
                        motivo === "cooldown_cpf"
                          ? `Cooldown CPF — só clones (${grupo.length})`
                          : motivo === "cooldown_casa"
                          ? `Cooldown casa (${grupo.length})`
                          : motivo === "sem_capacidade"
                          ? `Sem capacidade no dia (${grupo.length})`
                          : `Outro (${grupo.length})`;
                      return (
                        <div key={motivo} className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                            {label}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {grupo.map(({ celula: c, detalhe }) => {
                              const color = getCpfColor(c.cpf_index);
                              return (
                                <span
                                  key={c.id}
                                  draggable
                                  onDragStart={(e) => {
                                    setDraggedId(c.id);
                                    e.dataTransfer.effectAllowed = "move";
                                  }}
                                  onDragEnd={() => {
                                    setDraggedId(null);
                                    setDragOverDay(null);
                                  }}
                                  className={cn(
                                    "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border cursor-grab active:cursor-grabbing transition-opacity",
                                    draggedId === c.id && "opacity-40"
                                  )}
                                  style={{
                                    backgroundColor: color?.bg,
                                    borderColor: color?.border,
                                    color: color?.text,
                                  }}
                                  title={`${detalhe}\n\nArraste para um dia para forçar agendamento`}
                                >
                                  <GripVertical className="h-2.5 w-2.5 opacity-60" />
                                  {c.cpf_index ? `CPF ${c.cpf_index} • ` : ""}
                                  {c.bookmaker_nome}
                                  <span className="opacity-60 ml-1">({c.grupo_nome})</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}

              {/* Warnings */}
              {simulacao && (simulacao.warnings?.length ?? 0) > 0 && (
                <div className="text-[11px] text-muted-foreground space-y-0.5 pt-2">
                  {simulacao.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1">
                      <span className="text-warning">•</span>
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ============ SIDEBAR — CONFIGURAÇÃO ============ */}
          {sidebarOpen && (
            <aside className="w-[340px] shrink-0 border-l bg-muted/10 flex flex-col">
              <div className="px-4 py-2.5 border-b flex items-center justify-between bg-background/40">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold">Configuração</span>
                </div>
                <Button size="sm" className="h-7 text-[11px]" onClick={aplicarConfig}>
                  <Sparkles className="h-3 w-3 mr-1" />
                  Aplicar
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {/* Parâmetros gerais */}
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                    Parâmetros gerais
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <ParamField
                      label="Clones/dia"
                      value={config.clonesPorDia}
                      onChange={(v) => setConfig({ ...config, clonesPorDia: Math.max(1, v) })}
                      min={1}
                      max={20}
                      tooltip={{
                        titulo: "Clones por dia",
                        descricao:
                          "Limite ESTRITO de casas do grupo CLONES agendadas em um mesmo dia. Conta cada casa-clone (não CPFs distintos).",
                        exemplo:
                          "Se = 3, no dia 5 podem entrar no máximo 3 clones (ex: Bet365-CPF1, Pinnacle-CPF2, Stake-CPF3). Uma 4ª clone irá para outro dia, mesmo que ainda haja vaga em 'Máx casas/dia'.",
                      }}
                    />
                    <ParamField
                      label="Máx casas/dia"
                      value={config.maxCasasPorDia}
                      onChange={(v) => setConfig({ ...config, maxCasasPorDia: Math.max(0, v) })}
                      min={0}
                      max={50}
                      tooltip={{
                        titulo: "Máximo de casas por dia",
                        descricao:
                          "Teto global de casas (clones + suporte) por dia. 0 = sem limite — só vale o limite de clones/dia.",
                        exemplo:
                          "Se = 10, no dia 5 podem entrar 3 clones + 7 casas suporte. A 11ª (qualquer tipo) será adiada.",
                      }}
                    />
                    <ParamField
                      label="Meta ganho/dia"
                      value={config.metaGanhoDia}
                      onChange={(v) => setConfig({ ...config, metaGanhoDia: Math.max(0, v) })}
                      min={0}
                      step="0.01"
                      tooltip={{
                        titulo: "Meta de ganho por dia",
                        descricao:
                          "Quando a soma de 'depósito sugerido' do dia atinge esse valor, o dia 'fecha' e novas casas vão para o próximo. 0 = desativado.",
                        exemplo:
                          "Se = 1.500 e o dia 5 já tem 3 casas somando $1.500, qualquer nova casa pulará para o dia 6 — mesmo com vaga em 'Máx casas/dia'.",
                      }}
                    />
                    <ParamField
                      label="Cooldown casa"
                      value={config.cooldownCasaDias}
                      onChange={(v) => setConfig({ ...config, cooldownCasaDias: Math.max(0, v) })}
                      min={0}
                      max={30}
                      tooltip={{
                        titulo: "Cooldown da mesma casa (dias)",
                        descricao:
                          "Intervalo mínimo entre 2 agendamentos da MESMA casa-clone. Aplica-se apenas a clones (suporte pode repetir).",
                        exemplo:
                          "Se = 3 e Bet365-CPF1 foi agendada no dia 4, a próxima clone Bet365 (qualquer CPF) só poderá entrar a partir do dia 8.",
                      }}
                    />
                    <ParamField
                      label="Cooldown CPF"
                      value={config.cooldownCpfDias}
                      onChange={(v) => setConfig({ ...config, cooldownCpfDias: Math.max(0, v) })}
                      min={0}
                      max={30}
                      tooltip={{
                        titulo: "Cooldown do mesmo CPF (dias)",
                        descricao:
                          "Intervalo mínimo entre 2 clones do MESMO CPF. Evita sobrecarga de criações no mesmo titular em janelas curtas.",
                        exemplo:
                          "Se = 5 e CPF1 fez uma clone no dia 4, a próxima clone do CPF1 só poderá entrar a partir do dia 10.",
                      }}
                    />
                    <ParamField
                      label="Dia limite"
                      value={config.diaLimite}
                      onChange={(v) =>
                        setConfig({ ...config, diaLimite: Math.min(31, Math.max(1, v)) })
                      }
                      min={1}
                      max={31}
                      tooltip={{
                        titulo: "Último dia utilizável do mês",
                        descricao:
                          "Janela de simulação vai do dia 1 até este dia. Casas que não couberem ficam no painel 'não couberam'.",
                        exemplo:
                          "Se = 25, a simulação só usa dias 1–25. Os últimos 5–6 dias do mês ficam livres (ex: para fechamento ou folga).",
                      }}
                    />
                    <ParamField
                      label="Mín outras/jan."
                      value={config.minOutrasPorJanela ?? 0}
                      onChange={(v) => setConfig({ ...config, minOutrasPorJanela: Math.max(0, v) })}
                      min={0}
                      max={20}
                      tooltip={{
                        titulo: "Mínimo de casas suporte por janela",
                        descricao:
                          "Garante que a cada N dias (definidos em 'Janela outras') haja ao menos X casas SUPORTE (não-clone). Evita concentração de clones puros. 0 = desativado.",
                        exemplo:
                          "Se = 1 e janela = 3, a cada 3 dias deve haver ≥ 1 casa suporte. Se chegando ao dia 3 só houver clones, o algoritmo força entrar uma suporte.",
                      }}
                    />
                    <ParamField
                      label="Janela outras (d)"
                      value={config.janelaOutrasDias ?? 3}
                      onChange={(v) => setConfig({ ...config, janelaOutrasDias: Math.max(1, v) })}
                      min={1}
                      max={30}
                      tooltip={{
                        titulo: "Tamanho da janela (dias) para 'Mín outras'",
                        descricao:
                          "Define o tamanho da janela deslizante usada pela regra 'Mín outras'. Trabalha em conjunto com aquele campo.",
                        exemplo:
                          "Se = 3 e 'Mín outras' = 1, então em qualquer trio de dias consecutivos (1-3, 2-4, 3-5...) deve haver pelo menos 1 casa suporte.",
                      }}
                    />
                  </div>
                </div>

                {/* Faixas de meta — removido a pedido */}
                {/* Mín. por dia da semana */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                        Mín. por dia da semana
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground/60 hover:text-primary transition-colors"
                            aria-label="Sobre Mín. por dia da semana"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="left" align="start" className="w-72 text-xs space-y-2">
                          <div className="font-semibold text-sm">Mínimo por dia da semana</div>
                          <p className="text-muted-foreground leading-relaxed">
                            Garante uma quantidade mínima de casas em dias específicos da semana
                            (ex: sextas, sábados, domingos). É <strong>warning-only</strong> — se
                            não houver células suficientes, gera aviso mas não bloqueia.
                          </p>
                          <div className="rounded-md bg-muted/40 border p-2 space-y-0.5">
                            <div className="text-[10px] uppercase tracking-wide font-semibold text-primary/80">
                              Exemplo
                            </div>
                            <p className="text-[11px] leading-relaxed">
                              Regra: <strong>Sex/Sáb/Dom = 3 casas/dia</strong>. Toda sexta, sábado
                              e domingo do mês receberá pelo menos 3 casas (puxando do estoque
                              antes de outros dias).
                            </p>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2"
                      onClick={() => {
                        const novas = [...(config.regrasDiaSemana ?? [])];
                        novas.push({ diasSemana: [4, 5, 6], minimoPorDia: 3 });
                        setConfig({ ...config, regrasDiaSemana: novas });
                      }}
                    >
                      <Plus className="h-3 w-3 mr-0.5" /> Regra
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Garante mínimo de casas/dia nos dias selecionados. Aviso se não atingir.
                  </p>
                  <div className="space-y-1.5">
                    {(config.regrasDiaSemana ?? []).length === 0 && (
                      <p className="text-[10px] text-muted-foreground italic text-center py-3 rounded border border-dashed">
                        Nenhuma regra — sem mínimo por dia da semana.
                      </p>
                    )}
                    {(config.regrasDiaSemana ?? []).map((r, idx) => (
                      <div
                        key={idx}
                        className="rounded border bg-background/60 p-2 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <Label className="text-[9px] uppercase text-muted-foreground">
                            Dias
                          </Label>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              const novas = (config.regrasDiaSemana ?? []).filter(
                                (_, i) => i !== idx
                              );
                              setConfig({ ...config, regrasDiaSemana: novas });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                        <div className="flex gap-0.5">
                          {DIAS_SEMANA.map((d) => {
                            const ativo = r.diasSemana.includes(d.value);
                            return (
                              <button
                                key={d.value}
                                type="button"
                                onClick={() => {
                                  const novosDias = ativo
                                    ? r.diasSemana.filter((v) => v !== d.value)
                                    : [...r.diasSemana, d.value].sort((a, b) => a - b);
                                  const novas = [...(config.regrasDiaSemana ?? [])];
                                  novas[idx] = { ...r, diasSemana: novosDias };
                                  setConfig({ ...config, regrasDiaSemana: novas });
                                }}
                                title={d.label}
                                className={cn(
                                  "flex-1 h-7 rounded text-[10px] font-medium border transition-colors",
                                  ativo
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-muted/30 text-muted-foreground border-border hover:bg-muted"
                                )}
                              >
                                {d.short}
                              </button>
                            );
                          })}
                        </div>
                        <div>
                          <Label className="text-[9px] uppercase text-muted-foreground">
                            Mínimo de casas/dia
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            max={20}
                            value={r.minimoPorDia}
                            onChange={(e) => {
                              const v = Math.max(1, Number(e.target.value) || 1);
                              const novas = [...(config.regrasDiaSemana ?? [])];
                              novas[idx] = { ...r, minimoPorDia: v };
                              setConfig({ ...config, regrasDiaSemana: novas });
                            }}
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </aside>
          )}
        </div>

        <div className="px-5 py-2.5 border-t flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Campo numérico compacto reutilizável (com tooltip explicativo opcional)
function ParamField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  tooltip,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: string;
  tooltip?: { titulo: string; descricao: string; exemplo: string };
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
        {tooltip && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground/60 hover:text-primary transition-colors"
                aria-label={`Sobre ${label}`}
              >
                <Info className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="left" align="start" className="w-72 text-xs space-y-2">
              <div className="font-semibold text-sm">{tooltip.titulo}</div>
              <p className="text-muted-foreground leading-relaxed">{tooltip.descricao}</p>
              <div className="rounded-md bg-muted/40 border p-2 space-y-0.5">
                <div className="text-[10px] uppercase tracking-wide font-semibold text-primary/80">
                  Exemplo
                </div>
                <p className="text-[11px] leading-relaxed">{tooltip.exemplo}</p>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-7 text-xs"
      />
    </div>
  );
}
