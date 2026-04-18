/**
 * SERVIÇO CANÔNICO de Lucro Operacional para múltiplos projetos.
 *
 * REFERÊNCIA ABSOLUTA: usa a MESMA engine de cálculo do KPI "Lucro" da Visão Geral
 * (`calcularLucroCanonicoFromRpc` em `useKpiBreakdowns.ts`), garantindo paridade
 * absoluta entre o card do projeto (kanban) e a tela de detalhe (Visão Geral).
 *
 * Para cada projeto:
 * 1) Busca a configuração (moeda_consolidacao + cotações de trabalho por moeda)
 * 2) Busca os dados brutos via RPC `get_projeto_dashboard_data`
 * 3) Constrói as funções de conversão (Trabalho + Oficial) com a MESMA semântica
 *    de `useProjetoCurrency`
 * 4) Aplica a engine canônica `calcularLucroCanonicoFromRpc`
 *
 * O resultado é o mesmo número exibido no badge "Lucro" da Visão Geral.
 */

import { supabase } from "@/integrations/supabase/client";
import { calcularLucroCanonicoFromRpc } from "@/hooks/useKpiBreakdowns";
import type { ProjetoDashboardRawData } from "@/hooks/useProjetoDashboardData";

export interface LucroCanonicoResultado {
  /** Lucro consolidado na MOEDA do projeto (ex: BRL para projeto BRL, USD para projeto USD) */
  consolidado: number;
  /** Lucro por moeda de origem (não consolidado) */
  porMoeda: Record<string, number>;
  /** Moeda em que `consolidado` está expresso */
  moedaConsolidacao: string;
  /**
   * Lucro Realizado (Fluxo Líquido Ajustado) na MOEDA do projeto.
   * Fórmula canônica: (Saques + Saques Virtuais) - (Depósitos + Depósitos Virtuais).
   * Usa o MESMO converter Oficial (FastForex) do FinancialMetricsCard para garantir paridade.
   */
  lucroRealizado: number;
}

interface FetchProjetosLucroCanonicoParams {
  projetoIds: string[];
  /** Cotações OFICIAIS (FastForex/PTAX) — usadas como fallback quando o projeto não tem cotação de trabalho para a moeda */
  cotacoesOficiais: {
    USD: number;
    EUR: number;
    GBP: number;
    MYR: number;
    MXN: number;
    ARS: number;
    COP: number;
  };
}

interface ProjetoCurrencyConfig {
  id: string;
  moeda_consolidacao: string;
  cotacao_trabalho: number | null;
  cotacao_trabalho_eur: number | null;
  cotacao_trabalho_gbp: number | null;
  cotacao_trabalho_myr: number | null;
  cotacao_trabalho_mxn: number | null;
  cotacao_trabalho_ars: number | null;
  cotacao_trabalho_cop: number | null;
}

type Rates = { USD: number; EUR: number; GBP: number; MYR: number; MXN: number; ARS: number; COP: number };

/**
 * Implementação funcional EQUIVALENTE a `_convert` em `useProjetoCurrency`.
 * Mantém a MESMA lógica de cross-rate (via USD pivot) para garantir paridade.
 */
function buildConverter(moedaConsolidacao: string, rates: Rates) {
  return (valor: number, moedaOrigem: string): number => {
    if (!valor || isNaN(valor)) return 0;
    const moeda = (moedaOrigem || "BRL").toUpperCase();
    const dest = (moedaConsolidacao || "BRL").toUpperCase();

    if (moeda === dest) return valor;

    const cotacaoUsd = rates.USD;
    if (!cotacaoUsd || cotacaoUsd <= 0) return valor;

    // BRL <-> USD
    if (moeda === "BRL" && dest === "USD") return valor / cotacaoUsd;
    if (moeda === "USD" && dest === "BRL") return valor * cotacaoUsd;

    // Demais moedas FIAT — cotação fornecida em BRL/X
    const fiatRate: Record<string, number | undefined> = {
      EUR: rates.EUR,
      GBP: rates.GBP,
      MYR: rates.MYR,
      MXN: rates.MXN,
      ARS: rates.ARS,
      COP: rates.COP,
    };

    if (moeda in fiatRate) {
      const r = fiatRate[moeda];
      if (!r || r <= 0) return valor;
      if (dest === "BRL") return valor * r;
      // X -> USD via BRL pivot
      return valor * (r / cotacaoUsd);
    }

    // Cripto stablecoins/tokens — paridade com USD
    if (["USDT", "USDC", "BTC", "ETH", "BNB", "TRX", "SOL", "MATIC", "ADA"].includes(moeda)) {
      if (dest === "USD") return valor;
      return valor * cotacaoUsd;
    }

    return valor;
  };
}

