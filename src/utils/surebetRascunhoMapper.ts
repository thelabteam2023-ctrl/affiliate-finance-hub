/**
 * surebetRascunhoMapper — Conversão bidirecional entre o modelo do formulário
 * de arbitragem (OddEntry[]) e o modelo de persistência de rascunho
 * (RascunhoPernaData[]).
 *
 * MOTIVO: historicamente cada tela fazia seu próprio map inline, e as
 * sub-entradas (múltiplas casas na MESMA perna) eram descartadas no save e
 * hardcoded como [] no load. Centralizar aqui garante roundtrip fiel e
 * testável.
 *
 * IMPORTANTE: rascunhos vivem apenas em localStorage — nada aqui toca banco,
 * saldo ou ledger.
 */

import type { OddEntry, OddFormEntry } from "@/hooks/useSurebetCalculator";
import type { RascunhoPernaData, RascunhoEntradaData } from "@/hooks/useApostaRascunho";
import type { SupportedCurrency } from "@/hooks/useCurrencySnapshot";

const num = (v?: string | number | null): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const parsed = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const str = (v?: number | null): string => (v === undefined || v === null ? "" : String(v));

/** Uma sub-entrada é descartável apenas se estiver completamente vazia. */
const isSubEntryEmpty = (e: OddFormEntry): boolean =>
  !e?.bookmaker_id && !num(e?.odd) && !num(e?.stake) && !e?.selecaoLivre?.trim();

export interface RascunhoMapperOptions {
  /** Resolve o nome da casa para exibição na listagem de rascunhos. */
  getBookmakerNome?: (id: string) => string | undefined;
}

/** Formulário → rascunho (preserva TODAS as sub-entradas e atributos). */
export function oddsToRascunhoPernas(
  odds: OddEntry[],
  options: RascunhoMapperOptions = {}
): RascunhoPernaData[] {
  const nome = options.getBookmakerNome ?? (() => undefined);

  return odds.map((entry) => {
    const subs = (entry.additionalEntries || []).filter((e) => !isSubEntryEmpty(e));

    const entradas_adicionais: RascunhoEntradaData[] = subs.map((sub) => ({
      bookmaker_id: sub.bookmaker_id || undefined,
      bookmaker_nome: sub.bookmaker_id ? nome(sub.bookmaker_id) : undefined,
      odd: num(sub.odd),
      stake: num(sub.stake),
      moeda: sub.moeda,
      selecao_livre: sub.selecaoLivre || undefined,
      fonte_saldo: sub.fonteSaldo,
      tipo: sub.tipo,
      comissao: sub.comissao,
    }));

    return {
      bookmaker_id: entry.bookmaker_id || undefined,
      bookmaker_nome: entry.bookmaker_id ? nome(entry.bookmaker_id) : undefined,
      selecao: entry.selecao || undefined,
      selecao_livre: entry.selecaoLivre || undefined,
      odd: num(entry.odd),
      stake: num(entry.stake),
      moeda: entry.moeda,
      fonte_saldo: entry.fonteSaldo,
      tipo: entry.tipo,
      comissao: entry.comissao,
      ...(entradas_adicionais.length > 0 ? { entradas_adicionais } : {}),
    };
  });
}

/** Rascunho → formulário (suporta N sub-entradas e rascunhos legados). */
export function rascunhoPernasToOdds(
  pernas: RascunhoPernaData[] | undefined,
  defaultSelecoes: string[] = []
): OddEntry[] {
  if (!pernas || pernas.length === 0) return [];

  return pernas.map((perna, i) => {
    const additionalEntries: OddFormEntry[] = (perna.entradas_adicionais || []).map((sub) => ({
      bookmaker_id: sub.bookmaker_id || "",
      moeda: ((sub.moeda as SupportedCurrency) || (perna.moeda as SupportedCurrency) || "BRL"),
      odd: str(sub.odd),
      stake: str(sub.stake),
      selecaoLivre: sub.selecao_livre || "",
      fonteSaldo: sub.fonte_saldo,
      tipo: sub.tipo ?? perna.tipo,
      comissao: sub.comissao,
    }));

    return {
      bookmaker_id: perna.bookmaker_id || "",
      moeda: (perna.moeda as SupportedCurrency) || "BRL",
      odd: str(perna.odd),
      stake: str(perna.stake),
      selecao: perna.selecao || defaultSelecoes[i] || "",
      selecaoLivre: perna.selecao_livre || "",
      isReference: i === 0,
      isManuallyEdited: !!(perna.odd && perna.stake),
      stakeOrigem: undefined,
      fonteSaldo: perna.fonte_saldo,
      tipo: perna.tipo,
      comissao: perna.comissao,
      additionalEntries,
    };
  });
}
