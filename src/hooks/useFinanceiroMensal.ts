import { useMemo } from "react";
import { format, startOfMonth, subMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLocalDate } from "@/lib/dateUtils";
import type { FinanceiroData } from "@/hooks/useFinanceiroData";

export interface MesFinanceiro {
  mesKey: string;           // "2025-03"
  mesLabel: string;         // "Mar/25"
  mesNomeLongo: string;     // "Março/2025"
  cac: number;
  comissoes: number;
  bonus: number;
  infra: number;
  rh: number;
  operadores: number;
  custoTotal: number;
  fluxoLiquido: number;     // Saques - Depósitos (cash_ledger, BRL)
  lucroOperacional: number; // apostas (lucro_prejuizo)
  resultadoLiquido: number; // fluxoLiquido - custoTotal
  margemOperacional: number | null;
}

interface Params {
  finData: FinanceiroData;
  meses: number; // janela em meses (ex: 12)
  convertToBRL?: (valor: number, moeda: string) => number;
}

const toKey = (raw?: string | null) => {
  if (!raw) return null;
  try {
    const d = parseLocalDate(raw);
    return format(d, "yyyy-MM");
  } catch {
    return null;
  }
};

const empty = (): Omit<MesFinanceiro, "mesKey" | "mesLabel" | "mesNomeLongo"> => ({
  cac: 0, comissoes: 0, bonus: 0, infra: 0, rh: 0, operadores: 0, custoTotal: 0,
  fluxoLiquido: 0, lucroOperacional: 0, resultadoLiquido: 0, margemOperacional: null,
});

export function useFinanceiroMensal({ finData, meses, convertToBRL }: Params) {
  return useMemo<MesFinanceiro[]>(() => {
    const conv = convertToBRL || ((v: number) => v);
    // Build window of N months ending current month
    const now = startOfMonth(new Date());
    const windowKeys: string[] = [];
    for (let i = meses - 1; i >= 0; i--) {
      const d = subMonths(now, i);
      windowKeys.push(format(d, "yyyy-MM"));
    }
    const map: Record<string, ReturnType<typeof empty>> = {};
    windowKeys.forEach(k => { map[k] = empty(); });

    const bump = (k: string | null, fn: (m: ReturnType<typeof empty>) => void) => {
      if (!k || !(k in map)) return;
      fn(map[k]);
    };

    // despesas (movimentacoes_indicacao) — CAC + Comissões + Bônus
    (finData.despesas || []).forEach((d: any) => {
      const k = toKey(d.data_movimentacao);
      const v = Number(d.valor) || 0;
      if (d.tipo === "PAGTO_PARCEIRO" || d.tipo === "PAGTO_FORNECEDOR") bump(k, m => { m.cac += v; });
      else if (d.tipo === "COMISSAO_INDICADOR") bump(k, m => { m.comissoes += v; });
      else if (d.tipo === "BONUS_INDICADOR") bump(k, m => { m.bonus += v; });
    });

    // despesas administrativas — infra (≠ RH) e RH (= RH)
    (finData.despesasAdmin || []).forEach((d: any) => {
      const k = toKey(d.data_despesa);
      const v = Number(d.valor) || 0;
      if (d.grupo === "RECURSOS_HUMANOS") bump(k, m => { m.rh += v; });
      else bump(k, m => { m.infra += v; });
    });

    // pagamentos operadores
    (finData.pagamentosOperador || []).forEach((p: any) => {
      const k = toKey(p.data_pagamento);
      const v = Number(p.valor) || 0;
      bump(k, m => { m.operadores += v; });
    });

    // cash_ledger — Fluxo Líquido (Saques − Depósitos), consolidado em BRL
    (finData.cashLedger || []).forEach((l: any) => {
      const k = toKey(l.data_transacao);
      const valorBRL = conv(Number(l.valor) || 0, (l.moeda || "BRL").toUpperCase());
      if (l.tipo_transacao === "SAQUE") bump(k, m => { m.fluxoLiquido += valorBRL; });
      else if (l.tipo_transacao === "DEPOSITO") bump(k, m => { m.fluxoLiquido -= valorBRL; });
    });

    // apostas — Lucro Operacional teórico
    (finData.apostasHistorico || []).forEach((a: any) => {
      const k = toKey(a.data_aposta);
      const v = Number(a.lucro_prejuizo) || 0;
      bump(k, m => { m.lucroOperacional += v; });
    });

    // Operadores final = pagamentos + RH (paridade com useFinanceiroCalculations)
    return windowKeys.map(k => {
      const m = map[k];
      const operadoresTotal = m.operadores + m.rh;
      const custoTotal = m.cac + m.comissoes + m.bonus + m.infra + operadoresTotal;
      const resultado = m.fluxoLiquido - custoTotal;
      const base = m.fluxoLiquido + custoTotal;
      const margem = base > 0 ? (resultado / base) * 100 : null;
      const date = parseISO(`${k}-01`);
      return {
        mesKey: k,
        mesLabel: format(date, "MMM/yy", { locale: ptBR }).replace(".", ""),
        mesNomeLongo: format(date, "MMMM/yyyy", { locale: ptBR }),
        cac: m.cac,
        comissoes: m.comissoes,
        bonus: m.bonus,
        infra: m.infra,
        rh: m.rh,
        operadores: operadoresTotal,
        custoTotal,
        fluxoLiquido: m.fluxoLiquido,
        lucroOperacional: m.lucroOperacional,
        resultadoLiquido: resultado,
        margemOperacional: margem,
      };
    });
  }, [finData, meses, convertToBRL]);
}