import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { KpiRail, type KpiRailItem } from "@/components/financeiro/KpiRail";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Wallet,
  Receipt,
  Target,
  ShieldAlert,
  Lock,
  Layers,
  ShieldX,
} from "lucide-react";
import type {
  ResumoOperacionalResult,
  ResumoPeriodoTipo,
  ResumoRange,
} from "@/hooks/useResumoOperacional";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: ResumoOperacionalResult;
  /** Range atualmente aplicado (controlado pela página). */
  range: ResumoRange;
  /** Range default da Análise Temporal (fallback do preset "janela_temporal"). */
  defaultRange: ResumoRange;
  /** Atualiza o range usado pelo hook (e pela consulta de exposição). */
  onRangeChange: (r: ResumoRange) => void;
}

const fmtBRL = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** Parse texto do agente em tópicos. Não muda o backend; só apresentação. */
interface Topico {
  titulo: string;
  corpo: string;
  destaque: boolean;
}
function parseTopicos(texto: string): Topico[] {
  if (!texto?.trim()) return [];
  const linhas = texto.replace(/\r/g, "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const blocos: string[] = [];
  let buf: string[] = [];
  const isInicio = (l: string) =>
    /^([-*•]|\d+[.)])\s+/.test(l) || /^\*\*[^*]+\*\*/.test(l) || /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^.:]{2,40}:/.test(l);
  for (const l of linhas) {
    if (isInicio(l) && buf.length) {
      blocos.push(buf.join(" "));
      buf = [];
    }
    buf.push(l);
  }
  if (buf.length) blocos.push(buf.join(" "));
  const limpos = blocos.map((b) => b.replace(/^([-*•]|\d+[.)])\s+/, "").trim());
  if (!limpos.length) return [{ titulo: "Resumo", corpo: texto.trim(), destaque: false }];
  return limpos.map((b) => {
    let titulo = "Resumo";
    let corpo = b;
    const negrito = b.match(/^\*\*([^*]+)\*\*\s*[:\-—]?\s*(.*)$/);
    const colon = b.match(/^([^:]{2,60}):\s*(.*)$/);
    if (negrito) {
      titulo = negrito[1].trim();
      corpo = negrito[2].trim();
    } else if (colon) {
      titulo = colon[1].replace(/\*\*/g, "").trim();
      corpo = colon[2].trim();
    }
    const tl = titulo.toLowerCase();
    const destaque = tl.includes("lucro real") && !tl.includes("worst");
    return { titulo, corpo: corpo || b, destaque };
  });
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function firstOfMonthISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function lastOfMonthISO(d: Date): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

function rangeFromPreset(tipo: ResumoPeriodoTipo, defaultRange: ResumoRange): ResumoRange {
  const now = new Date();
  if (tipo === "mes_atual") {
    return {
      tipo,
      label: "Mês atual",
      dataInicio: firstOfMonthISO(now),
      dataFim: lastOfMonthISO(now),
    };
  }
  if (tipo === "mes_anterior") {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      tipo,
      label: "Mês anterior",
      dataInicio: firstOfMonthISO(prev),
      dataFim: lastOfMonthISO(prev),
    };
  }
  if (tipo === "ano_atual") {
    return {
      tipo,
      label: `Ano ${now.getFullYear()}`,
      dataInicio: `${now.getFullYear()}-01-01`,
      dataFim: `${now.getFullYear()}-12-31`,
    };
  }
  if (tipo === "todo_historico") {
    return {
      tipo,
      label: "Todo histórico",
      dataInicio: "2000-01-01",
      dataFim: todayISO(),
    };
  }
  // janela_temporal ou fallback
  return defaultRange;
}

function parseISO(s: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}
function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PRESETS: Array<{ tipo: ResumoPeriodoTipo; label: string }> = [
  { tipo: "janela_temporal", label: "Análise Temporal" },
  { tipo: "mes_atual", label: "Mês atual" },
  { tipo: "mes_anterior", label: "Mês anterior" },
  { tipo: "ano_atual", label: "Ano atual" },
  { tipo: "todo_historico", label: "Todo histórico" },
  { tipo: "customizado", label: "Personalizado" },
];

