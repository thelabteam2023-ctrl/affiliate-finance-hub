import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MesFinanceiro } from "@/hooks/useFinanceiroMensal";
import type { ExposicaoFinanceira } from "@/hooks/useExposicaoFinanceira";

export interface OcorrenciaResumo {
  id: string;
  titulo: string;
  tipo: string;
  valorBRL: number;
  moeda: string;
  is_scan?: boolean;
  fonte?: "ledger" | "ocorrencia";
}

export interface ResumoMetricas {
  fluxoLiquido: number;
  custoTotal: number;
  resultadoLiquido: number;
  custosPorCategoria: {
    cac: number;
    comissoes: number;
    bonus: number;
    infra: number;
    operadores: number;
    participacoes: number;
  };
  perdasTotal: number;
  perdasErro: boolean;
  moedasSemCotacao: number;
  lucroReal: number | null;
  ocorrencias: OcorrenciaResumo[];
}

export interface ResumoOperacionalResult {
  metricas: ResumoMetricas | null;
  texto: string | null;
  periodo: { label: string; dataInicio: string; dataFim: string } | null;
  loading: boolean;
  error: string | null;
  run: () => Promise<void>;
}

interface Params {
  mesesFinanceiro: MesFinanceiro[];
  workspaceId: string | null;
  janelaLabel: string;
  /** Engine canônica de Perdas no Período (mesma do card Exposição & Perdas). */
  exposicao: ExposicaoFinanceira;
}

export function useResumoOperacional({
  mesesFinanceiro,
  workspaceId,
  janelaLabel,
  exposicao,
}: Params): ResumoOperacionalResult {
  const [texto, setTexto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<{ label: string; dataInicio: string; dataFim: string } | null>(null);
  const [metricas, setMetricas] = useState<ResumoMetricas | null>(null);

  // Janela = meses não-baseline
  const meses = mesesFinanceiro.filter((m) => !m.isBaseline);
  const firstKey = meses[0]?.mesKey ?? null;
  const lastKey = meses[meses.length - 1]?.mesKey ?? null;
  const dataInicio = firstKey ? `${firstKey}-01` : null;
  const dataFim = lastKey
    ? (() => {
        const [y, mo] = lastKey.split("-").map(Number);
        const d = new Date(Date.UTC(y, mo, 0));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      })()
    : null;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTexto(null);
    try {
      // 1. Agrega métricas do período (não-baseline)
      const sum = (k: keyof MesFinanceiro) =>
        meses.reduce((acc, m) => acc + (Number((m as any)[k]) || 0), 0);
      const fluxoLiquido = sum("fluxoLiquido");
      const custoTotal = sum("custoTotal");
      const resultadoLiquido = sum("resultadoLiquido");
      const custosPorCategoria = {
        cac: sum("cac"),
        comissoes: sum("comissoes"),
        bonus: sum("bonus"),
        infra: sum("infra"),
        operadores: sum("operadores"),
        participacoes: sum("participacoes"),
      };

      // 2. Perdas — usa engine canônica (mesma do card Exposição & Perdas):
      //    inclui PERDA_OPERACIONAL do cash_ledger (SCAN) + ocorrências resolvidas
      //    com perda ainda não materializadas no ledger. Sem duplicidade.
      const perdasErro = false;
      const moedasSemCotacao = 0;
      const perdasTotal = exposicao.totalPerdasPeriodo;
      const ocorrencias: OcorrenciaResumo[] = exposicao.detalhes.perdas.map((p) => ({
        id: p.id,
        titulo: p.descricao,
        tipo: p.is_scan ? "scan" : p.fonte,
        valorBRL: p.valor,
        moeda: p.moeda,
        is_scan: !!p.is_scan,
        fonte: p.fonte,
      }));

      const lucroReal = perdasErro ? null : resultadoLiquido - perdasTotal;

      const met: ResumoMetricas = {
        fluxoLiquido,
        custoTotal,
        resultadoLiquido,
        custosPorCategoria,
        perdasTotal,
        perdasErro,
        moedasSemCotacao,
        lucroReal,
        ocorrencias,
      };
      setMetricas(met);
      const per = {
        label: janelaLabel,
        dataInicio: dataInicio || "",
        dataFim: dataFim || "",
      };
      setPeriodo(per);

      // 3. Chama edge function
      const { data, error: fnErr } = await supabase.functions.invoke("resumo-operacional", {
        body: {
          periodo: per,
          metricas: {
            fluxoLiquido: met.fluxoLiquido,
            custoTotal: met.custoTotal,
            resultadoLiquido: met.resultadoLiquido,
            custosPorCategoria: met.custosPorCategoria,
            perdasTotal: met.perdasTotal,
            perdasErro: met.perdasErro,
            moedasSemCotacao: met.moedasSemCotacao,
            lucroReal: met.lucroReal,
            ocorrencias: met.ocorrencias.map((o) => ({
              titulo: o.titulo,
              tipo: o.tipo,
              valorBRL: o.valorBRL,
            })),
          },
        },
      });
      if (fnErr) throw fnErr;
      setTexto((data as any)?.texto || "(resposta vazia)");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [meses, exposicao, janelaLabel, dataInicio, dataFim]);

  return { metricas, texto, periodo, loading, error, run };
}