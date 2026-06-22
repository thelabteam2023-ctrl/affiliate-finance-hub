/**
 * Formata as linhas relacionais de `apostas_perna_entradas` (embed) para o shape
 * `SurebetPernaEntry` consumido pelo SurebetCard.
 *
 * Usado pelos fetchers (ProjetoSurebetTab, ProjetoApostasTab,
 * ProjetoDuploGreenTab, BonusApostasTab) para popular `perna.entries` no
 * modelo 1:N — onde uma perna lógica (`apostas_pernas`) pode ter N entradas
 * em casas diferentes (`apostas_perna_entradas`).
 */

import type { SurebetPernaEntry } from "@/components/projeto-detalhe/SurebetCard";

interface RawEntradaRow {
  id?: string;
  bookmaker_id?: string | null;
  stake?: number | null;
  odd?: number | null;
  moeda?: string | null;
  fonte_saldo?: string | null;
  resultado?: string | null;
  lucro_prejuizo?: number | null;
  stake_brl_referencia?: number | null;
  lucro_prejuizo_brl_referencia?: number | null;
  cotacao_snapshot?: number | null;
  selecao_livre?: string | null;
  bookmakers?: {
    nome?: string;
    instance_identifier?: string | null;
    parceiro?: { nome?: string } | null;
    bookmakers_catalogo?: { logo_url?: string | null } | null;
  } | null;
}

function formatNome(
  bookmaker?: RawEntradaRow["bookmakers"],
  fallback?: string,
): string {
  const nome = bookmaker?.nome || fallback || "—";
  const inst = bookmaker?.instance_identifier;
  const parc = bookmaker?.parceiro?.nome;
  const base = inst ? `${nome} (${inst})` : nome;
  return parc ? `${base} - ${parc}` : base;
}

export function formatPernaEntradas(
  entradas: RawEntradaRow[] | null | undefined,
  fallbackBookmakerNome?: string,
): SurebetPernaEntry[] {
  if (!Array.isArray(entradas) || entradas.length === 0) return [];
  return entradas.map((e) => ({
    id: e.id,
    bookmaker_id: e.bookmaker_id || "",
    bookmaker_nome: formatNome(e.bookmakers, fallbackBookmakerNome),
    parceiro_nome: e.bookmakers?.parceiro?.nome ?? null,
    instance_identifier: e.bookmakers?.instance_identifier ?? null,
    logo_url: e.bookmakers?.bookmakers_catalogo?.logo_url ?? null,
    moeda: e.moeda || "BRL",
    odd: Number(e.odd) || 0,
    stake: Number(e.stake) || 0,
    selecao_livre: e.selecao_livre || undefined,
    fonte_saldo: e.fonte_saldo || undefined,
    resultado: e.resultado ?? null,
    lucro_prejuizo: e.lucro_prejuizo ?? null,
    stake_brl_referencia: e.stake_brl_referencia ?? null,
    lucro_prejuizo_brl_referencia: e.lucro_prejuizo_brl_referencia ?? null,
    cotacao_snapshot: e.cotacao_snapshot ?? null,
  }));
}