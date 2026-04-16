/**
 * SERVIÇO CANÔNICO DE EXTRAS DO PROJETO
 * 
 * FONTE ÚNICA DE VERDADE para todos os eventos que contribuem ao lucro operacional
 * ALÉM das apostas liquidadas (que são computadas diretamente via apostas_unificada).
 * 
 * Este serviço é consumido por:
 * - ProjetoDashboardTab (gráfico de Evolução do Lucro + calendário)
 * - useKpiBreakdowns (KPI cards de Lucro/Prejuízo)
 * - Qualquer novo componente que precise calcular lucro operacional
 * 
 * FÓRMULA CANÔNICA:
 * ─────────────────────────────────────────────────────────
 * LUCRO_OPERACIONAL = 
 *   Σ apostas_liquidadas (P&L consolidado)
 *   + Σ cashback
 *   + Σ giros_gratis (valor_retorno)
 *   + Σ bônus_creditados (exceto FREEBET — lucro SNR já no P&L)
 *   + Σ eventos_promocionais (freebet_convertida, credito_promocional, giro_gratis_ganho)
 *   - Σ perdas_cancelamento_bonus
 *   + Σ ajustes_saldo
 *   + Σ resultado_cambial (ganho - perda)
 *   + Σ conciliações
 *   - Σ perdas_operacionais (projeto_perdas confirmadas)
 * ─────────────────────────────────────────────────────────
 * 
 * REGRA CRÍTICA: FREEBET
 * Bônus do tipo FREEBET são EXCLUÍDOS porque o lucro da aposta SNR
 * (Stake Not Returned) já está contabilizado no P&L da aposta.
 * Incluir o bonus_amount geraria dupla contagem.
 * 
 * REGRA CRÍTICA: MOEDA
 * Os valores são retornados na moeda ORIGINAL, exceto bônus com snapshot
 * congelado, que retornam já na moeda de consolidação do projeto.
 * A conversão adicional continua sendo responsabilidade do consumidor.
 */

import { supabase } from '@/integrations/supabase/client';
import { extractCivilDateKey } from '@/utils/dateUtils';

// =====================================================
// TIPOS
// =====================================================

export type ExtraTipo = 
  | 'cashback'
  | 'giro_gratis'
  | 'bonus'
  | 'freebet'
  | 'promocional'
  | 'ajuste_saldo'
  | 'resultado_cambial'
  | 'conciliacao'
  | 'perda_operacional';

export interface ProjetoExtraEntry {
  /** Data civil (YYYY-MM-DD) do evento */
  data: string;
  /** Valor na moeda original (positivo = receita, negativo = custo) */
  valor: number;
  /** Moeda original do valor */
  moeda: string;
  /** Tipo/módulo canônico do evento */
  tipo: ExtraTipo;
}

// Mapeamento de ExtraTipo → label para exibição
export const EXTRA_TIPO_LABELS: Record<ExtraTipo, string> = {
  cashback: 'Cashback',
  giro_gratis: 'Giros Grátis',
  bonus: 'Bônus Ganhos',
  freebet: 'Freebet Convertida',
  promocional: 'Promocional',
  ajuste_saldo: 'Ajuste de Saldo',
  resultado_cambial: 'Resultado Cambial',
  conciliacao: 'Conciliação',
  perda_operacional: 'Perdas Operacionais',
};

// =====================================================
// SERVIÇO PRINCIPAL
// =====================================================

/**
 * Busca TODOS os extras de lucro de um projeto.
 * Retorna lista de entradas com data, valor, moeda e tipo.
 * 
 * NÃO aplica filtro de período — o consumidor é responsável por isso.
 * NÃO aplica conversão de moeda — valores são na moeda original.
 */
