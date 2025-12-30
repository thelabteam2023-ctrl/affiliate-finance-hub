import React from 'react';
import { HelpCircle, Shield, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';
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
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <HelpCircle className="h-4 w-4" />
          Como usar?
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Guia da Calculadora de Proteção
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6 text-sm">
            {/* O que é proteção */}
            <section className="space-y-2">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                O que é Proteção (Lay)?
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Proteção Lay é uma técnica usada para <strong>garantir um resultado controlado</strong>, 
                independente do resultado da aposta na casa. Você aposta CONTRA o mesmo evento 
                em uma exchange (como Betfair), neutralizando ganhos ou perdas inesperadas.
              </p>
            </section>

            {/* Por que fazer Lay */}
            <section className="space-y-2">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-primary" />
                Por que fazer Lay para extrair bônus?
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Quando você recebe um bônus de casa de apostas, o objetivo é <strong>converter 
                esse bônus em dinheiro real</strong> com o menor risco possível. Ao fazer Lay, 
                você "trava" o resultado: mesmo se ganhar a aposta na casa, você perde o 
                equivalente na exchange, ficando apenas com a margem do bônus.
              </p>
            </section>

            {/* Green e Red */}
            <section className="space-y-2">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success" />
                O que significa Green e Red aqui?
              </h3>
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-success/10 border border-success/30">
                  <p className="font-medium text-success">GREEN = Sua aposta GANHOU na casa</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Você ganhou na casa, mas perdeu no Lay. O lucro é controlado.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                  <p className="font-medium text-destructive">RED = Sua aposta PERDEU na casa</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Você perdeu na casa, mas ganhou no Lay. Objetivo de extração atingido!
                  </p>
                </div>
              </div>
            </section>

            {/* Como usar a calculadora */}
            <section className="space-y-2">
              <h3 className="font-semibold text-foreground">Como usar esta calculadora:</h3>
              <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                <li>Escolha o tipo de aposta (dupla, tripla, etc.)</li>
                <li>Defina seu stake inicial e as odds de cada perna</li>
                <li>Selecione seu objetivo (geralmente "perder na casa")</li>
                <li>A cada resultado, clique em GREEN ou RED</li>
                <li>Siga a ação recomendada para fazer o Lay correto</li>
              </ol>
            </section>

            {/* Aviso */}
            <section className="p-4 rounded-lg bg-warning/10 border border-warning/30">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-warning">Aviso Importante</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Esta ferramenta é para <strong>controle de risco</strong>, não para maximização de lucro. 
                    O objetivo é garantir um resultado previsível, mesmo que isso signifique 
                    abrir mão de lucros potenciais maiores.
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
