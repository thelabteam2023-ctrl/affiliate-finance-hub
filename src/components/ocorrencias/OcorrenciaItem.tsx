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
import { TipoBadge, StatusBadge } from './OcorrenciaBadges';



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
      <CardContent className="p-2 px-3 flex items-center justify-between gap-4">
        {/* Left Section: Priority + Title + Badges */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div 
            className={cn("h-2 w-2 rounded-full shrink-0", PRIORIDADE_DOTS[ocorrencia.prioridade])} 
            title={`Prioridade: ${ocorrencia.prioridade}`}
          />
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-foreground truncate max-w-[300px] group-hover:text-primary transition-colors">
              {ocorrencia.titulo}
            </h4>
            <div className="flex items-center gap-2 shrink-0">
              <TipoBadge tipo={ocorrencia.tipo} />
              <StatusBadge status={ocorrencia.status} />
            </div>
          </div>
        </div>

        {/* Right Section: Entity, Time, Value */}
        <div className="flex items-center gap-6 shrink-0 text-xs">
          {/* Entity Info - Compact */}
          <div className="hidden lg:flex items-center gap-2 min-w-[200px] max-w-[240px] text-muted-foreground">
            {bookmakerNome ? (
              <div className="flex items-center gap-2 truncate w-full">
                <div className="h-6 w-6 rounded flex items-center justify-center bg-muted/50 shrink-0 border border-border/20">
                  {bookmakerLogoUrl ? (
                    <img src={bookmakerLogoUrl} alt="" className="h-4 w-4 object-contain" />
                  ) : (
                    <Building2 className="h-3.5 w-3.5 opacity-40" />
                  )}
                </div>
                <div className="flex flex-col min-w-0 leading-tight">
                  <span className="font-bold text-foreground/80 truncate text-[11px] uppercase tracking-tight">{bookmakerNome}</span>
                  {parceiroNome && (
                    <span className="text-[9px] opacity-50 truncate">{getFirstLastName(parceiroNome)}</span>
                  )}
                </div>
              </div>
            ) : projetoNome ? (
              <div className="flex items-center gap-2 truncate w-full">
                <div className="h-6 w-6 rounded flex items-center justify-center bg-muted/50 shrink-0 border border-border/20">
                  <FolderOpen className="h-3.5 w-3.5 opacity-40" />
                </div>
                <span className="font-bold text-foreground/80 truncate text-[11px] uppercase tracking-tight">{projetoNome}</span>
              </div>
            ) : null}
          </div>

          {/* Timestamp */}
          <div className="flex items-center gap-1.5 text-muted-foreground/60 w-[85px] justify-end">
            <Clock className="h-3 w-3" />
            <span className="tabular-nums whitespace-nowrap">{formatDistanceToNow(new Date(ocorrencia.created_at), { addSuffix: true, locale: ptBR, includeSeconds: false }).replace('aproximadamente ', '').replace('há ', '')}</span>
          </div>

          {/* Value - Highlighted */}
          <div className="w-[100px] flex justify-end">
            {(ocorrencia as any).valor_risco > 0 ? (
              <div className="flex items-center gap-1 font-black text-red-500">
                <span className="text-[10px] opacity-70">{getCurrencySymbol((ocorrencia as any).moeda || 'BRL')}</span>
                <span className="text-sm">{Number((ocorrencia as any).valor_risco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            ) : (
              <span className="text-muted-foreground/20 font-bold">—</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


