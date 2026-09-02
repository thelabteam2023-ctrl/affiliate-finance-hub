/**
 * Filtro canônico da listagem de parceiros.
 *
 * REGRA FUNCIONAL: apenas `parceiros.status` determina se o parceiro aparece em
 * "Em andamento" (ativo). O status da parceria/contrato NÃO influencia este filtro.
 *
 * A comparação é normalizada (trim + minúsculas) para que variações de gravação
 * ("Inativo", " ativo ") nunca façam um parceiro inativo escapar do filtro.
 */

export type ParceiroStatusFilter = "ativo" | "inativo" | "todos" | string;

export interface FiltravelParceiro {
  nome: string;
  cpf?: string | null;
  status?: string | null;
}

export function normalizeParceiroStatus(status?: string | null): string {
  return (status ?? "").trim().toLowerCase();
}

export function matchesParceiroStatus(
  parceiro: FiltravelParceiro,
  statusFilter: ParceiroStatusFilter,
): boolean {
  const filter = normalizeParceiroStatus(statusFilter);
  if (filter === "todos" || filter === "") return true;
  return normalizeParceiroStatus(parceiro.status) === filter;
}

export function matchesParceiroSearch(parceiro: FiltravelParceiro, searchTerm: string): boolean {
  const term = (searchTerm ?? "").trim().toLowerCase();
  if (!term) return true;
  const nome = (parceiro.nome ?? "").toLowerCase();
  const cpf = parceiro.cpf ?? "";
  return nome.includes(term) || cpf.includes(term);
}

export function filterParceiros<T extends FiltravelParceiro>(
  parceiros: T[],
  searchTerm: string,
  statusFilter: ParceiroStatusFilter,
): T[] {
  return parceiros.filter(
    (p) => matchesParceiroSearch(p, searchTerm) && matchesParceiroStatus(p, statusFilter),
  );
}
