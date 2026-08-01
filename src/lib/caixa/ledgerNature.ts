/**
 * Classificação de NATUREZA das movimentações do Caixa Operacional.
 *
 * Camada 100% de apresentação: não altera eventos, saldos ou RPCs.
 * Serve para segregar os indicadores do Histórico por natureza financeira
 * (Aporte vs Quitação, Depósito vs Saque, Pagamento vs Despesa, etc.).
 *
 * REGRA CRÍTICA: Aporte e Quitação compartilham o mesmo `tipo_transacao`
 * (`APORTE_FINANCEIRO`). A distinção é feita pela DIREÇÃO:
 *   - destino INVESTIDOR            → QUITACAO (saída)
 *   - destino CAIXA_OPERACIONAL     → APORTE  (entrada)
 */

export type MovementGroup =
  | "APORTE"
  | "QUITACAO"
  | "DEPOSITO"
  | "SAQUE"
  | "TRANSFERENCIA"
  | "PAGAMENTO"
  | "DESPESA"
  | "AJUSTE"
  | "PERDA"
  | "OUTROS";

export type MovementDirection = "ENTRADA" | "SAIDA" | "NEUTRO";

export interface MovementNature {
  grupo: MovementGroup;
  direcao: MovementDirection;
}

export const MOVEMENT_GROUP_META: Record<
  MovementGroup,
  { label: string; plural: string; direcaoPadrao: MovementDirection; order: number }
> = {
  APORTE:        { label: "Aporte",        plural: "Aportes",        direcaoPadrao: "ENTRADA", order: 1 },
  QUITACAO:      { label: "Quitação",      plural: "Quitações",      direcaoPadrao: "SAIDA",   order: 2 },
  SAQUE:         { label: "Saque",         plural: "Saques",         direcaoPadrao: "ENTRADA", order: 3 },
  DEPOSITO:      { label: "Depósito",      plural: "Depósitos",      direcaoPadrao: "SAIDA",   order: 4 },
  PAGAMENTO:     { label: "Pagamento",     plural: "Pagamentos",     direcaoPadrao: "SAIDA",   order: 5 },
  DESPESA:       { label: "Despesa",       plural: "Despesas",       direcaoPadrao: "SAIDA",   order: 6 },
  PERDA:         { label: "Perda",         plural: "Perdas",         direcaoPadrao: "SAIDA",   order: 7 },
  AJUSTE:        { label: "Ajuste",        plural: "Ajustes",        direcaoPadrao: "NEUTRO",  order: 8 },
  TRANSFERENCIA: { label: "Transferência", plural: "Transferências", direcaoPadrao: "NEUTRO",  order: 9 },
  OUTROS:        { label: "Outro",         plural: "Outros",         direcaoPadrao: "NEUTRO",  order: 10 },
};

const PAGAMENTO_TYPES = new Set([
  "PAGTO_PARCEIRO",
  "PAGTO_FORNECEDOR",
  "PAGTO_OPERADOR",
  "ALOCACAO_FORNECEDOR",
  "COMISSAO_INDICADOR",
  "BONUS_INDICADOR",
  "BONIFICACAO_ESTRATEGICA",
]);

const DESPESA_TYPES = new Set(["DESPESA_ADMINISTRATIVA", "RENOVACAO_PARCERIA"]);

const AJUSTE_TYPES = new Set([
  "AJUSTE_MANUAL",
  "AJUSTE_SALDO",
  "AJUSTE_RECONCILIACAO",
  "CONCILIACAO",
]);

const NEUTRO_TYPES = new Set(["TRANSFERENCIA", "SWAP_IN", "SWAP_OUT", "CONVERSAO"]);

const upper = (v: unknown) => String(v ?? "").toUpperCase();

export function classifyMovementNature(t: any): MovementNature {
  const tipo = upper(t?.tipo_transacao);
  const origem = upper(t?.origem_tipo);
  const destino = upper(t?.destino_tipo);

  // 1) Aporte × Quitação — mesmo tipo, direções opostas
  if (tipo === "APORTE_FINANCEIRO" || tipo === "APORTE" || tipo === "APORTE_DIRETO" || tipo === "LIQUIDACAO") {
    const ehQuitacao = tipo === "LIQUIDACAO" || destino === "INVESTIDOR";
    if (ehQuitacao) return { grupo: "QUITACAO", direcao: "SAIDA" };
    return { grupo: "APORTE", direcao: "ENTRADA" };
  }

  // 2) Giro operacional com as casas
  if (tipo === "DEPOSITO") return { grupo: "DEPOSITO", direcao: "SAIDA" };
  if (tipo === "SAQUE") return { grupo: "SAQUE", direcao: "ENTRADA" };

  // 3) Movimentos internos — não compõem o fluxo líquido
  if (NEUTRO_TYPES.has(tipo)) return { grupo: "TRANSFERENCIA", direcao: "NEUTRO" };

  // 4) Custos
  if (PAGAMENTO_TYPES.has(tipo)) return { grupo: "PAGAMENTO", direcao: "SAIDA" };
  if (DESPESA_TYPES.has(tipo)) return { grupo: "DESPESA", direcao: "SAIDA" };

  // 5) Perdas patrimoniais
  if (tipo === "PERDA_OPERACIONAL" || tipo === "PERDA_ATIVO" || tipo === "SCAN") {
    return { grupo: "PERDA", direcao: "SAIDA" };
  }

  // 6) Ajustes e resultado cambial (cambial NÃO entra no lucro operacional)
  if (tipo === "GANHO_CAMBIAL") return { grupo: "AJUSTE", direcao: "ENTRADA" };
  if (tipo === "PERDA_CAMBIAL") return { grupo: "AJUSTE", direcao: "SAIDA" };
  if (tipo === "ESTORNO_COMISSAO_INDICADOR") return { grupo: "AJUSTE", direcao: "ENTRADA" };
  if (AJUSTE_TYPES.has(tipo)) {
    // Ajuste pode ir nos dois sentidos: usa o sinal do valor quando disponível
    const valor = Number(t?.valor ?? 0);
    if (valor < 0) return { grupo: "AJUSTE", direcao: "SAIDA" };
    if (destino === "CAIXA_OPERACIONAL") return { grupo: "AJUSTE", direcao: "ENTRADA" };
    if (origem === "CAIXA_OPERACIONAL") return { grupo: "AJUSTE", direcao: "SAIDA" };
    return { grupo: "AJUSTE", direcao: "NEUTRO" };
  }

  return { grupo: "OUTROS", direcao: "NEUTRO" };
}