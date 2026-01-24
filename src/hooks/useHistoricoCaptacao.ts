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

      // Fetch all required data in parallel - usando tabelas diretas, não views com RLS complexo
      const [
        parceriasResult,
        parceirosResult,
        indicacoesResult,
        indicadoresResult,
        fornecedoresResult,
        movimentacoesResult,
        apostasResult,
        bookmarkersResult
      ] = await Promise.all([
        // Parcerias direto da tabela
        supabase.from("parcerias").select(`
          id,
          parceiro_id,
          origem_tipo,
          data_inicio,
          status,
          indicacao_id,
          fornecedor_id,
          valor_indicador,
          valor_parceiro,
          valor_fornecedor
        `),
        // Parceiros para nomes
        supabase.from("parceiros").select("id, nome"),
        // Indicações para mapear indicador_id
        supabase.from("indicacoes").select("id, indicador_id"),
        // Indicadores para nomes
        supabase.from("indicadores_referral").select("id, nome"),
        // Fornecedores para nomes
        supabase.from("fornecedores").select("id, nome"),
        // Movimentações para calcular comissões pagas
        supabase.from("movimentacoes_indicacao")
          .select("parceria_id, tipo, valor, status")
          .eq("status", "CONFIRMADO"),
        // Apostas para calcular lucro
        supabase.from("apostas_unificada")
          .select("bookmaker_id, lucro_prejuizo, resultado")
          .not("resultado", "in", "(PENDENTE,VOID)"),
        // Bookmakers para mapear parceiro_id
        supabase.from("bookmakers").select("id, parceiro_id"),
      ]);

      if (parceriasResult.error) throw parceriasResult.error;

      // Build maps for lookups
      const parceiroNomeMap: Record<string, string> = {};
      (parceirosResult.data || []).forEach((p: any) => {
        parceiroNomeMap[p.id] = p.nome;
      });

      const indicacaoIndicadorMap: Record<string, string> = {};
      (indicacoesResult.data || []).forEach((i: any) => {
        if (i.indicador_id) {
          indicacaoIndicadorMap[i.id] = i.indicador_id;
        }
      });

      const indicadorNomeMap: Record<string, string> = {};
      (indicadoresResult.data || []).forEach((i: any) => {
        indicadorNomeMap[i.id] = i.nome;
      });

      const fornecedorNomeMap: Record<string, string> = {};
      (fornecedoresResult.data || []).forEach((f: any) => {
        fornecedorNomeMap[f.id] = f.nome;
      });

      // Build bookmaker -> parceiro map
      const bookmakerParceiroMap: Record<string, string> = {};
      (bookmarkersResult.data || []).forEach((b: any) => {
        if (b.parceiro_id) {
          bookmakerParceiroMap[b.id] = b.parceiro_id;
        }
      });

      // Build lucro map by parceiro_id (calculated from apostas)
      const lucroMap: Record<string, number> = {};
      (apostasResult.data || []).forEach((a: any) => {
        if (a.bookmaker_id && a.lucro_prejuizo != null) {
          const parceiroId = bookmakerParceiroMap[a.bookmaker_id];
          if (parceiroId) {
            lucroMap[parceiroId] = (lucroMap[parceiroId] || 0) + (a.lucro_prejuizo || 0);
          }
        }
      });

      // Build comissões map by parceria_id
      const comissaoMap: Record<string, number> = {};
      (movimentacoesResult.data || []).forEach((m: any) => {
        if (m.tipo === "COMISSAO_INDICADOR" && m.parceria_id) {
          comissaoMap[m.parceria_id] = (comissaoMap[m.parceria_id] || 0) + m.valor;
        }
      });

      // Process records from parcerias table
      // CORREÇÃO: Evitar duplicação de custos
      const processedRecords: CaptacaoRecord[] = (parceriasResult.data || []).map((p: any) => {
        const valorIndicadorAcordado = p.valor_indicador || 0;
        const valorParceiro = p.valor_parceiro || 0;
        const valorFornecedor = p.valor_fornecedor || 0;
        const comissoesPagas = comissaoMap[p.id] || 0;
        
        // Custo real de indicador: usar o maior entre acordado e pago
        const custoIndicador = Math.max(valorIndicadorAcordado, comissoesPagas);
        
        // Custo total de aquisição = indicador + parceiro + fornecedor (sem duplicar)
        const custoTotal = custoIndicador + valorParceiro + valorFornecedor;
        const lucroGerado = lucroMap[p.parceiro_id] || 0;
        
        // ROI = (lucro / custo) * 100 - PROTEÇÃO CONTRA DIVISÃO POR ZERO
        let roi: number | null = null;
        let roiStatus: "positivo" | "negativo" | "neutro" = "neutro";
        
        if (custoTotal > 0) {
          roi = ((lucroGerado - custoTotal) / custoTotal) * 100;
          roiStatus = roi > 0 ? "positivo" : roi < 0 ? "negativo" : "neutro";
        } else if (lucroGerado > 0) {
          // Aquisição gratuita com lucro = ROI infinito, representamos como 100%
          roi = 100;
          roiStatus = "positivo";
        } else if (lucroGerado < 0) {
          // Aquisição gratuita com prejuízo
          roi = -100;
          roiStatus = "negativo";
        }
        // else: lucro = 0 e custo = 0 -> roi permanece null (neutro)

        // Determine responsável
        let responsavelNome: string | null = null;
        let responsavelId: string | null = null;

        if (p.origem_tipo === "INDICADOR" && p.indicacao_id) {
          const indicadorId = indicacaoIndicadorMap[p.indicacao_id];
          if (indicadorId) {
            responsavelNome = indicadorNomeMap[indicadorId] || null;
            responsavelId = indicadorId;
          }
        } else if (p.origem_tipo === "FORNECEDOR" && p.fornecedor_id) {
          responsavelNome = fornecedorNomeMap[p.fornecedor_id] || null;
          responsavelId = p.fornecedor_id;
        }

        return {
          parceriaId: p.id,
          parceiroId: p.parceiro_id,
          parceiroNome: parceiroNomeMap[p.parceiro_id] || "Parceiro desconhecido",
          origemTipo: p.origem_tipo || "DIRETO",
          responsavelNome,
          responsavelId,
          dataEntrada: p.data_inicio,
          status: p.status || "ATIVA",
          custoAquisicao: custoTotal,
          valorIndicador: custoIndicador,
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

    // Calculate ROI for each origin - PROTEÇÃO CONTRA DIVISÃO POR ZERO
    Object.keys(byOrigem).forEach((key) => {
      const { custo, lucro } = byOrigem[key];
      if (custo > 0) {
        byOrigem[key].roi = ((lucro - custo) / custo) * 100;
      } else if (lucro > 0) {
        // Custo zero com lucro positivo = ROI infinito, representamos como 100%
        byOrigem[key].roi = 100;
      } else if (lucro < 0) {
        // Custo zero com prejuízo
        byOrigem[key].roi = -100;
      }
      // else: custo = 0 e lucro = 0 -> roi permanece 0
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
