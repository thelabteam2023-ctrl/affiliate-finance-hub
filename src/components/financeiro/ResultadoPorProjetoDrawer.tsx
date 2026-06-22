import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowDownUp,
  ExternalLink,
  AlertTriangle,
  TrendingUp,
  Coins,
} from "lucide-react";
import type { ResultadoPorProjetoItem } from "@/hooks/useResultadoPorProjeto";

export type DrawerFocus = "realizado" | "teorico" | "exposto";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focus: DrawerFocus;
  items: ResultadoPorProjetoItem[];
  totaisBRL: {
    lucroOperacional: number;
    lucroRealizado: number;
    capitalExposto: number;
  };
  loading: boolean;
  formatBRL: (v: number) => string;
  /**
   * Resultado da operação calculado por subtração no card
   * (Patrimônio Atual − Capital Próprio). Quando informado, o drawer
   * exibe um bloco de reconciliação no rodapé comparando esse valor
   * com a soma do Lucro Operacional dos projetos (engine canônica) e
   * expõe a divergência (drift cambial, eventos sem projeto, etc.).
   */
  resultadoOperacaoBRL?: number;
}

function formatMoeda(valor: number, moeda: string) {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: moeda,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor);
  } catch {
    return `${moeda} ${valor.toFixed(2)}`;
  }
}

const FOCUS_META: Record<
  DrawerFocus,
  { title: string; description: string; icon: JSX.Element }
> = {
  realizado: {
    title: "Resultado Realizado por projeto",
    description:
      "Dinheiro que já voltou ao caixa. Fórmula: (Saques + Saques Virtuais) − (Depósitos + Depósitos Virtuais).",
    icon: <TrendingUp className="h-4 w-4 text-emerald-500" />,
  },
  teorico: {
    title: "Resultado Teórico por projeto",
    description:
      "Lucro contábil considerando o saldo atual nas casas. Pode não se realizar integralmente.",
    icon: <Coins className="h-4 w-4 text-primary" />,
  },
  exposto: {
    title: "Capital Exposto por projeto",
    description:
      "Diferença entre Teórico e Realizado — saldo ainda dentro das casas que depende de saque para virar dinheiro real.",
    icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  },
};

type SortKey = "exposto" | "realizado" | "operacional" | "nome";

