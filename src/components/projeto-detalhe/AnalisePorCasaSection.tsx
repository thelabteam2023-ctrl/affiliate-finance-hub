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
  Star,
  Ban,
  ThumbsUp,
  ThumbsDown,
  Lightbulb
} from "lucide-react";

interface BookmakerAnalise {
  bookmaker_id: string;
  bookmaker_nome: string;
  lucro: number;
  volume: number;
  qtdApostas: number;
  roi: number;
  percentualLucroTotal: number;
  eventosLimitacao: number;
  eventosBloqueio: number;
  statusAtual: string;
}

interface RecomendacaoCasa {
  bookmaker_id: string;
  bookmaker_nome: string;
  tipo: "continuar" | "cautela" | "reduzir" | "evitar";
  motivo: string;
  lucro: number;
  roi: number;
  risco: "baixo" | "medio" | "alto";
}

interface AnalisePorCasaSectionProps {
  bookmakerAnalises: BookmakerAnalise[];
  lucroTotalCiclo: number;
}

export function AnalisePorCasaSection({ bookmakerAnalises, lucroTotalCiclo }: AnalisePorCasaSectionProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Calcular recomendações automáticas
  const recomendacoes = useMemo((): RecomendacaoCasa[] => {
    return bookmakerAnalises.map(casa => {
      const temEventosRisco = casa.eventosLimitacao > 0 || casa.eventosBloqueio > 0;
      const roiBom = casa.roi > 3;
      const roiMediocre = casa.roi > 0 && casa.roi <= 3;
      const lucroBom = casa.lucro > 0 && casa.percentualLucroTotal > 15;
      const isLimitada = casa.statusAtual === "LIMITADA" || casa.statusAtual === "limitada";
      const isBloqueada = casa.statusAtual === "BLOQUEADA" || casa.statusAtual === "bloqueada";

      let tipo: RecomendacaoCasa["tipo"];
      let motivo: string;
      let risco: RecomendacaoCasa["risco"];

      if (isBloqueada) {
        tipo = "evitar";
        motivo = "Casa bloqueada, não é possível operar";
        risco = "alto";
      } else if (isLimitada && casa.lucro < 0) {
        tipo = "evitar";
        motivo = "Casa limitada com prejuízo acumulado";
        risco = "alto";
      } else if (isLimitada && roiBom) {
        tipo = "cautela";
        motivo = "Bom ROI, mas já sofreu limitação - risco de continuidade";
        risco = "medio";
      } else if (casa.eventosLimitacao >= 2) {
        tipo = "reduzir";
        motivo = `Múltiplos eventos de limitação (${casa.eventosLimitacao}x) - padrão de risco`;
        risco = "alto";
      } else if (roiBom && lucroBom && !temEventosRisco) {
        tipo = "continuar";
        motivo = `Alto ROI (${casa.roi.toFixed(1)}%) e ${casa.percentualLucroTotal.toFixed(0)}% do lucro total sem eventos de risco`;
        risco = "baixo";
      } else if (roiBom && temEventosRisco) {
        tipo = "cautela";
        motivo = `Bom ROI, mas com ${casa.eventosLimitacao + casa.eventosBloqueio} evento(s) de risco`;
        risco = "medio";
      } else if (roiMediocre && temEventosRisco) {
        tipo = "reduzir";
        motivo = "ROI baixo combinado com eventos de risco";
        risco = "alto";
      } else if (casa.lucro < 0) {
        tipo = "reduzir";
        motivo = `Prejuízo de ${formatCurrency(Math.abs(casa.lucro))} no ciclo`;
        risco = "medio";
      } else if (roiMediocre && !temEventosRisco) {
        tipo = "continuar";
        motivo = "Operação estável, sem eventos de risco";
        risco = "baixo";
      } else {
        tipo = "cautela";
        motivo = "Necessita mais dados para avaliação completa";
        risco = "medio";
      }

      return {
        bookmaker_id: casa.bookmaker_id,
        bookmaker_nome: casa.bookmaker_nome,
        tipo,
        motivo,
        lucro: casa.lucro,
        roi: casa.roi,
        risco
      };
    }).sort((a, b) => {
      // Ordenar por prioridade: continuar > cautela > reduzir > evitar
      const ordem = { continuar: 0, cautela: 1, reduzir: 2, evitar: 3 };
      return ordem[a.tipo] - ordem[b.tipo];
    });
  }, [bookmakerAnalises]);

  // Identificar casas destaque
  const casaMaisLucrativa = bookmakerAnalises.length > 0 
    ? bookmakerAnalises.reduce((a, b) => a.lucro > b.lucro ? a : b)
    : null;
  
  const casaMaiorRoi = bookmakerAnalises.filter(c => c.qtdApostas >= 3).length > 0
    ? bookmakerAnalises.filter(c => c.qtdApostas >= 3).reduce((a, b) => a.roi > b.roi ? a : b)
    : null;

  const casasComRisco = bookmakerAnalises.filter(c => 
    c.eventosLimitacao > 0 || c.eventosBloqueio > 0 || 
    c.statusAtual === "LIMITADA" || c.statusAtual === "limitada"
  );

  const getTipoIcon = (tipo: RecomendacaoCasa["tipo"]) => {
    switch (tipo) {
      case "continuar": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "cautela": return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "reduzir": return <TrendingDown className="h-4 w-4 text-orange-500" />;
      case "evitar": return <Ban className="h-4 w-4 text-red-500" />;
    }
  };

  const getTipoBadge = (tipo: RecomendacaoCasa["tipo"]) => {
    switch (tipo) {
      case "continuar": 
        return <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30">Continuar</Badge>;
      case "cautela": 
        return <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30">Cautela</Badge>;
      case "reduzir": 
        return <Badge className="bg-orange-500/20 text-orange-500 border-orange-500/30">Reduzir</Badge>;
      case "evitar": 
        return <Badge className="bg-red-500/20 text-red-500 border-red-500/30">Evitar</Badge>;
    }
  };

  const getRiscoBadge = (risco: RecomendacaoCasa["risco"]) => {
    switch (risco) {
      case "baixo": return <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 text-xs">Risco Baixo</Badge>;
      case "medio": return <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-xs">Risco Médio</Badge>;
      case "alto": return <Badge variant="outline" className="text-red-500 border-red-500/30 text-xs">Risco Alto</Badge>;
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
      {/* Destaques Principais */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" />
            Destaques por Casa
          </CardTitle>
          <CardDescription>Visão rápida das casas mais relevantes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Casa mais lucrativa */}
            {casaMaisLucrativa && casaMaisLucrativa.lucro > 0 && (
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-500">Mais Lucrativa</span>
                </div>
                <p className="text-lg font-bold truncate">{casaMaisLucrativa.bookmaker_nome}</p>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(casaMaisLucrativa.lucro)} ({casaMaisLucrativa.percentualLucroTotal.toFixed(0)}% do total)
                </p>
              </div>
            )}

            {/* Melhor ROI */}
            {casaMaiorRoi && casaMaiorRoi.roi > 0 && (
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium text-blue-500">Melhor ROI</span>
                </div>
                <p className="text-lg font-bold truncate">{casaMaiorRoi.bookmaker_nome}</p>
                <p className="text-sm text-muted-foreground">
                  {casaMaiorRoi.roi.toFixed(2)}% de retorno
                </p>
              </div>
            )}

            {/* Casas com risco */}
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-500">Risco Operacional</span>
              </div>
              <p className="text-lg font-bold">{casasComRisco.length} casa(s)</p>
              <p className="text-sm text-muted-foreground">
                {casasComRisco.length > 0 
                  ? `Com limitação ou bloqueio`
                  : "Nenhum evento de risco"}
              </p>
            </div>
          </div>

          {/* Performance por Casa (lista compacta) */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Participação no Lucro por Casa</h4>
            {bookmakerAnalises
              .filter(c => c.lucro !== 0)
              .sort((a, b) => b.percentualLucroTotal - a.percentualLucroTotal)
              .slice(0, 5)
              .map(casa => (
                <div key={casa.bookmaker_id} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-32 truncate">{casa.bookmaker_nome}</span>
                  <Progress 
                    value={Math.min(Math.abs(casa.percentualLucroTotal), 100)} 
                    className={`flex-1 h-2 ${casa.lucro < 0 ? '[&>div]:bg-red-500' : ''}`}
                  />
                  <span className={`text-sm font-medium w-20 text-right ${casa.lucro >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {casa.lucro >= 0 ? '+' : ''}{casa.percentualLucroTotal.toFixed(1)}%
                  </span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Recomendações Automáticas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Recomendações Estratégicas por Casa
          </CardTitle>
          <CardDescription>Análise automática de risco × performance para decisão de alocação</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recomendacoes.map(rec => (
            <div 
              key={rec.bookmaker_id} 
              className={`p-4 rounded-lg border ${
                rec.tipo === 'continuar' ? 'bg-emerald-500/5 border-emerald-500/20' :
                rec.tipo === 'cautela' ? 'bg-amber-500/5 border-amber-500/20' :
                rec.tipo === 'reduzir' ? 'bg-orange-500/5 border-orange-500/20' :
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
                  {getRiscoBadge(rec.risco)}
                  <span className={`text-sm font-medium ${rec.lucro >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {rec.lucro >= 0 ? '+' : ''}{formatCurrency(rec.lucro)}
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{rec.motivo}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Tabela Detalhada */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Métricas Detalhadas por Casa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Casa</th>
                  <th className="text-right p-2">Apostas</th>
                  <th className="text-right p-2">Volume</th>
                  <th className="text-right p-2">Lucro</th>
                  <th className="text-right p-2">ROI</th>
                  <th className="text-right p-2">% Lucro Total</th>
                  <th className="text-center p-2">Limitações</th>
                  <th className="text-center p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {bookmakerAnalises
                  .sort((a, b) => b.lucro - a.lucro)
                  .map(casa => (
                    <tr key={casa.bookmaker_id} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-medium">{casa.bookmaker_nome}</td>
                      <td className="p-2 text-right">{casa.qtdApostas}</td>
                      <td className="p-2 text-right">{formatCurrency(casa.volume)}</td>
                      <td className={`p-2 text-right font-medium ${casa.lucro >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {casa.lucro >= 0 ? '+' : ''}{formatCurrency(casa.lucro)}
                      </td>
                      <td className={`p-2 text-right ${casa.roi >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {casa.roi.toFixed(2)}%
                      </td>
                      <td className="p-2 text-right">
                        {casa.percentualLucroTotal.toFixed(1)}%
                      </td>
                      <td className="p-2 text-center">
                        {casa.eventosLimitacao > 0 || casa.eventosBloqueio > 0 ? (
                          <Badge variant="destructive" className="text-xs">
                            {casa.eventosLimitacao + casa.eventosBloqueio}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
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
    </div>
  );
}
