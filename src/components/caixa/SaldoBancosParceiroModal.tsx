import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, User, Landmark, Loader2, ArrowDownAZ, ArrowDown01 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { formatMoneyValue } from "@/components/ui/money-display";
import { Button } from "@/components/ui/button";

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

type SortMode = "valor" | "alfabetica";

export function SaldoBancosParceiroModal({ open, onOpenChange, caixaParceiroId }: Props) {
  const { workspaceId } = useTabWorkspace();
  const [loading, setLoading] = useState(false);
  const [parceiros, setParceiros] = useState<ParceiroAgrupado[]>([]);
  const [total, setTotal] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>("valor");

  useEffect(() => {
    if (!open) return;

    const fetchData = async () => {
      setLoading(true);
      if (!workspaceId) return;
      
      try {
        const query = supabase
          .from("v_saldo_parceiro_contas")
          .select("parceiro_id, parceiro_nome, banco, saldo, moeda")
          .eq("workspace_id", workspaceId)
          .limit(5000);

        if (caixaParceiroId) {
          query.neq("parceiro_id", caixaParceiroId);
        }

        const { data } = await query;
        const rows = (data || []) as ContaDetalhe[];

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

        setParceiros(Object.values(grouped));
        setTotal(sum);
      } catch (err) {
        console.error("Erro ao buscar saldos bancários:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [open, caixaParceiroId]);

  const sortedParceiros = [...parceiros].sort((a, b) => {
    if (sortMode === "alfabetica") {
      return a.nome.localeCompare(b.nome, "pt-BR");
    }
    return b.total - a.total;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[#0F1115] border-white/10 text-white p-0 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh] gap-0">
        <div className="p-6 border-b border-white/5 bg-white/[0.02]">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <Landmark className="h-5 w-5 text-primary" />
                Saldo em Bancos
              </DialogTitle>
              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg">
                <Button
                  variant={sortMode === "valor" ? "secondary" : "ghost"}
                  size="sm"
                  className={`h-7 px-2 text-[10px] gap-1 uppercase tracking-wider transition-all duration-200 ${sortMode === "valor" ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-white/40 hover:text-white hover:bg-white/5"}`}
                  onClick={() => setSortMode("valor")}
                >
                  <ArrowDown01 className="h-3 w-3" />
                  Valor
                </Button>
                <Button
                  variant={sortMode === "alfabetica" ? "secondary" : "ghost"}
                  size="sm"
                  className={`h-7 px-2 text-[10px] gap-1 uppercase tracking-wider transition-all duration-200 ${sortMode === "alfabetica" ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-white/40 hover:text-white hover:bg-white/5"}`}
                  onClick={() => setSortMode("alfabetica")}
                >
                  <ArrowDownAZ className="h-3 w-3" />
                  A-Z
                </Button>
              </div>
            </div>
          </DialogHeader>
        </div>

        <ScrollArea className="flex-1 min-h-0 px-6">
          <div className="py-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-white/40 font-medium">Carregando saldos...</p>
              </div>
            ) : sortedParceiros.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                  <Landmark className="h-6 w-6 text-white/20" />
                </div>
                <p className="text-white/40 font-medium">Nenhuma conta bancária com saldo encontrada.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedParceiros.map((parceiro) => (
                  <div key={parceiro.nome} className="group relative">
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.01] group-hover:bg-white/[0.03] group-hover:border-white/10 transition-all duration-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-white group-hover:text-primary transition-colors">
                          <User className="h-4 w-4 text-white/40" />
                          {parceiro.nome}
                        </div>
                        <span className="text-sm font-mono font-bold text-white/60">
                          {formatMoneyValue(parceiro.total, "BRL")}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {parceiro.contas.map((conta, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 group/item hover:border-white/20 transition-all"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Building2 className="h-3.5 w-3.5 text-white/20 group-hover/item:text-primary transition-colors shrink-0" />
                              <span className="text-sm text-white/70 group-hover/item:text-white transition-colors truncate">{conta.banco}</span>
                            </div>
                            <span className="text-sm font-mono font-bold text-white tabular-nums shrink-0 ml-2">
                              {formatMoneyValue(conta.saldo, conta.moeda)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-6 bg-white/[0.04] border-t border-white/10 flex items-center justify-between shrink-0">
          <span className="text-white/40 text-sm font-medium uppercase tracking-wider">Total Consolidado</span>
          <div className="flex flex-col items-end">
            <span className="text-2xl font-mono font-bold text-white">
              {formatMoneyValue(total, "BRL")}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}