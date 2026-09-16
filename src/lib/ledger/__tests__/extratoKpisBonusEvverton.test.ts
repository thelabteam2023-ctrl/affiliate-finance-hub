import { describe, it, expect } from "vitest";
import { resolveValorConsolidado } from "../resolveValorConsolidado";

/**
 * Reconstrução número a número do projeto BONUS EVVERTON.
 *
 * Objetivo: provar que os KPIs do Extrato (Depósitos, Saques, "Lucro se sacar tudo")
 * só fecham com o Lucro Realizado quando o valor já em moeda de consolidação NÃO
 * passa por BRL → USD → BRL. A distorção antiga era exatamente R$ 2,45.
 */

const TRABALHO = 5.1537; // Cotação de Trabalho do projeto
const SNAP_RATE = 5.16270; // cotação congelada nos registros em BRL

const convert = (valor: number, moeda: string) =>
  moeda.toUpperCase() === "BRL" ? valor : valor * TRABALHO;

interface Row {
  valor: number;
  moeda: string;
  snapshotUsd: number | null;
}

// Lançamentos reais (confirmados, sem reversão). Baseline virtual USD 5 é excluído.
const depositos: Row[] = [
  { valor: 2500, moeda: "BRL", snapshotUsd: 2500 / SNAP_RATE },
  { valor: 2500, moeda: "BRL", snapshotUsd: 2500 / SNAP_RATE },
  { valor: 1000, moeda: "USD", snapshotUsd: 1000 },
];
const saques: Row[] = [
  { valor: 2490, moeda: "BRL", snapshotUsd: 2490 / SNAP_RATE },
  { valor: 1102, moeda: "BRL", snapshotUsd: 1102 / SNAP_RATE },
  { valor: 1341.25, moeda: "USD", snapshotUsd: 1341.25 },
];
const saldoCasas = 0; // 1XBET, 7GAMES e BETRISE zeradas

const somaCanonica = (rows: Row[]) =>
  rows.reduce(
    (acc, r) =>
      acc +
      resolveValorConsolidado({
        valor: r.valor,
        moeda: r.moeda,
        snapshotUsd: r.snapshotUsd,
        moedaConsolidacao: "BRL",
        convertToConsolidation: convert,
      }),
    0
  );

// Regra ANTIGA do Extrato: snapshot USD sempre tinha prioridade, inclusive para BRL.
const somaComDuplaConversao = (rows: Row[]) =>
  rows.reduce((acc, r) => {
    const snap = r.snapshotUsd ?? 0;
    return acc + (snap > 0 ? convert(snap, "USD") : convert(r.valor, r.moeda));
  }, 0);

describe("KPIs do Extrato — BONUS EVVERTON", () => {
  it("Depósitos e Saques usam valor nativo em BRL", () => {
    expect(somaCanonica(depositos)).toBeCloseTo(10153.7, 2);
    expect(somaCanonica(saques)).toBeCloseTo(10504.4, 2);
  });

  it("Lucro Realizado = saques − depósitos = R$ 350,70", () => {
    expect(somaCanonica(saques) - somaCanonica(depositos)).toBeCloseTo(350.7, 2);
  });

  it('"Lucro se sacar tudo" coincide quando as casas estão zeradas', () => {
    const sacarTudo = somaCanonica(saques) + saldoCasas - somaCanonica(depositos);
    expect(sacarTudo).toBeCloseTo(350.7, 2);
  });

  it('"Lucro se sacar tudo" soma o saldo que ainda está nas casas', () => {
    const saldoUsdEmCasa = 100; // US$ 100 parados
    const sacarTudo =
      somaCanonica(saques) + convert(saldoUsdEmCasa, "USD") - somaCanonica(depositos);
    expect(sacarTudo).toBeCloseTo(350.7 + 100 * TRABALHO, 2);
  });

  it("a regra antiga produzia exatamente os R$ 2,45 de distorção", () => {
    const antigo = somaComDuplaConversao(saques) - somaComDuplaConversao(depositos);
    expect(somaComDuplaConversao(depositos)).toBeCloseTo(10144.98, 2);
    expect(somaComDuplaConversao(saques)).toBeCloseTo(10498.14, 2);
    expect(antigo).toBeCloseTo(353.15, 1);
    expect(antigo - 350.7).toBeCloseTo(2.45, 1);
  });

  it("projeto consolidado em USD não converte valores em dólar", () => {
    const resolverUsd = (r: Row) =>
      resolveValorConsolidado({
        valor: r.valor,
        moeda: r.moeda,
        snapshotUsd: r.snapshotUsd,
        moedaConsolidacao: "USD",
        convertToConsolidation: (v, m) => (m.toUpperCase() === "USD" ? v : v / TRABALHO),
      });
    expect(resolverUsd({ valor: 1341.25, moeda: "USD", snapshotUsd: 1341.25 })).toBe(1341.25);
    expect(resolverUsd({ valor: 500, moeda: "USDT", snapshotUsd: 500 })).toBeCloseTo(500, 6);
  });

  it("saque parcial mantém a proporção do fluxo", () => {
    const parcial = somaCanonica([{ valor: 500, moeda: "USD", snapshotUsd: 500 }]);
    expect(parcial).toBeCloseTo(500 * TRABALHO, 2);
  });
});
