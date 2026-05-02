import { useMemo, useCallback } from "react";
import { format, subMonths, subWeeks, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval, getWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLocalDate } from "@/lib/dateUtils";
import type { FinanceiroData } from "@/hooks/useFinanceiroData";
import type {
  CustoAquisicaoDetalhe,
  ComissaoDetalhe,
  BonusDetalhe,
  InfraestruturaDetalhe,
  OperadorDetalhe,
} from "@/components/financeiro/ComposicaoCustosCard";
import type {
  BookmakerPorProjeto,
  ContaPorBanco,
  WalletPorExchange,
  CaixaDetalhe,
} from "@/components/financeiro/MapaPatrimonioCard";

interface FinanceiroCalcParams {
  finData: FinanceiroData;
  dataInicio: string | null;
  dataFim: string | null;
  cotacaoUSD: number;
  cotacoesMap?: Record<string, number>;
  lucroOperacionalApostas: number;
  getCryptoUSDValue: (coin: string, saldoCoin: number, saldoUsdFallback: number) => number;
  convertFromBRL: (valor: number, currency: string) => number;
  /** Função de conversão unificada (mesma do Caixa Operacional) */
  convertUnified?: (valor: number, moedaOrigem: string, moedaDestino: string) => number;
}

export function useFinanceiroCalculations({
  finData,
  dataInicio,
  dataFim,
  cotacaoUSD,
  cotacoesMap = {},
  lucroOperacionalApostas,
  getCryptoUSDValue,
  convertFromBRL,
  convertUnified,
}: FinanceiroCalcParams) {
  const {
    caixaFiat,
    caixaCrypto,
    despesas,
    custos,
    cashLedger,
    despesasAdmin,
    despesasAdminPendentes,
    pagamentosOperador,
    pagamentosOperadorPendentes,
    bookmakersSaldos,
    bookmakersDetalhados,
    apostasHistorico,
    totalParceirosAtivos,
    contasParceiros,
    contasDetalhadas,
    walletsParceiros,
    walletsDetalhadas,
    participacoesPagas,
    parceirosPendentes,
    comissoesPendentes,
    bonusPendentes,
    movimentacoesIndicacao,
  } = finData;

  const formatCurrency = useCallback((value: number, currency: string = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency === "USD" ? "USD" : "BRL",
    }).format(value);
  }, []);

  // Period filter helper
  const filterByPeriod = useCallback(<T extends Record<string, any>>(
    data: T[],
    dateField: keyof T
  ): T[] => {
    if (!dataInicio && !dataFim) return data;
    return data.filter(item => {
      const dateValue = item[dateField] as string | undefined;
      if (!dateValue) return true;
      const itemDate = parseLocalDate(dateValue);
      const start = dataInicio ? startOfMonth(parseLocalDate(dataInicio)) : new Date(0);
      const end = dataFim ? endOfMonth(parseLocalDate(dataFim)) : new Date();
      return isWithinInterval(itemDate, { start, end });
    });
  }, [dataInicio, dataFim]);

  // All filtered data in one memo
  const filtered = useMemo(() => {
    const filteredDespesas = filterByPeriod(despesas, "data_movimentacao");
    const filteredCustos = filterByPeriod(custos, "data_inicio");
    const filteredLedger = filterByPeriod(cashLedger, "data_transacao");
    const filteredDespesasAdmin = filterByPeriod(despesasAdmin.map(d => ({
      ...d,
      origem_caixa_operacional: d.origem_tipo === "CAIXA_OPERACIONAL"
    })), "data_despesa");
    const filteredPagamentosOp = filterByPeriod(pagamentosOperador, "data_pagamento");
    return { filteredDespesas, filteredCustos, filteredLedger, filteredDespesasAdmin, filteredPagamentosOp };
  }, [despesas, custos, cashLedger, despesasAdmin, pagamentosOperador, filterByPeriod]);

  // Helper: converter qualquer moeda para BRL
  // Prioriza convertUnified (mesma função do Caixa Operacional) para garantir paridade
  const convertToBRL = useCallback((valor: number, moeda: string): number => {
    if (!moeda || moeda === 'BRL') return valor;
    // Se temos a função unificada do Caixa, usar ela (fonte única de verdade)
    if (convertUnified) {
      return convertUnified(valor, moeda, 'BRL');
    }
    // Fallback: conversão via cotacoesMap
    if (moeda === 'USD' || moeda === 'USDT' || moeda === 'USDC') return valor * cotacaoUSD;
    const cotacao = cotacoesMap[moeda.toUpperCase()];
    if (cotacao && cotacao > 0.001) return valor * cotacao;
    return valor * cotacaoUSD;
  }, [cotacaoUSD, cotacoesMap, convertUnified]);

  // Saldos base — ALINHADO com Caixa Operacional (PosicaoCapital)
  // Usa Math.max(0, ...) para ignorar saldos negativos (mesma regra do Caixa)
  const saldos = useMemo(() => {
    // Caixa Operacional: consolidar TODAS as moedas FIAT
    let capitalOperacional = 0;
    const saldoBRL = caixaFiat.find(f => f.moeda === "BRL")?.saldo || 0;
    const saldoUSD = caixaFiat.find(f => f.moeda === "USD")?.saldo || 0;
    caixaFiat.forEach(f => {
      capitalOperacional += convertToBRL(f.saldo, f.moeda);
    });
    const totalCryptoUSD = caixaCrypto.reduce((acc, c) => acc + getCryptoUSDValue(c.coin, c.saldo_coin, c.saldo_usd), 0);
    capitalOperacional += totalCryptoUSD * cotacaoUSD;
    
    // Bookmakers: consolidar TODAS as moedas via cotação real
    // ALINHAMENTO: Usar Math.max(0) igual ao Caixa Operacional
    const saldoBookmakersBRL = bookmakersSaldos.filter(b => !b.moeda || b.moeda === "BRL").reduce((acc, b) => acc + Math.max(0, b.saldo_atual || 0), 0);
    const saldoBookmakersUSD = bookmakersSaldos.filter(b => b.moeda === "USD" || b.moeda === "USDT").reduce((acc, b) => acc + Math.max(0, b.saldo_atual || 0), 0);
    const saldoBookmakersEUR = bookmakersSaldos.filter(b => b.moeda === "EUR").reduce((acc, b) => acc + Math.max(0, b.saldo_atual || 0), 0);
    let saldoBookmakers = 0;
    bookmakersSaldos.forEach(b => {
      saldoBookmakers += convertToBRL(Math.max(0, b.saldo_atual || 0), b.moeda || 'BRL');
    });
    const hasBookmakersUSD = saldoBookmakersUSD > 0 || saldoBookmakersEUR > 0;
    
    // Contas Parceiros: consolidar por moeda com conversão real
    // ALINHAMENTO: Usar Math.max(0) igual ao Caixa Operacional
    let totalContasParceiros = 0;
    contasParceiros.forEach((c: any) => {
      totalContasParceiros += convertToBRL(Math.max(0, c.saldo || 0), c.moeda || 'BRL');
    });

    // Wallets Parceiros: Math.max(0) para paridade com Caixa
    const totalWalletsParceiros = walletsParceiros.reduce((acc: number, w: any) => acc + (Math.max(0, w.saldo_usd || 0) * cotacaoUSD), 0);
    
    return { saldoBRL, saldoUSD, totalCryptoUSD, capitalOperacional, saldoBookmakersBRL, saldoBookmakersUSD, saldoBookmakersEUR, saldoBookmakers, hasBookmakersUSD, totalContasParceiros, totalWalletsParceiros };
  }, [caixaFiat, caixaCrypto, bookmakersSaldos, contasParceiros, walletsParceiros, cotacaoUSD, getCryptoUSDValue, convertToBRL]);

  // Cost calculations
  const costs = useMemo(() => {
    const { filteredDespesas, filteredDespesasAdmin, filteredPagamentosOp } = filtered;
    
    const totalCustosAquisicao = filteredDespesas.filter((d: any) => d.tipo === "PAGTO_PARCEIRO" || d.tipo === "PAGTO_FORNECEDOR").reduce((acc: number, d: any) => acc + d.valor, 0);
    const totalComissoes = filteredDespesas.filter((d: any) => d.tipo === "COMISSAO_INDICADOR").reduce((acc: number, d: any) => acc + d.valor, 0);
    const totalBonus = filteredDespesas.filter((d: any) => d.tipo === "BONUS_INDICADOR").reduce((acc: number, d: any) => acc + d.valor, 0);
    const totalDespesasIndicacao = totalComissoes + totalBonus;
    const totalRenovacoes = filteredDespesas.filter((d: any) => d.tipo === "RENOVACAO_PARCERIA").reduce((acc: number, d: any) => acc + d.valor, 0);
    const totalBonificacoes = filteredDespesas.filter((d: any) => d.tipo === "BONIFICACAO_ESTRATEGICA").reduce((acc: number, d: any) => acc + d.valor, 0);
    const totalCustosRetencao = totalRenovacoes + totalBonificacoes;
    const totalCustosOperacionais = totalCustosAquisicao + totalDespesasIndicacao + totalCustosRetencao;
    
    const despesasInfraestrutura = filteredDespesasAdmin.filter((d: any) => d.grupo !== 'RECURSOS_HUMANOS');
    const despesasRH = filteredDespesasAdmin.filter((d: any) => d.grupo === 'RECURSOS_HUMANOS');
    const totalDespesasAdmin = despesasInfraestrutura.reduce((acc: number, d: any) => acc + d.valor, 0);
    const totalDespesasRH = despesasRH.reduce((acc: number, d: any) => acc + d.valor, 0);
    const totalPagamentosOperadores = filteredPagamentosOp.reduce((acc: number, p: any) => acc + p.valor, 0) + totalDespesasRH;
    const custoSustentacao = totalCustosOperacionais + totalDespesasAdmin + totalPagamentosOperadores;
    
    return {
      totalCustosAquisicao, totalComissoes, totalBonus, totalDespesasIndicacao,
      totalCustosRetencao, totalCustosOperacionais, totalDespesasAdmin, totalDespesasRH,
      totalPagamentosOperadores, custoSustentacao,
      despesasInfraestrutura, despesasRH,
    };
  }, [filtered]);

  // Movimentação de capital
  const movimentacao = useMemo(() => {
    const { filteredLedger } = filtered;
    const depositosBookmakersPeriodo = filteredLedger.filter((l: any) => l.moeda === "BRL" && l.tipo_transacao === "DEPOSITO").reduce((acc: number, l: any) => acc + l.valor, 0);
    const saquesBookmakersPeriodo = filteredLedger.filter((l: any) => l.moeda === "BRL" && l.tipo_transacao === "SAQUE").reduce((acc: number, l: any) => acc + l.valor, 0);
    return { depositosBookmakersPeriodo, saquesBookmakersPeriodo };
  }, [filtered]);

  // Composição de custos
  const composicaoCustos = useMemo(() => {
    return [
      { name: "Custos Aquisição", value: costs.totalCustosAquisicao, color: "#3B82F6" },
      { name: "Comissões", value: costs.totalComissoes, color: "#22C55E" },
      { name: "Bônus", value: costs.totalBonus, color: "#F59E0B" },
      { name: "Infraestrutura", value: costs.totalDespesasAdmin, color: "#8B5CF6" },
      { name: "Operadores", value: costs.totalPagamentosOperadores, color: "#06B6D4" },
    ].filter(c => c.value > 0);
  }, [costs]);

  // Detalhes drill-down
  const custosAquisicaoDetalhes = useMemo((): CustoAquisicaoDetalhe[] => {
    const { filteredDespesas } = filtered;
    const parceiroTotal = filteredDespesas.filter((d: any) => d.tipo === "PAGTO_PARCEIRO").reduce((acc: number, d: any) => acc + d.valor, 0);
    const fornecedorTotal = filteredDespesas.filter((d: any) => d.tipo === "PAGTO_FORNECEDOR").reduce((acc: number, d: any) => acc + d.valor, 0);
    const detalhes: CustoAquisicaoDetalhe[] = [];
    if (parceiroTotal > 0) detalhes.push({ tipo: "PAGTO_PARCEIRO", valor: parceiroTotal });
    if (fornecedorTotal > 0) detalhes.push({ tipo: "PAGTO_FORNECEDOR", valor: fornecedorTotal });
    return detalhes;
  }, [filtered]);

  const comissoesDetalhes = useMemo((): ComissaoDetalhe[] => {
    const agrupado: Record<string, { indicadorNome: string; valor: number }> = {};
    filtered.filteredDespesas.filter((d: any) => d.tipo === "COMISSAO_INDICADOR").forEach((d: any) => {
      const indicadorNome = d.indicadores_referral?.nome || "Indicador não identificado";
      if (!agrupado[indicadorNome]) agrupado[indicadorNome] = { indicadorNome, valor: 0 };
      agrupado[indicadorNome].valor += d.valor;
    });
    return Object.values(agrupado).sort((a, b) => b.valor - a.valor);
  }, [filtered]);

  const bonusDetalhes = useMemo((): BonusDetalhe[] => {
    const agrupado: Record<string, { indicadorNome: string; valor: number }> = {};
    filtered.filteredDespesas.filter((d: any) => d.tipo === "BONUS_INDICADOR").forEach((d: any) => {
      const indicadorNome = d.indicadores_referral?.nome || "Indicador não identificado";
      if (!agrupado[indicadorNome]) agrupado[indicadorNome] = { indicadorNome, valor: 0 };
      agrupado[indicadorNome].valor += d.valor;
    });
    return Object.values(agrupado).sort((a, b) => b.valor - a.valor);
  }, [filtered]);

  const infraestruturaDetalhes = useMemo((): InfraestruturaDetalhe[] => {
    const agrupado: Record<string, { categoria: string; valor: number; valorUSD: number; hasCrypto: boolean }> = {};
    costs.despesasInfraestrutura.forEach((d: any) => {
      const categoria = d.categoria || "Outros";
      const isCrypto = d.tipo_moeda === "CRYPTO";
      if (!agrupado[categoria]) agrupado[categoria] = { categoria, valor: 0, valorUSD: 0, hasCrypto: false };
      agrupado[categoria].valor += d.valor;
      if (isCrypto) {
        agrupado[categoria].hasCrypto = true;
        const valorUSD = d.qtd_coin ?? (d.cotacao ? d.valor / d.cotacao : convertFromBRL(d.valor, "USD"));
        agrupado[categoria].valorUSD += valorUSD;
      }
    });
    return Object.values(agrupado).sort((a, b) => b.valor - a.valor);
  }, [costs.despesasInfraestrutura, convertFromBRL]);

  const operadoresDetalhes = useMemo((): OperadorDetalhe[] => {
    const agrupado: Record<string, { operadorNome: string; valor: number }> = {};
    filtered.filteredPagamentosOp.forEach((p: any) => {
      const operadorNome = p.operadores?.nome || "Operador não identificado";
      if (!agrupado[operadorNome]) agrupado[operadorNome] = { operadorNome, valor: 0 };
      agrupado[operadorNome].valor += p.valor;
    });
    costs.despesasRH.forEach((d: any) => {
      const operadorNome = d.operadores?.nome || "Operador não identificado";
      let subcategoriaLabel = "Outros";
      
      if (d.subcategoria_rh) {
        const subcatMap: Record<string, string> = { 
          SALARIO_MENSAL: "Salário Mensal", 
          COMISSAO: "Comissão", 
          ADIANTAMENTO: "Adiantamento", 
          BONIFICACAO: "Bonificação" 
        };
        subcategoriaLabel = subcatMap[d.subcategoria_rh] || d.subcategoria_rh;
      } else if (d.categoria) {
        // Se a categoria já contém "Recursos Humanos - ", limpar para não ficar redundante
        subcategoriaLabel = d.categoria.replace("Recursos Humanos - ", "");
      }
      
      const key = `RH - ${operadorNome} (${subcategoriaLabel})`;
      if (!agrupado[key]) agrupado[key] = { operadorNome: key, valor: 0 };
      agrupado[key].valor += d.valor;
    });
    return Object.values(agrupado).sort((a, b) => b.valor - a.valor);
  }, [filtered.filteredPagamentosOp, costs.despesasRH]);

  // Mapa patrimônio details
  const bookmakersPorProjeto = useMemo((): BookmakerPorProjeto[] => {
    const agrupado: Record<string, { projetoId: string | null; projetoNome: string; saldoBRL: number; saldoUSD: number }> = {};
    bookmakersDetalhados.forEach((b: any) => {
      const projetoId = b.projeto_id || null;
      const projetoNome = b.projetos?.nome || "Sem Projeto";
      const key = projetoId || "sem_projeto";
      const saldoLiquido = b.saldo_atual || 0;
      const moeda = b.moeda || "BRL";
      const isUSD = moeda === "USD" || moeda === "USDT";
      if (!agrupado[key]) agrupado[key] = { projetoId, projetoNome, saldoBRL: 0, saldoUSD: 0 };
      if (isUSD) agrupado[key].saldoUSD += saldoLiquido;
      else agrupado[key].saldoBRL += saldoLiquido;
    });
    return Object.values(agrupado).filter(p => p.saldoBRL !== 0 || p.saldoUSD !== 0).map(p => ({ ...p, saldo: p.saldoBRL + (p.saldoUSD * cotacaoUSD) }));
  }, [bookmakersDetalhados, cotacaoUSD]);

  const contasPorBanco = useMemo((): ContaPorBanco[] => {
    return contasDetalhadas.filter((c: any) => (c.saldo || 0) !== 0).map((c: any) => ({
      bancoNome: c.banco || "Banco não informado",
      parceiroNome: c.parceiro_nome || "Parceiro não informado",
      saldo: c.saldo || 0,
      qtdContas: 1,
      moeda: c.moeda || "BRL",
    })).sort((a: any, b: any) => b.saldo - a.saldo);
  }, [contasDetalhadas]);

  const walletsPorExchange = useMemo((): WalletPorExchange[] => {
    const agrupado: Record<string, { exchange: string; saldoUsd: number }> = {};
    walletsDetalhadas.forEach((w: any) => {
      const exchange = w.exchange || "Exchange não informada";
      if (!agrupado[exchange]) agrupado[exchange] = { exchange, saldoUsd: 0 };
      agrupado[exchange].saldoUsd += w.saldo_usd || 0;
    });
    return Object.values(agrupado);
  }, [walletsDetalhadas]);

  const caixaDetalhes = useMemo((): CaixaDetalhe[] => {
    const detalhes: CaixaDetalhe[] = [];
    if (saldos.saldoBRL > 0) detalhes.push({ tipo: "BRL", nome: "Real (BRL)", valor: saldos.saldoBRL, valorBRL: saldos.saldoBRL });
    if (saldos.saldoUSD > 0) detalhes.push({ tipo: "USD", nome: "Dólar (USD)", valor: saldos.saldoUSD, valorBRL: saldos.saldoUSD * cotacaoUSD });
    caixaCrypto.forEach(c => {
      const valorUSD = getCryptoUSDValue(c.coin, c.saldo_coin, c.saldo_usd);
      if (valorUSD > 0) detalhes.push({ tipo: "CRYPTO", nome: c.coin, valor: c.saldo_coin, valorBRL: valorUSD * cotacaoUSD });
    });
    return detalhes;
  }, [saldos.saldoBRL, saldos.saldoUSD, caixaCrypto, cotacaoUSD, getCryptoUSDValue]);

  // Previous month costs
  const totalCustosAnterior = useMemo(() => {
    const mesAnterior = subMonths(new Date(), 1);
    const keyAnterior = format(mesAnterior, "yyyy-MM");
    const custosAnt = despesas.filter((d: any) => d.data_movimentacao && format(parseLocalDate(d.data_movimentacao), "yyyy-MM") === keyAnterior).reduce((acc: number, d: any) => acc + d.valor, 0);
    const despesasAdmAnt = despesasAdmin.filter((d: any) => d.data_despesa && format(parseLocalDate(d.data_despesa), "yyyy-MM") === keyAnterior).reduce((acc: number, d: any) => acc + d.valor, 0);
    const opAnt = pagamentosOperador.filter((p: any) => p.data_pagamento && format(parseLocalDate(p.data_pagamento), "yyyy-MM") === keyAnterior).reduce((acc: number, p: any) => acc + p.valor, 0);
    return custosAnt + despesasAdmAnt + opAnt;
  }, [despesas, despesasAdmin, pagamentosOperador]);

  // Compromissos pendentes
  const compromissosPendentesData = useMemo(() => {
    const data = {
      despesasAdmin: despesasAdminPendentes.reduce((acc: number, d: any) => acc + d.valor, 0),
      pagamentosOperador: pagamentosOperadorPendentes.reduce((acc: number, p: any) => acc + p.valor, 0),
      pagamentosParcerias: parceirosPendentes.valorTotal,
      comissoesIndicador: comissoesPendentes.valorTotal,
      bonusIndicador: bonusPendentes.valorTotal,
      total: 0,
    };
    data.total = data.despesasAdmin + data.pagamentosOperador + data.pagamentosParcerias + data.comissoesIndicador + data.bonusIndicador;
    return data;
  }, [despesasAdminPendentes, pagamentosOperadorPendentes, parceirosPendentes, comissoesPendentes, bonusPendentes]);

  // Rentabilidade
  const totalLucroParceiros = lucroOperacionalApostas > 0 ? lucroOperacionalApostas : 0;
  
  const diasMedioAquisicao = useMemo(() => {
    if (custos.length === 0) return 1;
    const hoje = new Date();
    const diasPorParceria = custos.filter((c: any) => c.data_inicio).map((c: any) => {
      const dataInicio = parseLocalDate(c.data_inicio);
      return Math.max(1, Math.floor((hoje.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24)));
    });
    if (diasPorParceria.length === 0) return 1;
    return Math.max(1, Math.round(diasPorParceria.reduce((a: number, d: number) => a + d, 0) / diasPorParceria.length));
  }, [custos]);

  // Histórico mensal
  const historicoMensal = useMemo(() => {
    const months: Record<string, { mes: string; label: string; lucroApostas: number; custosOperacionais: number; despesasAdmin: number; participacoes: number; patrimonio: number }> = {};
    for (let i = 11; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const key = format(date, "yyyy-MM");
      months[key] = { mes: key, label: format(date, "MMM/yy", { locale: ptBR }), lucroApostas: 0, custosOperacionais: 0, despesasAdmin: 0, participacoes: 0, patrimonio: 0 };
    }
    apostasHistorico.forEach((aposta: any) => {
      if (aposta.data_aposta && aposta.lucro_prejuizo !== null) {
        const key = format(parseLocalDate(aposta.data_aposta), "yyyy-MM");
        if (months[key]) months[key].lucroApostas += aposta.lucro_prejuizo;
      }
    });
    despesas.forEach((d: any) => {
      if (d.data_movimentacao) { const key = format(parseLocalDate(d.data_movimentacao), "yyyy-MM"); if (months[key]) months[key].custosOperacionais += d.valor || 0; }
    });
    pagamentosOperador.forEach((p: any) => {
      if (p.data_pagamento) { const key = format(parseLocalDate(p.data_pagamento), "yyyy-MM"); if (months[key]) months[key].custosOperacionais += p.valor || 0; }
    });
    despesasAdmin.forEach((d: any) => {
      if (d.data_despesa) { const key = format(parseLocalDate(d.data_despesa), "yyyy-MM"); if (months[key]) months[key].despesasAdmin += d.valor || 0; }
    });
    participacoesPagas.forEach((p: any) => {
      if (p.data_pagamento) { const key = format(parseLocalDate(p.data_pagamento), "yyyy-MM"); if (months[key]) months[key].participacoes += p.valor_participacao || 0; }
    });
    let patrimonioAcumulado = 0;
    const arr = Object.values(months);
    arr.forEach((m, i) => {
      const lucroLiquido = m.lucroApostas - m.custosOperacionais - m.despesasAdmin - m.participacoes;
      patrimonioAcumulado += lucroLiquido;
      arr[i].patrimonio = patrimonioAcumulado;
    });
    return arr.map(m => ({
      ...m,
      resultado: m.lucroApostas,
      custos: m.custosOperacionais,
      despesas: m.despesasAdmin,
      lucroLiquido: m.lucroApostas - m.custosOperacionais - m.despesasAdmin - m.participacoes,
      totalCustos: m.custosOperacionais + m.despesasAdmin + m.participacoes,
    }));
  }, [apostasHistorico, despesas, despesasAdmin, pagamentosOperador, participacoesPagas]);

  return {
    formatCurrency,
    saldos,
    costs,
    movimentacao,
    composicaoCustos,
    custosAquisicaoDetalhes,
    comissoesDetalhes,
    bonusDetalhes,
    infraestruturaDetalhes,
    operadoresDetalhes,
    bookmakersPorProjeto,
    contasPorBanco,
    walletsPorExchange,
    caixaDetalhes,
    totalCustosAnterior,
    compromissosPendentesData,
    totalLucroParceiros,
    diasMedioAquisicao,
    historicoMensal,
    totalParceirosAtivos,
    despesasAdmin: [
      ...filtered.filteredDespesasAdmin,
      ...filterByPeriod(
        (finData.pagamentosOperador || []).map((p: any) => ({
          id: `pagto-op-${p.id}`,
          categoria: 'RECURSOS_HUMANOS',
          grupo: 'RECURSOS_HUMANOS',
          descricao: p.descricao,
          valor: p.valor,
          data_despesa: p.data_transacao || p.data_pagamento || p.data_movimentacao,
          status: p.status || 'CONFIRMADO',
          _fromLedger: true,
          operador_id: p.operador_id,
          operadores: p.operadores,
          origem_tipo: p.origem_tipo,
          origem_caixa_operacional: p.origem_tipo === "CAIXA_OPERACIONAL",
          origem_parceiro_id: p.origem_parceiro_id,
          origem_conta_bancaria_id: p.origem_conta_bancaria_id,
          origem_wallet_id: p.origem_wallet_id,
          tipo_moeda: p.tipo_moeda,
          coin: p.coin,
          qtd_coin: p.qtd_coin,
          cotacao: p.cotacao,
        })),
        'data_despesa'
      ),
    ],
    dataInicio,
    dataFim,
  };
}