export function ResultadoPorProjetoDrawer({
  open,
  onOpenChange,
  focus,
  items,
  totaisBRL,
  loading,
  formatBRL,
  resultadoOperacaoBRL,
}: Props) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>(
    focus === "realizado" ? "realizado" : "exposto"
  );
  const [onlyExposto, setOnlyExposto] = useState(focus === "exposto");

  const meta = FOCUS_META[focus];

  const visible = useMemo(() => {
    let list = [...items];
    if (onlyExposto) {
      list = list.filter((i) => Math.abs(i.capitalExpostoBRL) > 0.01);
    } else {
      // Esconde projetos totalmente zerados para não poluir
      list = list.filter(
        (i) =>
          Math.abs(i.lucroOperacionalBRL) > 0.01 ||
          Math.abs(i.lucroRealizadoBRL) > 0.01 ||
          Math.abs(i.capitalExpostoBRL) > 0.01
      );
    }
    list.sort((a, b) => {
      switch (sortKey) {
        case "realizado":
          return b.lucroRealizadoBRL - a.lucroRealizadoBRL;
        case "operacional":
          return b.lucroOperacionalBRL - a.lucroOperacionalBRL;
        case "nome":
          return a.nome.localeCompare(b.nome);
        case "exposto":
        default:
          return b.capitalExpostoBRL - a.capitalExpostoBRL;
      }
    });
    return list;
  }, [items, onlyExposto, sortKey]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto p-0 flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <SheetTitle className="flex items-center gap-2 text-base">
            {meta.icon}
            {meta.title}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {meta.description}
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border/50 bg-muted/20">
          <div className="flex items-center gap-2">
            <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Ordenar:</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="h-7 text-xs bg-background border border-border/50 rounded px-2"
            >
              <option value="exposto">Capital exposto</option>
              <option value="realizado">Realizado</option>
              <option value="operacional">Lucro operacional</option>
              <option value="nome">Nome</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="only-exposto"
              checked={onlyExposto}
              onCheckedChange={setOnlyExposto}
            />
            <Label htmlFor="only-exposto" className="text-xs cursor-pointer">
              Só com exposição
            </Label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Nenhum projeto com movimentação neste escopo.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {visible.map((it) => (
                <ProjetoRow
                  key={it.id}
                  item={it}
                  formatBRL={formatBRL}
                  onOpen={() => navigate(`/projetos/${it.id}`)}
                  highlight={focus}
                />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/50 bg-muted/30 px-5 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Total (BRL)
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <TotalCell
              label="Lucro Operacional"
              value={totaisBRL.lucroOperacional}
              formatBRL={formatBRL}
              highlight={focus === "teorico"}
            />
            <TotalCell
              label="Realizado"
              value={totaisBRL.lucroRealizado}
              formatBRL={formatBRL}
              tone={totaisBRL.lucroRealizado >= 0 ? "positive" : "negative"}
              highlight={focus === "realizado"}
            />
            <TotalCell
              label="Capital Exposto"
              value={totaisBRL.capitalExposto}
              formatBRL={formatBRL}
              tone="warning"
              highlight={focus === "exposto"}
            />
          </div>
          {typeof resultadoOperacaoBRL === "number" && (
            <ReconciliacaoBlock
              resultadoOperacaoBRL={resultadoOperacaoBRL}
              lucroOperacionalProjetosBRL={totaisBRL.lucroOperacional}
              formatBRL={formatBRL}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProjetoRow({
  item,
  formatBRL,
  onOpen,
  highlight,
}: {
  item: ResultadoPorProjetoItem;
  formatBRL: (v: number) => string;
  onOpen: () => void;
  highlight: DrawerFocus;
}) {
  const isBRL = item.moeda === "BRL";

  return (
    <div className="px-5 py-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm truncate">{item.nome}</span>
          <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">
            {item.moeda}
          </Badge>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[11px] gap-1"
          onClick={onOpen}
        >
          Abrir
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <DualValueCell
          label="Lucro Operacional"
          valorOriginal={item.lucroOperacional}
          valorBRL={item.lucroOperacionalBRL}
          moeda={item.moeda}
          isBRL={isBRL}
          formatBRL={formatBRL}
          highlighted={highlight === "teorico"}
        />
        <DualValueCell
          label="Realizado"
          valorOriginal={item.lucroRealizado}
          valorBRL={item.lucroRealizadoBRL}
          moeda={item.moeda}
          isBRL={isBRL}
          formatBRL={formatBRL}
          tone={item.lucroRealizado >= 0 ? "positive" : "negative"}
          highlighted={highlight === "realizado"}
        />
        <DualValueCell
          label="Capital Exposto"
          valorOriginal={item.capitalExposto}
          valorBRL={item.capitalExpostoBRL}
          moeda={item.moeda}
          isBRL={isBRL}
          formatBRL={formatBRL}
          tone="warning"
          highlighted={highlight === "exposto"}
        />
      </div>
    </div>
  );
}

function DualValueCell({
  label,
  valorOriginal,
  valorBRL,
  moeda,
  isBRL,
  formatBRL,
  tone = "default",
  highlighted = false,
}: {
  label: string;
  valorOriginal: number;
  valorBRL: number;
  moeda: string;
  isBRL: boolean;
  formatBRL: (v: number) => string;
  tone?: "default" | "positive" | "negative" | "warning";
  highlighted?: boolean;
}) {
  const colorClass =
    tone === "positive"
      ? "text-emerald-500"
      : tone === "negative"
        ? "text-red-500"
        : tone === "warning"
          ? "text-amber-500"
          : "text-foreground";

  return (
    <div
      className={`rounded-md px-2 py-1.5 border ${
        highlighted
          ? "border-primary/40 bg-primary/5"
          : "border-transparent bg-muted/20"
      }`}
    >
      <div className="text-[10px] text-muted-foreground leading-tight">
        {label}
      </div>
      <div className={`font-mono text-xs font-semibold ${colorClass}`}>
        {isBRL ? formatBRL(valorOriginal) : formatMoeda(valorOriginal, moeda)}
      </div>
      {!isBRL && (
        <div className="text-[10px] text-muted-foreground font-mono">
          ≈ {formatBRL(valorBRL)}
        </div>
      )}
    </div>
  );
}

function TotalCell({
  label,
  value,
  formatBRL,
  tone = "default",
  highlight = false,
}: {
  label: string;
  value: number;
  formatBRL: (v: number) => string;
  tone?: "default" | "positive" | "negative" | "warning";
  highlight?: boolean;
}) {
  const colorClass =
    tone === "positive"
      ? "text-emerald-500"
      : tone === "negative"
        ? "text-red-500"
        : tone === "warning"
          ? "text-amber-500"
          : "text-foreground";
  return (
    <div
      className={`rounded-md px-2 py-1.5 ${
        highlight ? "bg-primary/10 ring-1 ring-primary/30" : ""
      }`}
    >
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`font-mono text-sm font-bold ${colorClass}`}>
        {formatBRL(value)}
      </div>
    </div>
  );
}

function ReconciliacaoBlock({
  resultadoOperacaoBRL,
  lucroOperacionalProjetosBRL,
  formatBRL,
}: {
  resultadoOperacaoBRL: number;
  lucroOperacionalProjetosBRL: number;
  formatBRL: (v: number) => string;
}) {
  const divergencia = resultadoOperacaoBRL - lucroOperacionalProjetosBRL;
  const absDiv = Math.abs(divergencia);
  const tone =
    absDiv < 1
      ? "ok"
      : absDiv < Math.max(50, Math.abs(resultadoOperacaoBRL) * 0.02)
        ? "warn"
        : "alert";
  const toneClass =
    tone === "ok"
      ? "text-emerald-500"
      : tone === "warn"
        ? "text-amber-500"
        : "text-red-500";
  const toneLabel =
    tone === "ok"
      ? "Modelo bate com a engine canônica."
      : tone === "warn"
        ? "Pequena divergência (esperada por drift cambial)."
        : "Divergência relevante — vale auditar atribuições.";

  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        Reconciliação com o Patrimônio
      </div>
      <div className="space-y-1 text-xs font-mono">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            Resultado da operação (Patrimônio − Capital)
          </span>
          <span className="font-semibold">
            {formatBRL(resultadoOperacaoBRL)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            Soma do Lucro Operacional dos projetos
          </span>
          <span className="font-semibold">
            {formatBRL(lucroOperacionalProjetosBRL)}
          </span>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-border/30">
          <span className="text-muted-foreground">Divergência</span>
          <span className={`font-semibold ${toneClass}`}>
            {divergencia >= 0 ? "+" : ""}
            {formatBRL(divergencia)}
          </span>
        </div>
      </div>
      <p className={`mt-2 text-[10px] leading-relaxed ${toneClass}`}>
        {toneLabel}
      </p>
      {tone !== "ok" && (
        <ul className="mt-1 text-[10px] text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>Drift cambial (cotação atual vs snapshot por operação)</li>
          <li>Saldos sem projeto_id_snapshot (caixa, parceiros)</li>
          <li>Projetos arquivados com saldo residual</li>
        </ul>
      )}
    </div>
  );
}