export async function fetchProjetoExtras(projetoId: string): Promise<ProjetoExtraEntry[]> {
  const extras: ProjetoExtraEntry[] = [];

  // Buscar metadados do projeto necessários para extras/snapshots
  const [{ data: projectBookmakers }, { data: projeto }] = await Promise.all([
    supabase
      .from('bookmakers')
      .select('id, moeda')
      .eq('projeto_id', projetoId),
    supabase
      .from('projetos')
      .select('moeda_consolidacao')
      .eq('id', projetoId)
      .maybeSingle(),
  ]);

  const projectBookmakerIds = new Set(projectBookmakers?.map(b => b.id) || []);
  const projectBookmakerMoeda = new Map((projectBookmakers || []).map(b => [b.id, b.moeda || 'BRL']));
  const moedaConsolidacaoProjeto = projeto?.moeda_consolidacao || 'BRL';

  // Executar todas as queries em paralelo
  const [
    cashbackResult,
    girosGratisResult,
    bonusCreditadosResult,
    eventosPromResult,
    perdasCancelResult,
    ajustesSaldoResult,
    resultadosCambiaisResult,
    conciliacoesResult,
    perdasOperResult,
  ] = await Promise.all([
    fetchCashback(projetoId),
    fetchGirosGratis(projetoId),
    fetchBonusCreditados(projetoId, projectBookmakerMoeda, moedaConsolidacaoProjeto),
    fetchEventosPromocionais(projectBookmakerIds),
    fetchPerdasCancelamentoBonuses(projectBookmakerIds),
    fetchAjustesSaldo(projetoId),
    fetchResultadosCambiais(projetoId),
    fetchConciliacoes(projetoId, projectBookmakerMoeda),
    fetchPerdasOperacionais(projetoId),
  ]);

  extras.push(
    ...cashbackResult,
    ...girosGratisResult,
    ...bonusCreditadosResult,
    ...eventosPromResult,
    ...perdasCancelResult,
    ...ajustesSaldoResult,
    ...resultadosCambiaisResult,
    ...conciliacoesResult,
    ...perdasOperResult,
  );

  return extras;
}

// =====================================================
// FUNÇÕES DE FETCH INDIVIDUAIS
// =====================================================

async function fetchCashback(projetoId: string): Promise<ProjetoExtraEntry[]> {
  const { data } = await supabase
    .from('cashback_manual')
    .select('data_credito, valor, moeda_operacao')
    .eq('projeto_id', projetoId);

  return (data || [])
    .filter(cb => cb.valor && cb.valor > 0 && cb.data_credito)
    .map(cb => ({
      data: extractCivilDateKey(cb.data_credito),
      valor: cb.valor,
      moeda: cb.moeda_operacao || 'BRL',
      tipo: 'cashback' as ExtraTipo,
    }));
}

async function fetchGirosGratis(projetoId: string): Promise<ProjetoExtraEntry[]> {
  const { data: girosGratis } = await supabase
    .from('giros_gratis' as any)
    .select('data_registro, valor_retorno, bookmaker_id')
    .eq('projeto_id', projetoId)
    .eq('status', 'confirmado')
    .not('valor_retorno', 'is', null);

  const giros = (girosGratis || []) as any[];
  
  // Resolver moedas dos bookmakers
  const bookmakerIds = [...new Set(giros.map(g => g.bookmaker_id).filter(Boolean))];
  let bookmakerMoedaMap: Record<string, string> = {};
  if (bookmakerIds.length > 0) {
    const { data: bms } = await supabase
      .from('bookmakers')
      .select('id, moeda')
      .in('id', bookmakerIds);
    bms?.forEach(bm => { bookmakerMoedaMap[bm.id] = bm.moeda; });
  }

  return giros
    .filter(gg => gg.valor_retorno > 0 && gg.data_registro)
    .map(gg => ({
      data: extractCivilDateKey(gg.data_registro),
      valor: gg.valor_retorno,
      moeda: bookmakerMoedaMap[gg.bookmaker_id] || 'BRL',
      tipo: 'giro_gratis' as ExtraTipo,
    }));
}

/**
 * Bônus creditados — EXCLUI FREEBET (lucro SNR já contabilizado no P&L)
 */
async function fetchBonusCreditados(
  projetoId: string,
  projectBookmakerMoeda: Map<string, string>,
  moedaConsolidacaoProjeto: string,
): Promise<ProjetoExtraEntry[]> {
  const { data } = await supabase
    .from('project_bookmaker_link_bonuses')
    .select('credited_at, bonus_amount, currency, tipo_bonus, bookmaker_id, valor_consolidado_snapshot')
    .eq('project_id', projetoId)
    .in('status', ['credited', 'finalized'])
    .not('credited_at', 'is', null);

  return (data || [])
    .filter(b => {
      // REGRA CANÔNICA: FREEBET excluído — lucro SNR já no P&L da aposta
      if (b.tipo_bonus === 'FREEBET') return false;
      return Number(b.bonus_amount || 0) > 0;
    })
    .map(b => {
      const hasSnapshot = Number(b.valor_consolidado_snapshot || 0) > 0;

      return {
        data: extractCivilDateKey(b.credited_at!),
        valor: hasSnapshot ? Number(b.valor_consolidado_snapshot || 0) : Number(b.bonus_amount || 0),
        moeda: hasSnapshot
          ? moedaConsolidacaoProjeto
          : (b.currency || projectBookmakerMoeda.get(b.bookmaker_id) || 'BRL'),
        tipo: 'bonus' as ExtraTipo,
      };
    });
}

