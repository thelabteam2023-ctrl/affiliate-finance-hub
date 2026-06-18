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

function Card({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  highlight = false,
  badge,
  warn,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "neutral" | "positive" | "negative" | "warning";
  highlight?: boolean;
  badge?: string;
  warn?: string;
  sub?: string;
}) {
  const toneClasses =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-red-600 dark:text-red-400"
        : tone === "warning"
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground";
  return (
    <div
      className={`rounded-lg border p-3 flex flex-col gap-1 ${
        highlight ? "border-primary bg-primary/5" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span className="flex-1">{label}</span>
        {badge && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
            {badge}
          </Badge>
        )}
      </div>
      <div className={`font-semibold tabular-nums ${highlight ? "text-lg" : "text-sm"} ${toneClasses}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground leading-tight">{sub}</div>}
      {warn && <div className="text-[10px] text-amber-600 dark:text-amber-400">{warn}</div>}
    </div>
  );
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Resumo Operacional
          </DialogTitle>
          <DialogDescription>
            {periodo
              ? `${periodo.label} · ${periodo.dataInicio} → ${periodo.dataFim}`
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

        {loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-24 w-full" />
          </div>
        )}

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

        {!loading && metricas && (
          <div className="space-y-4">
            {metricas.janelaInsuficiente && (
              <Alert variant="default" className="border-amber-500/50">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-xs">
                  O período escolhido excede a janela carregada pela Análise Temporal. Os totais
                  podem estar truncados — aumente a janela (preset 24m ou maior) na Análise Temporal
                  antes de gerar novamente.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Card
                label="Fluxo Líquido"
                value={fmtBRL(metricas.fluxoLiquido)}
                icon={Wallet}
                tone={metricas.fluxoLiquido >= 0 ? "positive" : "negative"}
              />
              <Card
                label="Custos Operacionais"
                value={fmtBRL(metricas.custoTotal)}
                icon={Receipt}
                tone="negative"
              />
              <Card
                label="Resultado Líquido"
                value={fmtBRL(metricas.resultadoLiquido)}
                icon={TrendingUp}
                tone={metricas.resultadoLiquido >= 0 ? "positive" : "negative"}
                badge="gráfico"
              />
              <Card
                label="Perdas (Disputa/Scam)"
                value={metricas.perdasErro ? "Indisponível" : fmtBRL(metricas.perdasTotal)}
                icon={TrendingDown}
                tone={metricas.perdasErro ? "warning" : metricas.perdasTotal > 0 ? "negative" : "neutral"}
                warn={
                  metricas.moedasSemCotacao > 0
                    ? `${metricas.moedasSemCotacao} ocorr. sem cotação`
                    : undefined
                }
              />
              <Card
                label="Lucro Real"
                value={metricas.lucroReal == null ? "Indisponível" : fmtBRL(metricas.lucroReal)}
                icon={Target}
                tone={
                  metricas.lucroReal == null
                    ? "warning"
                    : metricas.lucroReal >= 0
                      ? "positive"
                      : "negative"
                }
                highlight
              />
            </div>

            {/* Exposição pendente (snapshot) */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                <ShieldAlert className="h-3 w-3" />
                Exposição Pendente (snapshot atual)
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <Card
                  label="Em Disputa"
                  value={fmtBRL(metricas.exposicaoPendente.emDisputa)}
                  icon={ShieldAlert}
                  tone={metricas.exposicaoPendente.emDisputa > 0 ? "warning" : "neutral"}
                  sub={
                    metricas.exposicaoPendente.countDisputa > 0
                      ? `${metricas.exposicaoPendente.countDisputa} ocorrência(s) · Casas ${fmtBRL(metricas.exposicaoPendente.bySegment.bookmakers)} · Wallets ${fmtBRL(metricas.exposicaoPendente.bySegment.wallets)}`
                      : "Nenhuma disputa em aberto"
                  }
                />
                <Card
                  label="Irrecuperável"
                  value={fmtBRL(metricas.exposicaoPendente.irrecuperavel)}
                  icon={Lock}
                  tone={metricas.exposicaoPendente.irrecuperavel > 0 ? "negative" : "neutral"}
                  sub={
                    metricas.exposicaoPendente.countIrrecuperavel > 0
                      ? `${metricas.exposicaoPendente.countIrrecuperavel} casa(s) com saldo travado`
                      : "Sem saldos irrecuperáveis"
                  }
                />
                <Card
                  label="Lucro Real (worst-case)"
                  value={
                    metricas.lucroRealWorstCase == null
                      ? "—"
                      : fmtBRL(metricas.lucroRealWorstCase)
                  }
                  icon={ShieldX}
                  tone={
                    metricas.lucroRealWorstCase == null
                      ? "neutral"
                      : metricas.lucroRealWorstCase >= 0
                        ? "positive"
                        : "negative"
                  }
                  sub="Cenário em que 100% das disputas viram perda. Referência de risco, não resultado contábil."
                />
              </div>
            </div>

            {metricas.perdasErro && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Não foi possível confirmar ocorrências do período. O Lucro Real não é exibido para
                  evitar uma leitura otimista incorreta — verifique o módulo Ocorrências.
                </AlertDescription>
              </Alert>
            )}

            {texto && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-line">
                {texto}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              <Layers className="inline h-3 w-3 mr-1" />
              Perdas (mesma engine do card Exposição & Perdas): <code>cash_ledger</code>{" "}
              <code>PERDA_OPERACIONAL</code> (SCAN) + ocorrências resolvidas como{" "}
              <code>perda_confirmada</code>/<code>perda_parcial</code> ainda não materializadas no
              ledger. Em Disputa = ocorrências com status aberto/em_andamento/aguardando_terceiro.
              Irrecuperável = saldo travado atual em casas de aposta. Conversão BRL via PTAX/FastForex.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Resumo Operacional
          </DialogTitle>
          <DialogDescription>
            {periodo
              ? `${periodo.label} · ${periodo.dataInicio} → ${periodo.dataFim}`
              : "Análise gerada por IA do período visível na Análise Temporal."}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {error && !loading && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && metricas && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Card
                label="Fluxo Líquido"
                value={fmtBRL(metricas.fluxoLiquido)}
                icon={Wallet}
                tone={metricas.fluxoLiquido >= 0 ? "positive" : "negative"}
              />
              <Card
                label="Custos Operacionais"
                value={fmtBRL(metricas.custoTotal)}
                icon={Receipt}
                tone="negative"
              />
              <Card
                label="Resultado Líquido"
                value={fmtBRL(metricas.resultadoLiquido)}
                icon={TrendingUp}
                tone={metricas.resultadoLiquido >= 0 ? "positive" : "negative"}
                badge="gráfico"
              />
              <Card
                label="Perdas (Disputa/Scam)"
                value={metricas.perdasErro ? "Indisponível" : fmtBRL(metricas.perdasTotal)}
                icon={TrendingDown}
                tone={metricas.perdasErro ? "warning" : metricas.perdasTotal > 0 ? "negative" : "neutral"}
                warn={
                  metricas.moedasSemCotacao > 0
                    ? `${metricas.moedasSemCotacao} ocorr. sem cotação`
                    : undefined
                }
              />
              <Card
                label="Lucro Real"
                value={metricas.lucroReal == null ? "Indisponível" : fmtBRL(metricas.lucroReal)}
                icon={Target}
                tone={
                  metricas.lucroReal == null
                    ? "warning"
                    : metricas.lucroReal >= 0
                      ? "positive"
                      : "negative"
                }
                highlight
              />
            </div>

            {metricas.perdasErro && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Não foi possível confirmar ocorrências do período. O Lucro Real não é exibido para
                  evitar uma leitura otimista incorreta — verifique o módulo Ocorrências.
                </AlertDescription>
              </Alert>
            )}

            {texto && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-line">
                {texto}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              Critério de perdas (mesma engine do card Exposição & Perdas):{" "}
              <code>cash_ledger</code> com <code>PERDA_OPERACIONAL</code> (SCAN casa/parceiro) somado a
              ocorrências resolvidas como <code>perda_confirmada</code>/<code>perda_parcial</code> ainda
              não materializadas no ledger. Conversão para BRL via cotações oficiais (PTAX/FastForex).
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}