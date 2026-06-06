import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import ParceiroDialog from "@/components/parceiros/ParceiroDialog";
import { Plus, Calendar } from "lucide-react";

interface ContaFiat {
  id: string;
  banco: string;
  titular: string;
  moeda: string;
  saldo: number;
}

interface SaldosFiatCardProps {
  caixaParceiroId: string | null;
  formatCurrency: (value: number, currency: string) => string;
  onDataChanged: () => void;
}

export function SaldosFiatCard({ caixaParceiroId, formatCurrency, onDataChanged }: SaldosFiatCardProps) {
  const [contas, setContas] = useState<ContaFiat[]>([]);
  const [isParceiroDialogOpen, setIsParceiroDialogOpen] = useState(false);
  const [parceiroCompleto, setParceiroCompleto] = useState<any>(null);

  const fetchContas = useCallback(async () => {
    if (!caixaParceiroId) return;
    const { data } = await supabase.from("v_saldo_parceiro_contas").select("*").eq("parceiro_id", caixaParceiroId);
    setContas((data || []).map((c: any) => ({ ...c, id: c.conta_id })) as ContaFiat[]);
  }, [caixaParceiroId]);

  const fetchParceiroCompleto = async () => {
    if (!caixaParceiroId) return;
    const { data } = await supabase
      .from("parceiros")
      .select(`
        *,
        contas_bancarias (*),
        wallets_crypto (*)
      `)
      .eq("id", caixaParceiroId)
      .single();
    
    if (data) {
      setParceiroCompleto(data);
      setIsParceiroDialogOpen(true);
    }
  };

  useEffect(() => { fetchContas(); }, [fetchContas]);

  // Aggregate totals by currency
  const saldosPorMoeda = contas.reduce<Record<string, number>>((acc, c) => {
    const m = c.moeda || "BRL";
    acc[m] = (acc[m] || 0) + (c.saldo || 0);
    return acc;
  }, {});

  const primarySaldo = saldosPorMoeda["BRL"] || 0;

  return (
    <>
      <Card className="bg-transparent border-[0.5px] border-[var(--border-default)] rounded-[12px] p-[16px_18px] relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-fiat)]" aria-hidden="true"></div>
            <span className="text-[11px] font-medium tracking-[0.06em] uppercase text-[var(--text-faint)]">
              Caixa FIAT
            </span>
            {contas.length > 0 && (
              <span className="bg-[var(--border-default)] text-[var(--text-muted)] text-[9px] px-1.5 py-0.5 rounded-[4px] font-medium">
                {contas.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button 
              className="p-1 hover:bg-white/5 rounded-md text-[var(--text-faint)] hover:text-[var(--accent-fiat)] transition-colors"
              onClick={fetchParceiroCompleto}
              title="Adicionar Conta"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <Calendar className="w-3.5 h-3.5 text-[var(--text-faint)] opacity-50" />
          </div>
        </div>

        {/* Body */}
        <div>
          <p className="text-[28px] font-medium text-[var(--text-primary)] tabular-nums leading-tight">
            {formatCurrency(primarySaldo, "BRL")}
          </p>
          <p className="text-[12px] text-[var(--text-muted)] mt-1">
            BRL · Conta principal
          </p>
        </div>

        {/* Watermark */}
        <div className="absolute bottom-2 right-4 text-[9px] font-bold tracking-[0.06em] text-[var(--border-default)] select-none uppercase">
          BRL
        </div>
      </Card>

      <ParceiroDialog
        open={isParceiroDialogOpen}
        onClose={() => {
          setIsParceiroDialogOpen(false);
          setParceiroCompleto(null);
          onDataChanged();
          fetchContas();
        }}
        parceiro={parceiroCompleto}
        initialTab="bancos"
      />
    </>
  );
}

