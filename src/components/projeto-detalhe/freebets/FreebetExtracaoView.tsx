import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  TrendingUp,
  Target,
  Percent,
  Gift,
  CheckCircle2,
  Clock,
  XCircle,
  LayoutGrid,
  List,
  Activity,
} from "lucide-react";
import { FreebetContaminationAlert } from "./FreebetContaminationAlert";
import { useFreebetContamination } from "@/hooks/useFreebetContamination";
import { ApostaOperacionalFreebet, FreebetRecebida } from "./types";
import { CurvaExtracaoChart } from "./CurvaExtracaoChart";
import { FreebetApostasList } from "./FreebetApostasList";
import { FreebetApostaCard } from "./FreebetApostaCard";
import { OperationsSubTabHeader } from "../operations";
import { HistoryDimensionalFilter, useHistoryDimensionalFilter } from "../operations";

export interface FreebetExtracaoMetrics {
  valorFreebetUsado: number;
  valorExtraido: number;
  taxaExtracao: number;
  totalOperacoes: number;
  operacoesGanhas: number;
  operacoesPerdidas: number;
  operacoesPendentes: number;
  winRate: number;
  roiMedio: number;
}

interface FreebetExtracaoViewProps {
  projetoId: string;
  apostas: ApostaOperacionalFreebet[];
  freebets: FreebetRecebida[];
  formatCurrency: (value: number) => string;
  dateRange: { start: Date; end: Date } | null;
  onResultadoUpdated: () => void;
  onEditClick: (aposta: ApostaOperacionalFreebet) => void;
}

