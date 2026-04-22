/**
 * Helpers para filtrar apostas considerando multi-entry (sub_entries) e pernas.
 *
 * BUG FIX: O filtro de Casas/Parceiros considerava apenas `bookmaker_id` da
 * aposta principal, ignorando entradas adicionais na mesma seleção (ex: aposta
 * simples PUMAS x JUAREZ com 2 entradas no Novibet) ou pernas de múltiplas/surebets.
 *
 * Estas funções coletam TODOS os bookmaker_ids envolvidos na aposta:
 *   - bookmaker_id principal da aposta
 *   - bookmaker_id de cada item em `_sub_entries` (multi-entry simples)
 *   - bookmaker_id de cada item em `pernas` (múltiplas/surebets)
 */

interface ApostaWithEntries {
  bookmaker_id?: string | null;
  _sub_entries?: Array<{ bookmaker_id?: string | null }> | null;
  pernas?: Array<{ bookmaker_id?: string | null }> | null;
}

/**
 * Retorna o conjunto de todos os bookmaker_ids envolvidos numa aposta,
 * incluindo a casa principal, sub-entries e pernas.
 */
export function collectApostaBookmakerIds(a: ApostaWithEntries): Set<string> {
  const ids = new Set<string>();
  if (a.bookmaker_id) ids.add(a.bookmaker_id);
  if (Array.isArray(a._sub_entries)) {
    for (const e of a._sub_entries) {
      if (e?.bookmaker_id) ids.add(e.bookmaker_id);
    }
  }
  if (Array.isArray(a.pernas)) {
    for (const p of a.pernas) {
      if (p?.bookmaker_id) ids.add(p.bookmaker_id);
    }
  }
  return ids;
}

/**
 * Verifica se a aposta envolve algum dos bookmakerIds filtrados (em qualquer perna).
 */
export function apostaMatchesBookmakerFilter(
  a: ApostaWithEntries,
  bookmakerIds: string[]
): boolean {
  if (bookmakerIds.length === 0) return true;
  const allIds = collectApostaBookmakerIds(a);
  if (allIds.size === 0) return false;
  return bookmakerIds.some(id => allIds.has(id));
}

/**
 * Verifica se a aposta envolve algum dos parceiroIds filtrados,
 * resolvendo via mapa bookmakerId -> parceiroId.
 */
export function apostaMatchesParceiroFilter(
  a: ApostaWithEntries,
  parceiroIds: string[],
  bookmakers: Array<{ id: string; parceiro_id?: string | null }>
): boolean {
  if (parceiroIds.length === 0) return true;
  const allBookmakerIds = collectApostaBookmakerIds(a);
  if (allBookmakerIds.size === 0) return false;
  for (const bkId of allBookmakerIds) {
    const bk = bookmakers.find(b => b.id === bkId);
    if (bk?.parceiro_id && parceiroIds.includes(bk.parceiro_id)) return true;
  }
  return false;
}