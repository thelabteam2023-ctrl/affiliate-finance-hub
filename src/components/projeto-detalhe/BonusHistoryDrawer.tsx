import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Gift,
  Plus,
  Edit,
  Trash2,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Undo2,
  Building2,
  Flag,
  Trophy,
  Target,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ProjectBonus, BonusStatus, FinalizeReason } from "@/hooks/useProjectBonuses";

interface BonusHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmakerName: string;
  bookmakerLogin: string;
  bookmakerLogo?: string | null;
  bonuses: ProjectBonus[];
  totalCredited: number;
  currency?: string;
  onAddBonus: () => void;
  onEditBonus: (bonus: ProjectBonus) => void;
  onDeleteBonus: (id: string) => Promise<boolean>;
  onFinalizeBonus: (bonus: ProjectBonus) => void;
}

const getStatusBadge = (status: BonusStatus) => {
  switch (status) {
    case "credited":
      return (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Ativo
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          <Clock className="h-3 w-3 mr-1" />
          Pendente
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
          <XCircle className="h-3 w-3 mr-1" />
          Falhou
        </Badge>
      );
    case "expired":
      return (
        <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Expirado
        </Badge>
      );
    case "reversed":
      return (
        <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
          <Undo2 className="h-3 w-3 mr-1" />
          Estornado
        </Badge>
      );
    case "finalized":
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
          <Trophy className="h-3 w-3 mr-1" />
          Finalizado
        </Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
};

const getFinalizeReasonLabel = (reason: FinalizeReason | null): string => {
  if (!reason) return "";
  const labels: Record<FinalizeReason, string> = {
    rollover_completed: "Rollover concluído (Saque)",
    cycle_completed: "Ciclo encerrado",
    expired: "Expirado",
    cancelled_reversed: "Cancelado / Revertido",
  };
  return labels[reason] || reason;
};

const formatCurrency = (value: number, currency: string = "BRL") => {
  const symbols: Record<string, string> = {
    BRL: "R$",
    USD: "$",
    EUR: "€",
    GBP: "£",
    USDT: "USDT",
  };
  return `${symbols[currency] || currency} ${value.toFixed(2)}`;
};

export function BonusHistoryDrawer({
  open,
  onOpenChange,
  bookmakerName,
  bookmakerLogin,
  bookmakerLogo,
  bonuses,
  totalCredited,
  currency = "BRL",
  onAddBonus,
  onEditBonus,
  onDeleteBonus,
  onFinalizeBonus,
}: BonusHistoryDrawerProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bonusToDelete, setBonusToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!bonusToDelete) return;
    setDeleting(true);
    await onDeleteBonus(bonusToDelete);
    setDeleting(false);
    setDeleteDialogOpen(false);
    setBonusToDelete(null);
  };

  // Separate active and historical bonuses
  const activeBonuses = bonuses.filter((b) => b.status === "credited");
  const historicalBonuses = bonuses.filter((b) => b.status !== "credited");
  
  // Calculate total from active bonuses using their own currency
  const activeBonusTotal = activeBonuses.reduce((acc, b) => acc + b.bonus_amount, 0);
  // Get the currency from the first active bonus, or fallback to prop
  const activeBonusCurrency = activeBonuses.length > 0 ? activeBonuses[0].currency : currency;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <div className="flex items-center gap-3">
              {bookmakerLogo ? (
                <img
                  src={bookmakerLogo}
                  alt={bookmakerName}
                  className="h-10 w-10 rounded-lg object-contain bg-white p-1"
                />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
              )}
              <div>
                <SheetTitle>{bookmakerName}</SheetTitle>
                <SheetDescription>{bookmakerLogin}</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {/* Summary - Active Bonus */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 cursor-help">
                    <div className="flex items-center gap-2">
                      <Gift className="h-5 w-5 text-emerald-400" />
                      <span className="font-medium">Bônus Ativo</span>
                    </div>
                    <span className="text-xl font-bold text-emerald-400">
                      {formatCurrency(activeBonusTotal, activeBonusCurrency)}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Soma dos bônus com status "Ativo" (credited)</p>
                  <p className="text-xs text-muted-foreground">Este valor compõe o saldo operável</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Add Button */}
            <Button onClick={onAddBonus} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Bônus
            </Button>

            {/* Active Bonuses */}
            {activeBonuses.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Bônus Ativos ({activeBonuses.length})
                </h4>
                <div className="space-y-2">
                  {activeBonuses.map((bonus) => {
                    const hasRollover = bonus.rollover_target_amount && bonus.rollover_target_amount > 0;
                    const rolloverPercent = hasRollover 
                      ? Math.min(100, ((bonus.rollover_progress || 0) / bonus.rollover_target_amount!) * 100)
                      : 0;
                    
                    return (
                      <div
                        key={bonus.id}
                        className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">
                                {formatCurrency(bonus.bonus_amount, bonus.currency)}
                              </span>
                              {getStatusBadge(bonus.status)}
                            </div>
                            {bonus.title && (
                              <p className="text-sm text-muted-foreground">{bonus.title}</p>
                            )}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(bonus.created_at), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                              {bonus.expires_at && (
                                <span className="flex items-center gap-1 text-amber-400">
                                  <Clock className="h-3 w-3" />
                                  Expira: {format(new Date(bonus.expires_at), "dd/MM/yyyy", { locale: ptBR })}
                                </span>
                              )}
                            </div>
                            
                            {/* Rollover Progress Bar */}
                            {hasRollover && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="mt-2 pt-2 border-t border-emerald-500/20 space-y-1">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground flex items-center gap-1">
                                          <Target className="h-3 w-3" />
                                          Rollover
                                        </span>
                                        <span className={rolloverPercent >= 100 ? "text-emerald-400 font-medium" : "text-muted-foreground"}>
                                          {formatCurrency(bonus.rollover_progress || 0, bonus.currency)} / {formatCurrency(bonus.rollover_target_amount!, bonus.currency)}
                                        </span>
                                      </div>
                                      <Progress 
                                        value={rolloverPercent} 
                                        className="h-2"
                                      />
                                      <div className="text-right text-xs text-muted-foreground">
                                        {rolloverPercent.toFixed(0)}% concluído
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="text-xs space-y-1">
                                      <p>Meta de rollover: {formatCurrency(bonus.rollover_target_amount!, bonus.currency)}</p>
                                      <p>Apostado: {formatCurrency(bonus.rollover_progress || 0, bonus.currency)}</p>
                                      {bonus.rollover_multiplier && <p>Multiplicador: {bonus.rollover_multiplier}x</p>}
                                      {bonus.min_odds && <p>Odd mínima: {bonus.min_odds}</p>}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                                    onClick={() => onFinalizeBonus(bonus)}
                                  >
                                    <Flag className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Finalizar bônus</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onEditBonus(bonus)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => {
                                setBonusToDelete(bonus.id);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Historical Bonuses */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Histórico ({historicalBonuses.length})
              </h4>
              <ScrollArea className="h-[300px]">
                {historicalBonuses.length === 0 && activeBonuses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Gift className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p>Nenhum bônus registrado</p>
                  </div>
                ) : historicalBonuses.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    <p>Nenhum bônus no histórico</p>
                  </div>
                ) : (
                  <div className="space-y-3 pr-4">
                    {historicalBonuses.map((bonus) => (
                      <div
                        key={bonus.id}
                        className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors opacity-75"
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">
                                {formatCurrency(bonus.bonus_amount, bonus.currency)}
                              </span>
                              {getStatusBadge(bonus.status)}
                            </div>
                            {bonus.title && (
                              <p className="text-sm text-muted-foreground">{bonus.title}</p>
                            )}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(bonus.created_at), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                              {bonus.status === "finalized" && bonus.finalize_reason && (
                                <span className="text-blue-400">
                                  {getFinalizeReasonLabel(bonus.finalize_reason)}
                                </span>
                              )}
                            </div>
                            {bonus.notes && (
                              <p className="text-xs text-muted-foreground mt-1">{bonus.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onEditBonus(bonus)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => {
                                setBonusToDelete(bonus.id);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Bônus</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este bônus? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
