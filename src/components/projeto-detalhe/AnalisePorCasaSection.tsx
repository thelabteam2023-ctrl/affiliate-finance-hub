import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Building2, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Target,
  Zap,
  Activity,
  Clock,
  BarChart3,
  Gauge,
  Shield,
  AlertCircle,
  Timer,
  Layers
} from "lucide-react";
import { BookmakerAnalise, ProjetoContexto } from "@/hooks/useBookmakerAnalise";
import { LongevidadeExplicacaoDialog } from "./LongevidadeExplicacaoDialog";

interface RecomendacaoLongevidade {
  bookmaker_id: string;
  bookmaker_nome: string;
  tipo: "alto_giro" | "medio_giro" | "baixo_giro" | "critico";
  recomendacao: string;
  detalhes: string;
  score: number;
  classificacao: BookmakerAnalise["classificacaoLongevidade"];
}

interface AnalisePorCasaSectionProps {
  bookmakerAnalises: BookmakerAnalise[];
  lucroTotalCiclo: number;
  projetoContexto?: ProjetoContexto | null;
  formatCurrency?: (value: number) => string;
}

// Fallback para formatação de moeda
const defaultFormatCurrency = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

export function AnalisePorCasaSection({ bookmakerAnalises, lucroTotalCiclo, projetoContexto, formatCurrency: formatCurrencyProp }: AnalisePorCasaSectionProps) {
  const formatCurrency = formatCurrencyProp || defaultFormatCurrency;

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("pt-BR").format(value);
  };

  // Gerar recomendações baseadas em longevidade
  const recomendacoes = useMemo((): RecomendacaoLongevidade[] => {
    return bookmakerAnalises.map(casa => {
      let tipo: RecomendacaoLongevidade["tipo"];
      let recomendacao: string;
      let detalhes: string;

      const totalEventos = casa.eventosLimitacao + casa.eventosBloqueio;
      const isLimitada = casa.statusAtual === "LIMITADA" || casa.statusAtual === "limitada";
      const isBloqueada = casa.statusAtual === "BLOQUEADA" || casa.statusAtual === "bloqueada";

      if (isBloqueada) {
        tipo = "critico";
        recomendacao = "Casa inoperante";
        detalhes = "Conta bloqueada, não é possível operar. Considere encerrar vínculo.";
      } else if (isLimitada) {
        if (casa.volumeAteLimitacao >= 30000) {
          tipo = "medio_giro";
          recomendacao = "Casa com boa absorção antes de limitar";
          detalhes = `Suportou ${formatCurrency(casa.volumeAteLimitacao)} antes da limitação. Pode ser reaberta ou substituída por nova conta.`;
        } else {
          tipo = "baixo_giro";
          recomendacao = "Casa com baixa tolerância a volume";
          detalhes = `Limitou com apenas ${formatCurrency(casa.volumeAteLimitacao)} de giro. Alta rotatividade necessária.`;
        }
      } else if (casa.scoreLongevidade >= 80) {
        tipo = "alto_giro";
        recomendacao = "Casa indicada para alto giro de capital";
        detalhes = totalEventos === 0 
          ? `Excelente longevidade: ${formatCurrency(casa.volumeTotal)} girados em ${casa.diasAtivos} dias sem eventos de risco.`
          : `Boa resiliência: ${formatCurrency(casa.volumeAteLimitacao)} em média por evento. Capacidade de absorção comprovada.`;
      } else if (casa.scoreLongevidade >= 60) {
        tipo = "medio_giro";
        recomendacao = "Casa com boa longevidade, uso controlado";
        detalhes = `Volume de ${formatCurrency(casa.volumeTotal)} com ${totalEventos} evento(s). Rotação consciente recomendada.`;
      } else if (casa.scoreLongevidade >= 40) {
        tipo = "baixo_giro";
        recomendacao = "Casa com longevidade limitada";
        detalhes = `Tolera baixo volume antes de limitar (${formatCurrency(casa.volumeAteLimitacao)} por evento). Usar apenas pontualmente.`;
      } else {
        tipo = "critico";
        recomendacao = "Casa de alto risco operacional";
        detalhes = `Frequência alta de limitação (${casa.frequenciaLimitacao}). Minimizar exposição.`;
      }

      return {
        bookmaker_id: casa.bookmaker_id,
        bookmaker_nome: casa.bookmaker_nome,
        tipo,
        recomendacao,
        detalhes,
        score: casa.scoreLongevidade,
        classificacao: casa.classificacaoLongevidade
      };
    }).sort((a, b) => b.score - a.score);
  }, [bookmakerAnalises]);

  // Identificar casas por categoria
  const casasMaiorLongevidade = bookmakerAnalises.filter(c => c.classificacaoLongevidade === "excelente" || c.scoreLongevidade >= 80);
  const casasMaiorVolume = bookmakerAnalises.length > 0 
    ? [...bookmakerAnalises].sort((a, b) => b.volumeAteLimitacao - a.volumeAteLimitacao)[0]
    : null;
  const casasRisco = bookmakerAnalises.filter(c => 
    c.eventosLimitacao > 0 || c.eventosBloqueio > 0 || 
    c.statusAtual === "LIMITADA" || c.statusAtual === "limitada" ||
    c.statusAtual === "BLOQUEADA" || c.statusAtual === "bloqueada"
  );

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-emerald-500";
    if (score >= 70) return "text-green-500";
    if (score >= 40) return "text-amber-500";
    return "text-red-500";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 90) return "bg-emerald-500/20 border-emerald-500/30";
    if (score >= 70) return "bg-green-500/20 border-green-500/30";
    if (score >= 40) return "bg-amber-500/20 border-amber-500/30";
    return "bg-red-500/20 border-red-500/30";
  };

  const getClassificacaoBadge = (classificacao: BookmakerAnalise["classificacaoLongevidade"]) => {
    switch (classificacao) {
      case "excelente": 
        return <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30">Excelente</Badge>;
      case "boa": 
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Boa</Badge>;
      case "limitada": 
        return <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30">Limitada</Badge>;
      case "alto_risco": 
        return <Badge className="bg-red-500/20 text-red-500 border-red-500/30">Alto Risco</Badge>;
    }
  };

  const getFrequenciaBadge = (frequencia: BookmakerAnalise["frequenciaLimitacao"]) => {
    switch (frequencia) {
      case "rara": 
        return <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 text-xs">Rara</Badge>;
      case "moderada": 
        return <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-xs">Moderada</Badge>;
      case "frequente": 
        return <Badge variant="outline" className="text-orange-500 border-orange-500/30 text-xs">Frequente</Badge>;
      case "muito_frequente": 
        return <Badge variant="outline" className="text-red-500 border-red-500/30 text-xs">Muito Frequente</Badge>;
    }
  };

  const getTipoIcon = (tipo: RecomendacaoLongevidade["tipo"]) => {
    switch (tipo) {
      case "alto_giro": return <Zap className="h-4 w-4 text-emerald-500" />;
      case "medio_giro": return <Activity className="h-4 w-4 text-green-500" />;
      case "baixo_giro": return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "critico": return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getTipoBadge = (tipo: RecomendacaoLongevidade["tipo"]) => {
    switch (tipo) {
      case "alto_giro": 
        return <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30">Alto Giro</Badge>;
      case "medio_giro": 
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Médio Giro</Badge>;
      case "baixo_giro": 
        return <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30">Baixo Giro</Badge>;
      case "critico": 
        return <Badge className="bg-red-500/20 text-red-500 border-red-500/30">Crítico</Badge>;
    }
  };

  if (bookmakerAnalises.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h4 className="text-lg font-medium mb-2">Sem dados por casa</h4>
          <p className="text-muted-foreground text-center">
            Não há apostas registradas para análise por bookmaker
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Score de Longevidade Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            Análise de Longevidade e Capacidade por Casa
            <LongevidadeExplicacaoDialog projetoContexto={projetoContexto} />
          </CardTitle>
          <CardDescription>
            Avaliação de tolerância a volume e risco de limitação em apostas protegidas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Casas de Alta Longevidade */}
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium text-emerald-500">Alta Longevidade</span>
              </div>
              <p className="text-2xl font-bold">{casasMaiorLongevidade.length} casa(s)</p>
              <p className="text-sm text-muted-foreground">
                {casasMaiorLongevidade.length > 0 
                  ? "Indicadas para alto giro e ciclos longos"
                  : "Nenhuma casa com excelente longevidade"}
              </p>
            </div>

            {/* Maior Capacidade de Volume */}
            {casasMaiorVolume && (
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium text-blue-500">Maior Capacidade</span>
                </div>
                <p className="text-lg font-bold truncate">{casasMaiorVolume.bookmaker_nome}</p>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(casasMaiorVolume.volumeAteLimitacao)} por evento
                </p>
              </div>
            )}

            {/* Casas com Risco */}
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-500">Com Eventos de Risco</span>
              </div>
              <p className="text-2xl font-bold">{casasRisco.length} casa(s)</p>
              <p className="text-sm text-muted-foreground">
                {casasRisco.length > 0 
                  ? "Limitação ou bloqueio registrado"
                  : "Nenhum evento de risco"}
              </p>
            </div>
          </div>

          {/* Ranking por Score de Longevidade */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Ranking por Score de Longevidade (Top 8)
            </h4>
            {bookmakerAnalises
              .sort((a, b) => b.scoreLongevidade - a.scoreLongevidade)
              .slice(0, 8)
              .map(casa => (
                <div key={casa.bookmaker_id} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-32 truncate">{casa.bookmaker_nome}</span>
                  <Progress 
                    value={casa.scoreLongevidade} 
                    className={`flex-1 h-2 ${
                      casa.scoreLongevidade >= 70 ? '[&>div]:bg-emerald-500' :
                      casa.scoreLongevidade >= 40 ? '[&>div]:bg-amber-500' :
                      '[&>div]:bg-red-500'
                    }`}
                  />
                  <span className={`text-sm font-bold w-8 text-right ${getScoreColor(casa.scoreLongevidade)}`}>
                    {casa.scoreLongevidade.toFixed(0)}
                  </span>
                  <span className={`text-xs font-medium w-14 text-right ${casa.roi >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {casa.roi.toFixed(1)}%
                  </span>
                  {getClassificacaoBadge(casa.classificacaoLongevidade)}
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Recomendações Estratégicas de Longevidade */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Recomendações de Alocação por Longevidade
            <LongevidadeExplicacaoDialog projetoContexto={projetoContexto} />
          </CardTitle>
          <CardDescription>
            Onde alocar volume de forma estratégica, baseado em capacidade operacional
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recomendacoes.map(rec => (
            <div 
              key={rec.bookmaker_id} 
              className={`p-4 rounded-lg border ${
                rec.tipo === 'alto_giro' ? 'bg-emerald-500/5 border-emerald-500/20' :
                rec.tipo === 'medio_giro' ? 'bg-green-500/5 border-green-500/20' :
                rec.tipo === 'baixo_giro' ? 'bg-amber-500/5 border-amber-500/20' :
                'bg-red-500/5 border-red-500/20'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getTipoIcon(rec.tipo)}
                  <span className="font-medium">{rec.bookmaker_nome}</span>
                  {getTipoBadge(rec.tipo)}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${getScoreColor(rec.score)}`}>
                    {rec.score.toFixed(0)}
                  </span>
                  <span className="text-xs text-muted-foreground">pts</span>
                </div>
              </div>
              <p className="text-sm font-medium mb-1">{rec.recomendacao}</p>
              <p className="text-sm text-muted-foreground">{rec.detalhes}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Métricas Detalhadas por Casa */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Métricas de Longevidade por Casa
          </CardTitle>
          <CardDescription>
            Volume girado, eventos de limitação e capacidade de absorção
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Casa</th>
                  <th className="text-right p-2">Score</th>
                  <th className="text-right p-2">Volume Total</th>
                  <th className="text-right p-2">Volume/Limitação</th>
                  <th className="text-right p-2">Apostas</th>
                  <th className="text-right p-2">Dias Ativos</th>
                  <th className="text-center p-2">Limitações</th>
                  <th className="text-center p-2">Frequência</th>
                  <th className="text-center p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {bookmakerAnalises
                  .sort((a, b) => b.scoreLongevidade - a.scoreLongevidade)
                  .map(casa => (
                    <tr key={casa.bookmaker_id} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-medium">{casa.bookmaker_nome}</td>
                      <td className="p-2 text-right">
                        <span className={`font-bold ${getScoreColor(casa.scoreLongevidade)}`}>
                          {casa.scoreLongevidade.toFixed(0)}
                        </span>
                      </td>
                      <td className="p-2 text-right">{formatCurrency(casa.volumeTotal)}</td>
                      <td className="p-2 text-right font-medium">
                        {formatCurrency(casa.volumeAteLimitacao)}
                      </td>
                      <td className="p-2 text-right">{casa.qtdApostas}</td>
                      <td className="p-2 text-right">{casa.diasAtivos}</td>
                      <td className="p-2 text-center">
                        {casa.eventosLimitacao > 0 || casa.eventosBloqueio > 0 ? (
                          <Badge variant="destructive" className="text-xs">
                            {casa.eventosLimitacao + casa.eventosBloqueio}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {getFrequenciaBadge(casa.frequenciaLimitacao)}
                      </td>
                      <td className="p-2 text-center">
                        {casa.statusAtual === "LIMITADA" || casa.statusAtual === "limitada" ? (
                          <Badge className="bg-amber-500/20 text-amber-500 text-xs">Limitada</Badge>
                        ) : casa.statusAtual === "BLOQUEADA" || casa.statusAtual === "bloqueada" ? (
                          <Badge className="bg-red-500/20 text-red-500 text-xs">Bloqueada</Badge>
                        ) : (
                          <Badge className="bg-emerald-500/20 text-emerald-500 text-xs">Ativo</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Métricas Financeiras (Contexto Secundário) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            Contexto Financeiro (Referência)
          </CardTitle>
          <CardDescription>
            Lucro e ROI são métricas secundárias em apostas protegidas - use apenas como contexto
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Casa</th>
                  <th className="text-right p-2">Lucro</th>
                  <th className="text-right p-2">ROI</th>
                  <th className="text-right p-2">% do Total</th>
                  <th className="text-right p-2">Depositado</th>
                  <th className="text-right p-2">Sacado</th>
                </tr>
              </thead>
              <tbody>
                {bookmakerAnalises
                  .sort((a, b) => b.lucro - a.lucro)
                  .map(casa => (
                    <tr key={casa.bookmaker_id} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-medium">{casa.bookmaker_nome}</td>
                      <td className={`p-2 text-right font-medium ${casa.lucro >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {casa.lucro >= 0 ? '+' : ''}{formatCurrency(casa.lucro)}
                      </td>
                      <td className={`p-2 text-right ${casa.roi >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {casa.roi.toFixed(2)}%
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {casa.percentualLucroTotal.toFixed(1)}%
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {formatCurrency(casa.totalDepositado || 0)}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {formatCurrency(casa.totalSacado || 0)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
