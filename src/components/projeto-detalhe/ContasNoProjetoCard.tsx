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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Link2, 
  History, 
  AlertTriangle, 
  Users, 
  Gift,
  Building2,
  TrendingUp,
  Globe,
  HelpCircle,
  Info
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
    historicoContasLista,
    historicoContasLimitadasLista,
    historicoParceirosLista,
    // BLOCO C
    casasComBonus,
    contasComBonus,
    parceirosComContasVinculadas,
    casasComBonusLista,
    contasComBonusLista,
    parceirosAtivosLista,
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
    <TooltipProvider delayDuration={200}>
      <Card className="col-span-2">
        <CardHeader className="flex flex-row items-center justify-center space-y-0 pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Painel de Relacionamentos
          </CardTitle>
          {hasForeignCurrency && (
            <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-400">
              <Globe className="h-2.5 w-2.5 mr-1" />
              Multi-moeda
            </Badge>
          )}
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* ============ BLOCO A — Estado Atual ============ */}
          <div className="grid grid-cols-2 gap-4">
            {/* Contas */}
            <div className="flex flex-col items-center justify-center text-center space-y-1">
              <div className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Contas</span>
              </div>
              <div className="text-2xl font-bold">{contasAtuais}</div>
              <div className="flex items-center justify-center gap-2 text-xs">
                <span className="text-emerald-400">{contasAtivas} ativas</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-yellow-400">{contasLimitadas} limitadas</span>
              </div>
            </div>
            
            {/* Parceiros */}
            <div className="flex flex-col items-center justify-center text-center space-y-1">
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
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-1.5">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Histórico</span>
            </div>
            
            <div className="flex flex-wrap justify-center gap-2">
              {/* Contas já utilizadas - com tooltip */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge 
                    variant="outline" 
                    className="text-[10px] px-2 py-0.5 bg-muted/30 border-muted-foreground/20 text-muted-foreground font-normal cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    {historicoTotalContas} contas já utilizadas
                    <Info className="h-2.5 w-2.5 ml-1 opacity-50" />
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs p-0">
                  <div className="p-2 border-b border-border/50">
                    <p className="text-xs font-medium">Histórico de contas</p>
                    <p className="text-[10px] text-muted-foreground">Todas as contas que já passaram pelo projeto</p>
                  </div>
                  <ScrollArea className="max-h-48">
                    <div className="p-2 space-y-1">
                      {historicoContasLista.length > 0 ? (
                        historicoContasLista.map((conta) => (
                          <div key={conta.id} className="flex items-center justify-between text-[10px] py-0.5">
                            <span className="font-medium">{conta.nome}</span>
                            <span className="text-muted-foreground ml-2">
                              {conta.parceiroNome ? `— ${conta.parceiroNome}` : ""}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[10px] text-muted-foreground italic">Nenhum histórico</p>
                      )}
                    </div>
                  </ScrollArea>
                </TooltipContent>
              </Tooltip>
              
              {/* Contas já limitadas - com tooltip */}
              {historicoContasLimitadas > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge 
                      variant="outline" 
                      className="text-[10px] px-2 py-0.5 bg-yellow-500/10 border-yellow-500/20 text-yellow-500/80 font-normal cursor-pointer hover:bg-yellow-500/20 transition-colors"
                    >
                      <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                      {historicoContasLimitadas} já foram limitadas
                      <Info className="h-2.5 w-2.5 ml-1 opacity-50" />
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs p-0">
                    <div className="p-2 border-b border-border/50">
                      <p className="text-xs font-medium">Contas que já foram limitadas</p>
                      <p className="text-[10px] text-muted-foreground">Histórico de limitações no projeto</p>
                    </div>
                    <ScrollArea className="max-h-48">
                      <div className="p-2 space-y-1">
                        {historicoContasLimitadasLista.length > 0 ? (
                          historicoContasLimitadasLista.map((conta) => (
                            <div key={conta.id} className="flex items-center justify-between text-[10px] py-0.5">
                              <span className="font-medium text-yellow-500/80">{conta.nome}</span>
                              <span className="text-muted-foreground ml-2">
                                {conta.parceiroNome ? `— ${conta.parceiroNome}` : ""}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-[10px] text-muted-foreground italic">Nenhuma conta limitada</p>
                        )}
                      </div>
                    </ScrollArea>
                  </TooltipContent>
                </Tooltip>
              )}
              
              {/* Parceiros únicos - com tooltip */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge 
                    variant="outline" 
                    className="text-[10px] px-2 py-0.5 bg-muted/30 border-muted-foreground/20 text-muted-foreground font-normal cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    {historicoParceirosUnicos} parceiros únicos
                    <Info className="h-2.5 w-2.5 ml-1 opacity-50" />
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs p-0">
                  <div className="p-2 border-b border-border/50">
                    <p className="text-xs font-medium">Parceiros que já passaram pelo projeto</p>
                    <p className="text-[10px] text-muted-foreground">Total de contas por parceiro</p>
                  </div>
                  <ScrollArea className="max-h-48">
                    <div className="p-2 space-y-1">
                      {historicoParceirosLista.length > 0 ? (
                        historicoParceirosLista.map((parceiro) => (
                          <div key={parceiro.id} className="flex items-center justify-between text-[10px] py-0.5">
                            <span className="font-medium">{parceiro.nome}</span>
                            <span className="text-muted-foreground ml-2">
                              — {parceiro.totalContas} conta{parceiro.totalContas !== 1 ? "s" : ""}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[10px] text-muted-foreground italic">Nenhum parceiro</p>
                      )}
                    </div>
                  </ScrollArea>
                </TooltipContent>
              </Tooltip>
            </div>
            
            <p className="text-[10px] text-muted-foreground/70 italic text-center">
              Estes contadores nunca diminuem — representam o passado operacional do projeto.
            </p>
          </div>

          <Separator className="bg-border/50" />

          {/* ============ BLOCO C — Indicadores Operacionais ============ */}
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Operacional</span>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              {/* Casas com bônus */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center justify-center gap-1 bg-muted/20 rounded-md px-2 py-2 cursor-pointer hover:bg-muted/30 transition-colors">
                    <Gift className="h-3.5 w-3.5 text-purple-400" />
                    <div className="text-sm font-semibold text-center">{casasComBonus}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight text-center">casas c/ bônus</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs p-0">
                  <div className="p-2 border-b border-border/50">
                    <p className="text-xs font-medium">Casas com bônus ativo</p>
                    <p className="text-[10px] text-muted-foreground">
                      Quantidade de casas de apostas que possuem pelo menos uma conta neste projeto com saldo de bônus ou freebet ativo.
                    </p>
                  </div>
                  {casasComBonusLista.length > 0 && (
                    <ScrollArea className="max-h-32">
                      <div className="p-2 space-y-1">
                        {casasComBonusLista.map((casa) => (
                          <div key={casa.id} className="text-[10px] py-0.5 font-medium">
                            {casa.nome}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </TooltipContent>
              </Tooltip>
              
              {/* Contas com bônus */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center justify-center gap-1 bg-muted/20 rounded-md px-2 py-2 cursor-pointer hover:bg-muted/30 transition-colors">
                    <Link2 className="h-3.5 w-3.5 text-purple-400" />
                    <div className="text-sm font-semibold text-center">{contasComBonus}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight text-center">contas c/ bônus</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs p-0">
                  <div className="p-2 border-b border-border/50">
                    <p className="text-xs font-medium">Contas com bônus ativo</p>
                    <p className="text-[10px] text-muted-foreground">
                      Quantidade de contas individuais que possuem bônus, freebet ou crédito promocional ativo, mesmo dentro da mesma casa.
                    </p>
                  </div>
                  {contasComBonusLista.length > 0 && (
                    <ScrollArea className="max-h-32">
                      <div className="p-2 space-y-1">
                        {contasComBonusLista.map((conta) => (
                          <div key={conta.id} className="flex items-center justify-between text-[10px] py-0.5">
                            <span className="font-medium">{conta.nome}</span>
                            {conta.parceiroNome && (
                              <span className="text-muted-foreground ml-2">— {conta.parceiroNome}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </TooltipContent>
              </Tooltip>
              
              {/* Parceiros ativos */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center justify-center gap-1 bg-muted/20 rounded-md px-2 py-2 cursor-pointer hover:bg-muted/30 transition-colors">
                    <Users className="h-3.5 w-3.5 text-blue-400" />
                    <div className="text-sm font-semibold text-center">{parceirosComContasVinculadas}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight text-center">parceiros ativos</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs p-0">
                  <div className="p-2 border-b border-border/50">
                    <p className="text-xs font-medium">Parceiros ativos</p>
                    <p className="text-[10px] text-muted-foreground">
                      Número de parceiros que atualmente possuem pelo menos uma conta vinculada ao projeto.
                    </p>
                  </div>
                  {parceirosAtivosLista.length > 0 && (
                    <ScrollArea className="max-h-32">
                      <div className="p-2 space-y-1">
                        {parceirosAtivosLista.map((parceiro) => (
                          <div key={parceiro.id} className="flex items-center justify-between text-[10px] py-0.5">
                            <span className="font-medium">{parceiro.nome}</span>
                            <span className="text-muted-foreground ml-2">
                              — {parceiro.totalContas} conta{parceiro.totalContas !== 1 ? "s" : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
