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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  simularDistribuicao,
  type AutoSchedulerConfig,
  type SimulacaoResultado,
} from "@/lib/auto-scheduler";
import type { CelulaDisponivel } from "@/hooks/usePlanoCelulasDisponiveis";
import type { PlanningCampanha } from "@/hooks/usePlanningData";

// Mesma palette CPF do calendário
const CPF_COLORS = [
  { bg: "hsl(45 95% 55% / 0.15)", border: "hsl(45 95% 55%)", text: "hsl(45 95% 65%)", dot: "hsl(45 95% 55%)" },
  { bg: "hsl(142 70% 45% / 0.15)", border: "hsl(142 70% 45%)", text: "hsl(142 70% 55%)", dot: "hsl(142 70% 45%)" },
  { bg: "hsl(217 90% 60% / 0.15)", border: "hsl(217 90% 60%)", text: "hsl(217 90% 70%)", dot: "hsl(217 90% 60%)" },
  { bg: "hsl(0 80% 60% / 0.15)", border: "hsl(0 80% 60%)", text: "hsl(0 80% 70%)", dot: "hsl(0 80% 60%)" },
  { bg: "hsl(280 70% 60% / 0.15)", border: "hsl(280 70% 60%)", text: "hsl(280 70% 70%)", dot: "hsl(280 70% 60%)" },
  { bg: "hsl(25 90% 55% / 0.15)", border: "hsl(25 90% 55%)", text: "hsl(25 90% 65%)", dot: "hsl(25 90% 55%)" },
  { bg: "hsl(180 70% 45% / 0.15)", border: "hsl(180 70% 45%)", text: "hsl(180 70% 55%)", dot: "hsl(180 70% 45%)" },
  { bg: "hsl(330 75% 60% / 0.15)", border: "hsl(330 75% 60%)", text: "hsl(330 75% 70%)", dot: "hsl(330 75% 60%)" },
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
  diaLimite: 23,
  minOutrasPorJanela: 1,
  janelaOutrasDias: 3,
  faixas: [],
  toleranciaFaixaPct: 10,
  regrasDiaSemana: [],
  seed: 1,
};

