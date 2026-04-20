import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Building2,
  CheckCircle2,
  PlayCircle,
  Trash2,
  CalendarDays,
  Clock,
  Layers,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  usePlanejamentoCenarios,
  useDeleteCenario,
  useMarcarSlotAplicado,
  type PlanejamentoCenario,
} from "@/hooks/usePlanejamentoCenarios";
import { useDistribuicaoPlanos } from "@/hooks/useDistribuicaoPlanos";
import {
  useUpsertCampanha,
  type PlanningCampanha,
} from "@/hooks/usePlanningData";
import { marcarCelulaAgendada } from "@/hooks/usePlanoCelulasDisponiveis";
import { useQueryClient } from "@tanstack/react-query";

const MES_NOMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Mesma palette CPF do dialog/calendário — 10 cores distintas
const CPF_COLORS = [
  { bg: "hsl(45 95% 55% / 0.15)", border: "hsl(45 95% 55%)", text: "hsl(45 95% 65%)", dot: "hsl(45 95% 55%)" },
  { bg: "hsl(142 70% 45% / 0.15)", border: "hsl(142 70% 45%)", text: "hsl(142 70% 55%)", dot: "hsl(142 70% 45%)" },
  { bg: "hsl(217 90% 60% / 0.15)", border: "hsl(217 90% 60%)", text: "hsl(217 90% 70%)", dot: "hsl(217 90% 60%)" },
  { bg: "hsl(0 80% 60% / 0.15)", border: "hsl(0 80% 60%)", text: "hsl(0 80% 70%)", dot: "hsl(0 80% 60%)" },
  { bg: "hsl(280 70% 60% / 0.15)", border: "hsl(280 70% 60%)", text: "hsl(280 70% 70%)", dot: "hsl(280 70% 60%)" },
  { bg: "hsl(25 90% 55% / 0.15)", border: "hsl(25 90% 55%)", text: "hsl(25 90% 65%)", dot: "hsl(25 90% 55%)" },
  { bg: "hsl(180 70% 45% / 0.15)", border: "hsl(180 70% 45%)", text: "hsl(180 70% 55%)", dot: "hsl(180 70% 45%)" },
  { bg: "hsl(330 75% 60% / 0.15)", border: "hsl(330 75% 60%)", text: "hsl(330 75% 70%)", dot: "hsl(330 75% 60%)" },
  { bg: "hsl(255 85% 70% / 0.18)", border: "hsl(255 85% 70%)", text: "hsl(255 85% 78%)", dot: "hsl(255 85% 70%)" },
  { bg: "hsl(160 60% 40% / 0.18)", border: "hsl(160 60% 40%)", text: "hsl(160 60% 55%)", dot: "hsl(160 60% 40%)" },
];
function getCpfColor(idx: number | null | undefined) {
  if (!idx || idx < 1) return null;
  return CPF_COLORS[(idx - 1) % CPF_COLORS.length];
}

/**
 * Página do "Calendário Simulado": lista cenários salvos, mostra a distribuição
 * em formato calendário read-only e permite aplicar tudo em batch ou item a item.
 */
