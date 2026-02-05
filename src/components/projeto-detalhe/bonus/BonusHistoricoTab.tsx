import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProjectBonuses, ProjectBonus, FinalizeReason } from "@/hooks/useProjectBonuses";
import { Building2, Search, History, CheckCircle2, XCircle, AlertTriangle, RotateCcw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BonusHistoricoTabProps {
  projetoId: string;
}

const REASON_LABELS: Record<FinalizeReason, { label: string; icon: React.ElementType; color: string }> = {
  rollover_completed: { label: "Rollover Concluído (Saque)", icon: CheckCircle2, color: "text-emerald-400 bg-emerald-500/20 border-emerald-500/30" },
  cycle_completed: { label: "Ciclo Encerrado", icon: CheckCircle2, color: "text-blue-400 bg-blue-500/20 border-blue-500/30" },
  expired: { label: "Expirou", icon: XCircle, color: "text-red-400 bg-red-500/20 border-red-500/30" },
  cancelled_reversed: { label: "Cancelado/Revertido", icon: RotateCcw, color: "text-gray-400 bg-gray-500/20 border-gray-500/30" },
};

export function BonusHistoricoTab({ projetoId }: BonusHistoricoTabProps) {
  const { bonuses } = useProjectBonuses({ projectId: projetoId });
  const [searchTerm, setSearchTerm] = useState("");
  const [reasonFilter, setReasonFilter] = useState<string>("all");

  // Filter for finalized bonuses
  const finalizedBonuses = bonuses.filter(b => b.status === 'finalized');

  const formatCurrency = (value: number, moeda: string = 'BRL') => {
    const symbols: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€', GBP: '£' };
    return `${symbols[moeda] || moeda} ${value.toFixed(2)}`;
  };

  const filteredBonuses = finalizedBonuses.filter(bonus => {
    const matchesSearch = 
      bonus.bookmaker_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bonus.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bonus.parceiro_nome?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesReason = reasonFilter === "all" || bonus.finalize_reason === reasonFilter;
    
    return matchesSearch && matchesReason;
  });

  // Sort by finalized_at descending
  filteredBonuses.sort((a, b) => {
    if (!a.finalized_at) return 1;
    if (!b.finalized_at) return -1;
    return new Date(b.finalized_at).getTime() - new Date(a.finalized_at).getTime();
  });

  const getReasonBadge = (reason: FinalizeReason | null) => {
    if (!reason) return null;
    const config = REASON_LABELS[reason];
    const Icon = config.icon;
    return (
      <Badge className={config.color}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por casa, título ou parceiro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Motivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os motivos</SelectItem>
            <SelectItem value="rollover_completed">Rollover Concluído (Saque)</SelectItem>
            <SelectItem value="cycle_completed">Ciclo Encerrado</SelectItem>
            <SelectItem value="expired">Expirou</SelectItem>
            <SelectItem value="cancelled_reversed">Cancelado/Revertido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {filteredBonuses.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <History className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhum bônus finalizado</h3>
              <p className="text-muted-foreground">
                Bônus finalizados aparecerão aqui
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <History className="h-4 w-4" />
              Histórico de Bônus Finalizados ({filteredBonuses.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {filteredBonuses.map(bonus => (
                  <div key={bonus.id} className="flex items-center gap-4 p-4 rounded-lg bg-card border">
                    {/* Logo */}
                    {bonus.bookmaker_logo_url ? (
                      <img
                        src={bonus.bookmaker_logo_url}
                        alt={bonus.bookmaker_nome}
                        className="h-10 w-10 rounded-lg object-contain bg-white p-1 flex-shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{bonus.bookmaker_nome}</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-sm text-muted-foreground">{bonus.title || 'Bônus'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        {bonus.parceiro_nome && (
                          <>
                            <span>{bonus.parceiro_nome}</span>
                            <span>•</span>
                          </>
                        )}
                        {bonus.finalized_at && (
                          <span>
                            Finalizado em {format(parseISO(bonus.finalized_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Value */}
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold">{formatCurrency(bonus.bonus_amount, bonus.currency)}</p>
                      {getReasonBadge(bonus.finalize_reason)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
