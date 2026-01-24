import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CaptacaoRecord {
  parceriaId: string;
  parceiroId: string;
  parceiroNome: string;
  origemTipo: "INDICADOR" | "FORNECEDOR" | "DIRETO";
  responsavelNome: string | null;
  responsavelId: string | null;
  dataEntrada: string;
  status: string;
  // Custos de aquisição
  custoAquisicao: number;
  valorIndicador: number;
  valorParceiro: number;
  valorFornecedor: number;
  comissoesPagas: number;
  // Resultado financeiro
  lucroGerado: number;
  roi: number | null;
  roiStatus: "positivo" | "negativo" | "neutro";
}

export interface HistoricoCaptacaoFilters {
  periodo: { from: Date | null; to: Date | null };
  origemTipo: string | null;
  responsavelId: string | null;
  roiStatus: "positivo" | "negativo" | "todos";
  statusParceiro: string | null;
}

export interface HistoricoCaptacaoKpis {
  totalCaptacoes: number;
  custoTotalAquisicao: number;
  lucroTotalGerado: number;
  roiMedio: number;
  captacoesPositivas: number;
  captacoesNegativas: number;
  // NEW: CAC Pago Real metrics
  cpfsPagos: number;
  cpfsSemCusto: number;
  cacPago: number;
  taxaOrganica: number;
}

interface ResponsavelOption {
  id: string;
  nome: string;
  tipo: "INDICADOR" | "FORNECEDOR";
}