/**
 * Busca as configs de moeda dos projetos
 */
async function fetchProjetoConfigs(projetoIds: string[]): Promise<Map<string, ProjetoCurrencyConfig>> {
  const { data, error } = await supabase
    .from("projetos")
    .select(
      "id, moeda_consolidacao, cotacao_trabalho, cotacao_trabalho_eur, cotacao_trabalho_gbp, cotacao_trabalho_myr, cotacao_trabalho_mxn, cotacao_trabalho_ars, cotacao_trabalho_cop"
    )
    .in("id", projetoIds);

  if (error) throw error;

  const map = new Map<string, ProjetoCurrencyConfig>();
  (data || []).forEach((row: any) => {
    map.set(row.id, {
      id: row.id,
      moeda_consolidacao: row.moeda_consolidacao || "BRL",
      cotacao_trabalho: row.cotacao_trabalho,
      cotacao_trabalho_eur: row.cotacao_trabalho_eur,
      cotacao_trabalho_gbp: row.cotacao_trabalho_gbp,
      cotacao_trabalho_myr: row.cotacao_trabalho_myr,
      cotacao_trabalho_mxn: row.cotacao_trabalho_mxn,
      cotacao_trabalho_ars: row.cotacao_trabalho_ars,
      cotacao_trabalho_cop: row.cotacao_trabalho_cop,
    });
  });
  return map;
}

/**
 * Busca os dados brutos do dashboard de um projeto via RPC
 */
async function fetchDashboardData(projetoId: string): Promise<ProjetoDashboardRawData | null> {
  const { data, error } = await supabase.rpc("get_projeto_dashboard_data", { p_projeto_id: projetoId });
  if (error) {
    console.error(`[fetchProjetosLucroCanonico] erro no projeto ${projetoId}:`, error);
    return null;
  }
  const raw = data as any;
  if (!raw) return null;

  return {
    moeda_consolidacao: raw.moeda_consolidacao || "BRL",
    cotacao_trabalho: raw.cotacao_trabalho,
    fonte_cotacao: raw.fonte_cotacao,
    apostas: raw.apostas || [],
    apostas_pernas: raw.apostas_pernas || [],
    giros_gratis: raw.giros_gratis || [],
    cashback: raw.cashback || [],
    perdas: raw.perdas || [],
    ocorrencias_perdas: raw.ocorrencias_perdas || [],
    conciliacoes: raw.conciliacoes || [],
    bonus: raw.bonus || [],
    bookmakers: raw.bookmakers || [],
    depositos: raw.depositos || [],
    saques: raw.saques || [],
    ledger_extras: raw.ledger_extras || [],
    ajustes_pos_limitacao: raw.ajustes_pos_limitacao || [],
  };
}

/**
 * FONTE ÚNICA DA VERDADE para o "Lucro Operacional" exibido no card de cada projeto.
 *
 * Retorna um mapa { projetoId → resultado } onde o `consolidado` está NA MOEDA
 * DO PROJETO (não em BRL forçado), exatamente como aparece no KPI da Visão Geral.
 */
