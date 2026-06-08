import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Building2,
  Clock,
  DollarSign,
  User,
  AlertTriangle,
  FolderOpen,
} from 'lucide-react';
import { getCurrencySymbol } from '@/types/currency';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, getFirstLastName } from '@/lib/utils';
import type { Ocorrencia } from '@/types/ocorrencias';
import { PRIORIDADE_DOTS } from './ocorrencia-tokens';
import { TipoBadge } from './OcorrenciaBadges';


interface Props {
  ocorrencia: Ocorrencia;
  currentUserId?: string;
  onOpen: () => void;
  bookmakerNome?: string;
  bookmakerLogoUrl?: string | null;
  projetoNome?: string;
  parceiroNome?: string;
}

export function OcorrenciaItem({
  ocorrencia,
  currentUserId,
  onOpen,
  bookmakerNome,
  bookmakerLogoUrl,
  projetoNome,
  parceiroNome,
}: Props) {
  const isExecutor = ocorrencia.executor_id === currentUserId;

  return (
    <Card 
      className={cn(
        "group cursor-pointer hover:bg-muted/30 transition-all border-border/40 relative overflow-hidden bg-background",
      )}
      onClick={onOpen}
    >
      <CardContent className="p-4 flex items-center justify-between gap-6">
        {/* Left: Main info (Title, Type, Value) */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div 
                  className={cn("h-2.5 w-2.5 rounded-full shrink-0", PRIORIDADE_DOTS[ocorrencia.prioridade])} 
                  title={`Prioridade: ${ocorrencia.prioridade}`}
                />
                <h4 className="text-base font-bold text-foreground truncate group-hover:text-primary transition-colors">
                  {ocorrencia.titulo}
                </h4>
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                <TipoBadge tipo={ocorrencia.tipo} />
                <span className="text-muted-foreground/30">•</span>
                <StatusBadge status={ocorrencia.status} />
              </div>
            </div>

            <div className="text-right shrink-0">
              {(ocorrencia as any).valor_risco > 0 ? (
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-black uppercase tracking-widest text-red-500/60 mb-0.5">Disputa</span>
                  <div className="flex items-center gap-1 font-black text-lg text-red-500 leading-none">
                    <span className="text-sm opacity-70">{getCurrencySymbol((ocorrencia as any).moeda || 'BRL')}</span>
                    <span>{Number((ocorrencia as any).valor_risco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-end opacity-20">
                   <span className="text-[10px] font-black uppercase tracking-widest mb-0.5">Sem Valor</span>
                   <span className="text-lg font-black">—</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border/20 pt-2.5 mt-2.5">
            {/* Entity Info */}
            <div className="flex items-center gap-3">
              {bookmakerNome ? (
                <div className="flex items-center gap-2 bg-muted/30 px-2 py-1 rounded border border-border/30">
                  {bookmakerLogoUrl ? (
                    <img src={bookmakerLogoUrl} alt="" className="h-3.5 w-3.5 rounded-sm object-contain" />
                  ) : (
                    <Building2 className="h-3.5 w-3.5" />
                  )}
                  <span className="font-bold text-foreground/80">{bookmakerNome}</span>
                  {parceiroNome && (
                    <>
                      <span className="text-muted-foreground/30">|</span>
                      <span className="text-[11px]">{getFirstLastName(parceiroNome)}</span>
                    </>
                  )}
                </div>
              ) : projetoNome ? (
                <div className="flex items-center gap-2 bg-muted/30 px-2 py-1 rounded border border-border/30">
                  <FolderOpen className="h-3.5 w-3.5" />
                  <span className="font-bold text-foreground/80">{projetoNome}</span>
                </div>
              ) : null}
            </div>

            <div className="flex-1" />

            {/* Timestamps */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 opacity-80" title="Criado em">
                <Clock className="h-3.5 w-3.5" />
                <span className="font-medium">{formatDistanceToNow(new Date(ocorrencia.created_at), { addSuffix: true, locale: ptBR, includeSeconds: false })}</span>
              </div>
              
              {isExecutor && (
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] uppercase font-black px-2 py-0">
                  Atribuído a você
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

