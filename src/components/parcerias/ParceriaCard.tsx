import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Handshake, Eye, Pencil, Trash2, User, Calendar, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Helper to parse YYYY-MM-DD as local date (not UTC)
const parseLocalDate = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

interface ParceriaAlerta {
  id: string;
  parceiro_id: string;
  parceiro_nome: string;
  parceiro_cpf: string;
  indicador_nome: string | null;
  data_inicio: string;
  duracao_dias: number;
  data_fim_prevista: string;
  dias_restantes: number;
  nivel_alerta: string;
  valor_comissao_indicador: number;
  comissao_paga: boolean;
  status: string;
  elegivel_renovacao: boolean;
}

interface ParceriaCardProps {
  parceria: ParceriaAlerta;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  formatCurrency: (value: number) => string;
  getStatusBadge: (status: string) => JSX.Element;
  getAlertaBadge: (nivel: string) => JSX.Element;
}

export function ParceriaCard({
  parceria,
  onView,
  onEdit,
  onDelete,
  formatCurrency,
  getStatusBadge,
  getAlertaBadge,
}: ParceriaCardProps) {
  const diasDecorridos = parceria.duracao_dias - Math.max(0, parceria.dias_restantes);
  const progressPercent = Math.min(100, (diasDecorridos / parceria.duracao_dias) * 100);

  const getProgressColor = () => {
    if (parceria.nivel_alerta === "VENCIDA") return "bg-destructive";
    if (parceria.nivel_alerta === "ALERTA") return "bg-orange-500";
    if (parceria.nivel_alerta === "ATENCAO") return "bg-yellow-500";
    return "bg-primary";
  };

  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={onView}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-gradient-primary flex items-center justify-center">
              <Handshake className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold leading-none">{parceria.parceiro_nome}</h3>
              {parceria.indicador_nome && (
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {parceria.indicador_nome}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1 items-end">
            {getStatusBadge(parceria.status)}
            {getAlertaBadge(parceria.nivel_alerta)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progresso</span>
            <span className="font-medium">
              {parceria.dias_restantes > 0 
                ? `${parceria.dias_restantes} dias restantes` 
                : "Vencida"}
            </span>
          </div>
          <div className="relative">
            <Progress value={progressPercent} className="h-2" />
            <div
              className={`absolute top-0 left-0 h-2 rounded-full transition-all ${getProgressColor()}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{diasDecorridos} dias</span>
            <span>{parceria.duracao_dias} dias</span>
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Início: {format(parseLocalDate(parceria.data_inicio), "dd/MM/yy", { locale: ptBR })}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Fim: {format(parseLocalDate(parceria.data_fim_prevista), "dd/MM/yy", { locale: ptBR })}</span>
          </div>
        </div>

        {/* Commission */}
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-muted-foreground">Comissão</span>
          <div className="text-right">
            <span className="font-bold">{formatCurrency(parceria.valor_comissao_indicador)}</span>
            {parceria.comissao_paga && (
              <span className="ml-2 text-xs text-emerald-500">(Paga)</span>
            )}
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
