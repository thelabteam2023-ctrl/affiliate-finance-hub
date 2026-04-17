/**
 * Helper centralizado para conversão de valores entre moedas
 * usando a hierarquia de cotação determinística do sistema.
 *
 * HIERARQUIA (do mais determinístico para o menos):
 *   1º  cotacao_snapshot da perna  → congelado no momento do registro (ZERO drift)
 *   2º  Cotação de Trabalho do projeto → estável durante o ciclo
 *   3º  PTAX/Binance live → fallback final (apenas se nada acima existir)
 *
 * Esta função é a fonte da verdade para conversões em componentes analíticos
 * que iteram pernas (ex: Casas Mais Utilizadas, Distribuição por Esporte).
 */

export interface PernaConversionInput {
  /** Valor original na moeda da perna */
  valor: number;
  /** Moeda da perna (BRL, USD, EUR, etc) */
  moedaOrigem: string;
  /** Snapshot de cotação congelado no momento do registro da perna */
  cotacaoSnapshot?: number | null;
  /** stake_brl_referencia da perna (já convertido para BRL no registro) */
  stakeBrlReferencia?: number | null;
}

export interface ConversionContext {
  /** Moeda de consolidação do projeto (BRL ou USD) */
  moedaConsolidacao: string;
  /**
   * Função fallback do hook useProjetoCurrency.convertToConsolidation.
   * Será usada quando o snapshot não estiver disponível.
   */
  convertToConsolidationFallback: (valor: number, moedaOrigem: string) => number;
}

/**
 * Converte um valor de perna para a moeda de consolidação respeitando
 * a hierarquia snapshot → trabalho → live.
 */
export function convertPernaToConsolidacao(
  input: PernaConversionInput,
  ctx: ConversionContext,
): number {
  const { valor, moedaOrigem, cotacaoSnapshot, stakeBrlReferencia } = input;
  const { moedaConsolidacao, convertToConsolidationFallback } = ctx;

  if (!valor || isNaN(valor)) return 0;

  // Mesma moeda: sem conversão
  if (moedaOrigem === moedaConsolidacao) return valor;

  // Atalho: se consolidação é BRL e a perna tem stake_brl_referencia gravado,
  // usar diretamente (também é um snapshot determinístico, mas só p/ stake).
  // OBS: Este atalho é específico para STAKE — para LUCRO, use o snapshot via cotação.
  // Aqui mantemos como fallback opcional (chamador escolhe quando passar).
  if (
    moedaConsolidacao === "BRL" &&
    typeof stakeBrlReferencia === "number" &&
    stakeBrlReferencia > 0 &&
    valor === undefined
  ) {
    // intencionalmente ignorado — chamador deve passar o valor já se quiser
    // este path é só documentacional
  }

  // 1º: snapshot da perna (determinístico)
  if (cotacaoSnapshot && cotacaoSnapshot > 0) {
    // Snapshot é cotação USD→BRL gravada na perna.
    // BRL → USD
    if (moedaOrigem === "BRL" && moedaConsolidacao === "USD") {
      return valor / cotacaoSnapshot;
    }
    // USD (e stablecoins USD) → BRL
    if (
      ["USD", "USDT", "USDC"].includes(moedaOrigem) &&
      moedaConsolidacao === "BRL"
    ) {
      return valor * cotacaoSnapshot;
    }
    // Para outras moedas (EUR, GBP, etc), o snapshot da perna é apenas USD↔BRL.
    // Cai para fallback (que usa Cotação de Trabalho da moeda específica).
  }

  // 2º + 3º: delegar para o hook (Trabalho > Live)
  return convertToConsolidationFallback(valor, moedaOrigem);
}
