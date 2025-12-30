import React from 'react';
import { HelpCircle, TrendingUp, AlertTriangle, CheckCircle, Target, ArrowUpRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

export const GuiaProtecao: React.FC = () => {
  return (
    <Dialog modal={true}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <HelpCircle className="h-4 w-4" />
          Como funciona?
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg z-[10000]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Guia: Recuperação Progressiva + Extração
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6 text-sm">
            {/* Conceito */}
            <section className="space-y-2">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                O que é Recuperação Progressiva?
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Este modelo <strong>carrega passivo entre pernas</strong> e calcula automaticamente 
                o stake LAY necessário para recuperar tudo + extrair o valor desejado quando 
                cair na Exchange (RED).
              </p>
            </section>

            {/* Como funciona */}
            <section className="space-y-2">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Como funciona?
              </h3>
              <div className="space-y-3 text-muted-foreground">
                <p><strong>1. Você define:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Stake inicial na Bookmaker</li>
                  <li>Odds BACK e LAY de cada perna</li>
                  <li>Valor de extração desejado por perna</li>
                </ul>
                
                <p><strong>2. O sistema calcula:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Target = Passivo acumulado + Extração desejada</li>
                  <li>Stake LAY = Target ÷ (1 − comissão)</li>
                  <li>Responsabilidade = Stake LAY × (Odd LAY − 1)</li>
                </ul>
              </div>
            </section>

            {/* GREEN vs RED */}
            <section className="space-y-2">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success" />
                O que acontece em cada cenário?
              </h3>
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                  <p className="font-medium text-warning flex items-center gap-2">
                    <ArrowUpRight className="h-4 w-4" />
                    GREEN = Ganhou na Bookmaker
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Você ganhou, mas <strong>o passivo aumenta</strong>. O lucro da BACK não cobre 
                    a responsabilidade do LAY, então você carrega mais passivo para a próxima perna.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-success/10 border border-success/30">
                  <p className="font-medium text-success flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    RED = Perdeu na Bookmaker (OBJETIVO!)
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Você perdeu na casa, mas <strong>ganhou o LAY</strong>. O ganho líquido 
                    é exatamente o Target — passivo zerado, capital extraído!
                  </p>
                </div>
              </div>
            </section>

            {/* Por que o risco cresce */}
            <section className="space-y-2">
              <h3 className="font-semibold text-foreground">Por que o risco cresce a cada GREEN?</h3>
              <p className="text-muted-foreground leading-relaxed">
                Cada vez que você ganha na Bookmaker, o lucro não cobre totalmente a responsabilidade 
                do LAY (por causa do spread entre odds). Isso cria um passivo que você precisa 
                carregar para a próxima perna.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Quanto mais GREENs consecutivos, maior o passivo acumulado, e maior o stake LAY 
                necessário na próxima perna para recuperar tudo.
              </p>
            </section>

            {/* Aviso */}
            <section className="p-4 rounded-lg bg-warning/10 border border-warning/30">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-warning">Aviso Importante</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Este modelo é <strong>agressivo</strong>. Os stakes LAY crescem exponencialmente 
                    a cada GREEN. Certifique-se de ter banca suficiente na Exchange antes de operar.
                    O objetivo é sempre cair cedo — quanto antes o RED, melhor.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
