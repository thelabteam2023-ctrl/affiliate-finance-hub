import { cn } from "@/lib/utils";
import { useProjetoReconciliacaoResultado } from "@/hooks/useProjetoReconciliacaoResultado";

const MOEDA_SYMBOLS: Record<string, string> = {
  BRL: "R$", USD: "$", EUR: "€", GBP: "£", MYR: "RM", MXN: "MX$", ARS: "AR$", COP: "CO$",
};

const formatByMoeda = (value: number, moeda: string) => {
  const m = (moeda || "BRL").toUpperCase();
  const symbol = MOEDA_SYMBOLS[m] || m;
  return `${symbol} ${Math.abs(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

interface Props {
  projetoId: string;
  moedaConsolidacao: string;
  /** Só busca os dados quando o mouse está sobre o card (lista pode ter dezenas). */
  enabled: boolean;
}

/**
 * Composição do Lucro Realizado exibida no hover do card de Projetos:
 *   Operacional (teórico) + Diferença Cambial + Outros Resultados = Lucro Realizado.
 *
 * Somente leitura — usa o mesmo motor do Extrato (paridade absoluta).
 */
export function LucroRealizadoComposicaoTooltip({
  projetoId,
  moedaConsolidacao,
  enabled,
}: Props) {
  const { data, isLoading } = useProjetoReconciliacaoResultado(projetoId, { enabled });

  if (isLoading || !data) {
    return <div className="text-[11px] text-muted-foreground">Calculando composição…</div>;
  }

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

  const fmt = (v: number) =>
    `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatByMoeda(Math.abs(v), moedaConsolidacao)}`;

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
    <div className="flex items-baseline justify-between gap-4">
      <span className={cn("text-[11px]", muted ? "pl-3 text-muted-foreground/75" : "text-muted-foreground")}>
        {label}
        {hint && <span className="text-[10px] text-muted-foreground/60"> — {hint}</span>}
      </span>
      <span
        className={cn(
          "text-[11px] font-mono tabular-nums",
          valor > 0 ? "text-emerald-500" : valor < 0 ? "text-red-400" : "text-muted-foreground"
        )}
      >
        {fmt(valor)}
      </span>
    </div>
  );

  return (
    <div className="min-w-[250px] space-y-1">
      <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
        Composição do Lucro Realizado
      </p>

      <Linha label="Operacional (teórico)" valor={operacional} hint="cotação da operação" />

      <Linha label="Diferença cambial" valor={cambialTotal} />
      {Math.abs(cambialRealizado) >= 0.005 && (
        <Linha label="realizada" valor={cambialRealizado} muted />
      )}
      {Math.abs(cambialConversao) >= 0.005 && (
        <Linha
          label="conversão de capital"
          valor={cambialConversao}
          hint="aporte e recuperação em moedas diferentes"
          muted
        />
      )}
      {Math.abs(cambialNaoRealizado) >= 0.005 && (
        <Linha
          label="posição aberta"
          valor={cambialNaoRealizado}
          hint="ainda em moeda estrangeira"
          muted
        />
      )}

      {Math.abs(outrosFinanceiros) >= 0.005 && (
        <Linha
          label="Conciliação Depósito × Saldo"
          valor={outrosFinanceiros}
          hint="diferenças de recebimento"
        />
      )}

      {!reconciliado && (
        <Linha label="Não conciliado" valor={residuo} hint="verificar lançamentos" />
      )}

      <div className="flex items-baseline justify-between gap-4 border-t border-border/50 pt-1.5 mt-1">
        <span className="text-[11px] font-medium text-foreground">Lucro Realizado</span>
        <span
          className={cn(
            "text-xs font-bold font-mono tabular-nums",
            lucroRealizado >= 0 ? "text-emerald-500" : "text-red-400"
          )}
        >
          {fmt(lucroRealizado)}
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground/70 pt-1">
        Saques − depósitos já efetivados, na cotação de trabalho do projeto.
      </p>
    </div>
  );
}
