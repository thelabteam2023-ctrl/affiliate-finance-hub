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
      addLog("Iniciando auditoria profunda de integridade estrutural...", "info");
      
      const { data: deepAudit, error: auditError } = await supabase.rpc("audit_valuebet_integrity", {
        p_project_ids: projectIds && projectIds.length > 0 ? projectIds : null
      });

      if (auditError) {
        addLog(`Erro na RPC de Auditoria: ${auditError.message}`, "error");
      }

      // Busca por variações de estratégia (Case Insensitive)
      const { data: strategiesRaw } = await supabase
        .from("apostas_unificada")
        .select("estrategia, status")
        .eq("workspace_id", workspaceId)
        .ilike("estrategia", "%value%");

      // Agrupar manualmente no JS já que o Postgrest não suporta .group() direto via SDK JS desta forma
      const strategies = (strategiesRaw || []).reduce((acc: any[], curr) => {
        const existing = acc.find(a => a.estrategia === curr.estrategia && a.status === curr.status);
        if (existing) existing.count++;
        else acc.push({ estrategia: curr.estrategia, status: curr.status, count: 1 });
        return acc;
      }, []);

      // Verificar projetos selecionados
      let projectCheck = [];
      if (projectIds && projectIds.length > 0) {
        const { data: projectsRaw } = await supabase
          .from("apostas_unificada")
          .select("projeto_id, estrategia, status")
          .in("projeto_id", projectIds);
        
        projectCheck = (projectsRaw || []).reduce((acc: any[], curr) => {
          const existing = acc.find(a => a.projeto_id === curr.projeto_id && a.estrategia === curr.estrategia && a.status === curr.status);
          if (existing) existing.count++;
          else acc.push({ projeto_id: curr.projeto_id, estrategia: curr.estrategia, status: curr.status, count: 1 });
          return acc;
        }, []);
      }

      addLog("Auditoria concluída.", "success");
      return { 
        totalWorkspace: (deepAudit as any)?.issues?.reduce((acc: number, i: any) => acc + i.count, 0) || 0, 
        strategies, 
        projectCheck,
        discrepancies: (deepAudit as any)?.issues?.filter((i: any) => i.is_hidden) || []
      };
    },
    enabled: !!workspaceId,
  });

  // Efeito para monitorar erros da RPC principal
  useEffect(() => {
    if (rpcError) {
      addLog(`Erro na RPC: ${rpcError.message || JSON.stringify(rpcError)}`, "error");
    }
  }, [rpcError]);

  const diagnostics = () => {
    const results = [];
    
    if (!workspaceId) results.push({ msg: "FALHA: Workspace ID não identificado.", type: "error" });
    
    if (audit?.strategies) {
      const caseSensitiveValue = audit.strategies.find(s => s.estrategia === 'valuebet' || s.estrategia === 'ValueBet');
      if (caseSensitiveValue) {
        results.push({ 
          msg: `AVISO: Encontramos apostas com estratégia "${caseSensitiveValue.estrategia}". A RPC espera "VALUEBET" (maiúsculo).`, 
          type: "warning",
          action: "Normalizar nomes"
        });
      }

      const totalValue = audit.strategies.reduce((acc, s) => acc + s.count, 0);
      if (totalValue > 0 && (!rpcData?.kpis?.total_bets || rpcData.kpis.total_bets === 0)) {
        results.push({ 
          msg: `CRÍTICO: Existem ${totalValue} apostas no banco, mas a RPC retorna 0. Provável erro de filtro de STATUS ou DATA.`, 
          type: "error" 
        });
      }
    }

    if (audit?.projectCheck && audit.projectCheck.length > 0) {
      const pendingBets = audit.projectCheck.filter(p => p.status === 'PENDENTE');
      if (pendingBets.length > 0) {
        const count = pendingBets.reduce((acc, p) => acc + p.count, 0);
        results.push({ 
          msg: `INFO: Existem ${count} apostas PENDENTES que são ignoradas pelos KPIs da evolução.`, 
          type: "info" 
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
        <Button 
          variant="outline" 
          size="sm" 
          className="h-8 gap-2 bg-card"
          onClick={() => {
            refetchAudit();
            queryClient.invalidateQueries({ queryKey: ["laboratorio-valuebet"] });
          }}
          disabled={auditing || rpcLoading}
        >
          <RefreshCw className={cn("h-3 w-3", (auditing || rpcLoading) && "animate-spin")} />
          Recalibrar Ecossistema
        </Button>
      </CardHeader>
      
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lado Esquerdo: Resultados do Diagnóstico */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground flex items-center gap-2">
              <Search className="h-3 w-3" /> ANÁLISE DO OBSERVADOR
            </h3>
            
            <div className="space-y-2">
              {diagnosticResults.length === 0 && !auditing && (
                <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs text-emerald-400 font-medium">Nenhuma anomalia estrutural detectada. Se os dados não aparecem, verifique o filtro de data.</span>
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

            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="bg-card/50 p-3 rounded-lg border border-border/20">
                <p className="text-[10px] text-muted-foreground font-bold uppercase mb-1">Status RPC</p>
                <Badge variant={rpcError ? "destructive" : "secondary"} className="text-[10px]">
                  {rpcLoading ? "Chamando..." : rpcError ? "Erro na Função" : "Função Ativa"}
                </Badge>
              </div>
              <div className="bg-card/50 p-3 rounded-lg border border-border/20">
                <p className="text-[10px] text-muted-foreground font-bold uppercase mb-1">Dados no Workspace</p>
                <div className="flex items-center gap-2">
                  <Database className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-bold">{audit?.totalWorkspace || 0}</span>
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
