/**
 * MercadoResolver — fonte única de verdade para normalização de mercados.
 *
 * Suporta dois modelos de dados simultaneamente:
 *  - GERAÇÃO 1: campo único `mercado` (string livre, histórico).
 *  - GERAÇÃO 2: campos estruturados `tipo_mercado` + `sub_tipo_mercado`.
 *
 * Toda análise de mercado no Laboratório ValueBet (e futuros formulários
 * de entrada) deve usar `resolverMercado()` para obter um objeto normalizado
 * — nunca ler `mercado`, `tipo_mercado` ou `sub_tipo_mercado` diretamente.
 */

export type TipoMercadoKey = "handicap" | "resultado" | "total" | "outro";

export interface MercadoNormalizado {
  /** ex: "Handicap", "Total", "Resultado", "Outro" — sempre capitalizado. */
  tipo: string;
  /** ex: "Gols", "Escanteios", "1X2" — parte específica do sub-tipo. */
  sub_tipo: string;
  /** ex: "Handicap · Gols", "Total · Escanteios 1ºT" — label exibido em UI. */
  label_completo: string;
  /** 1 = histórico (inferido), 2 = novo modelo (exato). */
  geracao: 1 | 2;
  /** valor bruto preservado para auditoria/tooltip. */
  mercado_original: string;
  /** chave canônica do tipo, útil para filtros e agrupamento. */
  tipo_key: TipoMercadoKey;
}

/* ============================================================
 *  CONSTANTES — fonte única para Lab + formulários (Geração 2)
 * ========================================================== */

export const TIPOS_MERCADO: Array<{ key: TipoMercadoKey; label: string }> = [
  { key: "handicap", label: "Handicap" },
  { key: "resultado", label: "Resultado" },
  { key: "total", label: "Total" },
  { key: "outro", label: "Outro" },
];

export const SUB_TIPOS_POR_TIPO: Record<TipoMercadoKey, string[]> = {
  handicap: [
    "Handicap · Gols",
    "Handicap · Escanteios",
    "Handicap · Cartões",
    "Handicap · Gols 1ºT",
    "Handicap · Escanteios 1ºT",
  ],
  resultado: [
    "Resultado Final (1X2)",
    "Draw No Bet",
    "Double Chance",
    "Resultado 1º Tempo",
    "Resultado 2º Tempo",
    "Ambas Marcam (BTTS)",
    "Resultado Intervalo/Final",
  ],
  total: [
    "Total · Gols",
    "Total · Escanteios",
    "Total · Cartões",
    "Total · Gols 1ºT",
    "Total · Gols (Casa)",
    "Total · Gols (Fora)",
    "Total · Escanteios 1ºT",
    "Total · Cartões 1ºT",
    "Total · Chutes a Gol",
    "Total · Faltas",
  ],
  outro: [],
};

/* ============================================================
 *  RESOLVER
 * ========================================================== */

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function capitalizarTipo(key: string): { label: string; tipoKey: TipoMercadoKey } {
  const k = (key || "").toLowerCase() as TipoMercadoKey;
  if (k === "handicap") return { label: "Handicap", tipoKey: "handicap" };
  if (k === "resultado") return { label: "Resultado", tipoKey: "resultado" };
  if (k === "total") return { label: "Total", tipoKey: "total" };
  return { label: "Outro", tipoKey: "outro" };
}

