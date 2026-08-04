import { ProjetoDashboardRawData, buildBookmakerMoedaMap } from "@/hooks/useProjetoDashboardData";

/**
 * SERVIÇO CENTRALIZADO DE MÉTRICAS FINANCEIRAS (SSOT)
 * 
 * Este serviço é o único responsável por definir as fórmulas de cálculo
 * de todas as métricas financeiras do sistema, garantindo paridade absoluta
 * entre Relatórios, Projetos, Dashboard e Extrato.
 */

export interface FinancialMetrics {
  // Métrica Primária: Lucro Realizado (Fluxo de Caixa)
  // LUCRO REALIZADO = (Saldo nas Casas + Saques Confirmados) - Depósitos Efetivos
  netProfit: number;
  
  // ROI Operacional: (Lucro Realizado / Depósitos Efetivos) * 100
  roi: number | null;

  // Capital
  totalDepositos: number;    // Depósitos efetivos (exclui baseline)
  totalSaques: number;       // Saques confirmados
  saquesPendentes: number;   // Saques solicitados (em trânsito)
  depositosPendentes: number; // Depósitos solicitados (em trânsito)
  
  // Saldos
  saldoBookmakers: number;   // Patrimônio atual em casas
  saldoIrrecuperavel: number; // Risco (contas bloqueadas/limitadas)
  
  // Operacional (Secundário)
  totalStaked: number;       // Volume total transacionado
  grossProfitFromBets: number; // Lucro bruto das apostas (sem bônus)
  lucroGirosGratis: number;
  lucroCashback: number;
  
  // Auditoria
  ajustesConciliacao: number;
  operationalLossesConfirmed: number;
  
  moedaConsolidacao: string;
}

type ConvertFn = (valor: number, moedaOrigem: string) => number;

export class FinancialMetricsService {
  /**
   * Deriva todas as métricas financeiras a partir dos dados brutos do dashboard.
   */
  static calculate(
    rawData: ProjetoDashboardRawData,
    convert: ConvertFn
  ): FinancialMetrics {
    const moedaConsolidacao = rawData.moeda_consolidacao;
    const bookmakerMoeda = buildBookmakerMoedaMap(rawData.bookmakers);

    // 1. Depósitos Efetivos (SSOT: analytics-snapshot-conversion-hierarchy)
    // Filtro: DEPOSITO real + DEPOSITO_VIRTUAL (origem_tipo='MIGRACAO')
    // Exclui BASELINE e NULL (não são capital real aportado pelo usuário).
    const totalDepositos = rawData.depositos.reduce((acc, d) => {
      const isBaseline = d.tipo_transacao === 'DEPOSITO_VIRTUAL' && 
                         (d.origem_tipo === 'BASELINE' || d.origem_tipo == null);
      if (isBaseline) return acc;
      return acc + convert(Number(d.valor || 0), d.moeda || 'BRL');
    }, 0);

    // 2. Saques Confirmados
    const totalSaques = rawData.saques.reduce((acc, s) => 
      acc + convert(Number(s.valor_confirmado ?? s.valor), s.moeda || 'BRL'), 0);

    // 3. Saques Pendentes (Em Trânsito)
    const saquesPendentes = (rawData as any).saquesPendentes 
      ? (rawData as any).saquesPendentes.reduce((acc: number, s: any) => acc + convert(Number(s.valor || 0), s.moeda || 'BRL'), 0)
      : rawData.saques.filter(s => (s as any).status === 'PENDENTE').reduce((acc, s) => acc + convert(Number(s.valor || 0), s.moeda || 'BRL'), 0);

    // 4. Depósitos Pendentes
    const depositosPendentes = rawData.depositos.filter(d => (d as any).status === 'PENDENTE').reduce((acc, d) => 
      acc + convert(Number(d.valor || 0), d.moeda || 'BRL'), 0);

    // 5. Patrimônio atual (Saldos nas Casas)
    const saldoBookmakers = rawData.bookmakers.reduce((acc, b) => 
      acc + convert(Number(b.saldo_atual || 0), b.moeda || 'BRL'), 0);
    
    const saldoIrrecuperavel = rawData.bookmakers.reduce((acc, b) => 
      acc + convert(Number(b.saldo_irrecuperavel || 0), b.moeda || 'BRL'), 0);

    // 6. Lucro Realizado (Fórmula Canônica)
    // LUCRO REALIZADO = (Patrimônio + Saques Confirmados) - Depósitos Efetivos
    const netProfit = (saldoBookmakers + totalSaques) - totalDepositos;
    const roi = totalDepositos > 0 ? (netProfit / totalDepositos) * 100 : null;

    // 7. Métricas Operacionais
    const totalStaked = rawData.apostas
      .filter(a => !a.bonus_id && a.estrategia !== 'EXTRACAO_BONUS')
      .reduce((acc, a) => {
        if (a.stake_consolidado !== null && a.consolidation_currency === moedaConsolidacao) {
          return acc + Number(a.stake_consolidado);
        }
        const stake = a.forma_registro === 'ARBITRAGEM' ? Number(a.stake_total || 0) : Number(a.stake || 0);
        return acc + convert(stake, a.moeda_operacao || 'BRL');
      }, 0);

    const grossProfitFromBets = rawData.apostas
      .filter(a => a.status === 'LIQUIDADA' && !a.bonus_id && a.estrategia !== 'EXTRACAO_BONUS')
      .reduce((acc, a) => {
        if (a.pl_consolidado !== null && a.consolidation_currency === moedaConsolidacao) {
          return acc + Number(a.pl_consolidado);
        }
        return acc + convert(Number(a.lucro_prejuizo || 0), a.moeda_operacao || 'BRL');
      }, 0);

    const lucroGirosGratis = rawData.giros_gratis.reduce((acc, g) => {
      const moeda = bookmakerMoeda.get(g.bookmaker_id) || 'BRL';
      return acc + Math.max(0, convert(Number(g.valor_retorno || 0), moeda));
    }, 0);

    const lucroCashback = rawData.cashback.reduce((acc, cb) => 
      acc + Math.max(0, convert(Number(cb.valor || 0), cb.moeda_operacao || 'BRL')), 0);

    const ajustesConciliacao = rawData.conciliacoes.reduce((acc, c) => 
      acc + (Number(c.saldo_novo) - Number(c.saldo_anterior)), 0);

    const operationalLossesConfirmed = rawData.perdas.filter(p => p.status === 'CONFIRMADA').reduce((acc, p) => 
      acc + convert(Number(p.valor || 0), bookmakerMoeda.get(p.bookmaker_id || '') || 'BRL'), 0);

    return {
      netProfit,
      roi,
      totalDepositos,
      totalSaques,
      saquesPendentes,
      depositosPendentes,
      saldoBookmakers,
      saldoIrrecuperavel,
      totalStaked,
      grossProfitFromBets,
      lucroGirosGratis,
      lucroCashback,
      ajustesConciliacao,
      operationalLossesConfirmed,
      moedaConsolidacao
    };
  }
}
