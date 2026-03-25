import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollText, ArrowUpRight, ArrowDownRight, ArrowLeftRight, RefreshCw, Pencil } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EditLedgerDialog } from "./EditLedgerDialog";

interface Props {
  supplierWorkspaceId: string;
}

const TIPO_LABELS: Record<string, string> = {
  ALOCACAO: "Alocação de Capital",
  DEPOSITO: "Depósito",
  SAQUE: "Saque",
  TRANSFERENCIA_BANCO: "Envio ao Banco",
  TRANSFERENCIA: "Transferência",
  DEVOLUCAO: "Devolução",
  AJUSTE: "Ajuste",
};

const TIPO_ICONS: Record<string, typeof ArrowUpRight> = {
  ALOCACAO: ArrowUpRight,
  DEPOSITO: ArrowUpRight,
  SAQUE: ArrowDownRight,
  TRANSFERENCIA_BANCO: ArrowLeftRight,
  TRANSFERENCIA: ArrowLeftRight,
  DEVOLUCAO: ArrowDownRight,
  AJUSTE: RefreshCw,
};

const EDITABLE_TYPES = ["DEPOSITO", "SAQUE", "TRANSFERENCIA_BANCO"];

function formatCurrency(val: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(val);
}

export function SupplierExtratoTab({ supplierWorkspaceId }: Props) {
  const [editEntry, setEditEntry] = useState<any>(null);

  const { data: entries = [], isLoading, refetch } = useQuery({
    queryKey: ["supplier-extrato", supplierWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_ledger")
        .select("*, supplier_bookmaker_accounts(login_username, bookmakers_catalogo(nome, logo_url), supplier_titulares(nome))")
        .eq("supplier_workspace_id", supplierWorkspaceId)
        .order("sequencia", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">Carregando extrato...</p>
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ScrollText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {entries.map((entry: any) => {
          const Icon = TIPO_ICONS[entry.tipo] || RefreshCw;
          const isCredit = entry.direcao === "CREDIT";
          const canEdit = EDITABLE_TYPES.includes(entry.tipo);
          const wasEdited = !!(entry.metadata as any)?.valor_original;

          return (
            <Card key={entry.id} className="hover:border-border/80 transition-colors group">
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    isCredit ? "bg-success/10" : "bg-destructive/10"
                  }`}>
                    <Icon className={`h-4 w-4 ${isCredit ? "text-success" : "text-destructive"}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-foreground">
                        {TIPO_LABELS[entry.tipo] || entry.tipo}
                      </p>
                      {wasEdited && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
                          editado
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      {entry.supplier_bookmaker_accounts?.bookmakers_catalogo?.nome && (
                        <span> · {entry.supplier_bookmaker_accounts.bookmakers_catalogo.nome}</span>
                      )}
                    </p>
                    {entry.descricao && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{entry.descricao}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${isCredit ? "text-success" : "text-destructive"}`}>
                      {isCredit ? "+" : "-"}{formatCurrency(Number(entry.valor))}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Saldo: {formatCurrency(Number(entry.saldo_depois))}
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => setEditEntry(entry)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-muted/50"
                      title="Editar lançamento"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <EditLedgerDialog
        open={!!editEntry}
        onOpenChange={(open) => { if (!open) setEditEntry(null); }}
        entry={editEntry}
        onSuccess={() => { setEditEntry(null); refetch(); }}
      />
    </>
  );
}
