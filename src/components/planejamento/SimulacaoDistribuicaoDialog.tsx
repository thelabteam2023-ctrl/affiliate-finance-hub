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
import { Sparkles, AlertTriangle, RefreshCw, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  simularDistribuicao,
  type AutoSchedulerConfig,
  type SimulacaoResultado,
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
    const r = simularDistribuicao({ celulas, campanhasExistentes, year, month, config });
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
          <div className="col-span-2 sm:col-span-2 flex justify-end">
            <Button onClick={recalcular} size="sm" className="h-8 w-full sm:w-auto">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recalcular
            </Button>
          </div>
        </div>

        {/* Resumo */}
        {stats && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={stats.agendadas === stats.totalCelulas ? "default" : "secondary"}>
              {stats.agendadas} / {stats.totalCelulas} agendadas
            </Badge>
            <Badge variant="outline">{stats.diasUsados} dias usados</Badge>
            {stats.capacidadeMaxima > 0 && (
              <Badge variant="outline">Capacidade: {stats.capacidadeMaxima}</Badge>
            )}
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

        {/* Não agendadas */}
        {simulacao && simulacao.naoAgendadas.length > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-2 max-h-32 overflow-y-auto">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-warning mb-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {simulacao.naoAgendadas.length} célula(s) não couberam
            </div>
            <div className="flex flex-wrap gap-1">
              {simulacao.naoAgendadas.map((c) => {
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
                  >
                    {c.cpf_index ? `CPF ${c.cpf_index} • ` : ""}
                    {c.bookmaker_nome}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Warnings */}
        {simulacao && simulacao.warnings.length > 0 && (
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