async function fetchEventosPromocionais(
  projectBookmakerIds: Set<string>
): Promise<ProjetoExtraEntry[]> {
  if (projectBookmakerIds.size === 0) return [];

  const { data: eventos } = await supabase
    .from('cash_ledger')
    .select('data_transacao, valor, tipo_transacao, destino_bookmaker_id, moeda')
    .eq('status', 'CONFIRMADO')
    .in('tipo_transacao', ['FREEBET_CONVERTIDA', 'CREDITO_PROMOCIONAL', 'GIRO_GRATIS_GANHO']);

  return (eventos || [])
    .filter(ev => ev.destino_bookmaker_id && projectBookmakerIds.has(ev.destino_bookmaker_id) && (ev.valor || 0) > 0)
    .map(ev => {
      let tipo: ExtraTipo = 'promocional';
      if (ev.tipo_transacao === 'FREEBET_CONVERTIDA') tipo = 'freebet';
      else if (ev.tipo_transacao === 'GIRO_GRATIS_GANHO') tipo = 'giro_gratis';
      return {
        data: extractCivilDateKey(ev.data_transacao),
        valor: ev.valor!,
        moeda: ev.moeda || 'BRL',
        tipo,
      };
    });
}

async function fetchPerdasCancelamentoBonuses(
  projectBookmakerIds: Set<string>
): Promise<ProjetoExtraEntry[]> {
  if (projectBookmakerIds.size === 0) return [];

  const { data } = await supabase
    .from('cash_ledger')
    .select('valor, moeda, origem_bookmaker_id, data_transacao, auditoria_metadata')
    .eq('ajuste_motivo', 'BONUS_CANCELAMENTO')
    .eq('ajuste_direcao', 'SAIDA')
    .in('origem_bookmaker_id', Array.from(projectBookmakerIds));

  return (data || []).map((entry: any) => {
    const meta = typeof entry.auditoria_metadata === 'string'
      ? JSON.parse(entry.auditoria_metadata)
      : entry.auditoria_metadata;
    const valorPerdido = Number(meta?.valor_perdido ?? entry.valor) || 0;
    return {
      data: extractCivilDateKey(entry.data_transacao),
      valor: -valorPerdido,
      moeda: entry.moeda || 'BRL',
      tipo: 'promocional' as ExtraTipo,
    };
  }).filter(e => e.valor !== 0);
}

// NOTA: fetchAjustesPosLimitacao foi REMOVIDO.
// financial_events tipo AJUSTE são correções internas de saldo da bookmaker
// (estornos de exclusão, ajustes de payout/odd) e NÃO representam lucro/prejuízo
// operacional real. Incluí-los inflava artificialmente o lucro do projeto.

async function fetchAjustesSaldo(projetoId: string): Promise<ProjetoExtraEntry[]> {
  const { data } = await supabase
    .from('cash_ledger')
    .select('data_transacao, valor, moeda, ajuste_direcao')
    .eq('status', 'CONFIRMADO')
    .eq('tipo_transacao', 'AJUSTE_SALDO')
    .eq('projeto_id_snapshot', projetoId);

  return (data || [])
    .filter(aj => Number(aj.valor || 0) !== 0)
    .map(aj => ({
      data: extractCivilDateKey(aj.data_transacao),
      valor: aj.ajuste_direcao === 'SAIDA' ? -Number(aj.valor) : Number(aj.valor),
      moeda: aj.moeda || 'BRL',
      tipo: 'ajuste_saldo' as ExtraTipo,
    }));
}

async function fetchResultadosCambiais(projetoId: string): Promise<ProjetoExtraEntry[]> {
  const { data } = await supabase
    .from('cash_ledger')
    .select('data_transacao, valor, moeda, tipo_transacao')
    .eq('status', 'CONFIRMADO')
    .in('tipo_transacao', ['GANHO_CAMBIAL', 'PERDA_CAMBIAL'])
    .eq('projeto_id_snapshot', projetoId);

  return (data || [])
    .filter(fx => Number(fx.valor || 0) !== 0)
    .map(fx => ({
      data: extractCivilDateKey(fx.data_transacao),
      valor: fx.tipo_transacao === 'PERDA_CAMBIAL' ? -Number(fx.valor) : Number(fx.valor),
      moeda: fx.moeda || 'BRL',
      tipo: 'resultado_cambial' as ExtraTipo,
    }));
}

