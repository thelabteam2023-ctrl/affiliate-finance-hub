import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowUpDown } from "lucide-react";

interface HistoricoMensalEntry {
  mes: string;
  label: string;
  resultado: number;
  custos: number;
  despesas: number;
  despesasAdmin: number;
  participacoes: number;
  lucroLiquido: number;
  patrimonio: number;
}

interface Props {
  historicoMensal: HistoricoMensalEntry[];
  formatCurrency: (value: number, currency?: string) => string;
}

export function FinanceiroHistoricoTab({ historicoMensal, formatCurrency }: Props) {
  const [historicoSort, setHistoricoSort] = useState<{ field: "mes" | "lucroLiquido" | "patrimonio"; direction: "asc" | "desc" }>({ field: "mes", direction: "desc" });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Detalhamento Mensal</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium">Mês</th>
                  <th className="text-right py-3 px-4 font-medium">
                    <TooltipProvider><ShadcnTooltip><TooltipTrigger className="cursor-help border-b border-dotted border-muted-foreground/50">Lucro Apostas</TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs"><p className="text-xs">Soma do lucro/prejuízo de todas as apostas liquidadas no período.</p></TooltipContent></ShadcnTooltip></TooltipProvider>
                  </th>
                  <th className="text-right py-3 px-4 font-medium">
                    <TooltipProvider><ShadcnTooltip><TooltipTrigger className="cursor-help border-b border-dotted border-muted-foreground/50">Custos</TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs"><p className="text-xs">Pagamentos confirmados: parceiros, comissões, bônus de indicadores e pagamentos a operadores.</p></TooltipContent></ShadcnTooltip></TooltipProvider>
                  </th>
                  <th className="text-right py-3 px-4 font-medium">
                    <TooltipProvider><ShadcnTooltip><TooltipTrigger className="cursor-help border-b border-dotted border-muted-foreground/50">Despesas</TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs"><p className="text-xs">Despesas administrativas confirmadas: infraestrutura, ferramentas, serviços, etc.</p></TooltipContent></ShadcnTooltip></TooltipProvider>
                  </th>
                  <th className="text-right py-3 px-4 font-medium">
                    <TooltipProvider><ShadcnTooltip><TooltipTrigger className="cursor-help border-b border-dotted border-muted-foreground/50">Participações</TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs"><p className="text-xs">Distribuição de lucros pagas a investidores vinculados a projetos.</p></TooltipContent></ShadcnTooltip></TooltipProvider>
                  </th>
                  <th className="text-right py-3 px-4 font-medium">
                    <button onClick={() => setHistoricoSort(prev => ({ field: "lucroLiquido", direction: prev.field === "lucroLiquido" && prev.direction === "desc" ? "asc" : "desc" }))}
                      className={`inline-flex items-center gap-1 hover:text-primary transition-colors ${historicoSort.field === "lucroLiquido" ? "text-primary" : ""}`}>
                      <TooltipProvider><ShadcnTooltip><TooltipTrigger className="cursor-help border-b border-dotted border-muted-foreground/50">Lucro Líq.</TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs"><p className="text-xs">Lucro Apostas − Custos − Despesas − Participações.</p></TooltipContent></ShadcnTooltip></TooltipProvider>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-right py-3 px-4 font-medium">
                    <button onClick={() => setHistoricoSort(prev => ({ field: "patrimonio", direction: prev.field === "patrimonio" && prev.direction === "desc" ? "asc" : "desc" }))}
                      className={`inline-flex items-center gap-1 hover:text-primary transition-colors ${historicoSort.field === "patrimonio" ? "text-primary" : ""}`}>
                      <TooltipProvider><ShadcnTooltip><TooltipTrigger className="cursor-help border-b border-dotted border-muted-foreground/50">Patrimônio</TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs"><p className="text-xs">Soma acumulada do Lucro Líquido.</p></TooltipContent></ShadcnTooltip></TooltipProvider>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...historicoMensal].sort((a, b) => {
                  const { field, direction } = historicoSort;
                  let comparison = 0;
                  if (field === "mes") comparison = a.mes.localeCompare(b.mes);
                  else if (field === "lucroLiquido") comparison = a.lucroLiquido - b.lucroLiquido;
                  else if (field === "patrimonio") comparison = a.patrimonio - b.patrimonio;
                  return direction === "desc" ? -comparison : comparison;
                }).map((m) => (
                  <tr key={m.mes} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-3 px-4 font-medium">{m.label}</td>
                    <td className={`py-3 px-4 text-right ${m.resultado >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(m.resultado)}</td>
                    <td className="py-3 px-4 text-right text-destructive">{formatCurrency(m.custos)}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground">{formatCurrency(m.despesas + m.despesasAdmin)}</td>
                    <td className="py-3 px-4 text-right text-indigo-400">{formatCurrency(m.participacoes)}</td>
                    <td className={`py-3 px-4 text-right font-medium ${m.lucroLiquido >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(m.lucroLiquido)}</td>
                    <td className={`py-3 px-4 text-right font-semibold ${m.patrimonio >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatCurrency(m.patrimonio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
