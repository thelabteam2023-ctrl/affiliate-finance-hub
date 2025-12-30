import React from 'react';
import { HelpCircle, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface Props {
  tipo: 'perder_casa' | 'limitar_lucro' | 'neutralizar_greens';
}

const explicacoes = {
  perder_casa: {
    titulo: 'Perder na Casa (Extração de Bônus)',
    teoria: 'Você quer que a aposta PERCA na casa para receber o valor do LAY na exchange, convertendo o bônus em dinheiro real.',
    exemplo: {
      setup: [
        { label: 'Bônus recebido', valor: 'R$ 100' },
        { label: 'Aposta na casa', valor: 'R$ 100 @ odd 2.00' },
        { label: 'LAY na exchange', valor: 'R$ 105 @ odd 1.95 (comissão 5%)' },
      ],
      cenarios: [
        {
          titulo: 'Se PERDER na casa (objetivo)',
          tipo: 'sucesso',
          linhas: [
            { icon: 'check', texto: 'Casa: -R$ 100 (mas era bônus)' },
            { icon: 'check', texto: 'Exchange: +R$ 99,75 (R$ 105 × 95%)' },
          ],
          resultado: 'Lucro real: R$ 99,75',
        },
        {
          titulo: 'Se GANHAR na casa',
          tipo: 'neutro',
          linhas: [
            { icon: 'x', texto: 'Casa: +R$ 100' },
            { icon: 'x', texto: 'Exchange: -R$ 99,75 (responsabilidade)' },
          ],
          resultado: 'Resultado: ~R$ 0 (neutro)',
        },
      ],
    },
  },
  limitar_lucro: {
    titulo: 'Limitar Lucro',
    teoria: 'Você quer garantir um lucro máximo controlado, mesmo que a aposta ganhe. Ideal para travar resultados antes de eventos.',
    exemplo: {
      setup: [
        { label: 'Stake inicial', valor: 'R$ 100 @ odd 3.00' },
        { label: 'Lucro potencial', valor: 'R$ 200' },
        { label: 'LAY parcial para travar', valor: 'R$ 50 @ odd 3.00' },
        { label: 'Responsabilidade', valor: 'R$ 100' },
      ],
      cenarios: [
        {
          titulo: 'Se GANHAR',
          tipo: 'sucesso',
          linhas: [
            { icon: 'check', texto: 'Casa: +R$ 200' },
            { icon: 'check', texto: 'Exchange: -R$ 100' },
          ],
          resultado: 'Lucro travado: R$ 100',
        },
        {
          titulo: 'Se PERDER',
          tipo: 'neutro',
          linhas: [
            { icon: 'x', texto: 'Casa: -R$ 100' },
            { icon: 'check', texto: 'Exchange: +R$ 47,50' },
          ],
          resultado: 'Perda reduzida: -R$ 52,50',
        },
      ],
    },
  },
  neutralizar_greens: {
    titulo: 'Neutralizar Greens Inesperados',
    teoria: 'Após ganhar inesperadamente uma perna, você quer zerar o lucro excedente para não comprometer a estratégia de extração.',
    exemplo: {
      setup: [
        { label: 'Dupla com stake', valor: 'R$ 100' },
        { label: 'Perna 1', valor: 'GREEN @ odd 2.00 (lucro parcial +R$ 100)' },
        { label: 'Perna 2 pendente', valor: 'Odd 1.80' },
        { label: 'LAY para neutralizar', valor: 'R$ 200 @ odd 1.80' },
        { label: 'Responsabilidade', valor: 'R$ 160' },
      ],
      cenarios: [
        {
          titulo: 'Se perna 2 GANHAR',
          tipo: 'neutro',
          linhas: [
            { icon: 'check', texto: 'Casa: +R$ 160 (da múltipla)' },
            { icon: 'x', texto: 'Exchange: -R$ 160' },
          ],
          resultado: 'Resultado: R$ 0 (neutro)',
        },
        {
          titulo: 'Se perna 2 PERDER',
          tipo: 'sucesso',
          linhas: [
            { icon: 'x', texto: 'Casa: R$ 0' },
            { icon: 'check', texto: 'Exchange: +R$ 190' },
          ],
          resultado: 'Mantém extração original',
        },
      ],
    },
  },
};

export const ObjetivoExplicacaoDialog: React.FC<Props> = ({ tipo }) => {
  const data = explicacoes[tipo];

  return (
    <Dialog modal={true}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="p-1 hover:bg-muted rounded-full transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md z-[10000]">
        <DialogHeader>
          <DialogTitle className="text-lg">{data.titulo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Teoria */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground leading-relaxed">
              📌 <span className="font-medium text-foreground">Teoria:</span> {data.teoria}
            </p>
          </div>

          {/* Setup */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              📊 Exemplo Numérico
            </h4>
            <div className="space-y-1">
              {data.exemplo.setup.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{item.label}:</span>
                  <span className="font-mono text-xs">{item.valor}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cenários */}
          <div className="grid gap-3">
            {data.exemplo.cenarios.map((cenario, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg border ${
                  cenario.tipo === 'sucesso'
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-muted/30 border-border'
                }`}
              >
                <h5 className="text-sm font-medium mb-2">{cenario.titulo}</h5>
                <div className="space-y-1">
                  {cenario.linhas.map((linha, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs">
                      {linha.icon === 'check' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                      )}
                      <span className="text-muted-foreground">{linha.texto}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
                  <ArrowRight className="h-3.5 w-3.5 text-primary" />
                  <span className="text-sm font-medium">{cenario.resultado}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
