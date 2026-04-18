import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowUpRight, ArrowDownRight, ArrowLeftRight, RefreshCw, ScrollText } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  supplierWorkspaceId: string;
}

const TIPO_LABELS: Record<string, string> = {
  ALOCACAO: "Alocação de Capital",
  DEPOSITO: "Depósito",
  SAQUE: "Saque",
  TRANSFERENCIA_BANCO: "Envio ao Banco",
  RECOLHIMENTO_BANCO: "Recolhimento do Banco",
  TRANSFERENCIA: "Transferência",
  DEVOLUCAO: "Devolução",
  AJUSTE: "Ajuste",
  PAGAMENTO_TITULAR: "Pagamento ao Titular",
};

const TIPO_ICONS: Record<string, typeof ArrowUpRight> = {
  ALOCACAO: ArrowUpRight,
  DEPOSITO: ArrowUpRight,
  SAQUE: ArrowDownRight,
  TRANSFERENCIA_BANCO: ArrowLeftRight,
  RECOLHIMENTO_BANCO: ArrowLeftRight,
  TRANSFERENCIA: ArrowLeftRight,
  DEVOLUCAO: ArrowDownRight,
  AJUSTE: RefreshCw,
  PAGAMENTO_TITULAR: ArrowDownRight,
};

function formatCurrency(val: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(val);
}

export function SupplierExtratoInline({ supplierWorkspaceId }: Props) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["supplier-extrato-inline", supplierWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_ledger")
        .select("id, tipo, direcao, valor, saldo_depois, descricao, created_at, metadata")
        .eq("supplier_workspace_id", supplierWorkspaceId)
        .order("sequencia", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <div className="py-6 text-center">
        <p className="text-xs text-muted-foreground">Carregando movimentações...</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-6 text-center">
        <ScrollText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">Nenhuma movimentação registrada</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Últimas movimentações ({entries.length})
      </p>
      {entries.map((entry: any) => {
        const Icon = TIPO_ICONS[entry.tipo] || RefreshCw;
        const isCredit = entry.direcao === "CREDIT";
        return (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  isCredit ? "bg-success/10" : "bg-destructive/10"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isCredit ? "text-success" : "text-destructive"}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {TIPO_LABELS[entry.tipo] || entry.tipo}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-xs font-semibold ${isCredit ? "text-success" : "text-destructive"}`}>
                {isCredit ? "+" : "-"}
                {formatCurrency(Number(entry.valor))}
              </p>
              <p className="text-[9px] text-muted-foreground">
                Saldo: {formatCurrency(Number(entry.saldo_depois))}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
