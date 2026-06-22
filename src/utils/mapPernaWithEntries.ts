/**
 * Helpers compartilhados para leitura de pernas + entradas (1:N).
 *
 * REGRA CANÔNICA (memória `surebet-perna-read-with-entradas-standard`):
 *   Toda renderização de pernas de operações ARBITRAGEM/SUREBET DEVE trazer também
 *   `apostas_perna_entradas` no select e popular `SurebetPerna.entries[]`. A entrada
 *   denormalizada em `apostas_pernas` é apenas conveniência de saldo — nunca
 *   substitui a leitura das entradas.
 *
 * Antes deste helper, 4 tabs (Apostas, Surebet, DuploGreen, Bônus) liam só de
 * `apostas_pernas` e perdiam todas as casas adicionais (ex.: NORUEGA X SENEGAL
 * perna X = VAVE/Juliana + HUGEWIN/Wallyson — a segunda sumia da UI).
 */

import type { SurebetPernaEntry } from "@/components/projeto-detalhe/SurebetCard";

/**
 * Subselect padrão para trazer as entradas de uma perna junto da query principal
 * em `apostas_pernas`. Importa nas tabs como:
 *
 *   .select(`
 *     ...,
 *     ${SELECT_APOSTAS_PERNA_ENTRADAS}
 *   `)
 */
export const SELECT_APOSTAS_PERNA_ENTRADAS = `
  apostas_perna_entradas (
    id, perna_id, bookmaker_id, moeda, odd, stake, stake_real, stake_freebet, fonte_saldo, tipo, comissao, stake_brl_referencia, cotacao_snapshot, created_at
  )
`;

export interface BookmakerInfo {
  nome?: string | null;
  instance_identifier?: string | null;
  parceiro_nome?: string | null;
  logo_url?: string | null;
}

/**
 * Resolve o display name canônico de uma casa, idêntico ao usado na linha
 * principal: "NOME (instance) - PARCEIRO".
 */
export function buildBookmakerDisplayName(info: BookmakerInfo | undefined | null): string {
  if (!info) return "—";
  const baseNome = info.nome || "—";
  const withInstance = info.instance_identifier
    ? `${baseNome} (${info.instance_identifier})`
    : baseNome;
  return info.parceiro_nome ? `${withInstance} - ${info.parceiro_nome}` : withInstance;
}

/**
 * Converte as entradas brutas de `apostas_perna_entradas` no formato consumido
 * pelo `SurebetCard` (`SurebetPerna.entries[]`).
 *
 * - `pernaRow`     → row de `apostas_pernas` (já vinda da query, contendo
 *                    `apostas_perna_entradas` no subselect)
 * - `bookmakerMap` → mapa `bookmaker_id -> BookmakerInfo`. Cada tab já carrega
 *                    o seu (com nome+parceiro+catalogo). Passe pronto.
 */
export function buildPernaEntries(
  pernaRow: any,
  bookmakerMap: Map<string, BookmakerInfo>
): SurebetPernaEntry[] {
  const raw = Array.isArray(pernaRow?.apostas_perna_entradas)
    ? pernaRow.apostas_perna_entradas
    : [];
  if (raw.length === 0) return [];

  // Ordenação estável: created_at asc → 1ª entrada salva é a "principal"
  const sorted = [...raw].sort((a: any, b: any) => {
    const ta = a?.created_at ? Date.parse(a.created_at) : 0;
    const tb = b?.created_at ? Date.parse(b.created_at) : 0;
    return ta - tb;
  });

  return sorted.map((e: any): SurebetPernaEntry => {
    const bkInfo = bookmakerMap.get(e.bookmaker_id);
    return {
      id: e.id,
      bookmaker_id: e.bookmaker_id,
      bookmaker_nome: buildBookmakerDisplayName(bkInfo),
      parceiro_nome: bkInfo?.parceiro_nome ?? null,
      instance_identifier: bkInfo?.instance_identifier ?? null,
      logo_url: bkInfo?.logo_url ?? null,
      moeda: e.moeda || "BRL",
      odd: Number(e.odd) || 0,
      stake: Number(e.stake) || 0,
      selecao_livre: e.selecao_livre ?? undefined,
      fonte_saldo: e.fonte_saldo ?? "REAL",
      resultado: e.resultado ?? null,
      lucro_prejuizo: e.lucro_prejuizo ?? null,
      stake_brl_referencia: e.stake_brl_referencia ?? null,
      lucro_prejuizo_brl_referencia: e.lucro_prejuizo_brl_referencia ?? null,
      cotacao_snapshot: e.cotacao_snapshot ?? null,
    };
  });
}

/**
 * Soma de stakes das entradas (na moeda original de cada entrada — para uso
 * apenas quando moeda única).
 */
export function sumEntriesStake(entries: SurebetPernaEntry[]): number {
  return entries.reduce((acc, e) => acc + (Number(e.stake) || 0), 0);
}

/**
 * Odd média ponderada pelas stakes (na moeda original). Quando entries[] tem
 * moedas mistas, prefira recalcular consolidando no consumidor.
 */
export function weightedAvgOdd(entries: SurebetPernaEntry[]): number {
  const totalStake = sumEntriesStake(entries);
  if (totalStake <= 0) return 0;
  const weighted = entries.reduce(
    (acc, e) => acc + (Number(e.odd) || 0) * (Number(e.stake) || 0),
    0
  );
  return weighted / totalStake;
}
