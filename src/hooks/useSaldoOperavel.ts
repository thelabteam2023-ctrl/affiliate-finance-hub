import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";

interface BookmakerSaldo {
  id: string;
  saldo_atual: number | null;
  saldo_usd: number | null;
  moeda: string | null;
}

export function useSaldoOperavel(projetoId: string) {
  const { convertToConsolidation, moedaConsolidacao } = useProjetoCurrency(projetoId);

  const { data: bookmakers = [], isLoading } = useQuery({
    queryKey: ["saldo-operavel-bookmakers", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          saldo_atual,
          saldo_usd,
          moeda
        `)
        .eq("projeto_id", projetoId)
        .in("status", ["ATIVO", "ativo", "LIMITADA", "limitada"]);

      if (error) throw error;
      return (data || []) as BookmakerSaldo[];
    },
    enabled: !!projetoId,
  });

  // Saldo Operável = soma dos saldos reais de todas as casas vinculadas ao projeto
  // NÃO soma performance de bônus pois ela já está refletida nos saldos
  const saldoOperavel = useMemo(() => {
    return bookmakers.reduce((acc, bk) => {
      const moeda = bk.moeda || "BRL";
      const isUsdCurrency = moeda === "USD" || moeda === "USDT";
      const saldoReal = isUsdCurrency
        ? Number(bk.saldo_usd ?? bk.saldo_atual ?? 0)
        : Number(bk.saldo_atual ?? 0);
      return acc + convertToConsolidation(saldoReal, moeda);
    }, 0);
  }, [bookmakers, convertToConsolidation]);

  const totalCasas = bookmakers.length;

  return {
    saldoOperavel,
    totalCasas,
    isLoading,
    moedaConsolidacao,
  };
}
