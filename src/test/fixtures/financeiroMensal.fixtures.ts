import type { FinanceiroData } from "@/hooks/useFinanceiroData";

/**
 * Factory de FinanceiroData vazio. Cada teste anexa apenas o que precisa.
 * Todos os arrays opcionais ficam vazios — zero acoplamento com schema real.
 */
export function makeEmptyFinData(): FinanceiroData {
  return {
    caixaFiat: [],
    caixaCrypto: [],
    bookmakersSaldos: [],
    walletsDetalhadas: [],
    contasParceiros: [],
    despesas: [],
    custos: [],
    cashLedger: [],
    despesasAdmin: [],
    despesasAdminPendentes: [],
    pagamentosOperador: [],
    pagamentosOperadorPendentes: [],
    bookmakers: [],
    parceiros: [],
    investidores: [],
    apostasHistorico: [],
    projetos: [],
    projetoInvestidores: [],
    participacaoCiclos: [],
    participacoesPagas: [],
  } as unknown as FinanceiroData;
}

/** Linha mock de cash_ledger (status CONFIRMADO por padrão). */
export function makeLedger(partial: Partial<Record<string, any>>): any {
  return {
    id: crypto.randomUUID(),
    status: "CONFIRMADO",
    moeda: "BRL",
    projeto_id_snapshot: "p1",
    data_transacao: "2026-04-15",
    ...partial,
  };
}

/** Resultado canônico de 1 projeto. */
export function makeCanonico(lucroRealizadoBRL: number) {
  return {
    consolidado: 0,
    porMoeda: {},
    moedaConsolidacao: "BRL",
    lucroRealizado: lucroRealizadoBRL,
    lucroRealizadoBRL,
  };
}