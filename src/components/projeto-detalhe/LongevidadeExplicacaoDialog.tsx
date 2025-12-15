import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  HelpCircle, 
  TrendingUp, 
  BarChart3, 
  AlertTriangle, 
  Clock,
  Target,
  Zap,
  Activity,
  AlertCircle,
  Shield,
  Gauge,
  CheckCircle2,
  XCircle,
  ArrowRight
} from "lucide-react";
import { ProjetoContexto } from "@/hooks/useBookmakerAnalise";

interface LongevidadeExplicacaoDialogProps {
  projetoContexto?: ProjetoContexto | null;
}

export function LongevidadeExplicacaoDialog({ projetoContexto }: LongevidadeExplicacaoDialogProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6 rounded-full hover:bg-primary/10"
        >
          <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-primary" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            Como funciona a Análise de Longevidade
          </DialogTitle>
          <DialogDescription>
            Entenda como avaliamos cada casa para decisões estratégicas de alocação
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Por que não usamos Lucro/ROI */}
          <section className="space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Por que não usamos apenas Lucro ou ROI?
            </h3>
            <div className="p-4 rounded-lg bg-muted/50 space-y-2 text-sm">
              <p>Em apostas protegidas (Surebet, Value Bet, Matched Betting), o foco é diferente:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>Um <strong>prejuízo temporário</strong> pode ser estratégico e planejado</li>
                <li>Um <strong>lucro alto demais</strong> pode significar que a conta foi "queimada" rápido</li>
                <li>O <strong>ROI isolado</strong> não mostra quanto volume a casa suportou</li>
              </ul>
              <div className="mt-3 p-3 rounded bg-primary/10 border border-primary/20">
                <p className="font-medium text-foreground">💡 A melhor casa não é a que deu mais lucro — é a que suporta mais operações antes de morrer.</p>
              </div>
            </div>
          </section>

          {/* O que é o Score */}
          <section className="space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              O que é o Score de Longevidade?
            </h3>
            <div className="p-4 rounded-lg bg-muted/50 space-y-3 text-sm">
              <p>É uma pontuação de <strong>0 a 100</strong> que responde:</p>
              <p className="text-lg font-semibold text-center py-2 text-primary">
                "Quanto essa casa aguenta girar dentro deste projeto antes de morrer?"
              </p>
              
              <div className="grid gap-2 mt-4">
                <div className="flex items-start gap-3 p-2 rounded bg-background/50">
                  <BarChart3 className="h-4 w-4 text-blue-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Participação no Volume</p>
                    <p className="text-xs text-muted-foreground">Quanto da operação total passa por essa casa?</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-2 rounded bg-background/50">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Concentração de Risco</p>
                    <p className="text-xs text-muted-foreground">Quantos eventos de limitação/bloqueio em relação às outras casas?</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-2 rounded bg-background/50">
                  <Clock className="h-4 w-4 text-purple-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Velocidade de Limitação</p>
                    <p className="text-xs text-muted-foreground">Limitou cedo (ruim) ou tarde (bom) na operação?</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-2 rounded bg-background/50">
                  <Target className="h-4 w-4 text-emerald-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Ranking Relativo</p>
                    <p className="text-xs text-muted-foreground">Como ela se compara às outras casas do mesmo projeto?</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Classificações */}
          <section className="space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Classificações de Longevidade
            </h3>
            <div className="grid gap-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="text-2xl font-bold text-emerald-500 w-16 text-center">80+</div>
                <div>
                  <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30">Excelente</Badge>
                  <p className="text-sm text-muted-foreground mt-1">Alto giro seguro. Priorize para volumes maiores.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="text-2xl font-bold text-green-500 w-16 text-center">55-79</div>
                <div>
                  <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Boa</Badge>
                  <p className="text-sm text-muted-foreground mt-1">Uso regular com rotação consciente.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="text-2xl font-bold text-amber-500 w-16 text-center">30-54</div>
                <div>
                  <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30">Limitada</Badge>
                  <p className="text-sm text-muted-foreground mt-1">Tolera pouco volume. Use pontualmente.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="text-2xl font-bold text-red-500 w-16 text-center">0-29</div>
                <div>
                  <Badge className="bg-red-500/20 text-red-500 border-red-500/30">Alto Risco</Badge>
                  <p className="text-sm text-muted-foreground mt-1">Limita muito rápido. Evite ou minimize.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Diferença importante */}
          <section className="space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-primary" />
              Longevidade vs Alocação: a diferença crucial
            </h3>
            <div className="p-4 rounded-lg bg-muted/50 space-y-3 text-sm">
              <p>São duas avaliações complementares, mas diferentes:</p>
              
              <div className="grid md:grid-cols-2 gap-3 mt-3">
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="font-semibold text-blue-500 mb-2">📊 Score de Longevidade</p>
                  <p className="text-xs text-muted-foreground">Mede a <strong>capacidade histórica</strong> da casa de absorver volume sem limitar.</p>
                </div>
                <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <p className="font-semibold text-purple-500 mb-2">🎯 Recomendação de Alocação</p>
                  <p className="text-xs text-muted-foreground">Considera o <strong>momento atual</strong>: está limitada agora? Bloqueada?</p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <p className="font-medium">Exemplos práticos:</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 rounded bg-background/50 text-xs">
                    <Badge className="bg-green-500/20 text-green-500 text-xs">Score 75</Badge>
                    <ArrowRight className="h-3 w-3" />
                    <Badge className="bg-red-500/20 text-red-500 text-xs">Crítico</Badge>
                    <span className="text-muted-foreground">= Casa boa, mas está bloqueada agora</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded bg-background/50 text-xs">
                    <Badge className="bg-emerald-500/20 text-emerald-500 text-xs">Score 90</Badge>
                    <ArrowRight className="h-3 w-3" />
                    <Badge className="bg-emerald-500/20 text-emerald-500 text-xs">Alto Giro</Badge>
                    <span className="text-muted-foreground">= Excelente e operante</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded bg-background/50 text-xs">
                    <Badge className="bg-amber-500/20 text-amber-500 text-xs">Score 45</Badge>
                    <ArrowRight className="h-3 w-3" />
                    <Badge className="bg-amber-500/20 text-amber-500 text-xs">Baixo Giro</Badge>
                    <span className="text-muted-foreground">= Tolera pouco, usar com cautela</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Como usar na prática */}
          <section className="space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Como usar na prática
            </h3>
            <div className="grid gap-2">
              <div className="flex items-start gap-3 p-3 rounded-lg border">
                <Zap className="h-5 w-5 text-emerald-500 mt-0.5" />
                <div>
                  <p className="font-medium">Alto Giro</p>
                  <p className="text-sm text-muted-foreground">Priorize para volumes maiores e ciclos longos. É sua "casa principal".</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg border">
                <Activity className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium">Médio Giro</p>
                  <p className="text-sm text-muted-foreground">Mantenha rotação consciente. Monitore sinais de limitação.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg border">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                <div>
                  <p className="font-medium">Baixo Giro</p>
                  <p className="text-sm text-muted-foreground">Use pontualmente, volume mínimo. Boa para diversificação.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg border">
                <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                <div>
                  <p className="font-medium">Crítico</p>
                  <p className="text-sm text-muted-foreground">Evite novas operações. Considere encerrar ou substituir.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Avaliação Relativa */}
          <section className="space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Avaliação Relativa ao Projeto
            </h3>
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-2 text-sm">
              <p className="font-medium">O score é calculado <strong>em relação às outras casas do mesmo projeto</strong>, não com valores fixos.</p>
              <p className="text-muted-foreground">
                Isso significa que "alto volume" em um projeto pequeno é diferente de "alto volume" em um projeto grande.
              </p>
              
              {projetoContexto && projetoContexto.volumeTotal > 0 && (
                <div className="mt-3 p-3 rounded bg-background/50 border">
                  <p className="text-xs text-muted-foreground mb-2">Neste projeto:</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Volume total:</span>
                      <span className="font-medium ml-2">{formatCurrency(projetoContexto.volumeTotal)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Casas ativas:</span>
                      <span className="font-medium ml-2">{projetoContexto.totalCasas}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Eventos de risco:</span>
                      <span className="font-medium ml-2">{projetoContexto.totalEventosRisco}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Dias ativos:</span>
                      <span className="font-medium ml-2">{projetoContexto.diasProjetoAtivo}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Nota final */}
          <div className="p-4 rounded-lg bg-muted/30 border text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Nota importante:</strong> Estes indicadores são guias estratégicos baseados em dados. 
              A decisão final depende do contexto operacional, perfil de risco e conhecimento específico de cada casa.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
