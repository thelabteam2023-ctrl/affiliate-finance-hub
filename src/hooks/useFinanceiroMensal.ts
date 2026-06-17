import { useMemo } from "react";
import { format, startOfMonth, subMonths, parseISO, addMonths } from "date-fns";
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
  isBaseline: boolean;      // mês anterior ao 1º real, zerado, apenas referência visual
}

interface Params {
  finData: FinanceiroData;
  meses: number; // janela em meses (ex: 12)
  convertToBRL?: (valor: number, moeda: string) => number;
  incluirBaseline?: boolean; // default: true — prepende 1 mês zerado antes do 1º real
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

const empty = () => ({
  cac: 0, comissoes: 0, bonus: 0, infra: 0, rh: 0, operadores: 0, custoTotal: 0,
  fluxoLiquido: 0, lucroOperacional: 0, resultadoLiquido: 0, margemOperacional: null as number | null,
});

export function useFinanceiroMensal({ finData, meses, convertToBRL, incluirBaseline = true }: Params) {
  return useMemo<MesFinanceiro[]>(() => {
    const conv = convertToBRL || ((v: number) => v);
    // Build window: from max(primeiroMesReal, hoje-(N-1)) → hoje
    const now = startOfMonth(new Date());
    const nowKey = format(now, "yyyy-MM");
    const limiteMinKey = format(subMonths(now, meses - 1), "yyyy-MM");

    // Descobre o primeiro mês com QUALQUER registro nas 5 fontes
    let primeiroMesReal: string | null = null;
    const considerar = (raw?: string | null) => {
      const k = toKey(raw);
      if (!k) return;
      if (k > nowKey) return; // ignora datas futuras
      if (!primeiroMesReal || k < primeiroMesReal) primeiroMesReal = k;
    };
    (finData.despesas || []).forEach((d: any) => {
      const tipo = d.tipo;
      if (tipo === "PAGTO_PARCEIRO" || tipo === "PAGTO_FORNECEDOR" ||
          tipo === "COMISSAO_INDICADOR" || tipo === "BONUS_INDICADOR") {
        considerar(d.data_movimentacao);
      }
    });
    (finData.despesasAdmin || []).forEach((d: any) => considerar(d.data_despesa));
    (finData.pagamentosOperador || []).forEach((p: any) => considerar(p.data_pagamento));
    (finData.cashLedger || []).forEach((l: any) => {
      const tt = l.tipo_transacao;
      const isSaque = tt === "SAQUE" || tt === "SAQUE_VIRTUAL";
      const isDepositoReal = tt === "DEPOSITO";
      const isDepositoVirtualMigracao = tt === "DEPOSITO_VIRTUAL" && l.origem_tipo === "MIGRACAO";
      if ((isSaque || isDepositoReal || isDepositoVirtualMigracao) && l.projeto_id_snapshot) {
        considerar(l.data_transacao);
      }
    });
    (finData.apostasHistorico || []).forEach((a: any) => considerar(a.data_aposta));

    const inicioKey = primeiroMesReal && primeiroMesReal > limiteMinKey ? primeiroMesReal : limiteMinKey;

    // Gera todos os meses entre inicioKey..nowKey
    const windowKeys: string[] = [];
    let cursor = parseISO(`${inicioKey}-01`);
    const end = parseISO(`${nowKey}-01`);
    while (cursor <= end) {
      windowKeys.push(format(cursor, "yyyy-MM"));
      cursor = addMonths(cursor, 1);
    }

    // Baseline opcional: 1 mês anterior ao inicioKey, zerado
    let baselineKey: string | null = null;
    if (incluirBaseline && windowKeys.length > 0) {
      const prev = subMonths(parseISO(`${windowKeys[0]}-01`), 1);
      baselineKey = format(prev, "yyyy-MM");
      windowKeys.unshift(baselineKey);
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
    // Alinhado ao padrão Lucro Real (memória `lucro-real-payment-standard`):
    //   (SAQUE + SAQUE_VIRTUAL) − (DEPOSITO + DEPOSITO_VIRTUAL[MIGRACAO])
    //   status=CONFIRMADO (já garantido pelo loader) e apenas linhas com projeto_id_snapshot.
    (finData.cashLedger || []).forEach((l: any) => {
      const tt = l.tipo_transacao;
      // Só contabiliza linhas vinculadas a projetos do workspace (paridade com KPI).
      if (!l.projeto_id_snapshot) return;
      const k = toKey(l.data_transacao);
      const moeda = (l.moeda || "BRL").toUpperCase();
      if (tt === "SAQUE" || tt === "SAQUE_VIRTUAL") {
        const raw = Number(l.valor_confirmado ?? l.valor) || 0;
        const valorBRL = conv(raw, moeda);
        bump(k, m => { m.fluxoLiquido += valorBRL; });
      } else if (tt === "DEPOSITO" || (tt === "DEPOSITO_VIRTUAL" && l.origem_tipo === "MIGRACAO")) {
        const valorBRL = conv(Number(l.valor) || 0, moeda);
        bump(k, m => { m.fluxoLiquido -= valorBRL; });
      }
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
        isBaseline: baselineKey !== null && k === baselineKey,
      };
    });
  }, [finData, meses, convertToBRL, incluirBaseline]);
}