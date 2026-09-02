/**
 * Estado do vínculo casa↔parceiro na portabilidade.
 *
 * Fonte da verdade: `public.bookmakers.status` (CHECK bookmakers_status_check)
 * e `public.bookmakers.estado_conta` (CHECK bookmakers_estado_conta_check).
 * Nenhuma estrutura nova é criada — apenas transportamos os valores existentes.
 */

/** Valores aceitos pelo CHECK de `status` (normalizados em minúsculas). */
export const BOOKMAKER_STATUS_VALUES = [
  "ativo",
  "limitada",
  "encerrada",
  "bloqueada",
  "em_uso",
  "aguardando_saque",
] as const;

/** Valores aceitos pelo CHECK de `estado_conta`. */
export const BOOKMAKER_ESTADO_CONTA_VALUES = [
  "ativo",
  "limitada",
  "encerrada",
  "parceiro_inativo",
] as const;

export type BookmakerStatus = (typeof BOOKMAKER_STATUS_VALUES)[number];
export type BookmakerEstadoConta = (typeof BOOKMAKER_ESTADO_CONTA_VALUES)[number];

/**
 * Estados puramente cadastrais/operacionais do vínculo — transportáveis.
 * `em_uso` e `aguardando_saque` são estados TRANSITÓRIOS ligados a operação e
 * saldo do workspace de ORIGEM (casa em uso numa operação / saque pendente).
 * Como a casa importada nasce com saldo zero e sem projeto, esses estados não
 * têm significado no destino e são rebaixados para o estado base equivalente.
 */
const TRANSIENT_TO_BASE: Record<string, BookmakerStatus> = {
  em_uso: "ativo",
  aguardando_saque: "ativo",
};

export const BOOKMAKER_STATUS_LABELS: Record<string, string> = {
  ativo: "Ativa",
  limitada: "Limitada",
  encerrada: "Encerrada",
  bloqueada: "Bloqueada",
  em_uso: "Em uso",
  aguardando_saque: "Aguardando saque",
  parceiro_inativo: "Parceiro inativo",
};

export function labelBookmakerStatus(status: string | null | undefined): string {
  const key = (status ?? "ativo").toLowerCase();
  return BOOKMAKER_STATUS_LABELS[key] ?? key;
}

/** Normaliza o valor lido do banco para exportação (minúsculo e válido). */
export function normalizeExportedStatus(raw: string | null | undefined): BookmakerStatus {
  const key = (raw ?? "").trim().toLowerCase();
  return (BOOKMAKER_STATUS_VALUES as readonly string[]).includes(key)
    ? (key as BookmakerStatus)
    : "ativo";
}

export function normalizeExportedEstadoConta(
  raw: string | null | undefined,
): BookmakerEstadoConta | null {
  const key = (raw ?? "").trim().toLowerCase();
  return (BOOKMAKER_ESTADO_CONTA_VALUES as readonly string[]).includes(key)
    ? (key as BookmakerEstadoConta)
    : null;
}

export interface ResolvedImportState {
  status: BookmakerStatus;
  estado_conta: BookmakerEstadoConta;
  /** Estado original quando houve rebaixamento de estado transitório. */
  downgradedFrom?: string;
}

/**
 * Resolve o estado a aplicar na casa importada.
 * Arquivos antigos (sem `status`) continuam entrando como "ativo".
 */
export function resolveImportState(
  status: string | null | undefined,
  estadoConta?: string | null,
): ResolvedImportState {
  const normalized = normalizeExportedStatus(status);
  const downgraded = TRANSIENT_TO_BASE[normalized];
  const finalStatus = downgraded ?? normalized;

  const explicitEstado = normalizeExportedEstadoConta(estadoConta);
  const derivedEstado: BookmakerEstadoConta = (
    BOOKMAKER_ESTADO_CONTA_VALUES as readonly string[]
  ).includes(finalStatus)
    ? (finalStatus as BookmakerEstadoConta)
    : "ativo";

  return {
    status: finalStatus,
    estado_conta: explicitEstado ?? derivedEstado,
    downgradedFrom: downgraded ? normalized : undefined,
  };
}
