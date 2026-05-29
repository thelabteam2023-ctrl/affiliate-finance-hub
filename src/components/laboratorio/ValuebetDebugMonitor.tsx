import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, CheckCircle2, RefreshCw, Terminal, Search, ShieldAlert, Database, Info, Activity, Microscope, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

interface ValuebetDebugMonitorProps {
  workspaceId: string | null;
  projectIds: string[] | null;
  rpcData: any;
  rpcError: any;
  rpcLoading: boolean;
}

export function ValuebetDebugMonitor({
  workspaceId,
  projectIds,
  rpcData,
  rpcError,
  rpcLoading
}: ValuebetDebugMonitorProps) {
  const [logs, setLogs] = useState<{ msg: string; type: "info" | "error" | "success" | "warning"; timestamp: string }[]>([]);
  const queryClient = useQueryClient();

  const addLog = (msg: string, type: "info" | "error" | "success" | "warning" = "info") => {
    setLogs(prev => [{ msg, type, timestamp: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
  };

  // 1. Auditoria de dados brutos (ignorando filtros da RPC)
  const { data: audit, refetch: refetchAudit, isFetching: auditing } = useQuery({
    queryKey: ["valuebet-deep-audit", workspaceId, projectIds],
    queryFn: async () => {
      addLog("Iniciando auditoria profunda de integridade...", "info");
      
      const { data: auditResult, error: auditError } = await supabase.rpc("audit_valuebet_integrity", {
        p_project_ids: projectIds && projectIds.length > 0 ? projectIds : null
      });

      if (auditError) {
        addLog(`Erro na RPC de Auditoria: ${auditError.message}`, "error");
        throw auditError;
      }

      addLog("Auditoria concluída com sucesso.", "success");
      return auditResult as {
        wrong_workspace: number;
        wrong_case: number;
        pending: number;
        excluded_status: number;
        healthy: number;
        column_health?: {
          total: number;
          filled_stake_cons: number;
          filled_pl_cons: number;
          filled_valor_brl: number;
          filled_stake_total: number;
          filled_lp_raw: number;
        };
      };
    },
    enabled: !!workspaceId && !!projectIds && projectIds.length > 0,
  });

  // Efeito para monitorar erros e performance da RPC principal
  useEffect(() => {
    if (rpcError) {
      addLog(`Falha na RPC Principal: ${rpcError.message || JSON.stringify(rpcError)}`, "error");
    }
    if (rpcData?._metadata?.fetch_duration_ms) {
      const duration = rpcData._metadata.fetch_duration_ms;
      if (duration > 1500) {
        addLog(`ALERTA: Latência elevada (${duration.toFixed(0)}ms).`, "warning");
      } else {
        addLog(`Ecossistema estável (${duration.toFixed(0)}ms).`, "success");
      }
    }
  }, [rpcError, rpcData]);

  const diagnostics = () => {
    const results = [];
    
    if (!projectIds || projectIds.length === 0) {
      results.push({ 
        msg: `AGUARDANDO SELEÇÃO: Escolha ao menos um projeto para iniciar o diagnóstico de integridade.`, 
        type: "info" 
      });
      return results;
    }
    
    if (rpcError) {
      results.push({ 
        msg: `ERRO DE SISTEMA: A RPC principal falhou. Verifique logs do console.`, 
        type: "error" 
      });
    }


    if (audit) {
      if (audit.wrong_workspace > 0) {
        results.push({ 
          msg: `CRÍTICO: ${audit.wrong_workspace} apostas pertencem a outro workspace e estão invisíveis.`, 
          type: "error" 
        });
      }
      
      if (audit.wrong_case > 0) {
        results.push({ 
          msg: `AVISO: ${audit.wrong_case} apostas com grafia errada (Ex: valuebet ao invés de VALUEBET).`, 
          type: "warning" 
        });
      }

      if (audit.pending > 0) {
        results.push({ 
          msg: `INFORMAÇÃO: ${audit.pending} apostas PENDENTES (não entram nos KPIs por padrão).`, 
          type: "info" 
        });
      }

      if (audit.excluded_status > 0) {
        results.push({ 
          msg: `AVISO: ${audit.excluded_status} apostas com status não suportado pelo Laboratório.`, 
          type: "warning" 
        });
      }

      if (audit.healthy > 0 && (!rpcData?.kpis?.total_bets || rpcData.kpis.total_bets === 0)) {
        results.push({ 
          msg: `FILTRO DE DATA: Existem ${audit.healthy} apostas saudáveis, mas o período selecionado não as engloba.`, 
          type: "warning" 
        });
      }
    }

    if (audit?.column_health) {
      const total = audit.column_health.total || 1;
      const lpRate = (audit.column_health.filled_pl_cons + audit.column_health.filled_lp_raw) > 0 ? 1 : 0;
      const stakeRate = (audit.column_health.filled_stake_cons + audit.column_health.filled_valor_brl + audit.column_health.filled_stake_total) > 0 ? 1 : 0;
      
      const filledLP = Math.max(audit.column_health.filled_pl_cons, audit.column_health.filled_lp_raw);
      const filledStake = Math.max(audit.column_health.filled_stake_cons, audit.column_health.filled_valor_brl, audit.column_health.filled_stake_total);
      
      const lpCoverage = filledLP / total;
      const stakeCoverage = filledStake / total;

      if (lpCoverage < 0.95 || stakeCoverage < 0.95) {
        results.push({
          msg: `OBSERVABILIDADE: Coverage financeiro baixo (PL: ${(lpCoverage * 100).toFixed(1)}%, Stake: ${(stakeCoverage * 100).toFixed(1)}%). Os lucros e ROI podem estar subestimados.`,
          type: "error"
        });
      } else if (audit.column_health.filled_stake_cons === 0 && filledStake > 0) {
        results.push({
          msg: `AUTO-CURA ATIVA: Coluna principal de Stake está vazia. O sistema está utilizando fallbacks (valor_brl_referencia) para calcular ROI corretamente.`,
          type: "success"
        });
      }
    }

    return results;
  };

  const diagnosticResults = diagnostics();

  return (
    <Card className="border-border bg-black/40 backdrop-blur-md mt-10">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-500" />
          <CardTitle className="text-sm font-bold uppercase tracking-widest">
            Monitor de Diagnóstico e Auto-Cura
          </CardTitle>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-muted/40 rounded-full border border-border/20">
            <Activity className={cn("h-3 w-3", rpcData?._metadata?.fetch_duration_ms > 1000 ? "text-amber-500" : "text-emerald-500")} />
            <span className="text-[10px] font-bold tabular-nums">
              {rpcData?._metadata?.fetch_duration_ms ? `${rpcData._metadata.fetch_duration_ms.toFixed(0)}ms` : "--"}
            </span>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 gap-2 bg-card hover:bg-primary/10 hover:text-primary transition-all"
            onClick={() => {
              refetchAudit();
              queryClient.invalidateQueries({ queryKey: ["laboratorio-valuebet"] });
            }}
            disabled={auditing || rpcLoading}
          >
            <RefreshCw className={cn("h-3 w-3", (auditing || rpcLoading) && "animate-spin")} />
            Diagnóstico Profundo
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lado Esquerdo: Resultados do Diagnóstico */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-muted-foreground flex items-center gap-2">
                <Microscope className="h-3 w-3" /> LABORATÓRIO DE TESTES
              </h3>
              <Badge variant="outline" className="text-[9px] border-primary/20 text-primary">Modo Observador</Badge>
            </div>
            
            <div className="space-y-2">
              {diagnosticResults.length === 0 && !auditing && (
                <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs text-emerald-400 font-medium">Ecossistema saudável: {audit?.healthy || 0} apostas integras detectadas.</span>
                </div>
              )}
              
              {diagnosticResults.map((res, i) => (
                <div key={i} className={cn(
                  "flex flex-col gap-2 p-3 border rounded-lg",
                  res.type === "error" ? "bg-red-500/10 border-red-500/20" : 
                  res.type === "warning" ? "bg-amber-500/10 border-amber-500/20" : "bg-blue-500/10 border-blue-500/20"
                )}>
                  <div className="flex items-start gap-2">
                    {res.type === "error" ? <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" /> : 
                     res.type === "warning" ? <ShieldAlert className="h-4 w-4 text-amber-500 mt-0.5" /> : 
                     <Info className="h-4 w-4 text-blue-500 mt-0.5" />}
                    <span className={cn(
                      "text-xs font-medium",
                      res.type === "error" ? "text-red-400" : res.type === "warning" ? "text-amber-400" : "text-blue-400"
                    )}>{res.msg}</span>
                  </div>
                  {res.action && (
                    <Button variant="link" className="text-[10px] h-auto p-0 w-fit text-primary-foreground underline">
                      Tentar auto-regeneração: {res.action}
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
              <div className="bg-card/50 p-3 rounded-lg border border-border/20 group hover:border-primary/30 transition-colors">
                <p className="text-[10px] text-muted-foreground font-bold uppercase mb-1 flex items-center gap-1">
                  <Wrench className="h-2.5 w-2.5" /> Latência
                </p>
                <span className={cn(
                  "text-xs font-bold tabular-nums",
                  rpcData?._metadata?.fetch_duration_ms > 1000 ? "text-amber-500" : "text-emerald-500"
                )}>
                  {rpcData?._metadata?.fetch_duration_ms ? `${rpcData._metadata.fetch_duration_ms.toFixed(1)}ms` : "N/A"}
                </span>
              </div>
              <div className="bg-card/50 p-3 rounded-lg border border-border/20 group hover:border-primary/30 transition-colors">
                <p className="text-[10px] text-muted-foreground font-bold uppercase mb-1">Total Auditado</p>
                <div className="flex items-center gap-2">
                  <Database className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-bold">{(audit?.healthy || 0) + (audit?.pending || 0) + (audit?.wrong_workspace || 0)}</span>
                </div>
              </div>
              <div className="bg-card/50 p-3 rounded-lg border border-border/20 group hover:border-primary/30 transition-colors">
                <p className="text-[10px] text-muted-foreground font-bold uppercase mb-1">Cobertura PL/Stake</p>
                <div className="flex items-center gap-2">
                  <Activity className={cn("h-3 w-3", ( (audit?.column_health?.filled_pl_cons || 0) / (audit?.column_health?.total || 1)) < 0.9 ? "text-amber-500" : "text-emerald-500")} />
                  <span className="text-xs font-bold">
                    {audit?.column_health ? `${((Math.max(audit.column_health.filled_pl_cons, audit.column_health.filled_lp_raw) / (audit.column_health.total || 1)) * 100).toFixed(0)}% / ${((Math.max(audit.column_health.filled_stake_cons, audit.column_health.filled_valor_brl, audit.column_health.filled_stake_total) / (audit.column_health.total || 1)) * 100).toFixed(0)}%` : "--"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Lado Direito: Console Técnico */}
          <div className="flex flex-col h-[300px]">
            <h3 className="text-xs font-bold text-muted-foreground flex items-center gap-2 mb-2">
              <Terminal className="h-3 w-3" /> CONSOLE DO ECOSSISTEMA
            </h3>
            <ScrollArea className="flex-1 bg-black/60 rounded-lg border border-border/40 p-4 font-mono text-[10px]">
              {logs.map((log, i) => (
                <div key={i} className="mb-1 flex gap-2">
                  <span className="text-muted-foreground">[{log.timestamp}]</span>
                  <span className={cn(
                    log.type === "error" ? "text-red-500" : 
                    log.type === "success" ? "text-emerald-500" : 
                    log.type === "warning" ? "text-amber-500" : "text-blue-400"
                  )}>
                    {log.type.toUpperCase()}: {log.msg}
                  </span>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-muted-foreground italic">Aguardando eventos...</div>
              )}
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
