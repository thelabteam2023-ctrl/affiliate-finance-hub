import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useProjetoDashboardData, 
  getProjetoDashboardQueryKey,
  buildBookmakerMoedaMap,
  type ProjetoDashboardRawData,
  type RawAposta,
  type RawApostaPerna,
  type RawLedgerExtra,
} from './useProjetoDashboardData';
import { 
  ProjetoKpiBreakdowns, 
  KpiBreakdown, 
  CurrencyBreakdownItem,
  VolumeTemporalStats,
  createModuleContribution, 
  createKpiBreakdown 
} from '@/types/moduleBreakdown';
import { ESTRATEGIA_LABELS, type ApostaEstrategia } from '@/lib/apostaConstants';
import { getConsolidatedStake, getConsolidatedLucro, getConsolidatedLucroDirect, type PernaConsolidavel } from '@/utils/consolidatedValues';
import { extractCivilDateKey } from '@/utils/dateUtils';

interface UseKpiBreakdownsProps {
  projetoId: string;
  dataInicio?: Date | null;
  dataFim?: Date | null;
  moedaConsolidacao?: string;
  convertToConsolidation?: (valor: number, moedaOrigem: string) => number;
  cotacaoKey?: number;
}

interface UseKpiBreakdownsReturn {
  breakdowns: ProjetoKpiBreakdowns | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// Query key mantido para compatibilidade
export const PROJETO_BREAKDOWNS_QUERY_KEY = "projeto-breakdowns";

// =====================================================
// HELPERS
// =====================================================

type ConvertFn = (valor: number, moedaOrigem: string) => number;

interface ModuleDataWithCurrency {
  count: number;
  volume: number;
  volumeLiquidado?: number;
  lucro: number;
  countDetails?: string;
  valorTotal?: number;
  confirmadas?: number;
  pendentes?: number;
  total?: number;
  volumePorMoeda: CurrencyBreakdownItem[];
  lucroPorMoeda: CurrencyBreakdownItem[];
  lucroPorEstrategia?: Record<string, number>;
}

function agregarPorMoeda(items: { valor: number; moeda: string }[]): CurrencyBreakdownItem[] {
  const map = new Map<string, number>();
  items.forEach(({ valor, moeda }) => {
    const moedaNorm = (moeda || 'BRL').toUpperCase();
    map.set(moedaNorm, (map.get(moedaNorm) || 0) + valor);
  });
  return Array.from(map.entries())
    .map(([moeda, valor]) => ({ moeda, valor }))
    .filter(item => Math.abs(item.valor) > 0.01);
}

function combinarBreakdownsMoeda(...breakdowns: CurrencyBreakdownItem[][]): CurrencyBreakdownItem[] {
  const map = new Map<string, number>();
  breakdowns.flat().forEach(({ moeda, valor }) => {
    map.set(moeda, (map.get(moeda) || 0) + valor);
  });
  return Array.from(map.entries())
    .map(([moeda, valor]) => ({ moeda, valor }))
    .filter(item => Math.abs(item.valor) > 0.01);
}

// =====================================================
// DERIVAÇÕES IN-MEMORY (substituem queries individuais)
// =====================================================

function deriveApostasModule(
  apostas: RawAposta[],
  moedaConsolidacao: string,
  convert: ConvertFn,
  pernasMap: Map<string, RawApostaPerna[]>
): ModuleDataWithCurrency {
  const greens = apostas.filter(a => a.resultado === 'GREEN' || a.resultado === 'MEIO_GREEN').length;
  const reds = apostas.filter(a => a.resultado === 'RED' || a.resultado === 'MEIO_RED').length;
  const voids = apostas.filter(a => a.resultado === 'VOID' || a.resultado === 'REEMBOLSO').length;
  const countDetails = `${greens}G ${reds}R ${voids}V`;

  // Volume TOTAL (incluindo pendentes) — para KPI de Volume
  const volume = apostas.reduce((acc, a) => {
    const pernas = pernasMap.get(a.id);
    if (a.forma_registro === 'ARBITRAGEM' && pernas && pernas.length > 0) {
      return acc + pernas.reduce((sum, p) => {
        const moeda = (p.moeda || a.moeda_operacao || 'BRL').toUpperCase();
        return sum + convert(Number(p.stake || 0), moeda);
      }, 0);
    }
    return acc + getConsolidatedStake(a as any, convert, moedaConsolidacao);
  }, 0);

  // Volume LIQUIDADO (apenas apostas com resultado definido) — para ROI
  const apostasLiquidadas = apostas.filter(a => a.status === 'LIQUIDADA');
  const volumeLiquidado = apostasLiquidadas.reduce((acc, a) => {
    const pernas = pernasMap.get(a.id);
    if (a.forma_registro === 'ARBITRAGEM' && pernas && pernas.length > 0) {
      return acc + pernas.reduce((sum, p) => {
        const moeda = (p.moeda || a.moeda_operacao || 'BRL').toUpperCase();
        return sum + convert(Number(p.stake || 0), moeda);
      }, 0);
    }
    return acc + getConsolidatedStake(a as any, convert, moedaConsolidacao);
  }, 0);

  const lucroPorEstrategia: Record<string, number> = {};
  let lucro = 0;
  apostas.filter(a => a.status === 'LIQUIDADA').forEach(a => {
    const pernas = pernasMap.get(a.id);
    const pl = getConsolidatedLucroDirect(a as any, pernas, convert, moedaConsolidacao);
    lucro += pl;
    const key = a.estrategia || 'PUNTER';
    lucroPorEstrategia[key] = (lucroPorEstrategia[key] || 0) + pl;
  });

  // Volume por moeda: usar pernas para arbitragem
  const volumeItems: { valor: number; moeda: string }[] = [];
  apostas.forEach(a => {
    const pernas = pernasMap.get(a.id);
    if (a.forma_registro === 'ARBITRAGEM' && pernas && pernas.length > 0) {
      pernas.forEach(p => {
        volumeItems.push({ valor: Number(p.stake || 0), moeda: (p.moeda || a.moeda_operacao || 'BRL').toUpperCase() });
      });
    } else {
      volumeItems.push({
        valor: Number(a.forma_registro === 'ARBITRAGEM' ? (a.stake_total || 0) : (a.stake || 0)),
        moeda: (a.moeda_operacao || 'BRL').toUpperCase()
      });
    }
  });
  const volumePorMoeda = agregarPorMoeda(volumeItems);

  const lucroItems = apostas.filter(a => a.status === 'LIQUIDADA').map(a => ({
    valor: Number(a.lucro_prejuizo || 0),
    moeda: a.moeda_operacao || 'BRL'
  }));
  const lucroPorMoeda = agregarPorMoeda(lucroItems);

  return { count: apostas.length, volume, volumeLiquidado, lucro, countDetails, volumePorMoeda, lucroPorMoeda, lucroPorEstrategia };
}

function deriveGirosGratisModule(
  rawData: ProjetoDashboardRawData,
  convert: ConvertFn
): ModuleDataWithCurrency {
  const bookmakerMoeda = buildBookmakerMoedaMap(rawData.bookmakers);
  const giros = rawData.giros_gratis;
  const count = giros.length;
  const valorTotal = giros.reduce((acc, g) => acc + Number(g.valor_total_giros || 0), 0);

  const lucro = giros.reduce((acc, g) => {
    const valor = Math.max(0, Number(g.valor_retorno || 0));
    const moeda = bookmakerMoeda.get(g.bookmaker_id) || 'BRL';
    return acc + convert(valor, moeda);
  }, 0);

  const volumeItems = giros.map(g => ({
    valor: Number(g.valor_total_giros || 0),
    moeda: bookmakerMoeda.get(g.bookmaker_id) || 'BRL'
  }));
  const volumePorMoeda = agregarPorMoeda(volumeItems);

  const lucroItems = giros.map(g => ({
    valor: Math.max(0, Number(g.valor_retorno || 0)),
    moeda: bookmakerMoeda.get(g.bookmaker_id) || 'BRL'
  }));
  const lucroPorMoeda = agregarPorMoeda(lucroItems);

  return { count, volume: 0, lucro, valorTotal, volumePorMoeda, lucroPorMoeda };
}

function derivePerdasModule(rawData: ProjetoDashboardRawData, convert: ConvertFn): ModuleDataWithCurrency {
  const bookmakerMoeda = buildBookmakerMoedaMap(rawData.bookmakers);
  const perdas = rawData.perdas;

  const confirmadas = perdas.filter(p => p.status === 'CONFIRMADA')
    .reduce((acc, p) => {
      const moeda = bookmakerMoeda.get(p.bookmaker_id || '') || 'BRL';
      return acc + convert(Number(p.valor || 0), moeda);
    }, 0);
  const pendentes = perdas.filter(p => p.status === 'PENDENTE')
    .reduce((acc, p) => {
      const moeda = bookmakerMoeda.get(p.bookmaker_id || '') || 'BRL';
      return acc + convert(Number(p.valor || 0), moeda);
    }, 0);

  const lucroItems = perdas.filter(p => p.status === 'CONFIRMADA').map(p => ({
    valor: Number(p.valor || 0),
    moeda: bookmakerMoeda.get(p.bookmaker_id || '') || 'BRL'
  }));
  const lucroPorMoeda = agregarPorMoeda(lucroItems);

  return { count: 0, volume: 0, lucro: 0, confirmadas, pendentes, volumePorMoeda: [], lucroPorMoeda };
}

function deriveAjustesModule(rawData: ProjetoDashboardRawData, convert: ConvertFn): ModuleDataWithCurrency {
  const bookmakerMoeda = buildBookmakerMoedaMap(rawData.bookmakers);
  const conciliacoes = rawData.conciliacoes;

  const total = conciliacoes.reduce((acc, c) => {
    const delta = Number(c.saldo_novo) - Number(c.saldo_anterior);
    const moeda = bookmakerMoeda.get(c.bookmaker_id) || 'BRL';
    return acc + convert(delta, moeda);
  }, 0);

  const lucroItems = conciliacoes.map(c => ({
    valor: Number(c.saldo_novo) - Number(c.saldo_anterior),
    moeda: bookmakerMoeda.get(c.bookmaker_id) || 'BRL'
  }));
  const lucroPorMoeda = agregarPorMoeda(lucroItems);

  return { count: 0, volume: 0, lucro: 0, total, volumePorMoeda: [], lucroPorMoeda };
}

function deriveCashbackModule(
  rawData: ProjetoDashboardRawData,
  moedaConsolidacao: string,
  convert: ConvertFn
): ModuleDataWithCurrency {
  const cashbacks = rawData.cashback;
  const count = cashbacks.length;

  const total = cashbacks.reduce((acc, cb) => {
    const moedaOp = cb.moeda_operacao || 'BRL';
    const valor = Number(cb.valor || 0);
    if (moedaOp === moedaConsolidacao) return acc + valor;
    if (moedaConsolidacao === 'BRL' && cb.valor_brl_referencia != null) {
      return acc + Number(cb.valor_brl_referencia);
    }
    return acc + convert(valor, moedaOp);
  }, 0);

  const lucroItems = cashbacks.map(cb => ({
    valor: Number(cb.valor || 0),
    moeda: cb.moeda_operacao || 'BRL'
  }));
  const lucroPorMoeda = agregarPorMoeda(lucroItems);

  return { count, volume: 0, lucro: 0, total, volumePorMoeda: [], lucroPorMoeda };
}

function deriveBonusGanhosModule(
  rawData: ProjetoDashboardRawData,
  moedaConsolidacao: string,
  convert: ConvertFn
): ModuleDataWithCurrency {
  // REGRA CANÔNICA: FREEBET excluído — lucro SNR já contabilizado no P&L
  const bonuses = rawData.bonus.filter(b => b.tipo_bonus !== 'FREEBET');
  const count = bonuses.length;

  const total = bonuses.reduce((acc, b) => {
    const moeda = b.currency || 'BRL';
    const valor = Number(b.bonus_amount || 0);
    if (moeda === moedaConsolidacao) return acc + valor;
    return acc + convert(valor, moeda);
  }, 0);

  const lucroItems = bonuses.map(b => ({
    valor: Number(b.bonus_amount || 0),
    moeda: b.currency || 'BRL'
  }));
  const lucroPorMoeda = agregarPorMoeda(lucroItems);

  return { count, volume: 0, lucro: 0, total, volumePorMoeda: [], lucroPorMoeda };
}

// =====================================================
// DERIVAÇÃO DE EXTRAS (substitui fetchProjetoExtras)
// =====================================================

interface ExtraAgrupado {
  total: number;
  count: number;
  porMoeda: CurrencyBreakdownItem[];
}

type ExtraTipo = 'ajuste_saldo' | 'resultado_cambial' | 'promocional' | 'freebet';

function deriveExtrasFromRpc(
  rawData: ProjetoDashboardRawData,
  convert: ConvertFn,
  moedaConsolidacao: string
): Record<ExtraTipo, ExtraAgrupado> {
  const bookmakerMoeda = buildBookmakerMoedaMap(rawData.bookmakers);
  const bookmakerIds = new Set(rawData.bookmakers.map(b => b.id));

  const result: Record<string, { total: number; count: number; porMoeda: Map<string, number> }> = {};

  const addEntry = (tipo: string, valor: number, moeda: string) => {
    if (!result[tipo]) result[tipo] = { total: 0, count: 0, porMoeda: new Map() };
    const moedaNorm = (moeda || 'BRL').toUpperCase();
    const valorConvertido = moedaNorm === moedaConsolidacao ? valor : convert(valor, moedaNorm);
    result[tipo].total += valorConvertido;
    result[tipo].count += 1;
    result[tipo].porMoeda.set(moedaNorm, (result[tipo].porMoeda.get(moedaNorm) || 0) + valor);
  };

  // Processar ledger_extras
  rawData.ledger_extras.forEach(le => {
    const valor = Number(le.valor || 0);
    if (valor === 0) return;
    const moeda = le.moeda || 'BRL';

    switch (le.tipo_transacao) {
      case 'AJUSTE_SALDO': {
        // Verificar se é BONUS_CANCELAMENTO
        if (le.ajuste_motivo === 'BONUS_CANCELAMENTO' && le.ajuste_direcao === 'SAIDA') {
          const meta = typeof le.auditoria_metadata === 'string' ? JSON.parse(le.auditoria_metadata) : le.auditoria_metadata;
          const valorPerdido = Number(meta?.valor_perdido ?? valor) || 0;
          if (valorPerdido !== 0) {
            addEntry('promocional', -valorPerdido, moeda);
          }
        } else {
          // Ajuste de saldo normal
          const ajusteValor = le.ajuste_direcao === 'SAIDA' ? -valor : valor;
          addEntry('ajuste_saldo', ajusteValor, moeda);
        }
        break;
      }
      case 'GANHO_CAMBIAL':
        addEntry('resultado_cambial', valor, moeda);
        break;
      case 'PERDA_CAMBIAL':
        addEntry('resultado_cambial', -valor, moeda);
        break;
      case 'FREEBET_CONVERTIDA':
        addEntry('freebet', valor, moeda);
        break;
      case 'CREDITO_PROMOCIONAL':
      case 'GIRO_GRATIS_GANHO':
        addEntry('promocional', valor, moeda);
        break;
    }
  });

  // NOTA: ajustes_pos_limitacao (financial_events tipo AJUSTE) são correções de saldo
  // da bookmaker (estornos de exclusão, ajustes de payout), NÃO representam lucro/prejuízo
  // operacional real. Por isso são EXCLUÍDOS do cálculo de lucro.

  // Converter Maps para arrays
  const formatted: Record<string, ExtraAgrupado> = {};
  const tipos: ExtraTipo[] = ['ajuste_saldo', 'resultado_cambial', 'promocional', 'freebet'];
  tipos.forEach(tipo => {
    const data = result[tipo];
    formatted[tipo] = {
      total: data?.total || 0,
      count: data?.count || 0,
      porMoeda: data ? Array.from(data.porMoeda.entries())
        .map(([moeda, valor]) => ({ moeda, valor }))
        .filter(item => Math.abs(item.valor) > 0.01) : [],
    };
  });

  return formatted as Record<ExtraTipo, ExtraAgrupado>;
}

// =====================================================
// CÁLCULO DO LUCRO CANÔNICO (substitui fetchProjetosLucroOperacionalKpi)
// =====================================================

const isUsdLike = (moeda?: string | null) => {
  const m = (moeda || "BRL").toUpperCase();
  return m === "USD" || m === "USDT" || m === "USDC";
};

const normalizeMoeda = (moeda?: string | null): string => {
  const m = (moeda || "BRL").toUpperCase();
  if (m === "USDT" || m === "USDC") return "USD";
  return m;
};

function calcularLucroCanonicoFromRpc(
  rawData: ProjetoDashboardRawData,
  convert: ConvertFn,
  moedaConsolidacao: string
): { consolidado: number; porMoeda: Record<string, number> } {
  const bookmakerMoeda = buildBookmakerMoedaMap(rawData.bookmakers);
  let consolidado = 0;
  const porMoeda: Record<string, number> = {};

  const addToMoeda = (moeda: string, valor: number) => {
    const key = normalizeMoeda(moeda);
    porMoeda[key] = (porMoeda[key] || 0) + valor;
  };

  // Build pernas map para conversão direta multicurrency
  const pernasMap = new Map<string, PernaConsolidavel[]>();
  (rawData.apostas_pernas || []).forEach(p => {
    if (!pernasMap.has(p.aposta_id)) pernasMap.set(p.aposta_id, []);
    pernasMap.get(p.aposta_id)!.push({
      moeda: p.moeda,
      lucro_prejuizo: p.lucro_prejuizo != null ? Number(p.lucro_prejuizo) : null,
      resultado: p.resultado,
      stake: p.stake != null ? Number(p.stake) : null,
      stake_brl_referencia: p.stake_brl_referencia != null ? Number(p.stake_brl_referencia) : null,
    });
  });

  // 1) Apostas LIQUIDADAS — CORREÇÃO: usar getConsolidatedLucroDirect para conversão direta
  // em apostas multicurrency (evita cross-rate via BRL pivot)
  rawData.apostas.filter(a => a.status === 'LIQUIDADA').forEach(a => {
    const moeda = (a.moeda_operacao || 'BRL').toUpperCase();
    addToMoeda(moeda, Number(a.lucro_prejuizo || 0));
    const pernas = pernasMap.get(a.id);
    consolidado += getConsolidatedLucroDirect(a as any, pernas, convert, moedaConsolidacao);
  });

  // 2) Cashback — CORREÇÃO: usar convert() consistentemente (sem fallback valor_brl_referencia)
  rawData.cashback.forEach(cb => {
    const moeda = (cb.moeda_operacao || 'BRL').toUpperCase();
    const valor = Number(cb.valor || 0);
    addToMoeda(moeda, valor);
    consolidado += convert(valor, moeda);
  });

  // 3) Giros grátis
  rawData.giros_gratis.forEach(g => {
    const valor = Math.max(0, Number(g.valor_retorno || 0));
    const moeda = bookmakerMoeda.get(g.bookmaker_id) || 'BRL';
    addToMoeda(moeda, valor);
    consolidado += convert(valor, moeda);
  });

  // 4) Bônus (excl FREEBET)
  rawData.bonus.filter(b => b.tipo_bonus !== 'FREEBET').forEach(b => {
    const moeda = (b.currency || 'BRL').toUpperCase();
    const valor = Number(b.bonus_amount || 0);
    addToMoeda(moeda, valor);
    consolidado += convert(valor, moeda);
  });

  // 5) Perdas operacionais (subtrai)
  rawData.perdas.filter(p => p.status === 'CONFIRMADA').forEach(p => {
    const valor = Number(p.valor || 0);
    const moeda = bookmakerMoeda.get(p.bookmaker_id || '') || 'BRL';
    addToMoeda(moeda, -valor);
    consolidado -= convert(valor, moeda);
  });

  // 6) Conciliações
  rawData.conciliacoes.forEach(c => {
    const delta = Number(c.diferenca || (Number(c.saldo_novo) - Number(c.saldo_anterior)));
    const moeda = bookmakerMoeda.get(c.bookmaker_id) || 'BRL';
    addToMoeda(moeda, delta);
    consolidado += convert(delta, moeda);
  });

  // 7) Extras (ajuste_saldo, resultado_cambial, promocional, freebet)
  const extras = deriveExtrasFromRpc(rawData, convert, moedaConsolidacao);
  for (const [_tipo, grupo] of Object.entries(extras)) {
    if (!grupo) continue;
    consolidado += grupo.total;
    grupo.porMoeda.forEach(item => {
      addToMoeda(item.moeda, item.valor);
    });
  }

  return { consolidado, porMoeda };
}

// =====================================================
// VOLUME TEMPORAL STATS
// =====================================================

function deriveVolumeTemporalStats(
  apostas: RawAposta[],
  volumeTotal: number
): VolumeTemporalStats {
  if (apostas.length === 0) {
    return {
      primeiraAposta: null,
      ultimaAposta: null,
      diasAtivos: 0,
      diasComOperacao: 0,
      volumeMedioDiario: 0,
      mediaApostasPorDia: 0,
      densidadeOperacional: 0,
      volumeProjetado: null,
    };
  }

  // Extrair datas únicas de apostas (usar data civil, sem timezone)
  const datasSet = new Set<string>();
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const a of apostas) {
    const dateKey = a.data_aposta?.slice(0, 10); // YYYY-MM-DD
    if (!dateKey) continue;
    datasSet.add(dateKey);
    if (!minDate || dateKey < minDate) minDate = dateKey;
    if (!maxDate || dateKey > maxDate) maxDate = dateKey;
  }

