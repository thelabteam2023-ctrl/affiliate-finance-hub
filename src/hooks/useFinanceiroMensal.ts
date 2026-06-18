import { useMemo } from "react";
import { format, startOfMonth, subMonths, parseISO, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLocalDate } from "@/lib/dateUtils";
import type { FinanceiroData } from "@/hooks/useFinanceiroData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchProjetosLucroCanonico } from "@/services/fetchProjetosLucroCanonico";

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
  participacoes: number;    // distribuição paga a investidores (participacao_ciclos)
  isBaseline: boolean;      // mês anterior ao 1º real, zerado, apenas referência visual
}

interface Params {
  finData: FinanceiroData;
  meses: number; // janela em meses (ex: 12)
  convertToBRL?: (valor: number, moeda: string) => number;
  incluirBaseline?: boolean; // default: true — prepende 1 mês zerado antes do 1º real
  /**
   * Cotações OFICIAIS (FastForex/PTAX) usadas para alinhar o Fluxo Líquido mensal
   * à MESMA engine canônica do dashboard (`fetchProjetosLucroCanonico`).
   * Quando ausente, o hook faz fallback à leitura cru de `cash_ledger`
   * (modo legado, mantido só por compatibilidade).
   */
  cotacoesOficiais?: {
    USD: number;
    EUR?: number;
    GBP?: number;
    MYR?: number;
    MXN?: number;
    ARS?: number;
    COP?: number;
  };
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
  participacoes: 0,
});

export function useFinanceiroMensal({ finData, meses, convertToBRL, incluirBaseline = true, cotacoesOficiais }: Params) {
  // === FLUXO LÍQUIDO CANÔNICO (paridade total com a Visão Financeira) ===
  // Quando `cotacoesOficiais` é fornecido, calcula o Fluxo Líquido de CADA MÊS
  // chamando `fetchProjetosLucroCanonico` (mesma engine de `useWorkspaceLucroRealizado`).
  // Isso garante: ciclo de projeto, baseline neutralizado, anti-double-count de
  // DEPOSITO_VIRTUAL MIGRACAO, e cotações OFICIAIS — exatamente como o KPI do dashboard.
  const fluxoCanonicoQuery = useQuery({
    queryKey: [
      "financeiro-mensal-fluxo-canonico",
      meses,
      incluirBaseline,
      cotacoesOficiais?.USD,
      cotacoesOficiais?.EUR,
      cotacoesOficiais?.GBP,
      cotacoesOficiais?.MYR,
      cotacoesOficiais?.MXN,
      cotacoesOficiais?.ARS,
      cotacoesOficiais?.COP,
    ],
    enabled: !!cotacoesOficiais && (cotacoesOficiais.USD || 0) > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const now = startOfMonth(new Date());
      const nowKey = format(now, "yyyy-MM");
      const inicioJanela = subMonths(now, meses - 1);
      const startKey = incluirBaseline
        ? format(subMonths(inicioJanela, 1), "yyyy-MM")
        : format(inicioJanela, "yyyy-MM");

      // Enumera meses
      const monthKeys: string[] = [];
      let cursor = parseISO(`${startKey}-01`);
      const end = parseISO(`${nowKey}-01`);
      while (cursor <= end) {
        monthKeys.push(format(cursor, "yyyy-MM"));
        cursor = addMonths(cursor, 1);
      }

      // Projetos do workspace
      const { data: projs, error: pErr } = await supabase.from("projetos").select("id");
      if (pErr) throw pErr;
      const ids = (projs || []).map((p: any) => p.id);
      if (ids.length === 0) {
        return Object.fromEntries(monthKeys.map(k => [k, 0]));
      }

      const cot = {
        USD: cotacoesOficiais!.USD,
        EUR: cotacoesOficiais!.EUR || 0,
        GBP: cotacoesOficiais!.GBP || 0,
        MYR: cotacoesOficiais!.MYR || 0,
        MXN: cotacoesOficiais!.MXN || 0,
        ARS: cotacoesOficiais!.ARS || 0,
        COP: cotacoesOficiais!.COP || 0,
      };

      // Busca cada mês em paralelo
      const entries = await Promise.all(
        monthKeys.map(async (mk) => {
          const base = parseISO(`${mk}-01`);
          const ini = format(startOfMonth(base), "yyyy-MM-dd");
          // último dia do mês: primeiro dia do próximo mês - 1
          const fimDate = addMonths(startOfMonth(base), 1);
          fimDate.setDate(fimDate.getDate() - 1);
          const fim = format(fimDate, "yyyy-MM-dd");
          try {
            const res = await fetchProjetosLucroCanonico({
              projetoIds: ids,
              cotacoesOficiais: cot,
              dataInicio: ini,
              dataFim: fim,
            });
            const total = Object.values(res).reduce(
              (acc, r) => acc + (Number(r.lucroRealizadoBRL) || 0),
              0
            );
            return [mk, total] as const;
          } catch (e) {
            console.error("[useFinanceiroMensal] mes", mk, e);
            return [mk, 0] as const;
          }
        })
      );
      return Object.fromEntries(entries);
    },
  });

  const fluxoCanonicoByMes = fluxoCanonicoQuery.data;

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
    (finData.participacoesPagas || []).forEach((p: any) => considerar(p.data_pagamento));

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

    // participações pagas (distribuição a investidores) — assumido em BRL
    (finData.participacoesPagas || []).forEach((p: any) => {
      const k = toKey(p.data_pagamento);
      const v = Number(p.valor_participacao) || 0;
      bump(k, m => { m.participacoes += v; });
    });

    // FLUXO LÍQUIDO — FALLBACK LEGADO (somente quando cotacoesOficiais não vier).
    // Quando o caller passa `cotacoesOficiais`, o Fluxo é injetado adiante a partir
    // de `fluxoCanonicoByMes` (engine canônica = paridade com o dashboard).
    const usarFallbackCru = !cotacoesOficiais;
    if (usarFallbackCru) (finData.cashLedger || []).forEach((l: any) => {
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
      const custoTotal = m.cac + m.comissoes + m.bonus + m.infra + operadoresTotal + m.participacoes;
      // Fluxo canônico tem prioridade absoluta (paridade com Visão Financeira).
      const fluxoLiquido = fluxoCanonicoByMes && k in fluxoCanonicoByMes
        ? fluxoCanonicoByMes[k]
        : m.fluxoLiquido;
      const resultado = fluxoLiquido - custoTotal;
      const base = fluxoLiquido + custoTotal;
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
        fluxoLiquido,
        lucroOperacional: m.lucroOperacional,
        resultadoLiquido: resultado,
        margemOperacional: margem,
        participacoes: m.participacoes,
        isBaseline: baselineKey !== null && k === baselineKey,
      };
    });
  }, [finData, meses, convertToBRL, incluirBaseline, cotacoesOficiais, fluxoCanonicoByMes]);
}