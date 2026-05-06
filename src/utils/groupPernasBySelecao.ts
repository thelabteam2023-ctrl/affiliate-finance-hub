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
  parceiro_nome?: string | null;
  instance_identifier?: string | null;
  logo_url?: string | null;
  selecao: string;
  selecao_livre?: string | null;
  odd: number;
  stake: number;
  resultado?: string | null;
  lucro_prejuizo?: number | null;
  moeda?: string;
  stake_brl_referencia?: number | null;
  lucro_prejuizo_brl_referencia?: number | null;
  cotacao_snapshot?: number | null;
  gerou_freebet?: boolean;
  valor_freebet_gerada?: number | null;
  fonte_saldo?: string | null;
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
    // Agora consideramos múltiplas entradas se houver sub-registros flat OU 
    // se o registro principal já vier com entries pré-populadas do banco
    const hasEntries = subs.length > 0 || (main as any).entries?.length > 0;

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
        bookmaker_nome: (() => {
          // Caso 1: Múltiplas pernas flat (modelo legado)
          if (subs.length > 0) {
            return group.map(p => resolve(p)).join(", ");
          }
          // Caso 2: Uma perna com múltiplas entries (novo modelo)
          if ((main as any).entries?.length > 1) {
            return (main as any).entries.map((e: any) => e.bookmaker_nome || "—").join(", ");
          }
          // Caso 3: Perna única
          return resolve(main);
        })(),
      bookmaker_id: main.bookmaker_id,
      parceiro_nome: main.parceiro_nome ?? main.bookmaker?.parceiro?.nome ?? null,
      instance_identifier: main.instance_identifier ?? null,
      logo_url: main.logo_url ?? null,
      moeda: main.moeda || 'BRL',
      stake_brl_referencia: main.stake_brl_referencia ?? null,
      lucro_prejuizo_brl_referencia: main.lucro_prejuizo_brl_referencia ?? null,
      cotacao_snapshot: main.cotacao_snapshot ?? null,
      fonte_saldo: main.fonte_saldo || undefined,
    };

    if (hasEntries) {
      result.odd_media = oddMedia;
      result.stake_total = stakeTotal;
      
      // Se já veio com entries pré-populadas (novo modelo 1:N), prioriza elas
      if ((main as any).entries?.length > 0) {
        result.entries = (main as any).entries;
      } else {
        // Fallback para modelo legado onde múltiplas pernas flat representavam divisões
        result.entries = group.map(p => ({
          id: p.id,
          bookmaker_id: p.bookmaker_id || '',
          bookmaker_nome: resolve(p),
          parceiro_nome: p.parceiro_nome ?? p.bookmaker?.parceiro?.nome ?? null,
          instance_identifier: p.instance_identifier ?? null,
          logo_url: p.logo_url ?? null,
          moeda: p.moeda || 'BRL',
          odd: p.odd,
          stake: p.stake,
          resultado: p.resultado ?? null,
          lucro_prejuizo: p.lucro_prejuizo ?? null,
          stake_brl_referencia: p.stake_brl_referencia ?? null,
          lucro_prejuizo_brl_referencia: p.lucro_prejuizo_brl_referencia ?? null,
          cotacao_snapshot: p.cotacao_snapshot ?? null,
          selecao_livre: p.selecao_livre || undefined,
          fonte_saldo: p.fonte_saldo || undefined,
        }));
      }
    }

    return result;
  });
}