  if (!minDate || !maxDate) {
    return {
      primeiraAposta: null,
      ultimaAposta: null,
      diasAtivos: 0,
      diasComOperacao: 0,
      volumeMedioDiario: 0,
      mediaApostasPorDia: 0,
      densidadeOperacional: 0,
      volumeProjetado: null,
    };
  }

  const diasComOperacao = datasSet.size;
  
  // diasAtivos = (última - primeira) + 1
  const start = new Date(minDate + 'T00:00:00');
  const end = new Date(maxDate + 'T00:00:00');
  const diffMs = end.getTime() - start.getTime();
  const diasAtivos = Math.max(1, Math.round(diffMs / (24 * 60 * 60 * 1000)) + 1);

  const volumeMedioDiario = diasAtivos > 0 ? volumeTotal / diasAtivos : 0;
  const mediaApostasPorDia = diasAtivos > 0 ? apostas.length / diasAtivos : 0;
  const densidadeOperacional = diasAtivos > 0 ? diasComOperacao / diasAtivos : 0;

  return {
    primeiraAposta: minDate,
    ultimaAposta: maxDate,
    diasAtivos,
    diasComOperacao,
    volumeMedioDiario,
    mediaApostasPorDia,
    densidadeOperacional,
    volumeProjetado: null, // Calculated at UI level with period context
  };
}

