import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, TrendingDown, AlertTriangle, Wallet, Receipt, Target } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { ResumoOperacionalResult } from "@/hooks/useResumoOperacional";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: ResumoOperacionalResult;
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
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "neutral" | "positive" | "negative" | "warning";
  highlight?: boolean;
  badge?: string;
  warn?: string;
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
      {warn && <div className="text-[10px] text-amber-600 dark:text-amber-400">{warn}</div>}
    </div>
  );
}

export function ResumoOperacionalDialog({ open, onOpenChange, result }: Props) {
  const { metricas, texto, periodo, loading, error } = result;

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
              <div className="prose prose-sm dark:prose-invert max-w-none rounded-lg border border-border bg-muted/30 p-4">
                <ReactMarkdown>{texto}</ReactMarkdown>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              Critério de perdas: ocorrências com <code>resultado_financeiro</code> em{" "}
              <code>perda_confirmada</code> ou <code>perda_parcial</code>, atribuídas pela{" "}
              <code>data_ocorrencia</code>. Conversão para BRL via cotações oficiais (PTAX/FastForex).
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}