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
import { Sparkles, AlertTriangle, RefreshCw, Building2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  simularDistribuicao,
  type AutoSchedulerConfig,
  type SimulacaoResultado,
  type FaixaMeta,
} from "@/lib/auto-scheduler";
import type { CelulaDisponivel } from "@/hooks/usePlanoCelulasDisponiveis";
import type { PlanningCampanha } from "@/hooks/usePlanningData";

// Mesma palette CPF do calendário (mantida em sincronia visual)
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
  maxCasasPorDia: 0, // 0 = sem limite
  metaGanhoDia: 0, // 0 = desativado
  cooldownCasaDias: 3,
  cooldownCpfDias: 5,
  diaLimite: 23,
  minOutrasPorJanela: 1,
  janelaOutrasDias: 3,
  faixas: [],
  toleranciaFaixaPct: 10,
  seed: 1,
};

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

  // Roda simulação ao abrir e quando o plano/mês muda
  useEffect(() => {
    if (!open) return;
    const r = simularDistribuicao({ celulas, campanhasExistentes, year, month, config });
    setSimulacao(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, celulas, campanhasExistentes, year, month]);

  const recalcular = () => {
    // Cada clique troca a seed → varia a combinação respeitando todas as restrições
    const novaSeed = Math.floor(Math.random() * 1_000_000) + 1;
    const novoConfig = { ...config, seed: novaSeed };
    setConfig(novoConfig);
    const r = simularDistribuicao({ celulas, campanhasExistentes, year, month, config: novoConfig });
    setSimulacao(r);
  };

  // Agrupa agendamentos por dia
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
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Simulação de Distribuição
          </DialogTitle>
          <DialogDescription>
            Pré-visualize como as casas-clone se distribuem no mês. A inserção no
            calendário continua manual via drag-and-drop.
          </DialogDescription>
        </DialogHeader>

        {/* Parâmetros */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end p-3 rounded-md border bg-muted/30">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Clones/dia
            </Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={config.clonesPorDia}
              onChange={(e) =>
                setConfig({ ...config, clonesPorDia: Math.max(1, Number(e.target.value) || 1) })
              }
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Máx casas/dia <span className="opacity-60">(0=∞)</span>
            </Label>
            <Input
              type="number"
              min={0}
              max={50}
              value={config.maxCasasPorDia}
              onChange={(e) =>
                setConfig({ ...config, maxCasasPorDia: Math.max(0, Number(e.target.value) || 0) })
              }
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Meta ganho/dia <span className="opacity-60">(0=off)</span>
            </Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={config.metaGanhoDia}
              onChange={(e) =>
                setConfig({ ...config, metaGanhoDia: Math.max(0, Number(e.target.value) || 0) })
              }
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Cooldown casa (d)
            </Label>
            <Input
              type="number"
              min={0}
              max={30}
              value={config.cooldownCasaDias}
              onChange={(e) =>
                setConfig({ ...config, cooldownCasaDias: Math.max(0, Number(e.target.value) || 0) })
              }
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Cooldown CPF (d)
            </Label>
            <Input
              type="number"
              min={0}
              max={30}
              value={config.cooldownCpfDias}
              onChange={(e) =>
                setConfig({ ...config, cooldownCpfDias: Math.max(0, Number(e.target.value) || 0) })
              }
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Dia limite
            </Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={config.diaLimite}
              onChange={(e) =>
                setConfig({ ...config, diaLimite: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })
              }
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Mín outras/janela
            </Label>
            <Input
              type="number"
              min={0}
              max={20}
              value={config.minOutrasPorJanela ?? 0}
              onChange={(e) =>
                setConfig({ ...config, minOutrasPorJanela: Math.max(0, Number(e.target.value) || 0) })
              }
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Janela outras (d)
            </Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={config.janelaOutrasDias ?? 3}
              onChange={(e) =>
                setConfig({ ...config, janelaOutrasDias: Math.max(1, Number(e.target.value) || 1) })
              }
              className="h-8 text-xs"
            />
          </div>
          <div className="col-span-2 sm:col-span-2 flex justify-end">
            <Button onClick={recalcular} size="sm" className="h-8 w-full sm:w-auto">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recalcular (varia combinação)
            </Button>
          </div>
        </div>

        {/* Faixas de meta de depósito */}
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                Faixas de meta (Σ depósito por intervalo)
              </Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Ex.: dias 1–10 = R$ 5.000, 11–20 = R$ 3.000. Tolerância permite passar do teto.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Label className="text-[10px] text-muted-foreground">Tol.%</Label>
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
                  className="h-7 w-14 text-xs"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
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
                <Plus className="h-3 w-3 mr-1" /> Faixa
              </Button>
            </div>
          </div>
          {(config.faixas ?? []).length === 0 && (
            <p className="text-[11px] text-muted-foreground italic">
              Nenhuma faixa — distribuição livre dentro do dia limite.
            </p>
          )}
          {(config.faixas ?? []).map((f, idx) => {
            const res = simulacao?.faixasResultado?.[idx];
            const pct = res && res.meta > 0 ? Math.min(100, (res.acumulado / res.meta) * 100) : 0;
            return (
              <div key={idx} className="flex items-end gap-2 rounded border bg-background/40 p-2">
                <div className="space-y-1">
                  <Label className="text-[9px] uppercase text-muted-foreground">Dia ini</Label>
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
                    className="h-7 w-14 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] uppercase text-muted-foreground">Dia fim</Label>
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
                    className="h-7 w-14 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] uppercase text-muted-foreground">Meta (Σ)</Label>
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
                    className="h-7 w-24 text-xs"
                  />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>
                      {res ? `${res.acumulado.toFixed(2)} / ${res.meta.toFixed(2)}` : "—"}
                    </span>
                    <span
                      className={cn(
                        "tabular-nums font-semibold",
                        res?.saturada
                          ? "text-warning"
                          : res?.cheia
                          ? "text-success"
                          : "text-muted-foreground"
                      )}
                    >
                      {res ? `${pct.toFixed(0)}%` : ""}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all",
                        res?.saturada
                          ? "bg-warning"
                          : res?.cheia
                          ? "bg-success"
                          : "bg-primary"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={() => {
                    const novas = (config.faixas ?? []).filter((_, i) => i !== idx);
                    setConfig({ ...config, faixas: novas });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>

        {/* Resumo */}
        {stats && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={stats.agendadas === stats.totalCelulas ? "default" : "secondary"}>
              {stats.agendadas} / {stats.totalCelulas} agendadas
            </Badge>
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              Clones: {stats.totalClones}
            </Badge>
            <Badge variant="outline">Outras: {stats.totalOutras}</Badge>
            <Badge variant="outline">{stats.diasUsados} dias usados</Badge>
            {stats.capacidadeMaxima > 0 && (
              <Badge variant="outline">Cap. casas: {stats.capacidadeMaxima}</Badge>
            )}
            <Badge variant="outline">
              Cap. por CPF clone: {stats.capacidadePorCpfClone}
            </Badge>
            <Badge variant="outline">
              Ganho total: {stats.ganhoTotal.toFixed(2)}
            </Badge>
            {excedeu && (
              <Badge variant="outline" className="border-warning text-warning">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Plano excede capacidade da janela
              </Badge>
            )}
          </div>
        )}

        {/* Lista por dia */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1.5">
          {dias.length === 0 && (
            <p className="text-center text-xs text-muted-foreground italic py-8">
              Nenhuma célula disponível para simular.
            </p>
          )}
          {dias.map((dia) => {
            const itens = porDia.get(dia) ?? [];
            const ganhoDia = itens.reduce(
              (sum, a) => sum + (Number(a.celula.deposito_sugerido) || 0),
              0
            );
            return (
              <div key={dia} className="flex gap-2 items-start">
                <div className="shrink-0 w-16 text-right">
                  <div className="text-[10px] uppercase text-muted-foreground">Dia</div>
                  <div className="text-lg font-bold tabular-nums leading-none">{dia}</div>
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
        </div>

        {/* Não agendadas — agrupadas por motivo */}
        {simulacao && (simulacao.naoAgendadasDetalhe?.length ?? 0) > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-2 max-h-48 overflow-y-auto space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              {simulacao.naoAgendadasDetalhe.length} célula(s) não couberam — motivos:
            </div>
            {(["cooldown_cpf", "cooldown_casa", "sem_capacidade", "outro"] as const).map((motivo) => {
              const grupo = (simulacao.naoAgendadasDetalhe ?? []).filter((d) => d.motivo === motivo);
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
            })}
          </div>
        )}

        {/* Warnings */}
        {simulacao && (simulacao.warnings?.length ?? 0) > 0 && (
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            {simulacao.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-1">
                <span className="text-warning">•</span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
