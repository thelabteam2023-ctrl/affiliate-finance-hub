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
  const isSlaViolado = false; // SLA extinguido

  return (
    <Card 
      className={cn(
        "group cursor-pointer hover:bg-muted/30 transition-all border-border/40 relative overflow-hidden",
        isSlaViolado && "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-red-500"
      )}

      onClick={onOpen}
    >
      <CardContent className="p-3 flex items-center justify-between gap-4">
        {/* Left Section: Dot + Title + Type */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div 
            className={cn("h-2.5 w-2.5 rounded-full shrink-0", PRIORIDADE_DOTS[ocorrencia.prioridade])} 
            title={`Prioridade: ${ocorrencia.prioridade}`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-foreground truncate">
                {ocorrencia.titulo}
              </h4>
              <TipoBadge tipo={ocorrencia.tipo} />
            </div>

          </div>
        </div>


        {/* Right Section: Entity + Responsible + Time + Value */}
        <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
          {/* Linked Entity */}
          <div className="hidden sm:flex items-center gap-2 min-w-[140px]">
            {bookmakerNome ? (
              <div className="flex flex-col gap-0.5 max-w-[120px]">
                <div className="flex items-center gap-1.5">
                  {bookmakerLogoUrl ? (
                    <img src={bookmakerLogoUrl} alt="" className="h-3.5 w-3.5 rounded-sm object-contain" />
                  ) : (
                    <Building2 className="h-3 w-3" />
                  )}
                  <span className="truncate font-medium">{bookmakerNome}</span>
                </div>
                {parceiroNome && (
                  <div className="flex items-center gap-1 pl-5">
                    <span className="text-[10px] text-muted-foreground/70 truncate">{getFirstLastName(parceiroNome)}</span>
                  </div>
                )}
              </div>
            ) : projetoNome ? (
              <div className="flex items-center gap-1.5 max-w-[120px]">
                <FolderOpen className="h-3.5 w-3.5" />
                <span className="truncate font-medium">{projetoNome}</span>
              </div>
            ) : null}
          </div>


          {/* Responsible */}
          <div className="flex items-center gap-1.5 w-8 justify-center">
            <div className={cn(
              "h-6 w-6 rounded-full flex items-center justify-center border transition-colors",
              isExecutor ? "bg-primary/20 border-primary/30 text-primary" : "bg-muted border-border"
            )}>
              {isExecutor ? (
                <User className="h-3.5 w-3.5" />
              ) : (
                <span className="text-[10px] font-bold">
                  {ocorrencia.executor?.full_name?.charAt(0) || '?'}
                </span>
              )}
            </div>
          </div>

          {/* Time */}
          <div className="flex items-center gap-1.5 w-[80px] justify-end">
            <Clock className="h-3.5 w-3.5 opacity-60" />
            <span>{formatDistanceToNow(new Date(ocorrencia.created_at), { addSuffix: true, locale: ptBR, includeSeconds: false }).replace('aproximadamente ', '').replace('há ', '')}</span>
          </div>

          {/* Value Indicator */}
          <div className="w-[80px] flex justify-end">
            {(ocorrencia as any).valor_risco > 0 ? (
              <div className="flex items-center gap-1 font-semibold text-red-500/90">
                <DollarSign className="h-3 w-3" />
                <span>
                  {getCurrencySymbol((ocorrencia as any).moeda || 'BRL')}
                  {Number((ocorrencia as any).valor_risco).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                </span>
              </div>
            ) : (
              <span className="opacity-20">—</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
