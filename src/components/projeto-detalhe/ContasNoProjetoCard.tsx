/**
 * Card "Contas no Projeto"
 * 
 * REGRA DE EXIBIÇÃO:
 * 
 * Nível 1 — Estado Atual:
 * - Contas ativas
 * - Contas atualmente limitadas
 * 
 * Nível 2 — Histórico Consolidado:
 * - Total histórico de contas já vinculadas (NUNCA diminui)
 * - Total de contas que já foram limitadas
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link2, Globe, History, AlertTriangle } from "lucide-react";
import { useProjetoHistoricoContas } from "@/hooks/useProjetoHistoricoContas";

interface ContasNoProjetoCardProps {
  projetoId: string;
  hasForeignCurrency?: boolean;
}

export function ContasNoProjetoCard({ projetoId, hasForeignCurrency = false }: ContasNoProjetoCardProps) {
  const {
    contasAtuais,
    contasAtivas,
    contasLimitadas,
    historicoTotalContas,
    historicoContasLimitadas,
    isLoading,
  } = useProjetoHistoricoContas(projetoId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16 mb-2" />
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Contas no Projeto</CardTitle>
        <Link2 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Nível 1 - Estado Atual */}
        <div>
          <div className="text-2xl font-bold">
            {contasAtuais}
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="text-emerald-400">{contasAtivas} ativas</span>
            {" · "}
            <span className="text-yellow-400">{contasLimitadas} limitadas</span>
          </p>
        </div>

        {/* Nível 2 - Histórico Consolidado */}
        {historicoTotalContas > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                  <History className="h-3.5 w-3.5 text-muted-foreground" />
                  <div className="flex flex-wrap gap-1.5">
                    <Badge 
                      variant="outline" 
                      className="text-[10px] px-1.5 py-0 bg-muted/30 border-muted-foreground/20 text-muted-foreground font-normal"
                    >
                      {historicoTotalContas} já usadas
                    </Badge>
                    {historicoContasLimitadas > 0 && (
                      <Badge 
                        variant="outline" 
                        className="text-[10px] px-1.5 py-0 bg-yellow-500/10 border-yellow-500/20 text-yellow-500/80 font-normal"
                      >
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                        {historicoContasLimitadas} limitações
                      </Badge>
                    )}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[200px]">
                <div className="space-y-1">
                  <p className="font-medium text-xs">Histórico Consolidado</p>
                  <p className="text-[10px] text-muted-foreground">
                    Total de contas já vinculadas ao projeto (inclui desvinculadas e devolvidas).
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Este contador nunca diminui.
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Indicador multi-moeda */}
        {hasForeignCurrency && (
          <div className="flex items-center gap-1">
            <Globe className="h-3 w-3 text-blue-400" />
            <span className="text-[10px] text-blue-400">Multi-moeda</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
