import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const SUSPICIOUS_THRESHOLD_HOURS = 72;

/**
 * Verifica se uma aposta tem data suspeita.
 * 
 * Uma data é considerada suspeita quando:
 * 1. |data_aposta - created_at| > 72 horas (possível erro de digitação), OU
 * 2. O ano de data_aposta é diferente do ano vigente (ano atual).
 */
export function isSuspiciousDate(dataAposta: string, createdAt: string): boolean {
  const aposta = new Date(dataAposta);
  const criacao = new Date(createdAt);
  const diffHours = Math.abs(aposta.getTime() - criacao.getTime()) / (1000 * 60 * 60);
  const currentYear = new Date().getFullYear();
  const apostaYear = aposta.getFullYear();
  return diffHours > SUSPICIOUS_THRESHOLD_HOURS || apostaYear !== currentYear;
}

/**
 * Hook para gerenciar filtro de datas suspeitas.
 * Recebe a lista completa de apostas e retorna contagem + toggle.
 */
export function useSuspiciousDateFilter<T extends Record<string, any>>(
  items: T[],
  /** Campo de data da operação (default: data_aposta) */
  dateField: string = "data_aposta"
) {
  const [active, setActive] = useState(false);

  const suspiciousCount = useMemo(() => {
    return items.filter(item => {
      const dataAposta = item[dateField];
      const createdAt = item.created_at;
      if (!dataAposta || !createdAt) return false;
      return isSuspiciousDate(dataAposta, createdAt);
    }).length;
  }, [items, dateField]);

  const filterFn = (item: T): boolean => {
    if (!active) return true;
    const dataAposta = item[dateField];
    const createdAt = item.created_at;
    if (!dataAposta || !createdAt) return false;
    return isSuspiciousDate(dataAposta, createdAt);
  };

  return {
    active,
    setActive,
    suspiciousCount,
    filterFn,
    hasSuspicious: suspiciousCount > 0,
  };
}

interface SuspiciousDateFilterButtonProps {
  active: boolean;
  onToggle: (active: boolean) => void;
  count: number;
  className?: string;
}

/**
 * Botão de filtro de datas suspeitas.
 * Só é renderizado quando há apostas com datas suspeitas (count > 0).
 */
export function SuspiciousDateFilterButton({
  active,
  onToggle,
  count,
  className,
}: SuspiciousDateFilterButtonProps) {
  if (count === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "default" : "outline"}
          size="sm"
          onClick={() => onToggle(!active)}
          className={cn(
            "h-8 gap-1.5 text-xs font-medium rounded-full px-3 transition-all",
            active
              ? "bg-amber-500/90 hover:bg-amber-500 text-white border-amber-500"
              : "border-amber-500/50 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400",
            className
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Datas Suspeitas
          <Badge
            variant="secondary"
            className={cn(
              "h-5 px-1.5 text-xs ml-0.5",
              active
                ? "bg-white/20 text-white"
                : "bg-amber-500/15 text-amber-500"
            )}
          >
            {count}
          </Badge>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[280px] text-xs">
        <p className="font-semibold mb-1">Apostas com datas suspeitas</p>
        <p className="text-muted-foreground">
          {count} {count === 1 ? "aposta foi registrada" : "apostas foram registradas"} com uma data de operação 
          que difere em mais de 48h da data de criação do registro. 
          Isso pode indicar erro de digitação na data.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
