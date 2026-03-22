import { supabase } from "@/integrations/supabase/client";

/** Breakdown de lucro por moeda original (dinâmico — suporta todas as moedas) */
type SaldoByMoeda = Record<string, number>;

interface LucroProjetoResumo {
  consolidado: number;
  porMoeda: SaldoByMoeda;
}

interface Params {
  projetoIds: string[];
  cotacaoUSD: number;
  /** Mapa de cotações adicionais (ex: { EUR: 6.2 }) para moedas além de USD/BRL.
   *  Cada valor representa quanto vale 1 unidade da moeda na moeda de consolidação. */
  cotacoes?: Record<string, number>;
  /** Moeda de consolidação do projeto (default: "BRL").
   *  Determina qual moeda é tratada como identidade na conversão. */
  moedaConsolidacao?: string;
  /** Filtro de data início (YYYY-MM-DD). Se omitido, sem limite inferior. */
  dataInicio?: string | null;
  /** Filtro de data fim (YYYY-MM-DD). Se omitido, sem limite superior. */
  dataFim?: string | null;
}

const isUsdLike = (moeda?: string | null) => {
  const m = (moeda || "BRL").toUpperCase();
  return m === "USD" || m === "USDT" || m === "USDC";
};

/** Moedas FIAT suportadas pelo sistema (inclui BRL para projetos com consolidação não-BRL) */
const ALL_FIAT_CURRENCIES = ["BRL", "EUR", "GBP", "MYR", "MXN", "ARS", "COP"] as const;

/**
 * Deriva um mapa de cotações para TODAS as moedas suportadas a partir de uma função de conversão.
 * Útil para callers que possuem uma convertFn mas precisam passar cotações ao KPI canônico.
 */
export function derivarCotacoesFromConvertFn(
  convertFn: (valor: number, moedaOrigem: string) => number
): Record<string, number> {
  const cotacoes: Record<string, number> = {};
  for (const moeda of ALL_FIAT_CURRENCIES) {
    const rate = convertFn(1, moeda);
    // Só incluir se a conversão retorna um valor diferente de 1 (identidade = sem conversão)
    if (Math.abs(rate - 1) > 0.001 && Math.abs(rate) > 0.001) {
      cotacoes[moeda] = rate;
    }
  }
  return cotacoes;
}

const createEmpty = (): LucroProjetoResumo => ({
  consolidado: 0,
  porMoeda: {},
});

/**
 * Serviço KPI-compatível para cálculo do Lucro Operacional de múltiplos projetos.
 * 
 * OPÇÃO B: Toda a agregação é feita server-side via RPC `get_projetos_lucro_operacional`.
 * O banco retorna totais por moeda por módulo por projeto.
 * O cliente apenas aplica as taxas de conversão e soma.
 * 
 * VANTAGENS:
 * - Zero limite de 1000 linhas (agregação feita em SQL)
 * - Uma única chamada RPC (antes eram ~15 queries REST)
 * - Escala para 1M+ registros sem impacto no cliente
 * 
 * MÓDULOS AGREGADOS NO BANCO:
 * - Apostas LIQUIDADAS (com suporte a multicurrency via pernas)
 * - Cashback manual
 * - Giros grátis confirmados
 * - Bônus ganhos (exceto FREEBET)
 * - Perdas operacionais confirmadas
 * - Conciliações de vínculo
 * - Ajustes de saldo (cash_ledger)
 * - Resultado cambial (cash_ledger)
 * - Eventos promocionais (cash_ledger)
 * - Perdas de cancelamento de bônus (cash_ledger)
 */
export async function fetchProjetosLucroOperacionalKpi({
  projetoIds,
  cotacaoUSD,
  cotacoes = {},
  moedaConsolidacao = "BRL",
  dataInicio,
  dataFim,
}: Params): Promise<Record<string, LucroProjetoResumo>> {
  if (projetoIds.length === 0) return {};

  const consolidUpper = moedaConsolidacao.toUpperCase();
  const consolidIsUsd = isUsdLike(consolidUpper);

  const convertToConsolidation = (valor: number, moedaOrigem: string) => {
    const m = (moedaOrigem || "BRL").toUpperCase();
    // Se a moeda de origem é a mesma da consolidação → identidade
    if (m === consolidUpper) return valor;
    // USD-like → aplicar cotação USD (mas só se consolidação NÃO é USD)
    if (isUsdLike(m)) {
      if (consolidIsUsd) return valor; // USD→USD = identidade
      return valor * cotacaoUSD;
    }
    if (cotacoes[m] != null) return valor * cotacoes[m];
    return valor;
  };

  // Chamada única ao banco — toda agregação feita server-side
  const { data: rpcResult, error } = await supabase
    .rpc('get_projetos_lucro_operacional', {
      p_projeto_ids: projetoIds,
      p_data_inicio: dataInicio || null,
      p_data_fim: dataFim || null,
    });

  if (error) {
    console.error('[fetchProjetosLucroOperacionalKpi] RPC error:', error);
    throw error;
  }

  const rawData = (rpcResult || {}) as Record<string, Record<string, Record<string, number>>>;
  const result: Record<string, LucroProjetoResumo> = {};

  // Módulos cujo valor já tem sinal correto (adicionar ao lucro)
  const ADD_MODULES = [
    'apostas', 'cashback', 'giros', 'bonus', 'conciliacoes',
    'ajustes_saldo', 'resultado_cambial', 'promocionais',
  ];

  // Módulos cujo valor é absoluto (subtrair do lucro)
  const SUB_MODULES = ['perdas', 'perdas_cancelamento'];

  for (const projetoId of projetoIds) {
    const projData = rawData[projetoId];
    if (!projData) {
      result[projetoId] = createEmpty();
      continue;
    }

    let consolidado = 0;
    const porMoeda: SaldoByMoeda = {};

    // Processar módulos aditivos
    for (const mod of ADD_MODULES) {
      const modData = projData[mod] || {};
      for (const [moeda, valor] of Object.entries(modData)) {
        const v = Number(valor);
        if (Math.abs(v) < 0.001) continue;
        porMoeda[moeda] = (porMoeda[moeda] || 0) + v;
        consolidado += convertToConsolidation(v, moeda);
      }
    }

    // Processar módulos subtrativos (valores absolutos no banco)
    for (const mod of SUB_MODULES) {
      const modData = projData[mod] || {};
      for (const [moeda, valor] of Object.entries(modData)) {
        const v = Number(valor);
        if (Math.abs(v) < 0.001) continue;
        porMoeda[moeda] = (porMoeda[moeda] || 0) - v;
        consolidado -= convertToConsolidation(v, moeda);
      }
    }

    result[projetoId] = { consolidado, porMoeda };
  }

  return result;
}