export function CalendarioSimulado({
  campanhasReais = [],
}: {
  campanhasReais?: PlanningCampanha[];
}) {
  const { planos } = useDistribuicaoPlanos();
  const [planoFiltro, setPlanoFiltro] = useState<string>("todos");
  const [cenarioId, setCenarioId] = useState<string | null>(null);
  const [cenarioParaExcluir, setCenarioParaExcluir] = useState<PlanejamentoCenario | null>(null);

  const { data: cenarios = [], isLoading } = usePlanejamentoCenarios(
    planoFiltro === "todos" ? null : planoFiltro
  );
  const deleteCenario = useDeleteCenario();
  const upsertCamp = useUpsertCampanha();
  const marcarAplicado = useMarcarSlotAplicado();
  const qc = useQueryClient();

  const cenarioAtivo = useMemo(
    () => cenarios.find((c) => c.id === cenarioId) ?? null,
    [cenarios, cenarioId]
  );

  // Auto-seleciona o primeiro cenário quando a lista mudar
  useMemo(() => {
    if (!cenarioId && cenarios.length > 0) setCenarioId(cenarios[0].id);
    if (cenarioId && !cenarios.find((c) => c.id === cenarioId)) {
      setCenarioId(cenarios[0]?.id ?? null);
    }
  }, [cenarios, cenarioId]);

  // Aplica os overrides ao snapshot dos agendamentos
  const agendamentosFinais = useMemo(() => {
    if (!cenarioAtivo) return [];
    return cenarioAtivo.agendamentos.map((a) => {
      const novoDia = cenarioAtivo.overrides?.[a.celulaId];
      if (novoDia && novoDia !== a.dia) {
        const mm = String(cenarioAtivo.mes).padStart(2, "0");
        const dd = String(novoDia).padStart(2, "0");
        return { ...a, dia: novoDia, dateKey: `${cenarioAtivo.ano}-${mm}-${dd}` };
      }
      return a;
    });
  }, [cenarioAtivo]);

  const slotsAplicadosSet = useMemo(
    () => new Set(cenarioAtivo?.slots_aplicados ?? []),
    [cenarioAtivo]
  );

  const porDia = useMemo(() => {
    const map = new Map<number, typeof agendamentosFinais>();
    agendamentosFinais.forEach((a) => {
      if (!map.has(a.dia)) map.set(a.dia, []);
      map.get(a.dia)!.push(a);
    });
    return map;
  }, [agendamentosFinais]);

  const dias = useMemo(() => {
    if (!cenarioAtivo) return [];
    const ultimoDia = new Date(cenarioAtivo.ano, cenarioAtivo.mes, 0).getDate();
    const arr: number[] = [];
    for (let d = 1; d <= ultimoDia; d++) arr.push(d);
    return arr;
  }, [cenarioAtivo]);

  const total = agendamentosFinais.length;
  const aplicados = agendamentosFinais.filter((a) =>
    slotsAplicadosSet.has(a.celulaId)
  ).length;

  // Aplica um slot individual: cria campanha + marca célula agendada + atualiza cenário
  const aplicarSlot = async (a: (typeof agendamentosFinais)[number]) => {
    if (!cenarioAtivo) return;
    if (slotsAplicadosSet.has(a.celulaId)) {
      toast.info("Slot já aplicado");
      return;
    }
    try {
      const novaCamp: any = await upsertCamp.mutateAsync({
        scheduled_date: a.dateKey,
        bookmaker_catalogo_id: a.bookmaker_catalogo_id,
        bookmaker_nome: a.bookmaker_nome,
        currency: a.moeda,
        deposit_amount: a.deposito_sugerido || 0,
        parceiro_id: a.parceiro_id ?? undefined,
        status: "planned",
      } as any);
      const campanhaId =
        typeof novaCamp === "string" ? novaCamp : novaCamp?.id ?? novaCamp?.[0]?.id;
      if (campanhaId) {
        try {
          await marcarCelulaAgendada(a.celulaId, campanhaId);
        } catch (err) {
          console.warn("[CalendarioSimulado] marcarCelulaAgendada falhou", err);
        }
      }
      await marcarAplicado.mutateAsync({
        cenarioId: cenarioAtivo.id,
        celulaId: a.celulaId,
      });
      qc.invalidateQueries({ queryKey: ["plano-celulas-disponiveis"] });
      toast.success(`${a.bookmaker_nome} aplicada no dia ${a.dia}`);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao aplicar");
    }
  };

  // Aplica TODOS os slots ainda não aplicados em batch (chunks de 5, 1 invalidate ao final)
  const aplicarTudo = async () => {
    if (!cenarioAtivo) return;
    const pendentes = agendamentosFinais.filter(
      (a) => !slotsAplicadosSet.has(a.celulaId)
    );
    if (pendentes.length === 0) {
      toast.info("Todos os slots já foram aplicados");
      return;
    }
    toast.message(`Aplicando ${pendentes.length} slot(s)...`);
    const aplicadosOk: string[] = [];
    const chunkSize = 5;
    for (let i = 0; i < pendentes.length; i += chunkSize) {
      const chunk = pendentes.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (a) => {
          try {
            const novaCamp: any = await upsertCamp.mutateAsync({
              scheduled_date: a.dateKey,
              bookmaker_catalogo_id: a.bookmaker_catalogo_id,
              bookmaker_nome: a.bookmaker_nome,
              currency: a.moeda,
              deposit_amount: a.deposito_sugerido || 0,
              parceiro_id: a.parceiro_id ?? undefined,
              status: "planned",
            } as any);
            const campanhaId =
              typeof novaCamp === "string"
                ? novaCamp
                : novaCamp?.id ?? novaCamp?.[0]?.id;
            if (campanhaId) {
              try {
                await marcarCelulaAgendada(a.celulaId, campanhaId);
              } catch {}
            }
            aplicadosOk.push(a.celulaId);
          } catch (err) {
            console.error("[CalendarioSimulado] erro ao aplicar slot", a, err);
          }
        })
      );
    }
    // Atualiza slots_aplicados em UMA única escrita
    if (aplicadosOk.length > 0) {
      try {
        // Refaz a query para garantir lista atual
        for (const id of aplicadosOk) {
          await marcarAplicado.mutateAsync({
            cenarioId: cenarioAtivo.id,
            celulaId: id,
          });
        }
      } catch (err) {
        console.warn("[CalendarioSimulado] marcarAplicado batch falhou", err);
      }
    }
    qc.invalidateQueries({ queryKey: ["plano-celulas-disponiveis"] });
    qc.invalidateQueries({ queryKey: ["planning-campanhas"] });
    toast.success(
      `${aplicadosOk.length} de ${pendentes.length} slot(s) aplicado(s)`
    );
  };

  const handleDelete = async () => {
    if (!cenarioParaExcluir) return;
    try {
      await deleteCenario.mutateAsync(cenarioParaExcluir.id);
      toast.success("Cenário removido");
      setCenarioParaExcluir(null);
      if (cenarioId === cenarioParaExcluir.id) setCenarioId(null);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao remover");
    }
  };

  return (
    <div className="flex h-full gap-3 p-3">
      {/* Sidebar — lista de cenários */}
      <Card className="w-72 shrink-0 p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-primary" />
            Cenários salvos
          </div>
          <Badge variant="secondary" className="text-[10px] h-4 px-1">
            {cenarios.length}
          </Badge>
        </div>

        <Select value={planoFiltro} onValueChange={setPlanoFiltro}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Plano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os planos</SelectItem>
            {planos.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1 overflow-y-auto space-y-1.5 -mx-1 px-1">
          {isLoading && (
            <p className="text-xs text-muted-foreground italic text-center py-4">
              Carregando…
            </p>
          )}
          {!isLoading && cenarios.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-6">
              Nenhum cenário salvo. Use o botão "Simular distribuição" no
              calendário e salve a simulação.
            </p>
          )}
          {cenarios.map((c) => {
            const ativo = c.id === cenarioId;
            const totalAg = c.agendamentos?.length ?? 0;
            const aplic = c.slots_aplicados?.length ?? 0;
            const planoNome = planos.find((p) => p.id === c.plano_id)?.nome ?? "—";
            return (
              <div
                key={c.id}
                onClick={() => setCenarioId(c.id)}
                className={cn(
                  "rounded-md border p-2 cursor-pointer transition-colors text-xs",
                  ativo
                    ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                    : "hover:border-primary/40 hover:bg-muted/40"
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="font-semibold truncate flex-1">{c.nome}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCenarioParaExcluir(c);
                    }}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    title="Remover cenário"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                  {planoNome} • {MES_NOMES[c.mes - 1]} {c.ano}
                </div>
                <div className="flex items-center gap-1 mt-1.5">
                  <Badge variant="outline" className="h-4 text-[9px] px-1">
                    {aplic}/{totalAg} aplicados
                  </Badge>
                  {aplic === totalAg && totalAg > 0 && (
                    <CheckCircle2 className="h-3 w-3 text-success" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Visualização do cenário */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {!cenarioAtivo ? (
          <Card className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            <div className="text-center space-y-2">
              <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p>Selecione um cenário à esquerda</p>
              <p className="text-xs">
                ou crie um novo a partir do "Simular distribuição" no Calendário
              </p>
            </div>
          </Card>
        ) : (
          <>
            {/* Header do cenário */}
            <Card className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary shrink-0" />
                  <h2 className="text-base font-bold truncate">
                    {cenarioAtivo.nome}
                  </h2>
                  <Badge variant="outline" className="text-[10px]">
                    {MES_NOMES[cenarioAtivo.mes - 1]} {cenarioAtivo.ano}
                  </Badge>
                </div>
                {cenarioAtivo.descricao && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {cenarioAtivo.descricao}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                  <Badge variant="secondary">
                    {aplicados}/{total} aplicados
                  </Badge>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Atualizado{" "}
                    {new Date(cenarioAtivo.updated_at).toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={aplicarTudo}
                  disabled={aplicados === total}
                  className="h-8 text-xs"
                >
                  <PlayCircle className="h-3.5 w-3.5 mr-1" />
                  Aplicar tudo ({total - aplicados})
                </Button>
              </div>
            </Card>

            {/* Lista por dia (read-only com botão por slot) */}
            <Card className="flex-1 p-3 overflow-y-auto">
              {dias.map((dia) => {
                const itens = porDia.get(dia) ?? [];
                if (itens.length === 0) return null;
                const dow = new Date(
                  cenarioAtivo.ano,
                  cenarioAtivo.mes - 1,
                  dia
                ).getDay();
                const isWeekend = dow === 0 || dow === 6;
                return (
                  <div
                    key={dia}
                    className="flex items-start gap-2 py-1.5 border-b last:border-b-0"
                  >
                    <div className="shrink-0 w-14 text-right pr-2">
                      <div className="text-xl font-bold tabular-nums leading-none">
                        {dia}
                      </div>
                      <div
                        className={cn(
                          "text-[10px] uppercase",
                          isWeekend ? "text-warning" : "text-muted-foreground"
                        )}
                      >
                        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][dow]}
                      </div>
                    </div>
                    <div className="flex-1 flex flex-wrap gap-1.5">
                      {itens.map((a) => {
                        const color = getCpfColor(a.cpf_index);
                        const aplicado = slotsAplicadosSet.has(a.celulaId);
                        return (
                          <div
                            key={a.celulaId}
                            className={cn(
                              "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-opacity",
                              aplicado && "opacity-50"
                            )}
                            style={{
                              backgroundColor: color?.bg ?? "hsl(var(--card))",
                              borderColor: color?.border ?? "hsl(var(--border))",
                            }}
                            title={`${a.bookmaker_nome} • CPF ${a.cpf_index ?? "?"} • ${a.grupo_nome}`}
                          >
                            {a.cpf_index ? (
                              <div
                                className="h-4 w-4 shrink-0 rounded flex items-center justify-center text-[9px] font-bold"
                                style={{
                                  backgroundColor: color?.dot,
                                  color: "hsl(0 0% 10%)",
                                }}
                              >
                                {a.cpf_index}
                              </div>
                            ) : null}
                            <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="font-medium truncate max-w-[140px]">
                              {a.bookmaker_nome}
                            </span>
                            {aplicado ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                            ) : (
                              <button
                                onClick={() => aplicarSlot(a)}
                                disabled={upsertCamp.isPending}
                                className="text-primary hover:text-primary/80 shrink-0"
                                title="Aplicar este slot ao calendário real"
                              >
                                <PlayCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {agendamentosFinais.length === 0 && (
                <div className="flex flex-col items-center justify-center text-sm text-muted-foreground py-12 gap-2">
                  <AlertTriangle className="h-6 w-6 text-warning/60" />
                  Cenário sem agendamentos.
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      <AlertDialog
        open={!!cenarioParaExcluir}
        onOpenChange={(v) => !v && setCenarioParaExcluir(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cenário?</AlertDialogTitle>
            <AlertDialogDescription>
              "{cenarioParaExcluir?.nome}" será removido permanentemente. As
              campanhas já aplicadas no calendário real NÃO são afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
