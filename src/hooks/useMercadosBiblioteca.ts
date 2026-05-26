import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MercadoBiblioteca {
  id: string;
  esporte: string;
  categoria: string;
  objeto: string | null;
  formato_opcoes: string[] | null;
  direcao_opcoes: string[];
  tem_linha: boolean;
  linha_placeholder: string | null;
  display_nome: string;
  prioridade: number;
}

export type MercadosAgrupados = Record<string, MercadoBiblioteca[]>;

/**
 * Catálogo público (read-only) de mercados padronizados por esporte.
 * Usado pelo formulário "Nova Entrada" (cascata categoria → objeto → formato → direção → linha).
 */
export function useMercadosBiblioteca(esporte: string | null) {
  return useQuery<MercadosAgrupados>({
    queryKey: ["mercados_biblioteca", esporte],
    enabled: !!esporte,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mercados_biblioteca" as any)
        .select("id, esporte, categoria, objeto, formato_opcoes, direcao_opcoes, tem_linha, linha_placeholder, display_nome, prioridade")
        .eq("esporte", esporte!)
        .eq("ativo", true)
        .order("categoria", { ascending: true })
        .order("prioridade", { ascending: false });

      if (error) throw error;

      const grouped: MercadosAgrupados = {};
      for (const row of (data || []) as unknown as MercadoBiblioteca[]) {
        if (!grouped[row.categoria]) grouped[row.categoria] = [];
        grouped[row.categoria].push(row);
      }
      return grouped;
    },
  });
}

export const ESPORTES_BIBLIOTECA = [
  { value: "soccer",     label: "Futebol" },
  { value: "basketball", label: "Basquete" },
  { value: "tennis",     label: "Tênis" },
  { value: "hockey",     label: "Hockey" },
  { value: "handball",   label: "Handebol" },
  { value: "cs2",        label: "CS2" },
  { value: "lol",        label: "League of Legends" },
  { value: "dota2",      label: "Dota 2" },
  { value: "valorant",   label: "Valorant" },
] as const;

export const MOEDAS_NOVA_ENTRADA = [
  { code: "BRL",  symbol: "R$", nome: "Real brasileiro" },
  { code: "USD",  symbol: "$",  nome: "Dólar americano" },
  { code: "EUR",  symbol: "€",  nome: "Euro" },
  { code: "GBP",  symbol: "£",  nome: "Libra esterlina" },
  { code: "ARS",  symbol: "$",  nome: "Peso argentino" },
  { code: "MXN",  symbol: "$",  nome: "Peso mexicano" },
  { code: "COP",  symbol: "$",  nome: "Peso colombiano" },
  { code: "CLP",  symbol: "$",  nome: "Peso chileno" },
  { code: "PEN",  symbol: "S/", nome: "Sol peruano" },
  { code: "UYU",  symbol: "$",  nome: "Peso uruguaio" },
  { code: "USDT", symbol: "₮",  nome: "Tether (cripto)" },
] as const;