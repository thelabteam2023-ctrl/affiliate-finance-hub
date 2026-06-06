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
        {/* Left Section: Dot + Info */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div 
            className={cn("h-2.5 w-2.5 rounded-full shrink-0 mt-1.5", PRIORIDADE_DOTS[ocorrencia.prioridade])} 
            title={`Prioridade: ${ocorrencia.prioridade}`}
          />
          <div className="flex-1 min-w-0 space-y-1">
            {/* Context Line: House Logo + Name + Owner */}
            <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-tight text-muted-foreground/80">
              {bookmakerNome && (
                <div className="flex items-center gap-1.5 bg-muted/40 px-1.5 py-0.5 rounded border border-border/20">
                  {bookmakerLogoUrl ? (
                    <img src={bookmakerLogoUrl} alt="" className="h-3 w-3 rounded-sm object-contain" />
                  ) : (
                    <Building2 className="h-3 w-3" />
                  )}
                  <span className="text-primary truncate max-w-[100px]">{bookmakerNome}</span>
                </div>
              )}
              {parceiroNome && (
                <div className="flex items-center gap-1.5">
                  <div className="h-1 w-1 rounded-full bg-border" />
                  <span className="truncate">A Glória de <span className="text-foreground/90">{getFirstLastName(parceiroNome)}</span></span>
                </div>
              )}
              {projetoNome && !bookmakerNome && (
                <div className="flex items-center gap-1.5">
                  <FolderOpen className="h-3 w-3" />
                  <span className="truncate">{projetoNome}</span>
                </div>
              )}
            </div>

            {/* Title Line */}
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-semibold text-foreground truncate">
                {ocorrencia.titulo}
              </h4>
              <TipoBadge tipo={ocorrencia.tipo} />
            </div>
          </div>
        </div>

        {/* Right Section: Coordinator + Time + Value */}
        <div className="flex items-center gap-6 shrink-0 text-xs text-muted-foreground">
          {/* Coordinator Section */}
          <div className="hidden md:flex flex-col items-end gap-0.5 min-w-[100px]">
             <span className="text-[10px] uppercase font-bold tracking-tighter opacity-50">Coordenação</span>
             <div className="flex items-center gap-2">
                <span className="font-medium text-foreground/80 truncate max-w-[80px]">
                  {ocorrencia.executor?.full_name ? getFirstLastName(ocorrencia.executor.full_name) : 'Sem executor'}
                </span>
                <div className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center border transition-colors shrink-0",
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
          </div>

          {/* Time Section */}
          <div className="flex flex-col items-end gap-0.5 w-[70px]">
            <span className="text-[10px] uppercase font-bold tracking-tighter opacity-50">Atualizado</span>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 opacity-60" />
              <span className="whitespace-nowrap font-medium">{formatDistanceToNow(new Date(ocorrencia.created_at), { addSuffix: true, locale: ptBR, includeSeconds: false }).replace('aproximadamente ', '').replace('há ', '')}</span>
            </div>
          </div>

          {/* Value Section */}
          <div className="w-[85px] flex flex-col items-end gap-0.5">
            <span className="text-[10px] uppercase font-bold tracking-tighter opacity-50">Risco</span>
            {(ocorrencia as any).valor_risco > 0 ? (
              <div className="flex items-center gap-1 font-bold text-red-500/90">
                <DollarSign className="h-3 w-3" />
                <span>
                  {getCurrencySymbol((ocorrencia as any).moeda || 'BRL')}
                  {Number((ocorrencia as any).valor_risco).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                </span>
              </div>
            ) : (
              <span className="opacity-20 font-bold">—</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
