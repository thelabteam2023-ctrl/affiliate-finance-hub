/**
 * Identidade canônica da relação parceiro ↔ casa dentro de um workspace.
 *
 * Regra: uma casa importada só é "a mesma" de uma casa existente no destino
 * quando coincidem catálogo (ou nome canônico), instância e moeda efetiva.
 * IDs de origem (`bookmakers.id`, `parceiro_id` de origem) NUNCA são usados.
 */

export const BOOKMAKER_CURRENCIES = [
  "BRL", "USD", "EUR", "GBP", "MYR", "MXN", "ARS", "COP", "CAD", "AUD",
  "JPY", "CLP", "PEN", "TRY", "INR", "USDT", "USDC", "BTC", "ETH",
] as const;

/** Fonte única da coerção de moeda usada tanto na chave quanto no INSERT. */
export function normalizeBookmakerCurrency(moeda: string | null | undefined): string {
  const value = (moeda ?? "").trim().toUpperCase();
  return (BOOKMAKER_CURRENCIES as readonly string[]).includes(value) ? value : "BRL";
}

/** Normalização textual: minúsculo, sem acento, sem espaço redundante. */
export function canonicalText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface BookmakerIdentityInput {
  /** ID do catálogo do workspace de DESTINO, quando resolvido. */
  catalogoId?: string | null;
  nome?: string | null;
  instanceIdentifier?: string | null;
  moeda?: string | null;
}

/**
 * Chave estável usada nas duas pontas (linhas do destino e casas do arquivo).
 * `NULL` e `""` em `instance_identifier` são tratados como a mesma instância.
 */
export function buildBookmakerIdentityKey({
  catalogoId,
  nome,
  instanceIdentifier,
  moeda,
}: BookmakerIdentityInput): string {
  const house = catalogoId ? `cat:${catalogoId}` : `nome:${canonicalText(nome)}`;
  return [house, canonicalText(instanceIdentifier), normalizeBookmakerCurrency(moeda)].join("|");
}
