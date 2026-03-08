import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Briefcase, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BrokerReceberContasDialog } from "./BrokerReceberContasDialog";

interface InvestidorComContas {
  id: string;
  nome: string;
  cpf: string | null;
  contas: Array<{
    id: string;
    nome: string;
    instance_identifier: string | null;
    login_username: string;
    moeda: string;
    saldo_atual: number;
    saldo_freebet: number;
    status: string;
    projeto_id: string | null;
    projeto_nome?: string | null;
  }>;
  totalCapital: number;
  totalContas: number;
}

export function BrokerTab() {
  const { workspaceId } = useTabWorkspace();
  const [investidoresComContas, setInvestidoresComContas] = useState<InvestidorComContas[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);

    try {
      // Buscar investidores do workspace
      const { data: investidores, error: invError } = await supabase
        .from("investidores")
        .select("id, nome, cpf")
        .eq("workspace_id", workspaceId)
        .order("nome");

      if (invError) throw invError;

      // Buscar bookmakers que pertencem a investidores
      const { data: contas, error: contasError } = await supabase
        .from("bookmakers")
        .select("id, nome, instance_identifier, login_username, moeda, saldo_atual, saldo_freebet, status, projeto_id, investidor_id")
        .eq("workspace_id", workspaceId)
        .not("investidor_id", "is", null);

      if (contasError) throw contasError;

      // Buscar nomes dos projetos vinculados
      const projetoIds = [...new Set((contas || []).filter(c => c.projeto_id).map(c => c.projeto_id!))];
      let projetosMap: Record<string, string> = {};
      if (projetoIds.length > 0) {
        const { data: projetos } = await supabase
          .from("projetos")
          .select("id, nome")
          .in("id", projetoIds);
        projetos?.forEach(p => { projetosMap[p.id] = p.nome; });
      }

      // Agrupar contas por investidor
      const result: InvestidorComContas[] = (investidores || []).map(inv => {
        const invContas = (contas || [])
          .filter(c => c.investidor_id === inv.id)
          .map(c => ({
            ...c,
            projeto_nome: c.projeto_id ? projetosMap[c.projeto_id] || null : null,
          }));

        return {
          id: inv.id,
          nome: inv.nome,
          cpf: inv.cpf,
          contas: invContas,
          totalCapital: invContas.reduce((sum, c) => sum + Number(c.saldo_atual), 0),
          totalContas: invContas.length,
        };
      }).filter(inv => inv.totalContas > 0);

      setInvestidoresComContas(result);
    } catch (err: any) {
      toast.error("Erro ao carregar dados do broker", { description: err.message });
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const formatCurrency = (value: number, moeda: string = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: moeda,
      minimumFractionDigits: 2,
    }).format(value);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ativo": case "EM_USO": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "limitada": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "bloqueada": return "bg-red-500/10 text-red-400 border-red-500/20";
      case "AGUARDANDO_SAQUE": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const totalCapitalGlobal = investidoresComContas.reduce((s, i) => s + i.totalCapital, 0);
  const totalContasGlobal = investidoresComContas.reduce((s, i) => s + i.totalContas, 0);

  return (
    <div className="space-y-6">
      {/* Header com KPIs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Investidores:</span>
            <span className="text-sm font-semibold">{investidoresComContas.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Contas recebidas:</span>
            <span className="text-sm font-semibold">{totalContasGlobal}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Capital sob gestão:</span>
            <span className="text-sm font-semibold text-emerald-400">{formatCurrency(totalCapitalGlobal)}</span>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Receber Contas
        </Button>
      </div>

      {/* Lista de investidores com contas */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : investidoresComContas.length === 0 ? (
        <Card className="bg-card/50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Briefcase className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground mb-2">
              Nenhuma conta de investidor cadastrada
            </h3>
            <p className="text-sm text-muted-foreground/70 max-w-md mb-6">
              Receba contas de bookmakers dos seus investidores para gerenciar e operar em seus projetos.
            </p>
            <Button onClick={() => setDialogOpen(true)} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Receber Contas do Investidor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {investidoresComContas.map(inv => (
            <Card key={inv.id} className="bg-card/50 border-border/50">
              <Collapsible open={expandedIds.has(inv.id)} onOpenChange={() => toggleExpanded(inv.id)}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-4 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-3">
                      {expandedIds.has(inv.id) ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="text-left">
                        <div className="font-medium">{inv.nome}</div>
                        {inv.cpf && (
                          <div className="text-xs text-muted-foreground">
                            CPF: {inv.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.$3-**")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">{inv.totalContas} conta(s)</div>
                        <div className="text-sm font-semibold text-emerald-400">
                          {formatCurrency(inv.totalCapital)}
                        </div>
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4">
                    <div className="rounded-lg border border-border/30 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/20 text-muted-foreground text-xs">
                            <th className="text-left p-2 pl-4">Casa / Identificador</th>
                            <th className="text-left p-2">Login</th>
                            <th className="text-left p-2">Moeda</th>
                            <th className="text-right p-2">Saldo</th>
                            <th className="text-left p-2">Status</th>
                            <th className="text-left p-2 pr-4">Projeto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inv.contas.map(conta => (
                            <tr key={conta.id} className="border-t border-border/20 hover:bg-muted/10">
                              <td className="p-2 pl-4">
                                <div className="font-medium">{conta.nome}</div>
                                {conta.instance_identifier && (
                                  <div className="text-xs text-muted-foreground">{conta.instance_identifier}</div>
                                )}
                              </td>
                              <td className="p-2 text-muted-foreground">{conta.login_username}</td>
                              <td className="p-2">
                                <Badge variant="outline" className="text-xs">{conta.moeda}</Badge>
                              </td>
                              <td className="p-2 text-right font-mono">
                                {formatCurrency(conta.saldo_atual, conta.moeda)}
                                {conta.saldo_freebet > 0 && (
                                  <span className="text-xs text-amber-400 ml-1">
                                    🎁 {formatCurrency(conta.saldo_freebet, conta.moeda)}
                                  </span>
                                )}
                              </td>
                              <td className="p-2">
                                <Badge variant="outline" className={`text-xs ${getStatusColor(conta.status)}`}>
                                  {conta.status}
                                </Badge>
                              </td>
                              <td className="p-2 pr-4">
                                {conta.projeto_nome ? (
                                  <span className="text-xs text-primary">{conta.projeto_nome}</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground/50">Disponível</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}

      <BrokerReceberContasDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={() => {
          setDialogOpen(false);
          fetchData();
        }}
      />
    </div>
  );
}
