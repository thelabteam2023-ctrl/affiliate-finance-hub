import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowUpRight, ArrowDownRight, ArrowLeftRight, RefreshCw, ScrollText, ArrowRight, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";

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
        .select("id, tipo, direcao, valor, saldo_depois, descricao, created_at, metadata, supplier_bookmaker_accounts(login_username, bookmakers_catalogo(nome, logo_url), supplier_titulares(nome))")
        .eq("supplier_workspace_id", supplierWorkspaceId)
        .order("sequencia", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: titularesMap = {} } = useQuery({
    queryKey: ["supplier-titulares-map-inline", supplierWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_titulares")
        .select("id, nome")
        .eq("supplier_workspace_id", supplierWorkspaceId);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((t: any) => { map[t.id] = t.nome; });
      return map;
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
        const meta = (entry.metadata || {}) as any;
        const casaNome = entry.supplier_bookmaker_accounts?.bookmakers_catalogo?.nome;
        const casaLogo = entry.supplier_bookmaker_accounts?.bookmakers_catalogo?.logo_url;
        const titularNome = entry.supplier_bookmaker_accounts?.supplier_titulares?.nome
          || (meta.titular_id ? titularesMap[meta.titular_id] : null)
          || meta.titular_nome;
        const bancoNome = meta.banco_nome;

        // Resolve origem → destino
        let origem: string | null = null;
        let destino: string | null = null;
        switch (entry.tipo) {
          case "ALOCACAO": {
            // Mostrar origem real (parceiro · banco/wallet) quando disponível
            const parceiro = meta.origem_parceiro_nome;
            const bancoOrWallet = meta.origem_banco_nome || meta.origem_wallet_nome;
            if (parceiro && bancoOrWallet) origem = `${parceiro} · ${bancoOrWallet}`;
            else if (parceiro) origem = parceiro;
            else if (bancoOrWallet) origem = bancoOrWallet;
            else origem = "Caixa Operacional";
            destino = "Saldo Disponível";
            break;
          }
          case "DEPOSITO":
            origem = bancoNome || "Banco";
            destino = casaNome || "Casa";
            break;
          case "SAQUE":
            origem = casaNome || "Casa";
            destino = bancoNome || "Banco";
            break;
          case "TRANSFERENCIA_BANCO":
            origem = "Saldo Disponível";
            destino = bancoNome || "Banco";
            break;
          case "RECOLHIMENTO_BANCO":
            origem = bancoNome || "Banco";
            destino = "Saldo Disponível";
            break;
          case "PAGAMENTO_TITULAR":
            origem = bancoNome || "Saldo Disponível";
            destino = titularNome || "Titular";
            break;
          case "DEVOLUCAO":
            origem = "Fornecedor";
            destino = "Caixa Operacional";
            break;
        }

        return (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {casaLogo ? (
                <img src={casaLogo} alt="" className="w-7 h-7 rounded-full object-contain shrink-0" />
              ) : (
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    isCredit ? "bg-success/10" : "bg-destructive/10"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isCredit ? "text-success" : "text-destructive"}`} />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {TIPO_LABELS[entry.tipo] || entry.tipo}
                </p>
                {origem && destino && (
                  <p className="text-[10px] text-foreground/70 font-medium flex items-center gap-1 truncate">
                    <span className="truncate">{origem}</span>
                    <ArrowRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{destino}</span>
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  {titularNome && (entry.tipo === "DEPOSITO" || entry.tipo === "SAQUE" || entry.tipo === "TRANSFERENCIA_BANCO" || entry.tipo === "RECOLHIMENTO_BANCO") && (
                    <span> · {titularNome}</span>
                  )}
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