export function FreebetExtracaoView({
  projetoId,
  apostas,
  freebets,
  formatCurrency,
  dateRange,
  onResultadoUpdated,
  onEditClick,
}: FreebetExtracaoViewProps) {
  const [subTab, setSubTab] = useState<"abertas" | "historico">("abertas");
  const [viewMode, setViewMode] = useState<"cards" | "list">("list");
  
  // Filtros dimensionais independentes para o histórico
  const { dimensionalFilter, setDimensionalFilter } = useHistoryDimensionalFilter();

  // Hook de contaminação
  const {
    isContaminated,
    contaminatedBookmakers,
    totalContaminatedBets,
    estrategiasEncontradas,
    loading: contaminationLoading,
  } = useFreebetContamination({ projetoId });

  // Filtrar APENAS apostas de extração pura
  // Critério: estrategia = EXTRACAO_FREEBET OU (contexto_operacional = FREEBET E tipo_freebet não null E NÃO gerou_freebet)
  const apostasExtracao = useMemo(() => {
    return apostas.filter((ap) => {
      // Estratégia dedicada de extração
      if (ap.estrategia === "EXTRACAO_FREEBET") return true;
      
      // Fallback: usa freebet + não é qualificadora
      const usaFreebet = ap.contexto_operacional === "FREEBET" || ap.tipo_freebet;
      const naoEQualificadora = !ap.gerou_freebet;
      
      return usaFreebet && naoEQualificadora;
    });
  }, [apostas]);

  // Métricas de extração PURAS
  const metrics = useMemo((): FreebetExtracaoMetrics => {
    const freebetsLiberadas = freebets.filter((fb) => fb.status === "LIBERADA");
    const valorFreebetUsado = freebetsLiberadas
      .filter((fb) => fb.utilizada)
      .reduce((acc, fb) => acc + fb.valor, 0);

    const finalizadas = apostasExtracao.filter(
      (ap) => ap.status === "LIQUIDADA" && ap.resultado && ap.resultado !== "PENDENTE"
    );

    const operacoesGanhas = apostasExtracao.filter((ap) =>
      ["GREEN", "MEIO_GREEN", "GREEN_BOOKMAKER"].includes(ap.resultado || "")
    ).length;

    const operacoesPerdidas = apostasExtracao.filter((ap) =>
      ["RED", "MEIO_RED", "RED_BOOKMAKER"].includes(ap.resultado || "")
    ).length;

    const operacoesPendentes = apostasExtracao.filter(
      (ap) => ap.status === "PENDENTE" || !ap.resultado
    ).length;

    // Calcular valor extraído - considerar matched betting
    const valorExtraido = finalizadas.reduce((acc, ap) => {
      const isGreen = ["GREEN", "MEIO_GREEN", "GREEN_BOOKMAKER"].includes(ap.resultado || "");
      const isRed = ["RED", "MEIO_RED", "RED_BOOKMAKER"].includes(ap.resultado || "");

      if (isGreen) {
        return acc + Math.max(0, ap.lucro_prejuizo || 0);
      } else if (isRed && ap.lay_odd && ap.lay_stake) {
        // Matched betting: freebet perdeu, mas lay na exchange ganhou
        const comissao = ap.lay_comissao || 0;
        const lucroLay = ap.lay_stake * (1 - comissao / 100);
        return acc + Math.max(0, lucroLay);
      }
      return acc;
    }, 0);

    const totalOperacoes = apostasExtracao.length;
    const taxaExtracao = valorFreebetUsado > 0 ? (valorExtraido / valorFreebetUsado) * 100 : 0;
    const winRate = totalOperacoes > 0 ? (operacoesGanhas / totalOperacoes) * 100 : 0;

    // ROI médio
    const totalStake = apostasExtracao.reduce((acc, ap) => acc + (ap.stake || 0), 0);
    const roiMedio = totalStake > 0 ? (valorExtraido / totalStake) * 100 : 0;

    return {
      valorFreebetUsado,
      valorExtraido,
      taxaExtracao,
      totalOperacoes,
      operacoesGanhas,
      operacoesPerdidas,
      operacoesPendentes,
      winRate,
      roiMedio,
    };
  }, [apostasExtracao, freebets]);

  // Separar apostas por status
  const apostasAtivas = apostasExtracao.filter(
    (ap) => ap.status === "PENDENTE" || ap.resultado === "PENDENTE"
  );
  
  // Aplicar filtros dimensionais no histórico
  const apostasHistoricoRaw = apostasExtracao.filter(
    (ap) => ap.status === "LIQUIDADA" && ap.resultado !== "PENDENTE"
  );
  const apostasHistorico = useMemo(() => {
    const { bookmakerIds, parceiroIds } = dimensionalFilter;
    if (bookmakerIds.length === 0 && parceiroIds.length === 0) return apostasHistoricoRaw;
    return apostasHistoricoRaw.filter(ap => {
      if (bookmakerIds.length > 0 && !bookmakerIds.includes(ap.bookmaker_id)) return false;
      // Para parceiro, precisamos resolver via bookmaker - usamos bookmaker_id para match indireto
      return true;
    });
  }, [apostasHistoricoRaw, dimensionalFilter]);

  // Auto-switch to history tab when no active operations
  useEffect(() => {
    if (apostasAtivas.length === 0 && apostasHistorico.length > 0 && subTab === 'abertas') {
      setSubTab('historico');
    }
  }, [apostasAtivas.length, apostasHistorico.length]);

  return (
    <div className="space-y-6">
      {/* Alerta de Contaminação */}
      {!contaminationLoading && isContaminated && (
        <FreebetContaminationAlert
          isContaminated={isContaminated}
          contaminatedBookmakers={contaminatedBookmakers}
          totalContaminatedBets={totalContaminatedBets}
          estrategiasEncontradas={estrategiasEncontradas}
        />
      )}

      {/* KPIs de Extração */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Extraído</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {formatCurrency(metrics.valorExtraido)}
            </div>
            <p className="text-xs text-muted-foreground">
              Lucro líquido de extração
            </p>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">FB Utilizada</CardTitle>
            <Gift className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">
              {formatCurrency(metrics.valorFreebetUsado)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total consumido em extrações
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa Extração</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                metrics.taxaExtracao >= 70
                  ? "text-emerald-400"
                  : metrics.taxaExtracao >= 50
                  ? "text-amber-400"
                  : "text-red-400"
              }`}
            >
              {metrics.taxaExtracao.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">Meta: 70%+</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.winRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {metrics.operacoesGanhas}G / {metrics.operacoesPerdidas}R
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Operações</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalOperacoes}</div>
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
              <span className="text-blue-400">{metrics.operacoesPendentes} Pend.</span>
              <span className="text-emerald-500">{metrics.operacoesGanhas} G</span>
              <span className="text-red-500">{metrics.operacoesPerdidas} R</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROI Médio</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                metrics.roiMedio >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {metrics.roiMedio.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">Retorno por operação</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Curva de Extração */}
      <CurvaExtracaoChart
        apostas={apostasExtracao}
        freebets={freebets}
        formatCurrency={formatCurrency}
        dateRange={dateRange}
      />

      {/* Lista de Operações de Extração */}
      <Card>
        <CardHeader className="pb-3">
          <OperationsSubTabHeader
            subTab={subTab}
            onSubTabChange={setSubTab}
            openCount={apostasAtivas.length}
            historyCount={apostasHistorico.length}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            showViewToggle={true}
          />
          <CardTitle className="text-base flex items-center gap-2 mt-3">
            <Target className="h-4 w-4 text-primary" />
            Operações de Extração
            <Badge variant="secondary" className="ml-2">
              Apenas para a estratégia Extração de Freebet
            </Badge>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {subTab === "abertas" && (
            <>
              {apostasAtivas.length === 0 ? (
                <div className="text-center py-12 border rounded-lg bg-muted/5">
                  <Clock className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    Nenhuma extração pendente
                  </p>
                </div>
              ) : viewMode === "list" ? (
                <FreebetApostasList
                  apostas={apostasAtivas}
                  projetoId={projetoId}
                  formatCurrency={formatCurrency}
                  onResultadoUpdated={onResultadoUpdated}
                  onEditClick={onEditClick}
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {apostasAtivas.map((aposta) => (
                    <FreebetApostaCard
                      key={aposta.id}
                      aposta={aposta}
                      projetoId={projetoId}
                      formatCurrency={formatCurrency}
                      onResultadoUpdated={onResultadoUpdated}
                      onEditClick={onEditClick}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {subTab === "historico" && (
            <>
              {/* Filtros dimensionais independentes do histórico */}
              <HistoryDimensionalFilter
                projetoId={projetoId}
                value={dimensionalFilter}
                onChange={setDimensionalFilter}
                className="pb-3 border-b border-border/50 mb-4"
              />
              {apostasHistorico.length === 0 ? (
                <div className="text-center py-12 border rounded-lg bg-muted/5">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    Nenhuma extração finalizada
                  </p>
                </div>
              ) : viewMode === "list" ? (
                <FreebetApostasList
                  apostas={apostasHistorico}
                  projetoId={projetoId}
                  formatCurrency={formatCurrency}
                  onResultadoUpdated={onResultadoUpdated}
                  onEditClick={onEditClick}
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {apostasHistorico.map((aposta) => (
                    <FreebetApostaCard
                      key={aposta.id}
                      aposta={aposta}
                      projetoId={projetoId}
                      formatCurrency={formatCurrency}
                      onResultadoUpdated={onResultadoUpdated}
                      onEditClick={onEditClick}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