export async function fetchProjetosLucroCanonico({
  projetoIds,
  cotacoesOficiais,
}: FetchProjetosLucroCanonicoParams): Promise<Record<string, LucroCanonicoResultado>> {
  if (projetoIds.length === 0) return {};

  // 1) Configs em paralelo com dashboards
  const configs = await fetchProjetoConfigs(projetoIds);

  // 2) Dashboard de cada projeto em paralelo
  const dashboards = await Promise.all(
    projetoIds.map(async (id) => ({ id, raw: await fetchDashboardData(id) }))
  );

  const result: Record<string, LucroCanonicoResultado> = {};

  for (const { id, raw } of dashboards) {
    const cfg = configs.get(id);
    if (!raw || !cfg) {
      result[id] = { consolidado: 0, porMoeda: {}, moedaConsolidacao: cfg?.moeda_consolidacao || "BRL", lucroRealizado: 0 };
      continue;
    }

    // Cotações de TRABALHO do projeto (com fallback para Oficiais) — mesma regra do useProjetoCurrency
    const workRates: Rates = {
      USD: cfg.cotacao_trabalho || cotacoesOficiais.USD,
      EUR: cfg.cotacao_trabalho_eur || cotacoesOficiais.EUR,
      GBP: cfg.cotacao_trabalho_gbp || cotacoesOficiais.GBP,
      MYR: cfg.cotacao_trabalho_myr || cotacoesOficiais.MYR,
      MXN: cfg.cotacao_trabalho_mxn || cotacoesOficiais.MXN,
      ARS: cfg.cotacao_trabalho_ars || cotacoesOficiais.ARS,
      COP: cfg.cotacao_trabalho_cop || cotacoesOficiais.COP,
    };

    const moedaConsolidacao = cfg.moeda_consolidacao;
    const convertTrabalho = buildConverter(moedaConsolidacao, workRates);
    const convertOficial = buildConverter(moedaConsolidacao, cotacoesOficiais);

    // Aplica a MESMA engine canônica usada pela Visão Geral
    const { consolidado, porMoeda } = calcularLucroCanonicoFromRpc(
      raw,
      convertTrabalho,
      moedaConsolidacao,
      convertOficial
    );

    result[id] = { consolidado, porMoeda, moedaConsolidacao, lucroRealizado: 0, _convertOficial: convertOficial } as any;
  }

  // === LUCRO REALIZADO (Fluxo Líquido Ajustado) ===
  // Lê DIRETO do cash_ledger com EXATAMENTE os mesmos filtros do FinancialMetricsCard
  // (status=CONFIRMADO, projeto_id_snapshot, tipo_transacao IN [...]) para garantir
  // paridade absoluta com o card "Fluxo Líquido Ajustado" da aba Financeiro.
  const [depositosRes, saquesRes] = await Promise.all([
    supabase
      .from("cash_ledger")
      .select("valor, moeda, projeto_id_snapshot")
      .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL"])
      .eq("status", "CONFIRMADO")
      .in("projeto_id_snapshot", projetoIds)
      .limit(50000),
    supabase
      .from("cash_ledger")
      .select("valor, valor_confirmado, moeda, projeto_id_snapshot")
      .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
      .eq("status", "CONFIRMADO")
      .in("projeto_id_snapshot", projetoIds)
      .limit(50000),
  ]);

  const depositosByProjeto: Record<string, { valor: number; moeda: string }[]> = {};
  (depositosRes.data || []).forEach((d: any) => {
    const pid = d.projeto_id_snapshot;
    if (!pid) return;
    (depositosByProjeto[pid] ||= []).push({ valor: Number(d.valor) || 0, moeda: (d.moeda || "BRL").toUpperCase() });
  });

  const saquesByProjeto: Record<string, { valor: number; moeda: string }[]> = {};
  (saquesRes.data || []).forEach((s: any) => {
    const pid = s.projeto_id_snapshot;
    if (!pid) return;
    const v = Number(s.valor_confirmado ?? s.valor) || 0;
    (saquesByProjeto[pid] ||= []).push({ valor: v, moeda: (s.moeda || "BRL").toUpperCase() });
  });

  // Aplica convertOficial do projeto e calcula Fluxo Líquido Ajustado
  for (const projetoId of projetoIds) {
    const r = result[projetoId] as any;
    if (!r || !r._convertOficial) continue;
    const convertOficial = r._convertOficial as (v: number, m: string) => number;
    const totalSaques = (saquesByProjeto[projetoId] || []).reduce(
      (acc, s) => acc + convertOficial(s.valor, s.moeda),
      0
    );
    const totalDepositos = (depositosByProjeto[projetoId] || []).reduce(
      (acc, d) => acc + convertOficial(d.valor, d.moeda),
      0
    );
    r.lucroRealizado = totalSaques - totalDepositos;
    delete r._convertOficial;
  }

  return result;
}