const DIAS_SEMANA: { value: number; label: string; short: string }[] = [
  { value: 0, label: "Domingo", short: "D" },
  { value: 1, label: "Segunda", short: "S" },
  { value: 2, label: "Terça", short: "T" },
  { value: 3, label: "Quarta", short: "Q" },
  { value: 4, label: "Quinta", short: "Q" },
  { value: 5, label: "Sexta", short: "S" },
  { value: 6, label: "Sábado", short: "S" },
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

  useEffect(() => {
    if (!open) return;
    const r = simularDistribuicao({ celulas, campanhasExistentes, year, month, config });
    setSimulacao(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, celulas, campanhasExistentes, year, month]);

  const recalcular = () => {
    const novaSeed = Math.floor(Math.random() * 1_000_000) + 1;
    const novoConfig = { ...config, seed: novaSeed };
    setConfig(novoConfig);
    const r = simularDistribuicao({ celulas, campanhasExistentes, year, month, config: novoConfig });
    setSimulacao(r);
  };

  const aplicarConfig = () => {
    const r = simularDistribuicao({ celulas, campanhasExistentes, year, month, config });
    setSimulacao(r);
  };

  const porDia = useMemo(() => {
    const map = new Map<number, SimulacaoResultado["agendamentos"]>();
    if (!simulacao) return map;
    simulacao.agendamentos.forEach((a) => {
      if (!map.has(a.dia)) map.set(a.dia, []);
      map.get(a.dia)!.push(a);
    });
    return map;
  }, [simulacao]);

  const dias = useMemo(() => {
    const set = new Set<number>();
    porDia.forEach((_, k) => set.add(k));
    return Array.from(set).sort((a, b) => a - b);
  }, [porDia]);

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
                <Badge variant="outline">Σ depósito: {stats.ganhoTotal.toFixed(2)}</Badge>
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

            {/* Faixas — barras compactas */}
            {simulacao && (simulacao.faixasResultado?.length ?? 0) > 0 && (
              <div className="px-5 py-2 border-b bg-muted/10 space-y-1.5">
                {simulacao.faixasResultado.map((res, idx) => {
                  const pct = res.meta > 0 ? Math.min(100, (res.acumulado / res.meta) * 100) : 0;
                  return (
                    <div key={idx} className="flex items-center gap-3 text-[11px]">
                      <div className="shrink-0 w-20 text-muted-foreground tabular-nums">
                        Dias {res.diaInicio}–{res.diaFim}
                      </div>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all",
                            res.saturada ? "bg-warning" : res.cheia ? "bg-success" : "bg-primary"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div
                        className={cn(
                          "shrink-0 w-44 text-right tabular-nums font-medium",
                          res.saturada
                            ? "text-warning"
                            : res.cheia
                            ? "text-success"
                            : "text-muted-foreground"
                        )}
                      >
                        {res.acumulado.toFixed(2)} / {res.meta.toFixed(2)} ({pct.toFixed(0)}%)
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

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
                  (sum, a) => sum + (Number(a.celula.deposito_sugerido) || 0),
                  0
                );
                const dow = new Date(year, month - 1, dia).getDay();
                const dowLabel = DIAS_SEMANA[dow]?.label3 ?? "";
                const isWeekend = dow === 0 || dow === 6;
                return (
                  <div key={dia} className="flex gap-2 items-start">
                    <div className="shrink-0 w-16 text-right">
                      <div className="text-[10px] uppercase text-muted-foreground">Dia</div>
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
                          Σ {ganhoDia.toFixed(2)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 flex flex-wrap gap-1.5 p-1.5 rounded-md border bg-muted/20 min-h-[44px]">
                      {itens.map((a) => {
                        const color = getCpfColor(a.celula.cpf_index);
                        return (
                          <div
                            key={a.celula.id}
                            className="flex items-center gap-1.5 px-1.5 py-1 rounded border text-[11px]"
                            style={{
                              backgroundColor: color?.bg ?? "hsl(var(--card))",
                              borderColor: color?.border ?? "hsl(var(--border))",
                            }}
                            title={`${a.celula.bookmaker_nome} • CPF ${a.celula.cpf_index ?? "?"} • ${a.celula.grupo_nome}`}
                          >
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
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Não agendadas — agrupadas por motivo */}
              {simulacao && (simulacao.naoAgendadasDetalhe?.length ?? 0) > 0 && (
                <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 p-2 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {simulacao.naoAgendadasDetalhe.length} célula(s) não couberam — motivos:
                  </div>
                  {(["cooldown_cpf", "cooldown_casa", "sem_capacidade", "outro"] as const).map(
                    (motivo) => {
                      const grupo = (simulacao.naoAgendadasDetalhe ?? []).filter(
                        (d) => d.motivo === motivo
                      );
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
                                  className="text-[10px] px-1.5 py-0.5 rounded border"
                                  style={{
                                    backgroundColor: color?.bg,
                                    borderColor: color?.border,
                                    color: color?.text,
                                  }}
                                  title={detalhe}
                                >
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
                    />
                    <ParamField
                      label="Máx casas/dia"
                      value={config.maxCasasPorDia}
                      onChange={(v) => setConfig({ ...config, maxCasasPorDia: Math.max(0, v) })}
                      min={0}
                      max={50}
                    />
                    <ParamField
                      label="Meta ganho/dia"
                      value={config.metaGanhoDia}
                      onChange={(v) => setConfig({ ...config, metaGanhoDia: Math.max(0, v) })}
                      min={0}
                      step="0.01"
                    />
                    <ParamField
                      label="Cooldown casa"
                      value={config.cooldownCasaDias}
                      onChange={(v) => setConfig({ ...config, cooldownCasaDias: Math.max(0, v) })}
                      min={0}
                      max={30}
                    />
                    <ParamField
                      label="Cooldown CPF"
                      value={config.cooldownCpfDias}
                      onChange={(v) => setConfig({ ...config, cooldownCpfDias: Math.max(0, v) })}
                      min={0}
                      max={30}
                    />
                    <ParamField
                      label="Dia limite"
                      value={config.diaLimite}
                      onChange={(v) =>
                        setConfig({ ...config, diaLimite: Math.min(31, Math.max(1, v)) })
                      }
                      min={1}
                      max={31}
                    />
                    <ParamField
                      label="Mín outras/jan."
                      value={config.minOutrasPorJanela ?? 0}
                      onChange={(v) => setConfig({ ...config, minOutrasPorJanela: Math.max(0, v) })}
                      min={0}
                      max={20}
                    />
                    <ParamField
                      label="Janela outras (d)"
                      value={config.janelaOutrasDias ?? 3}
                      onChange={(v) => setConfig({ ...config, janelaOutrasDias: Math.max(1, v) })}
                      min={1}
                      max={30}
                    />
                  </div>
                </div>

                {/* Faixas de meta */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                      Faixas de meta
                    </Label>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2"
                      onClick={() => {
                        const novas = [...(config.faixas ?? [])];
                        const ultimoFim = novas.length ? novas[novas.length - 1].diaFim : 0;
                        novas.push({
                          diaInicio: Math.min(ultimoFim + 1, config.diaLimite),
                          diaFim: Math.min(ultimoFim + 10, config.diaLimite),
                          meta: 1000,
                        });
                        setConfig({ ...config, faixas: novas });
                      }}
                    >
                      <Plus className="h-3 w-3 mr-0.5" /> Faixa
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] text-muted-foreground">Tolerância %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={config.toleranciaFaixaPct ?? 0}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          toleranciaFaixaPct: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="h-7 w-16 text-xs"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Σ depósito por intervalo. Ex.: dias 1–10 = R$ 5.000.
                  </p>
                  <div className="space-y-1.5">
                    {(config.faixas ?? []).length === 0 && (
                      <p className="text-[10px] text-muted-foreground italic text-center py-3 rounded border border-dashed">
                        Nenhuma faixa — distribuição livre.
                      </p>
                    )}
                    {(config.faixas ?? []).map((f, idx) => (
                      <div
                        key={idx}
                        className="rounded border bg-background/60 p-2 space-y-1.5"
                      >
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1">
                            <Label className="text-[9px] uppercase text-muted-foreground">
                              Início
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              max={31}
                              value={f.diaInicio}
                              onChange={(e) => {
                                const v = Math.max(1, Number(e.target.value) || 1);
                                const novas = [...(config.faixas ?? [])];
                                novas[idx] = { ...f, diaInicio: v };
                                setConfig({ ...config, faixas: novas });
                              }}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="flex-1">
                            <Label className="text-[9px] uppercase text-muted-foreground">
                              Fim
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              max={31}
                              value={f.diaFim}
                              onChange={(e) => {
                                const v = Math.max(1, Number(e.target.value) || 1);
                                const novas = [...(config.faixas ?? [])];
                                novas[idx] = { ...f, diaFim: v };
                                setConfig({ ...config, faixas: novas });
                              }}
                              className="h-7 text-xs"
                            />
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0 self-end"
                            onClick={() => {
                              const novas = (config.faixas ?? []).filter((_, i) => i !== idx);
                              setConfig({ ...config, faixas: novas });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                        <div>
                          <Label className="text-[9px] uppercase text-muted-foreground">
                            Meta (Σ depósito)
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={f.meta}
                            onChange={(e) => {
                              const v = Math.max(0, Number(e.target.value) || 0);
                              const novas = [...(config.faixas ?? [])];
                              novas[idx] = { ...f, meta: v };
                              setConfig({ ...config, faixas: novas });
                            }}
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mín. por dia da semana */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                      Mín. por dia da semana
                    </Label>
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

// Campo numérico compacto reutilizável
function ParamField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
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