export function ResumoOperacionalDialog({
  open,
  onOpenChange,
  result,
  range,
  defaultRange,
  onRangeChange,
}: Props) {
  const { metricas, texto, periodo, loading, error, run } = result;

  // Estado local do seletor (só vira "range" via onRangeChange quando o usuário gera)
  const [tipoSel, setTipoSel] = useState<ResumoPeriodoTipo>(range.tipo);
  const [customIni, setCustomIni] = useState<Date | undefined>(parseISO(range.dataInicio));
  const [customFim, setCustomFim] = useState<Date | undefined>(parseISO(range.dataFim));

  const customInvalid = useMemo(() => {
    if (tipoSel !== "customizado") return false;
    if (!customIni || !customFim) return true;
    return customIni > customFim;
  }, [tipoSel, customIni, customFim]);

  const handleGerar = async () => {
    let next: ResumoRange;
    if (tipoSel === "customizado") {
      if (!customIni || !customFim) return;
      next = {
        tipo: "customizado",
        label: `Personalizado · ${format(customIni, "dd/MM/yy")} → ${format(customFim, "dd/MM/yy")}`,
        dataInicio: dateToISO(customIni),
        dataFim: dateToISO(customFim),
      };
    } else {
      next = rangeFromPreset(tipoSel, defaultRange);
    }
    onRangeChange(next);
    // run() lê o `range` do hook — como `onRangeChange` é assíncrono via state,
    // o componente reexecuta com o novo range e o `run` é chamado em seguida.
    // Para garantir que rodemos com o valor mais novo, esperamos próximo tick.
    queueMicrotask(() => {
      void run();
    });
  };

  const jaGerou = !!metricas;

  // KPI Rails (resultado + exposição)
  const periodLabelRail = periodo
    ? `${periodo.label} · ${format(parseISO(periodo.dataInicio)!, "dd/MM/yyyy")} → ${format(parseISO(periodo.dataFim)!, "dd/MM/yyyy")}`
    : range.label;

  const itemsResultado: KpiRailItem[] = useMemo(() => {
    if (!metricas) {
      return [
        { id: "fl", label: "Fluxo Líquido", value: "—", icon: <Wallet className="h-3 w-3" />, loading },
        { id: "co", label: "Custos Op.", value: "—", icon: <Receipt className="h-3 w-3" />, loading },
        { id: "rl", label: "Resultado Líquido", value: "—", icon: <TrendingUp className="h-3 w-3" />, loading },
        { id: "pd", label: "Perdas (Scam)", value: "—", icon: <TrendingDown className="h-3 w-3" />, loading },
        { id: "lr", label: "Lucro Real", value: "—", icon: <Target className="h-3 w-3" />, loading },
      ];
    }
    return [
      {
        id: "fl",
        label: "Fluxo Líquido",
        value: fmtBRL(metricas.fluxoLiquido),
        icon: <Wallet className="h-3 w-3" />,
        valueTone: metricas.fluxoLiquido >= 0 ? "positive" : "negative",
      },
      {
        id: "co",
        label: "Custos Op.",
        value: fmtBRL(metricas.custoTotal),
        icon: <Receipt className="h-3 w-3" />,
        valueTone: "negative",
      },
      {
        id: "rl",
        label: "Resultado Líquido",
        value: fmtBRL(metricas.resultadoLiquido),
        icon: <TrendingUp className="h-3 w-3" />,
        valueTone: metricas.resultadoLiquido >= 0 ? "positive" : "negative",
      },
      {
        id: "pd",
        label: "Perdas (Disputa/Scam)",
        value: metricas.perdasErro ? "Indisponível" : fmtBRL(metricas.perdasTotal),
        icon: <TrendingDown className="h-3 w-3" />,
        valueTone: metricas.perdasErro ? "warning" : metricas.perdasTotal > 0 ? "negative" : "default",
      },
      {
        id: "lr",
        label: "Lucro Real",
        value: metricas.lucroReal == null ? "Indisponível" : fmtBRL(metricas.lucroReal),
        icon: <Target className="h-3 w-3" />,
        valueTone:
          metricas.lucroReal == null ? "warning" : metricas.lucroReal >= 0 ? "positive" : "negative",
        activeTone:
          metricas.lucroReal == null
            ? "warning"
            : metricas.lucroReal >= 0
              ? "positive"
              : "negative",
        tooltip: "Lucro Real = Resultado Líquido − Perdas confirmadas (Disputa/Scam) no período.",
      },
    ];
  }, [metricas, loading]);

  const itemsExposicao: KpiRailItem[] = useMemo(() => {
    if (!metricas) {
      return [
        { id: "ed", label: "Em Disputa", value: "—", icon: <ShieldAlert className="h-3 w-3" />, loading },
        { id: "ir", label: "Irrecuperável", value: "—", icon: <Lock className="h-3 w-3" />, loading },
        { id: "wc", label: "Lucro Real (worst)", value: "—", icon: <ShieldX className="h-3 w-3" />, loading },
      ];
    }
    const ep = metricas.exposicaoPendente;
    return [
      {
        id: "ed",
        label: "Em Disputa",
        value: fmtBRL(ep.emDisputa),
        icon: <ShieldAlert className="h-3 w-3" />,
        valueTone: ep.emDisputa > 0 ? "warning" : "default",
        tooltip:
          ep.countDisputa > 0 ? (
            <div className="space-y-0.5">
              <div>{ep.countDisputa} ocorrência(s) em aberto</div>
              <div>Casas: {fmtBRL(ep.bySegment.bookmakers)}</div>
              <div>Wallets: {fmtBRL(ep.bySegment.wallets)}</div>
              <div>Contas Parc.: {fmtBRL(ep.bySegment.contasParc)}</div>
              <div>Caixa Op.: {fmtBRL(ep.bySegment.caixaOp)}</div>
            </div>
          ) : (
            "Nenhuma disputa em aberto."
          ),
      },
      {
        id: "ir",
        label: "Irrecuperável",
        value: fmtBRL(ep.irrecuperavel),
        icon: <Lock className="h-3 w-3" />,
        valueTone: ep.irrecuperavel > 0 ? "negative" : "default",
        tooltip:
          ep.countIrrecuperavel > 0
            ? `${ep.countIrrecuperavel} casa(s) com saldo travado.`
            : "Sem saldos irrecuperáveis.",
      },
      {
        id: "wc",
        label: "Lucro Real (worst)",
        value: metricas.lucroRealWorstCase == null ? "—" : fmtBRL(metricas.lucroRealWorstCase),
        icon: <ShieldX className="h-3 w-3" />,
        valueTone:
          metricas.lucroRealWorstCase == null
            ? "default"
            : metricas.lucroRealWorstCase >= 0
              ? "positive"
              : "negative",
        tooltip:
          "Cenário em que 100% das disputas viram perda + irrecuperável já considerado. Referência de risco, não resultado contábil.",
      },
    ];
  }, [metricas, loading]);

  const topicos = useMemo(() => (texto ? parseTopicos(texto) : []), [texto]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Resumo Operacional
          </DialogTitle>
          <DialogDescription>
            {periodo
              ? `${periodo.label} · ${format(parseISO(periodo.dataInicio), "dd/MM/yyyy")} → ${format(parseISO(periodo.dataFim), "dd/MM/yyyy")}`
              : "Selecione um período e gere o resumo. A IA analisa apenas o intervalo escolhido."}
          </DialogDescription>
        </DialogHeader>

        {/* Seletor de período */}
        <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/20">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Button
                key={p.tipo}
                size="sm"
                variant={tipoSel === p.tipo ? "default" : "outline"}
                onClick={() => setTipoSel(p.tipo)}
                disabled={loading}
                className="h-7 text-xs"
              >
                {p.label}
              </Button>
            ))}
          </div>

          {tipoSel === "customizado" && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("h-8 justify-start text-xs", !customIni && "text-muted-foreground")}
                  >
                    <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                    {customIni ? format(customIni, "dd/MM/yyyy") : "Início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customIni}
                    onSelect={setCustomIni}
                    initialFocus
                    locale={ptBR}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">→</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("h-8 justify-start text-xs", !customFim && "text-muted-foreground")}
                  >
                    <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                    {customFim ? format(customFim, "dd/MM/yyyy") : "Fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customFim}
                    onSelect={setCustomFim}
                    locale={ptBR}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {customInvalid && (
                <span className="text-[11px] text-destructive">Data inválida</span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-muted-foreground">
              Disputa e irrecuperável refletem o snapshot atual, independente do período.
            </span>
            <Button
              size="sm"
              onClick={handleGerar}
              disabled={loading || customInvalid}
              className="h-8"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              {loading ? "Gerando..." : jaGerou ? "Regenerar" : "Gerar resumo"}
            </Button>
          </div>
        </div>

        {error && !loading && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && !metricas && !error && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Escolha um período acima e clique em <strong>Gerar resumo</strong> para que a IA produza
            a análise do intervalo selecionado.
          </div>
        )}

        {(loading || metricas) && (
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Rail lateral */}
            <aside className="lg:w-[188px] lg:flex-shrink-0 border border-border/40 rounded-lg overflow-hidden bg-card/40">
              <KpiRail periodLabel={periodLabelRail} items={itemsResultado} />
              <Separator className="bg-border/30" />
              <div className="px-3.5 pt-2.5 pb-1 text-[9px] uppercase tracking-[0.08em] text-muted-foreground/70">
                Exposição em aberto
              </div>
              <KpiRail
                periodLabel="Snapshot atual"
                items={itemsExposicao}
                footer={
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    Disputa e irrecuperável refletem o snapshot atual, independente do período
                    selecionado.
                  </p>
                }
              />
            </aside>

            {/* Conteúdo principal */}
            <div className="flex-1 min-w-0 space-y-4">
              {metricas?.janelaInsuficiente && (
                <Alert variant="default" className="border-amber-500/50">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <AlertDescription className="text-xs">
                    O período escolhido excede a janela carregada pela Análise Temporal. Os totais
                    podem estar truncados — aumente a janela (preset 24m ou maior) na Análise
                    Temporal antes de gerar novamente.
                  </AlertDescription>
                </Alert>
              )}

              {metricas?.perdasErro && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Não foi possível confirmar ocorrências do período. O Lucro Real não é exibido
                    para evitar uma leitura otimista incorreta — verifique o módulo Ocorrências.
                  </AlertDescription>
                </Alert>
              )}

              {loading && (
                <div className="space-y-3">
                  <Skeleton className="h-14 w-full rounded-md" />
                  <Skeleton className="h-14 w-full rounded-md" />
                  <Skeleton className="h-14 w-full rounded-md" />
                  <Skeleton className="h-14 w-full rounded-md" />
                </div>
              )}

              {!loading && topicos.length > 0 && (
                <ol className="space-y-3 list-none pl-0">
                  {topicos.map((t, i) => (
                    <li
                      key={i}
                      className={cn(
                        "border-l-2 pl-3 py-1",
                        t.destaque ? "border-primary" : "border-border/40",
                      )}
                    >
                      <div
                        className={cn(
                          "text-xs uppercase tracking-wide mb-1",
                          t.destaque
                            ? "text-primary font-semibold"
                            : "text-muted-foreground font-medium",
                        )}
                      >
                        {t.titulo}
                      </div>
                      <div
                        className={cn(
                          "text-sm leading-relaxed text-foreground/90",
                          t.destaque && "font-medium text-foreground",
                        )}
                      >
                        {t.corpo}
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {!loading && metricas && !texto && (
                <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                  Métricas carregadas. Aguardando texto do agente — clique em{" "}
                  <strong>Regenerar</strong> se persistir.
                </div>
              )}

              <p className="text-[10px] text-muted-foreground pt-2 border-t border-border/30">
                <Layers className="inline h-3 w-3 mr-1" />
                Perdas (mesma engine do card Exposição &amp; Perdas): <code>cash_ledger</code>{" "}
                <code>PERDA_OPERACIONAL</code> (SCAN) + ocorrências resolvidas como{" "}
                <code>perda_confirmada</code>/<code>perda_parcial</code> ainda não materializadas
                no ledger. Em Disputa = ocorrências com status
                aberto/em_andamento/aguardando_terceiro. Irrecuperável = saldo travado atual em
                casas de aposta. Conversão BRL via PTAX/FastForex.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
