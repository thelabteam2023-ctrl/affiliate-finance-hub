/**
 * Agrupa pernas flat por seleção para exibição de sub-entradas no SurebetCard.
 * 
 * Quando múltiplas pernas têm a mesma seleção (ex: "Casa"), a primeira vira
 * a entrada principal e as demais viram entries[] com bookmaker, odd e stake.
 * 
 * Calcula odd_media (ponderada por stake) e stake_total automaticamente.
 */

import type { SurebetPerna, SurebetPernaEntry } from "@/components/projeto-detalhe/SurebetCard";

interface RawPerna {
  id?: string;
  bookmaker_id?: string;
  bookmaker_nome?: string;
  selecao: string;
  selecao_livre?: string | null;
  odd: number;
  stake: number;
  resultado?: string | null;
  lucro_prejuizo?: number | null;
  moeda?: string;
  gerou_freebet?: boolean;
  valor_freebet_gerada?: number | null;
  // Bookmaker join
  bookmaker?: { nome: string; parceiro?: { nome: string } };
}

export function groupPernasBySelecao(
  pernasRaw: RawPerna[],
  bookmakerNomeResolver?: (p: RawPerna) => string
): SurebetPerna[] {
  const defaultNomeResolver = (p: RawPerna) =>
    p.bookmaker_nome || p.bookmaker?.nome || "—";

  const resolve = bookmakerNomeResolver || defaultNomeResolver;

  // Agrupar por selecao mantendo ordem de aparição
  const groups = new Map<string, RawPerna[]>();
  const groupOrder: string[] = [];

  for (const p of pernasRaw) {
    const key = p.selecao || `__unnamed_${p.id || Math.random()}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      groupOrder.push(key);
    }
    groups.get(key)!.push(p);
  }

  return groupOrder.map((key, gIdx) => {
    const group = groups.get(key)!;
    const main = group[0];
    const subs = group.slice(1);
    const hasEntries = subs.length > 0;

    // Calcular odd média ponderada e stake total
    const allEntries = group.map(p => ({ odd: p.odd, stake: p.stake }));
    const stakeTotal = allEntries.reduce((s, e) => s + (e.stake || 0), 0);
    const oddMedia = stakeTotal > 0
      ? allEntries.reduce((s, e) => s + (e.odd * e.stake), 0) / stakeTotal
      : main.odd;

    const result: SurebetPerna = {
      id: main.id || `perna-${gIdx}`,
      selecao: main.selecao,
      selecao_livre: main.selecao_livre || undefined,
      odd: main.odd,
      stake: main.stake,
      resultado: main.resultado || null,
      lucro_prejuizo: hasEntries
        ? group.reduce((s, p) => s + (p.lucro_prejuizo || 0), 0)
        : (main.lucro_prejuizo ?? null),
      bookmaker_nome: resolve(main),
      bookmaker_id: main.bookmaker_id,
      moeda: main.moeda || 'BRL',
    };

    if (hasEntries) {
      result.odd_media = oddMedia;
      result.stake_total = stakeTotal;
      result.entries = group.map(p => ({
        bookmaker_id: p.bookmaker_id || '',
        bookmaker_nome: resolve(p),
        moeda: p.moeda || 'BRL',
        odd: p.odd,
        stake: p.stake,
        selecao_livre: p.selecao_livre || undefined,
      }));
    }

    return result;
  });
}
