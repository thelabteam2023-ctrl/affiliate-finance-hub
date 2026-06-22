/**
 * Mapeia o `esporte` em PT-BR (como salvo em apostas_unificada) para a chave
 * `sport` usada no cache de logos (`team_logos`/`league_logos`).
 * Usado para alimentar o fallback `useLogoFallback` a partir de uma aposta.
 */
const MAP: Record<string, string> = {
  "futebol": "soccer",
  "basquete": "basketball",
  "tenis": "tennis",
  "tênis": "tennis",
  "baseball": "baseball",
  "hockey": "icehockey",
  "handebol": "handball",
  "futebol americano": "americanfootball",
  "vôlei": "volleyball",
  "volei": "volleyball",
  "mma/ufc": "mma",
  "boxe": "boxing",
  "rugby": "rugby",
};

export function esporteToSportKey(esporte: string | null | undefined): string | null {
  if (!esporte) return null;
  const k = esporte.trim().toLowerCase();
  return MAP[k] ?? k;
}