function limpar(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * Mapa Geração 1: chave normalizada → (tipo, sub_tipo).
 * Aplicado após `normalize()` no valor bruto.
 */
function resolverGeracaoUm(mercadoRaw: string | null | undefined): MercadoNormalizado {
  const original = (mercadoRaw ?? "").toString();
  const cleaned = limpar(original);
  if (!cleaned) {
    return {
      tipo: "Outro",
      tipo_key: "outro",
      sub_tipo: "Geral",
      label_completo: "Outro · Geral",
      geracao: 1,
      mercado_original: original,
    };
  }

  const norm = normalize(cleaned);

  // HANDICAP
  if (
    norm === "HANDICAP" ||
    norm === "HANDICAP DE GOLS" ||
    norm === "HANDICAP ASIATICO" ||
    norm === "AH"
  ) {
    return mk("Handicap", "handicap", "Gols", "Handicap · Gols", original);
  }

  // TOTAL · GOLS
  if (
    norm === "TOTAL DE GOLS" ||
    norm === "TOTAL DE GOLOS" ||
    norm === "GOLS" ||
    norm === "GOLOS" ||
    norm === "OVER/UNDER" ||
    norm === "OVER UNDER" ||
    norm === "O/U"
  ) {
    return mk("Total", "total", "Gols", "Total · Gols", original);
  }

  // TOTAL · GOLS 1ºT
  if (norm === "RESULTADO DO 1 TEMPO" || norm === "RESULTADO 1 TEMPO") {
    return mk("Total", "total", "Gols 1ºT", "Total · Gols 1ºT", original);
  }

  // TOTAL · ESCANTEIOS
  if (
    norm === "ESCANTEIOS" ||
    norm === "TOTAL DE ESCANTEIOS" ||
    norm === "CANTOS" ||
    norm === "CORNERS"
  ) {
    return mk("Total", "total", "Escanteios", "Total · Escanteios", original);
  }

  // RESULTADO 1X2
  if (
    norm === "1X2" ||
    norm === "VENCEDOR" ||
    norm === "VENCEDOR DA PARTIDA" ||
    norm === "MONEYLINE" ||
    norm === "RESULTADO FINAL" ||
    norm === "RESULTADO"
  ) {
    return mk("Resultado", "resultado", "1X2", "Resultado Final (1X2)", original);
  }

  // DRAW NO BET
  if (norm === "DRAW NO BET" || norm === "DNB") {
    return mk("Resultado", "resultado", "Draw No Bet", "Draw No Bet", original);
  }

  // CARTÕES
  if (norm === "CARTOES" || norm === "TOTAL DE CARTOES") {
    return mk("Total", "total", "Cartões", "Total · Cartões", original);
  }

  // BTTS
  if (
    norm === "AMBAS MARCAM" ||
    norm === "BTTS" ||
    norm === "AMBAS EQUIPAS MARCAM" ||
    norm === "AMBAS AS EQUIPAS MARCAM"
  ) {
    return mk("Resultado", "resultado", "BTTS", "Ambas Marcam (BTTS)", original);
  }

  // DOUBLE CHANCE
  if (norm === "DUPLA HIPOTESE" || norm === "DOUBLE CHANCE" || norm === "DUPLA CHANCE") {
    return mk("Resultado", "resultado", "Double Chance", "Double Chance", original);
  }

  // Fallback: Outro · <original limpo>
  return {
    tipo: "Outro",
    tipo_key: "outro",
    sub_tipo: cleaned,
    label_completo: `Outro · ${cleaned}`,
    geracao: 1,
    mercado_original: original,
  };
}

function mk(
  tipo: string,
  tipo_key: TipoMercadoKey,
  sub_tipo: string,
  label_completo: string,
  original: string,
): MercadoNormalizado {
  return { tipo, tipo_key, sub_tipo, label_completo, geracao: 1, mercado_original: original };
}

/**
 * Extrai a parte "depois do ·" do label completo (ex: "Total · Escanteios 1ºT" → "Escanteios 1ºT").
 * Quando não há separador, devolve o próprio label.
 */
function extrairSubTipo(labelCompleto: string): string {
  const idx = labelCompleto.indexOf("·");
  if (idx === -1) return labelCompleto.trim();
  return labelCompleto.slice(idx + 1).trim();
}

/**
 * Entrada mínima de uma aposta para o resolver — todos os campos opcionais.
 */
export interface ApostaResolvableInput {
  mercado?: string | null;
  tipo_mercado?: string | null;
  sub_tipo_mercado?: string | null;
}

export function resolverMercado(aposta: ApostaResolvableInput): MercadoNormalizado {
  // GERAÇÃO 2: campos estruturados preenchidos
  if (aposta.tipo_mercado && aposta.sub_tipo_mercado) {
    const { label, tipoKey } = capitalizarTipo(aposta.tipo_mercado);
    return {
      tipo: label,
      tipo_key: tipoKey,
      sub_tipo: extrairSubTipo(aposta.sub_tipo_mercado),
      label_completo: aposta.sub_tipo_mercado,
      geracao: 2,
      mercado_original: aposta.sub_tipo_mercado,
    };
  }

  // GERAÇÃO 1: inferir a partir do campo `mercado` livre
  return resolverGeracaoUm(aposta.mercado);
}