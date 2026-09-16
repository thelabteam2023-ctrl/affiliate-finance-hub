import { Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useProjetoReconciliacaoResultado } from "@/hooks/useProjetoReconciliacaoResultado";

interface Props {
  projetoId: string;
}

/**
 * Composição reconciliável do Lucro Realizado:
 *   Operacional + Resultado Cambial + Outros Resultados Financeiros = Lucro Realizado.
 *
 * O objetivo é deixar explícito por que o Operacional Teórico pode diferir do
 * Lucro Realizado sem que exista erro.
 */
export function ReconciliacaoBreakdown({ projetoId }: Props) {
  const { data } = useProjetoReconciliacaoResultado(projetoId);
  const { formatCurrency } = useProjetoCurrency(projetoId);

  if (!data) return null;

  const {
    operacional,
    cambialRealizado,
    cambialNaoRealizado,
    cambialConversao,
    cambialTotal,
    outrosFinanceiros,
    lucroRealizado,
    residuo,
    reconciliado,
  } = data;

  const temCambial = Math.abs(cambialTotal) >= 0.005;
  const temOutros = Math.abs(outrosFinanceiros) >= 0.005;

  const Linha = ({
    label,
    valor,
    hint,
    muted,
  }: {
    label: string;
    valor: number;
    hint?: string;
    muted?: boolean;
  }) => (
    <div className="flex items-baseline justify-between gap-3">
      <span className={cn("text-[11px]", muted ? "text-muted-foreground/80 pl-3" : "text-muted-foreground")}>
        {label}
        {hint && <span className="text-[10px] text-muted-foreground/60"> — {hint}</span>}
      </span>
      <span
        className={cn(
          "text-[11px] font-mono tabular-nums",
          valor >= 0 ? "text-emerald-500" : "text-red-400",
          muted && "opacity-80"
        )}
      >
        {valor >= 0 ? "+" : "−"}
        {formatCurrency(Math.abs(valor))}
      </span>
    </div>
  );

  return (
    <div className="mb-3 rounded-md border border-border/50 bg-muted/20 px-3 py-2 space-y-1">
      <div className="flex items-center gap-1.5 mb-1">
        <Scale className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
          Composição do resultado
        </span>
      </div>

      <Linha label="Lucro Operacional" valor={operacional} hint="cotação da operação" />

      {temCambial && (
        <>
          <Linha label="Resultado Cambial" valor={cambialTotal} />
          {Math.abs(cambialRealizado) >= 0.005 && (
            <Linha label="realizado" valor={cambialRealizado} muted />
          )}
          {Math.abs(cambialNaoRealizado) >= 0.005 && (
            <Linha
              label="não realizado"
              valor={cambialNaoRealizado}
              hint="posição aberta em moeda estrangeira"
              muted
            />
          )}
          {Math.abs(cambialConversao) >= 0.005 && (
            <Linha
              label="conversão de capital"
              valor={cambialConversao}
              hint="aporte e recuperação em moedas diferentes"
              muted
            />
          )}
        </>
      )}

      {temOutros && (
        <Linha
          label="Conciliação Depósito × Saldo"
          valor={outrosFinanceiros}
          hint="diferenças de recebimento"
        />
      )}

      {!reconciliado && (
        <Linha label="Não conciliado" valor={residuo} hint="verificar lançamentos" />
      )}

      <div className="flex items-baseline justify-between gap-3 pt-1.5 mt-1 border-t border-border/40">
        <span className="text-[11px] font-medium text-foreground">Lucro Realizado</span>
        <span
          className={cn(
            "text-xs font-bold font-mono tabular-nums",
            lucroRealizado >= 0 ? "text-emerald-500" : "text-red-400"
          )}
        >
          {lucroRealizado >= 0 ? "+" : "−"}
          {formatCurrency(Math.abs(lucroRealizado))}
        </span>
      </div>
    </div>
  );
}
