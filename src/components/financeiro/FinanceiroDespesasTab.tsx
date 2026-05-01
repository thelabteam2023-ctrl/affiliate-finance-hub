import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLocalDate } from "@/lib/dateUtils";
import { getGrupoInfo } from "@/lib/despesaGrupos";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Edit, Trash2 } from "lucide-react";
import { DespesaAdministrativaDialog } from "@/components/financeiro/DespesaAdministrativaDialog";
import { HistoricoDespesasAdmin } from "@/components/financeiro/HistoricoDespesasAdmin";

interface DespesaAdministrativa {
  id: string;
  categoria: string;
  grupo?: string;
  descricao: string | null;
  valor: number;
  data_despesa: string;
  status: string;
  _fromLedger?: boolean;
}

interface Props {
  despesasAdmin: DespesaAdministrativa[];
  totalDespesasAdmin: number;
  totalPagamentosOperadores: number;
  formatCurrency: (value: number, currency?: string) => string;
  onRefresh: () => void;
  dataInicio?: string | null;
  dataFim?: string | null;
}

export function FinanceiroDespesasTab({ despesasAdmin, totalDespesasAdmin, totalPagamentosOperadores, formatCurrency, onRefresh, dataInicio, dataFim }: Props) {
  const { toast } = useToast();
  const [despesaAdminDialogOpen, setDespesaAdminDialogOpen] = useState(false);
  const [editingDespesa, setEditingDespesa] = useState<DespesaAdministrativa | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Despesas Administrativas</h2>
          <p className="text-sm text-muted-foreground">Gerencie as despesas do escritório</p>
        </div>
        <Button onClick={() => { setEditingDespesa(null); setDespesaAdminDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Despesa
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className={despesasAdmin.length >= 5 ? "max-h-[400px] overflow-y-auto" : ""}>
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-background shadow-sm">
                  <tr className="bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium border-b">Data</th>
                    <th className="text-left py-3 px-4 font-medium border-b">Grupo</th>
                    <th className="text-left py-3 px-4 font-medium border-b">Descrição</th>
                    <th className="text-right py-3 px-4 font-medium border-b">Valor</th>
                    <th className="text-center py-3 px-4 font-medium border-b">Status</th>
                    <th className="text-center py-3 px-4 font-medium border-b">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {despesasAdmin.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhuma despesa administrativa cadastrada
                      </td>
                    </tr>
                  ) : (
                    [...despesasAdmin]
                      .sort((a, b) => parseLocalDate(b.data_despesa).getTime() - parseLocalDate(a.data_despesa).getTime())
                      .map((despesa) => {
                        const grupoInfo = getGrupoInfo(despesa.grupo || "OUTROS");
                        const IconComponent = grupoInfo.icon;
                        return (
                          <tr key={despesa.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-3 px-4 w-[120px]">
                              {format(parseLocalDate(despesa.data_despesa), "dd/MM/yyyy", { locale: ptBR })}
                            </td>
                            <td className="py-3 px-4">
                              <ShadcnTooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className={`whitespace-nowrap ${grupoInfo.color}`}>
                                    <IconComponent className="h-3 w-3 mr-1" />
                                    {grupoInfo.label}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">{grupoInfo.description}</p>
                                  {despesa.categoria && despesa.categoria !== grupoInfo.label && (
                                    <p className="text-xs text-muted-foreground mt-1">Categoria original: {despesa.categoria}</p>
                                  )}
                                </TooltipContent>
                              </ShadcnTooltip>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground max-w-[300px] truncate">{despesa.descricao || "—"}</td>
                            <td className="py-3 px-4 text-right font-medium text-orange-500 min-w-[100px]">{formatCurrency(despesa.valor)}</td>
                            <td className="py-3 px-4 text-center w-[120px]">
                              <Badge variant={despesa.status === "CONFIRMADO" ? "default" : "secondary"} className="text-xs">{despesa.status}</Badge>
                            </td>
                            <td className="py-3 px-4 w-[80px]">
                              {despesa._fromLedger ? (
                                <span className="text-xs text-muted-foreground">via operador</span>
                              ) : (
                                <div className="flex items-center justify-center gap-2">
                                  <button onClick={() => { setEditingDespesa(despesa); setDespesaAdminDialogOpen(true); }} className="text-muted-foreground hover:text-foreground transition-colors" title="Editar">
                                    <Edit className="h-4 w-4" />
                                  </button>
                                  <button onClick={async () => {
                                    if (confirm("Tem certeza que deseja excluir esta despesa?")) {
                                      const { error } = await supabase.from("despesas_administrativas").delete().eq("id", despesa.id);
                                      if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); }
                                      else { toast({ title: "Despesa excluída" }); onRefresh(); }
                                    }
                                  }} className="text-muted-foreground hover:text-destructive transition-colors" title="Excluir">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo por Grupo */}
      <Card>
        <CardHeader><CardTitle className="text-base">Resumo por Grupo</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(
              despesasAdmin.reduce((acc, d) => { const grupo = d.grupo || "OUTROS"; acc[grupo] = (acc[grupo] || 0) + d.valor; return acc; }, {} as Record<string, number>)
            ).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([grupo, valor]) => {
              const grupoInfo = getGrupoInfo(grupo);
              const IconComponent = grupoInfo.icon;
              return (
                <div key={grupo} className="flex items-center justify-between">
                  <span className="text-sm flex items-center gap-2"><IconComponent className="h-4 w-4" /><span>{grupoInfo.label}</span></span>
                  <span className="font-medium text-orange-500">{formatCurrency(valor as number)}</span>
                </div>
              );
            })}
            {despesasAdmin.length > 0 && (
              <>
                <div className="pt-3 border-t flex items-center justify-between font-bold text-lg">
                  <span>Total Geral</span>
                  <span className="text-orange-500">{formatCurrency(despesasAdmin.reduce((acc, d) => acc + d.valor, 0))}</span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <HistoricoDespesasAdmin formatCurrency={formatCurrency} dataInicio={dataInicio} dataFim={dataFim} />

      <DespesaAdministrativaDialog
        open={despesaAdminDialogOpen}
        onOpenChange={setDespesaAdminDialogOpen}
        despesa={editingDespesa}
        onSuccess={() => onRefresh()}
      />
    </div>
  );
}
