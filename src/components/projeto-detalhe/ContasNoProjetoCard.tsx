/**
 * Painel de Relacionamentos do Projeto
 * 
 * Este card substitui os antigos cards separados e consolida:
 * - Contas no Projeto
 * - Parceiros Únicos  
 * - Bônus Creditados (como indicadores)
 * 
 * ESTRUTURA:
 * 
 * BLOCO A — Estado Atual:
 * - Contas ativas / limitadas
 * - Parceiros ativos
 * 
 * BLOCO B — Histórico do Projeto (não regressivo):
 * - Contas já utilizadas
 * - Contas já limitadas
 * - Parceiros únicos que já passaram
 * 
 * BLOCO C — Indicadores Operacionais:
 * - Casas com bônus
 * - Contas com bônus
 * - Parceiros com contas vinculadas
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { 
  Link2, 
  History, 
  AlertTriangle, 
  Users, 
  Gift,
  Building2,
  TrendingUp,
  Globe
} from "lucide-react";
import { useProjetoHistoricoContas } from "@/hooks/useProjetoHistoricoContas";

interface ContasNoProjetoCardProps {
  projetoId: string;
  hasForeignCurrency?: boolean;
}

export function ContasNoProjetoCard({ projetoId, hasForeignCurrency = false }: ContasNoProjetoCardProps) {
  const {
    // BLOCO A
    contasAtuais,
    contasAtivas,
    contasLimitadas,
    parceirosAtivos,
    // BLOCO B
    historicoTotalContas,
    historicoContasLimitadas,
    historicoParceirosUnicos,
    // BLOCO C
    casasComBonus,
    contasComBonus,
    parceirosComContasVinculadas,
    isLoading,
  } = useProjetoHistoricoContas(projetoId);

  if (isLoading) {
    return (
      <Card className="col-span-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-12" />
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-8" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Painel de Relacionamentos
        </CardTitle>
        {hasForeignCurrency && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-400">
            <Globe className="h-2.5 w-2.5 mr-1" />
            Multi-moeda
          </Badge>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* ============ BLOCO A — Estado Atual ============ */}
        <div className="grid grid-cols-2 gap-4">
          {/* Contas */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Contas</span>
            </div>
            <div className="text-2xl font-bold">{contasAtuais}</div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-emerald-400">{contasAtivas} ativas</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-yellow-400">{contasLimitadas} limitadas</span>
            </div>
          </div>
          
          {/* Parceiros */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Parceiros</span>
            </div>
            <div className="text-2xl font-bold">{parceirosAtivos}</div>
            <div className="text-xs text-muted-foreground">ativos no projeto</div>
          </div>
        </div>

        <Separator className="bg-border/50" />

        {/* ============ BLOCO B — Histórico do Projeto ============ */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Histórico</span>
          </div>
          
          <div className="flex flex-wrap gap-1.5">
            <Badge 
              variant="outline" 
              className="text-[10px] px-2 py-0.5 bg-muted/30 border-muted-foreground/20 text-muted-foreground font-normal"
            >
              {historicoTotalContas} contas já utilizadas
            </Badge>
            
            {historicoContasLimitadas > 0 && (
              <Badge 
                variant="outline" 
                className="text-[10px] px-2 py-0.5 bg-yellow-500/10 border-yellow-500/20 text-yellow-500/80 font-normal"
              >
                <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                {historicoContasLimitadas} já foram limitadas
              </Badge>
            )}
            
            <Badge 
              variant="outline" 
              className="text-[10px] px-2 py-0.5 bg-muted/30 border-muted-foreground/20 text-muted-foreground font-normal"
            >
              {historicoParceirosUnicos} parceiros únicos
            </Badge>
          </div>
          
          <p className="text-[10px] text-muted-foreground/70 italic">
            Estes contadores nunca diminuem — representam o passado operacional do projeto.
          </p>
        </div>

        <Separator className="bg-border/50" />

        {/* ============ BLOCO C — Indicadores Operacionais ============ */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Operacional</span>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            <div className="flex items-center gap-1.5 bg-muted/20 rounded-md px-2 py-1.5">
              <Gift className="h-3 w-3 text-purple-400" />
              <div>
                <div className="text-sm font-semibold">{casasComBonus}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">casas c/ bônus</div>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 bg-muted/20 rounded-md px-2 py-1.5">
              <Link2 className="h-3 w-3 text-purple-400" />
              <div>
                <div className="text-sm font-semibold">{contasComBonus}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">contas c/ bônus</div>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 bg-muted/20 rounded-md px-2 py-1.5">
              <Users className="h-3 w-3 text-blue-400" />
              <div>
                <div className="text-sm font-semibold">{parceirosComContasVinculadas}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">parceiros ativos</div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
