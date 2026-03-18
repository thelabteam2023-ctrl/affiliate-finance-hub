import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const SUSPICIOUS_THRESHOLD_HOURS = 48;

/**
 * Verifica se uma aposta tem data suspeita.
 * 
 * Uma data é considerada suspeita quando a diferença entre
 * data_aposta (data informada pelo operador) e created_at (data real do registro)
 * é maior que 48 horas, indicando possível erro de digitação.
 */
export function isSuspiciousDate(dataAposta: string, createdAt: string): boolean {
  const aposta = new Date(dataAposta).getTime();
  const criacao = new Date(createdAt).getTime();
  const diffHours = Math.abs(aposta - criacao) / (1000 * 60 * 60);
  return diffHours > SUSPICIOUS_THRESHOLD_HOURS;
}

/**
 * Hook para gerenciar filtro de datas suspeitas.
 * Recebe a lista completa de apostas e retorna contagem + toggle.
 */
export function useSuspiciousDateFilter<T extends { data_aposta?: string; created_at?: string }>(
  items: T[]
) {
  const [active, setActive] = useState(false);

  const suspiciousCount = useMemo(() => {
    return items.filter(item => {
      if (!item.data_aposta || !item.created_at) return false;
      return isSuspiciousDate(item.data_aposta, item.created_at);
    }).length;
  }, [items]);

  const filterFn = (item: T): boolean => {
    if (!active) return true;
    if (!item.data_aposta || !item.created_at) return false;
    return isSuspiciousDate(item.data_aposta, item.created_at);
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
