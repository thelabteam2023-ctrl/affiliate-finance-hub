import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, User, Landmark, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatMoneyValue } from "@/components/ui/money-display";

interface ContaDetalhe {
  parceiro_id: string;
  parceiro_nome: string;
  banco: string;
  saldo: number;
  moeda: string;
}

interface ParceiroAgrupado {
  nome: string;
  total: number;
  contas: Array<{ banco: string; saldo: number; moeda: string }>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caixaParceiroId: string | null;
}

export function SaldoBancosParceiroModal({ open, onOpenChange, caixaParceiroId }: Props) {
  const [loading, setLoading] = useState(false);
  const [parceiros, setParceiros] = useState<ParceiroAgrupado[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!open) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const query = supabase
          .from("v_saldo_parceiro_contas")
          .select("parceiro_id, parceiro_nome, banco, saldo, moeda")
          .limit(5000);

        if (caixaParceiroId) {
          query.neq("parceiro_id", caixaParceiroId);
        }

        const { data } = await query;
        const rows = (data || []) as ContaDetalhe[];

        // Group by parceiro
        const grouped: Record<string, ParceiroAgrupado> = {};
        let sum = 0;

        rows.forEach((r) => {
          const saldo = Math.max(0, r.saldo || 0);
          if (saldo === 0) return;

          sum += saldo;
          const key = r.parceiro_id;
          if (!grouped[key]) {
            grouped[key] = { nome: r.parceiro_nome || "Sem nome", total: 0, contas: [] };
          }
          grouped[key].total += saldo;
          grouped[key].contas.push({ banco: r.banco || "Conta", saldo, moeda: r.moeda || "BRL" });
        });

        const sorted = Object.values(grouped).sort((a, b) => b.total - a.total);
        setParceiros(sorted);
        setTotal(sum);
      } catch (err) {
        console.error("Erro ao buscar saldos bancários:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [open, caixaParceiroId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            Saldo em Bancos dos Parceiros
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Total consolidado:{" "}
            <span className="font-semibold text-foreground">
              {formatMoneyValue(total, "BRL")}
            </span>
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : parceiros.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma conta bancária com saldo encontrada
          </p>
        ) : (
          <div className="space-y-4 mt-2">
            {parceiros.map((parceiro) => (
              <div key={parceiro.nome} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    {parceiro.nome}
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                    {formatMoneyValue(parceiro.total, "BRL")}
                  </span>
                </div>
                <div className="space-y-1.5 pl-5">
                  {parceiro.contas.map((conta, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-sm text-foreground truncate">{conta.banco}</span>
                      </div>
                      <span className="text-sm font-bold text-foreground tabular-nums shrink-0 ml-2">
                        {formatMoneyValue(conta.saldo, conta.moeda)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