export function useHistoricoCaptacao() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<CaptacaoRecord[]>([]);
  const [responsaveis, setResponsaveis] = useState<ResponsavelOption[]>([]);
  const [filters, setFilters] = useState<HistoricoCaptacaoFilters>({
    periodo: { from: null, to: null },
    origemTipo: null,
    responsavelId: null,
    roiStatus: "todos",
    statusParceiro: null,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch all required data in parallel
      const [custosResult, lucrosResult, movimentacoesResult, indicadoresResult, fornecedoresResult] = await Promise.all([
        // Custos de aquisição por parceria
        supabase.from("v_custos_aquisicao").select("*"),
        // Lucro por parceiro
        supabase.from("v_parceiro_lucro_total").select("parceiro_id, lucro_projetos"),
        // Movimentações para calcular comissões pagas
        supabase
          .from("v_movimentacoes_indicacao_workspace")
          .select("parceria_id, tipo, valor, status")
          .eq("status", "CONFIRMADO"),
        // Indicadores para lista de responsáveis
        supabase.from("indicadores_referral").select("id, nome"),
        // Fornecedores para lista de responsáveis
        supabase.from("fornecedores").select("id, nome"),
      ]);

      if (custosResult.error) throw custosResult.error;

      // Build lucro map by parceiro_id
      const lucroMap: Record<string, number> = {};
      (lucrosResult.data || []).forEach((l: any) => {
        lucroMap[l.parceiro_id] = l.lucro_projetos || 0;
      });

      // Build comissões map by parceria_id
      const comissaoMap: Record<string, number> = {};
      (movimentacoesResult.data || []).forEach((m: any) => {
        if (m.tipo === "COMISSAO_INDICADOR" && m.parceria_id) {
          comissaoMap[m.parceria_id] = (comissaoMap[m.parceria_id] || 0) + m.valor;
        }
      });

      // Process records
      // CORREÇÃO: Evitar duplicação de custos
      // - valor_indicador é o valor ACORDADO para pagar ao indicador (estático)
      // - comissoesPagas são os pagamentos EFETIVOS registrados no cash_ledger
      // Devemos usar apenas UM deles, não somar ambos.
      // Estratégia: Se há comissões pagas no ledger, usar o valor pago (mais preciso).
      //             Caso contrário, usar o valor acordado como estimativa.
      const processedRecords: CaptacaoRecord[] = (custosResult.data || []).map((c: any) => {
        const valorIndicadorAcordado = c.valor_indicador || 0;
        const valorParceiro = c.valor_parceiro || 0;
        const valorFornecedor = c.valor_fornecedor || 0;
        const comissoesPagas = comissaoMap[c.parceria_id] || 0;
        
        // Custo real de indicador: usar o maior entre acordado e pago
        // (Se pagou mais do que acordado, conta o pago; se ainda não pagou, conta o acordado)
        const custoIndicador = Math.max(valorIndicadorAcordado, comissoesPagas);
        
        // Custo total de aquisição = indicador + parceiro + fornecedor (sem duplicar)
        const custoTotal = custoIndicador + valorParceiro + valorFornecedor;
        const lucroGerado = lucroMap[c.parceiro_id] || 0;
        
        // ROI = (lucro / custo) * 100
        let roi: number | null = null;
        let roiStatus: "positivo" | "negativo" | "neutro" = "neutro";
        
        if (custoTotal > 0) {
          roi = ((lucroGerado - custoTotal) / custoTotal) * 100;
          roiStatus = roi > 0 ? "positivo" : roi < 0 ? "negativo" : "neutro";
        } else if (lucroGerado > 0) {
          roi = 100; // Free acquisition with profit = 100% ROI
          roiStatus = "positivo";
        }

        // Determine responsável
        let responsavelNome: string | null = null;
        let responsavelId: string | null = null;

        if (c.origem_tipo === "INDICADOR") {
          responsavelNome = c.indicador_nome;
          responsavelId = c.indicador_id;
        } else if (c.origem_tipo === "FORNECEDOR") {
          responsavelNome = c.fornecedor_nome;
          responsavelId = c.fornecedor_id;
        }

        return {
          parceriaId: c.parceria_id,
          parceiroId: c.parceiro_id,
          parceiroNome: c.parceiro_nome,
          origemTipo: c.origem_tipo || "DIRETO",
          responsavelNome,
          responsavelId,
          dataEntrada: c.data_inicio,
          status: c.status || "ATIVA",
          custoAquisicao: custoTotal,
          valorIndicador: custoIndicador, // Usar o custo efetivo (não duplicado)
          valorParceiro,
          valorFornecedor,
          comissoesPagas,
          lucroGerado,
          roi,
          roiStatus,
        };
      });
      setRecords(processedRecords);

      // Build responsáveis list
      const responsaveisList: ResponsavelOption[] = [
        ...(indicadoresResult.data || []).map((i: any) => ({
          id: i.id,
          nome: i.nome,
          tipo: "INDICADOR" as const,
        })),
        ...(fornecedoresResult.data || []).map((f: any) => ({
          id: f.id,
          nome: f.nome,
          tipo: "FORNECEDOR" as const,
        })),
      ];
      setResponsaveis(responsaveisList);
    } catch (error) {
      console.error("Erro ao carregar histórico de captação:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Período
      if (filters.periodo.from) {
        const dataEntrada = new Date(r.dataEntrada);
        if (dataEntrada < filters.periodo.from) return false;
      }
      if (filters.periodo.to) {
        const dataEntrada = new Date(r.dataEntrada);
        if (dataEntrada > filters.periodo.to) return false;
      }

      // Origem
      if (filters.origemTipo && r.origemTipo !== filters.origemTipo) return false;

      // Responsável
      if (filters.responsavelId && r.responsavelId !== filters.responsavelId) return false;

      // ROI Status
      if (filters.roiStatus === "positivo" && r.roiStatus !== "positivo") return false;
      if (filters.roiStatus === "negativo" && r.roiStatus !== "negativo") return false;

      // Status Parceiro
      if (filters.statusParceiro && r.status !== filters.statusParceiro) return false;

      return true;
    });
  }, [records, filters]);

  // Calculate KPIs from filtered records
  // NEW CAC LOGIC: Only CPFs with cost > 0 enter CAC calculation
  const kpis = useMemo((): HistoricoCaptacaoKpis => {
    const totalCaptacoes = filteredRecords.length;
    const custoTotalAquisicao = filteredRecords.reduce((acc, r) => acc + r.custoAquisicao, 0);
    const lucroTotalGerado = filteredRecords.reduce((acc, r) => acc + r.lucroGerado, 0);
    const captacoesPositivas = filteredRecords.filter((r) => r.roiStatus === "positivo").length;
    const captacoesNegativas = filteredRecords.filter((r) => r.roiStatus === "negativo").length;
    
    // CPFs com custo > 0 (pagos) vs sem custo (orgânicos/migrados)
    const cpfsPagos = filteredRecords.filter((r) => r.custoAquisicao > 0).length;
    const cpfsSemCusto = filteredRecords.filter((r) => r.custoAquisicao === 0).length;
    
    // CAC Pago Real: apenas CPFs com custo financeiro
    const cacPago = cpfsPagos > 0 ? custoTotalAquisicao / cpfsPagos : 0;
    
    // Taxa orgânica
    const taxaOrganica = totalCaptacoes > 0 ? (cpfsSemCusto / totalCaptacoes) * 100 : 0;

    // ROI médio ponderado pelo custo
    let roiMedio = 0;
    if (custoTotalAquisicao > 0) {
      roiMedio = ((lucroTotalGerado - custoTotalAquisicao) / custoTotalAquisicao) * 100;
    }

    return {
      totalCaptacoes,
      custoTotalAquisicao,
      lucroTotalGerado,
      roiMedio,
      captacoesPositivas,
      captacoesNegativas,
      cpfsPagos,
      cpfsSemCusto,
      cacPago,
      taxaOrganica,
    };
  }, [filteredRecords]);

  // Comparativo por origem
  const comparativoPorOrigem = useMemo(() => {
    const byOrigem: Record<string, { count: number; custo: number; lucro: number; roi: number }> = {};

    filteredRecords.forEach((r) => {
      if (!byOrigem[r.origemTipo]) {
        byOrigem[r.origemTipo] = { count: 0, custo: 0, lucro: 0, roi: 0 };
      }
      byOrigem[r.origemTipo].count += 1;
      byOrigem[r.origemTipo].custo += r.custoAquisicao;
      byOrigem[r.origemTipo].lucro += r.lucroGerado;
    });

    // Calculate ROI for each origin
    Object.keys(byOrigem).forEach((key) => {
      const { custo, lucro } = byOrigem[key];
      if (custo > 0) {
        byOrigem[key].roi = ((lucro - custo) / custo) * 100;
      }
    });

    return byOrigem;
  }, [filteredRecords]);

  return {
    loading,
    records: filteredRecords,
    allRecords: records,
    responsaveis,
    filters,
    setFilters,
    kpis,
    comparativoPorOrigem,
    refresh: fetchData,
  };
}
