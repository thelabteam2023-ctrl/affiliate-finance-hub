import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getGrupoInfo } from "@/lib/despesaGrupos";
import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface Despesa {
  id: string;
  valor: number;
  operadores?: { nome: string } | null;
  descricao: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grupo: string;
  despesas: Despesa[];
  formatCurrency: (value: number) => string;
}

export function ResumoGrupoDetalhesModal({ open, onOpenChange, grupo, despesas, formatCurrency }: Props) {
  const grupoInfo = getGrupoInfo(grupo);
  const IconComponent = grupoInfo.icon;

  const beneficiarios = useMemo(() => {
    const agrupado: Record<string, number> = {};
    
    despesas.forEach((d) => {
      // Prioridade total para o nome do operador. Se não existir, usa a descrição ou marcador genérico.
      const nome = d.operadores?.nome || (d.descricao && d.descricao.length < 50 ? d.descricao : null) || "Outros / Não Identificado";
      agrupado[nome] = (agrupado[nome] || 0) + d.valor;
    });

    return Object.entries(agrupado)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);
  }, [despesas]);

  const totalGeral = despesas.reduce((acc, d) => acc + d.valor, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconComponent className="h-5 w-5" />
            Detalhamento: {grupoInfo.label}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-4">
              {beneficiarios.map((b) => (
                <div key={b.nome} className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{b.nome}</span>
                    <span className="text-xs text-muted-foreground">Beneficiário</span>
                  </div>
                  <span className="font-semibold text-orange-500">
                    {formatCurrency(b.total)}
                  </span>
                </div>
              ))}
              {beneficiarios.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  Nenhum dado encontrado para este grupo.
                </p>
              )}
            </div>
          </ScrollArea>

          <Separator className="my-4" />

          <div className="flex items-center justify-between font-bold text-lg">
            <span>Total do Grupo</span>
            <span className="text-orange-500">{formatCurrency(totalGeral)}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}