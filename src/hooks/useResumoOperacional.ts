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

export type ResumoPeriodoTipo =
  | "janela_temporal"
  | "mes_atual"
  | "mes_anterior"
  | "ano_atual"
  | "todo_historico"
  | "customizado";

export interface ResumoRange {
  dataInicio: string; // YYYY-MM-DD
  dataFim: string; // YYYY-MM-DD
  tipo: ResumoPeriodoTipo;
  label: string;
}

export interface ExposicaoPendenteResumo {
  emDisputa: number;
  irrecuperavel: number;
  countDisputa: number;
  countIrrecuperavel: number;
  bySegment: {
    bookmakers: number;
    caixaOp: number;
    wallets: number;
    contasParc: number;
  };
  topOcorrencias: Array<{ label: string; valor: number; segmento: string }>;
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
  /** Snapshot atual de exposição pendente (não depende do período). */
  exposicaoPendente: ExposicaoPendenteResumo;
  /** Lucro real considerando 100% de perda das disputas + irrecuperável. */
  lucroRealWorstCase: number | null;
  /** True quando algum mesKey do array não cobriu integralmente o intervalo. */
  janelaInsuficiente: boolean;
}

export interface ResumoOperacionalResult {
  metricas: ResumoMetricas | null;
  texto: string | null;
  periodo: ResumoRange | null;
  loading: boolean;
  error: string | null;
  run: () => Promise<void>;
}

interface Params {
  mesesFinanceiro: MesFinanceiro[];
  workspaceId: string | null;
  /** Range escolhido pelo usuário (controlado pelo diálogo). */
  range: ResumoRange;
  /** Engine canônica — mesmo filtro de janela passado a useExposicaoFinanceira. */
  exposicao: ExposicaoFinanceira;
}

function mesKeyOverlapsRange(mesKey: string, ini: string, fim: string): boolean {
  const [y, mo] = mesKey.split("-").map(Number);
  if (!y || !mo) return false;
  const mesInicio = `${mesKey}-01`;
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const mesFim = `${mesKey}-${String(lastDay).padStart(2, "0")}`;
  return mesInicio <= fim && mesFim >= ini;
}

export function useResumoOperacional({
  mesesFinanceiro,
  workspaceId,
  range,
  exposicao,
}: Params): ResumoOperacionalResult {
  const [texto, setTexto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<ResumoRange | null>(null);
  const [metricas, setMetricas] = useState<ResumoMetricas | null>(null);

  const run = useCallback(async () => {
    if (!range?.dataInicio || !range?.dataFim) {
      setError("Período inválido.");
      return;
    }
    setLoading(true);
    setError(null);
    setTexto(null);
    try {
      // 1. Agrega métricas do período escolhido. Filtra meses (não-baseline) cujo
      //    intervalo intersecta o range. Para presets alinhados a mês (mes_atual,
      //    mes_anterior, ano_atual, todo_historico, janela_temporal) o filtro é exato.
      //    Para custom, meses parcialmente cobertos entram inteiros — comunicado na UI.
      const mesesNoRange = mesesFinanceiro.filter(
        (m) => !m.isBaseline && mesKeyOverlapsRange(m.mesKey, range.dataInicio, range.dataFim),
      );

      // Verifica se a janela carregada cobre o range; se não, sinaliza.
      const naoBaseline = mesesFinanceiro.filter((m) => !m.isBaseline);
      const firstLoaded = naoBaseline[0]?.mesKey;
      const lastLoaded = naoBaseline[naoBaseline.length - 1]?.mesKey;
      const firstLoadedISO = firstLoaded ? `${firstLoaded}-01` : null;
      const lastLoadedISO = lastLoaded
        ? (() => {
            const [y, mo] = lastLoaded.split("-").map(Number);
            const d = new Date(Date.UTC(y, mo, 0));
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
          })()
        : null;
      const janelaInsuficiente =
        !!firstLoadedISO &&
        !!lastLoadedISO &&
        (range.dataInicio < firstLoadedISO || range.dataFim > lastLoadedISO);

      const sum = (k: keyof MesFinanceiro) =>
        mesesNoRange.reduce((acc, m) => acc + (Number((m as any)[k]) || 0), 0);
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

      // 3. Exposição pendente (snapshot — não depende de período)
      const disputaItems = [
        ...exposicao.detalhes.disputaBookmakers.map((o) => ({
          label: o.bookmaker_nome || o.titulo,
          valor: o.valor,
          segmento: "bookmaker",
        })),
        ...exposicao.detalhes.disputaContasParceiros.map((o) => ({
          label: `${o.conta_titular ?? "—"} (${o.conta_banco ?? "—"})`,
          valor: o.valor,
          segmento: "conta-parceiro",
        })),
        ...exposicao.detalhes.disputaWallets.map((o) => ({
          label: o.wallet_label || o.titulo,
          valor: o.valor,
          segmento: "wallet",
        })),
        ...exposicao.detalhes.disputaCaixa.map((o) => ({
          label: `${o.conta_titular ?? "—"} (${o.conta_banco ?? "—"})`,
          valor: o.valor,
          segmento: "caixa",
        })),
      ];
      const topOcorrencias = disputaItems
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 5);
      const exposicaoPendente: ExposicaoPendenteResumo = {
        emDisputa: exposicao.totalEmDisputa,
        irrecuperavel: exposicao.totalIrrecuperavel,
        countDisputa: disputaItems.length,
        countIrrecuperavel: exposicao.countIrrecuperavel,
        bySegment: {
          bookmakers: exposicao.bySegmentDisputa.bookmakers || 0,
          caixaOp: exposicao.bySegmentDisputa["caixa-op"] || 0,
          wallets: exposicao.bySegmentDisputa.wallets || 0,
          contasParc: exposicao.bySegmentDisputa["contas-parc"] || 0,
        },
        topOcorrencias,
      };

      const lucroRealWorstCase =
        lucroReal === null ? null : lucroReal - exposicaoPendente.emDisputa - exposicaoPendente.irrecuperavel;

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
        exposicaoPendente,
        lucroRealWorstCase,
        janelaInsuficiente,
      };
      setMetricas(met);
      setPeriodo(range);

      // 4. Chama edge function
      const { data, error: fnErr } = await supabase.functions.invoke("resumo-operacional", {
        body: {
          periodo: range,
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
            exposicaoPendente: met.exposicaoPendente,
            lucroRealWorstCase: met.lucroRealWorstCase,
            janelaInsuficiente: met.janelaInsuficiente,
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
  }, [mesesFinanceiro, exposicao, range]);

  return { metricas, texto, periodo, loading, error, run };
}