import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Eye, Pencil, Trash2, DollarSign, Gift } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface IndicadorPerformance {
  indicador_id: string;
  nome: string;
  cpf: string;
  status: string;
  telefone: string | null;
  email: string | null;
  total_parceiros_indicados: number;
  parcerias_ativas: number;
  parcerias_encerradas: number;
  total_comissoes: number;
  total_bonus: number;
  parceiros_indicados_nomes?: { parceiroNome: string }[];
}

interface IndicadorCardProps {
  indicador: IndicadorPerformance;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  formatCurrency: (value: number) => string;
  getStatusBadge: (status: string) => JSX.Element;
}

export function IndicadorCard({
  indicador,
  onView,
  onEdit,
  onDelete,
  formatCurrency,
  getStatusBadge,
}: IndicadorCardProps) {
  const totalRecebido = indicador.total_comissoes + indicador.total_bonus;
  const parceirosNomes = indicador.parceiros_indicados_nomes || [];

  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={onView}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-gradient-primary flex items-center justify-center">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold leading-none">{indicador.nome}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {indicador.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "***.$2.$3-**")}
              </p>
            </div>
          </div>
          {getStatusBadge(indicador.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 text-center" onClick={(e) => e.stopPropagation()}>
          <Popover>
            <PopoverTrigger asChild>
              <div className="bg-muted/50 rounded-lg p-2 cursor-pointer hover:bg-muted transition-colors">
                <p className="text-lg font-bold">{indicador.total_parceiros_indicados}</p>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  Indicados <Users className="h-3 w-3" />
                </p>
              </div>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-64 p-3">
              <p className="font-semibold text-sm mb-2">Parceiros indicados</p>
              {parceirosNomes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum parceiro vinculado</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {parceirosNomes.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{i + 1}.</span>
                      <span className="truncate">{d.parceiroNome}</span>
                    </div>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
          <div className="bg-emerald-500/10 rounded-lg p-2">
            <p className="text-lg font-bold text-emerald-500">{indicador.parcerias_ativas}</p>
            <p className="text-xs text-muted-foreground">Ativas</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2">
            <p className="text-lg font-bold">{indicador.parcerias_encerradas}</p>
            <p className="text-xs text-muted-foreground">Encerradas</p>
          </div>
        </div>

        {/* Financial Info */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              <span>Comissões</span>
            </div>
            <span className="font-medium">{formatCurrency(indicador.total_comissoes)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Gift className="h-4 w-4" />
              <span>Bônus</span>
            </div>
            <span className="font-medium">{formatCurrency(indicador.total_bonus)}</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="font-medium">Total Recebido</span>
            <span className="font-bold text-emerald-500">{formatCurrency(totalRecebido)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-1 pt-2" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" onClick={onView}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
