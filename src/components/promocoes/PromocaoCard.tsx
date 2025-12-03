import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Megaphone, Eye, Pencil, Trash2, Gift, Target, Calendar, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Promocao {
  id: string;
  nome: string;
  descricao: string | null;
  data_inicio: string;
  data_fim: string;
  meta_parceiros: number;
  valor_bonus: number;
  status: string;
}

interface Participante {
  id: string;
  indicador_nome?: string;
  parceiros_indicados: number;
  meta_atingida: boolean;
  bonus_pago: boolean;
}

interface PromocaoCardProps {
  promocao: Promocao;
  participantes: Participante[];
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  formatCurrency: (value: number) => string;
  formatDate: (date: string) => string;
  getStatusBadge: (status: string) => JSX.Element;
}

export function PromocaoCard({
  promocao,
  participantes,
  onView,
  onEdit,
  onDelete,
  formatCurrency,
  formatDate,
  getStatusBadge,
}: PromocaoCardProps) {
  const totalParticipantes = participantes.length;
  const metasAtingidas = participantes.filter((p) => p.meta_atingida).length;
  const bonusPagos = participantes.filter((p) => p.bonus_pago).length;
  const totalBonusPago = bonusPagos * promocao.valor_bonus;

  const today = new Date();
  const inicio = new Date(promocao.data_inicio);
  const fim = new Date(promocao.data_fim);
  const isActive = promocao.status === "ATIVA" && today >= inicio && today <= fim;
  const totalDays = Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
  const daysElapsed = Math.max(0, Math.ceil((today.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
  const progressPercent = Math.min(100, (daysElapsed / totalDays) * 100);

  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={onView}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-gradient-primary flex items-center justify-center">
              <Megaphone className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold leading-none">{promocao.nome}</h3>
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(promocao.data_inicio)} - {formatDate(promocao.data_fim)}
              </p>
            </div>
          </div>
          {getStatusBadge(promocao.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Description */}
        {promocao.descricao && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {promocao.descricao}
          </p>
        )}

        {/* Progress */}
        {isActive && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tempo da Campanha</span>
              <span className="font-medium">{Math.max(0, totalDays - daysElapsed)} dias restantes</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Target className="h-4 w-4" />
              <span className="text-xs">Meta</span>
            </div>
            <p className="text-lg font-bold">{promocao.meta_parceiros}</p>
            <p className="text-xs text-muted-foreground">parceiros</p>
          </div>
          <div className="bg-primary/10 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-primary mb-1">
              <Gift className="h-4 w-4" />
              <span className="text-xs">Bônus</span>
            </div>
            <p className="text-lg font-bold text-primary">{formatCurrency(promocao.valor_bonus)}</p>
          </div>
        </div>

        {/* Participants Summary */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>Participantes</span>
            </div>
            <span className="font-medium">{totalParticipantes}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Metas Atingidas</span>
            <span className="font-medium text-emerald-500">{metasAtingidas}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Bônus Pagos</span>
            <span className="font-medium">{formatCurrency(totalBonusPago)}</span>
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