async function fetchConciliacoes(
  projetoId: string,
  projectBookmakerMoeda: Map<string, string>
): Promise<ProjetoExtraEntry[]> {
  const { data } = await supabase
    .from('bookmaker_balance_audit')
    .select('created_at, diferenca, bookmaker_id')
    .eq('origem', 'CONCILIACAO_VINCULO')
    .eq('referencia_tipo', 'projeto')
    .eq('referencia_id', projetoId);

  return (data || [])
    .filter(c => Number(c.diferenca || 0) !== 0)
    .map(c => ({
      data: extractCivilDateKey(c.created_at),
      valor: Number(c.diferenca),
      moeda: projectBookmakerMoeda.get(c.bookmaker_id) || 'BRL',
      tipo: 'conciliacao' as ExtraTipo,
    }));
}

async function fetchPerdasOperacionais(projetoId: string): Promise<ProjetoExtraEntry[]> {
  const { data } = await supabase
    .from('projeto_perdas')
    .select('valor, status, data_registro, bookmaker_id')
    .eq('projeto_id', projetoId)
    .eq('status', 'CONFIRMADA');

  // Resolver moedas
  const bookmakerIds = [...new Set((data || []).map((p: any) => p.bookmaker_id).filter(Boolean))];
  let bookmakerMoedas: Record<string, string> = {};
  if (bookmakerIds.length > 0) {
    const { data: bms } = await supabase
      .from('bookmakers')
      .select('id, moeda')
      .in('id', bookmakerIds);
    bms?.forEach(b => { bookmakerMoedas[b.id] = b.moeda || 'BRL'; });
  }

  return (data || [])
    .filter((p: any) => Number(p.valor || 0) > 0)
    .map((p: any) => ({
      data: extractCivilDateKey(p.data_registro),
      valor: -Number(p.valor), // Perdas são negativas
      moeda: bookmakerMoedas[p.bookmaker_id] || 'BRL',
      tipo: 'perda_operacional' as ExtraTipo,
    }));
}

// =====================================================
// HELPERS PARA CONSUMIDORES
// =====================================================

/**
 * Agrupa extras por tipo e retorna totais consolidados.
 * Aplica conversão de moeda via a função fornecida.
 */
export function agruparExtrasPorTipo(
  extras: ProjetoExtraEntry[],
  convertToConsolidation: (valor: number, moedaOrigem: string) => number,
  moedaConsolidacao: string,
  filtroData?: { inicio?: Date; fim?: Date }
): Record<ExtraTipo, { total: number; count: number; porMoeda: { moeda: string; valor: number }[] }> {
  const result: Record<string, { total: number; count: number; porMoeda: Map<string, number> }> = {};

  extras.forEach(e => {
    // Filtrar por data se necessário
    if (filtroData?.inicio || filtroData?.fim) {
      const extraDate = new Date(e.data + 'T12:00:00');
      if (filtroData.inicio && extraDate < filtroData.inicio) return;
      if (filtroData.fim && extraDate > filtroData.fim) return;
    }

    if (!result[e.tipo]) {
      result[e.tipo] = { total: 0, count: 0, porMoeda: new Map() };
    }

    const group = result[e.tipo];
    // Converter para moeda de consolidação
    const valorConvertido = e.moeda === moedaConsolidacao
      ? e.valor
      : convertToConsolidation(e.valor, e.moeda);
    
    group.total += valorConvertido;
    group.count += 1;

    // Breakdown por moeda original
    const current = group.porMoeda.get(e.moeda) || 0;
    group.porMoeda.set(e.moeda, current + e.valor);
  });

  // Converter Maps para arrays
  const formatted: any = {};
  for (const [tipo, data] of Object.entries(result)) {
    formatted[tipo] = {
      total: data.total,
      count: data.count,
      porMoeda: Array.from(data.porMoeda.entries())
        .map(([moeda, valor]) => ({ moeda, valor }))
        .filter(item => Math.abs(item.valor) > 0.01),
    };
  }
  return formatted;
}