// =====================================================
// DERIVAÇÃO COMPLETA DOS BREAKDOWNS
// =====================================================

function deriveBreakdowns(
  rawData: ProjetoDashboardRawData,
  moedaConsolidacao: string,
  convert: ConvertFn
): ProjetoKpiBreakdowns {
  // Build pernas map for per-leg consolidation of arbitrage bets
  const pernasMap = new Map<string, RawApostaPerna[]>();
  (rawData.apostas_pernas || []).forEach(p => {
    if (!pernasMap.has(p.aposta_id)) pernasMap.set(p.aposta_id, []);
    pernasMap.get(p.aposta_id)!.push(p);
  });

  // Módulos individuais
  const apostasData = deriveApostasModule(rawData.apostas, moedaConsolidacao, convert, pernasMap);
  const girosGratisData = deriveGirosGratisModule(rawData, convert);
  const perdasData = derivePerdasModule(rawData, convert);
  const ajustesData = deriveAjustesModule(rawData, convert);
  const cashbackData = deriveCashbackModule(rawData, moedaConsolidacao, convert);
  const bonusGanhosData = deriveBonusGanhosModule(rawData, moedaConsolidacao, convert);

  // Extras canônicos (ajuste_saldo, resultado_cambial, promocional, freebet)
  const extrasAgrupados = deriveExtrasFromRpc(rawData, convert, moedaConsolidacao);

  // Lucro canônico (mesma engine dos ciclos)
  const lucroCanonicoResult = calcularLucroCanonicoFromRpc(rawData, convert, moedaConsolidacao);
  const lucroCanonicoTotal = lucroCanonicoResult.consolidado;

  // === BREAKDOWN APOSTAS ===
  const apostasBreakdown = createKpiBreakdown([
    createModuleContribution('apostas', 'Apostas', apostasData.count, true, { icon: 'Target', color: 'default', details: apostasData.countDetails }),
    createModuleContribution('giros_gratis', 'Giros Grátis', girosGratisData.count, girosGratisData.count > 0, { icon: 'Dices', color: 'default' }),
  ], moedaConsolidacao);

  // === BREAKDOWN VOLUME ===
  const volumeBreakdown = createKpiBreakdown([
    createModuleContribution('apostas', 'Apostas', apostasData.volume, true, { icon: 'Target', color: 'default' }),
  ], moedaConsolidacao);
  volumeBreakdown.currencyBreakdown = apostasData.volumePorMoeda;

  // === BREAKDOWN LUCRO ===
  const STRATEGY_MODULE_MAP: Record<string, { moduleId: string; icon: string }> = {
    SUREBET: { moduleId: 'surebet', icon: 'ArrowLeftRight' },
    EXTRACAO_BONUS: { moduleId: 'bonus', icon: 'Coins' },
    VALUEBET: { moduleId: 'valuebet', icon: 'Sparkles' },
    DUPLO_GREEN: { moduleId: 'duplogreen', icon: 'Zap' },
    EXTRACAO_FREEBET: { moduleId: 'freebets', icon: 'Gift' },
    PUNTER: { moduleId: 'apostas', icon: 'Target' },
  };

  const strategyContributions = Object.entries(apostasData.lucroPorEstrategia || {})
    .map(([estrategia, lucro]) => {
      const mapping = STRATEGY_MODULE_MAP[estrategia] || { moduleId: estrategia.toLowerCase(), icon: 'Target' };
      const label = ESTRATEGIA_LABELS[estrategia as ApostaEstrategia] || estrategia;
      return createModuleContribution(mapping.moduleId, label, lucro as number, true, { icon: mapping.icon });
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const lucroBreakdown = createKpiBreakdown([
    ...strategyContributions,
    createModuleContribution('bonus_ganhos', 'Bônus Ganhos', bonusGanhosData.total || 0, (bonusGanhosData.count || 0) > 0, { icon: 'Gift', color: 'positive' }),
    createModuleContribution('giros_gratis', 'Giros Grátis', girosGratisData.lucro, girosGratisData.count > 0, { icon: 'Dices', color: 'positive' }),
    createModuleContribution('cashback', 'Cashback', cashbackData.total || 0, (cashbackData.count || 0) > 0, { icon: 'Percent', color: 'positive' }),
    createModuleContribution('perdas', 'Perdas Operacionais', -(perdasData.confirmadas || 0), (perdasData.confirmadas || 0) > 0, { icon: 'TrendingDown', color: 'negative' }),
    createModuleContribution('ajustes', 'Ajustes Conciliação', ajustesData.total || 0, (ajustesData.total || 0) !== 0, { icon: 'Minus', color: (ajustesData.total || 0) >= 0 ? 'positive' : 'negative' }),
    createModuleContribution('ajuste_saldo', 'Ajustes de Saldo/FX', extrasAgrupados.ajuste_saldo?.total || 0, (extrasAgrupados.ajuste_saldo?.count || 0) > 0, { icon: 'Settings', color: (extrasAgrupados.ajuste_saldo?.total || 0) >= 0 ? 'positive' : 'negative' }),
    createModuleContribution('resultado_cambial', 'Resultado Cambial', extrasAgrupados.resultado_cambial?.total || 0, (extrasAgrupados.resultado_cambial?.count || 0) > 0, { icon: 'Globe', color: (extrasAgrupados.resultado_cambial?.total || 0) >= 0 ? 'positive' : 'negative' }),
    createModuleContribution('promocional', 'Eventos Promocionais', extrasAgrupados.promocional?.total || 0, (extrasAgrupados.promocional?.count || 0) > 0, { icon: 'Megaphone', color: (extrasAgrupados.promocional?.total || 0) >= 0 ? 'positive' : 'negative' }),
    createModuleContribution('freebet', 'Freebet Convertida', extrasAgrupados.freebet?.total || 0, (extrasAgrupados.freebet?.count || 0) > 0, { icon: 'Gift', color: (extrasAgrupados.freebet?.total || 0) >= 0 ? 'positive' : 'negative' }),
  ], moedaConsolidacao);

  // RECONCILIAÇÃO
  const somaModulos = lucroBreakdown.total;
  const deltaReconciliacao = lucroCanonicoTotal - somaModulos;
  if (Math.abs(deltaReconciliacao) > 0.01) {
    lucroBreakdown.contributions.push(
      createModuleContribution('reconciliacao', 'Reconciliação', deltaReconciliacao, true, { icon: 'Scale', color: deltaReconciliacao >= 0 ? 'positive' : 'negative' })
    );
  }

  // Sobrescrever total com valor canônico
  lucroBreakdown.total = lucroCanonicoTotal;

  // Currency breakdown do lucro
  lucroBreakdown.currencyBreakdown = combinarBreakdownsMoeda(
    apostasData.lucroPorMoeda,
    girosGratisData.lucroPorMoeda,
    bonusGanhosData.lucroPorMoeda,
    cashbackData.lucroPorMoeda,
    perdasData.lucroPorMoeda.map(item => ({ ...item, valor: -item.valor })),
    ajustesData.lucroPorMoeda,
    extrasAgrupados.ajuste_saldo?.porMoeda || [],
    extrasAgrupados.resultado_cambial?.porMoeda || [],
    extrasAgrupados.promocional?.porMoeda || [],
    extrasAgrupados.freebet?.porMoeda || [],
  );

  // === ROI ===
  // ROI usa volume LIQUIDADO — apostas pendentes não têm resultado definido
  const lucroTotal = lucroCanonicoTotal;
  const volumeTotal = volumeBreakdown.total;
  const volumeLiquidadoTotal = apostasData.volumeLiquidado ?? volumeTotal;
  const roiTotal = volumeLiquidadoTotal > 0 ? (lucroTotal / volumeLiquidadoTotal) * 100 : null;

  // === VOLUME TEMPORAL STATS ===
  const volumeTemporalStats = deriveVolumeTemporalStats(rawData.apostas, volumeBreakdown.total);

  return {
    apostas: apostasBreakdown,
    volume: volumeBreakdown,
    lucro: lucroBreakdown,
    roi: {
      total: roiTotal,
      volumeTotal: volumeLiquidadoTotal,
      lucroTotal,
      currency: moedaConsolidacao,
    },
    volumeTemporal: volumeTemporalStats,
  };
}

// =====================================================
// HOOK PRINCIPAL
// =====================================================

/**
 * Hook para calcular breakdowns dinâmicos dos KPIs por módulo.
 * REFATORADO: Agora deriva dados do RPC centralizado (0 queries individuais).
 */
export function useKpiBreakdowns({
  projetoId,
  dataInicio = null,
  dataFim = null,
  moedaConsolidacao = 'BRL',
  convertToConsolidation,
  cotacaoKey = 0,
}: UseKpiBreakdownsProps): UseKpiBreakdownsReturn {
  const { data: rawData, isLoading, error, refresh: refreshDashboard } = useProjetoDashboardData(projetoId || undefined);

  const safeConvert = convertToConsolidation || ((valor: number, _moeda: string) => valor);

  const breakdowns = useMemo(() => {
    if (!rawData) return null;
    return deriveBreakdowns(rawData, moedaConsolidacao, safeConvert);
  }, [rawData, moedaConsolidacao, safeConvert, cotacaoKey]);

  const refresh = useCallback(async () => {
    await refreshDashboard();
  }, [refreshDashboard]);

  return {
    breakdowns,
    loading: isLoading,
    error: error ? String(error) : null,
    refresh,
  };
}
