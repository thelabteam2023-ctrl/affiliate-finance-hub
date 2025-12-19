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
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ProjectBonus, BonusStatus } from "@/hooks/useProjectBonuses";

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
  onChangeStatus: (id: string, status: BonusStatus) => Promise<boolean>;
}

const getStatusBadge = (status: BonusStatus) => {
  switch (status) {
    case "credited":
      return (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Creditado
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
    default:
      return <Badge>{status}</Badge>;
  }
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
  onChangeStatus,
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
            {/* Summary */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-emerald-400" />
                <span className="font-medium">Total Creditado</span>
              </div>
              <span className="text-xl font-bold text-emerald-400">
                {formatCurrency(totalCredited, currency)}
              </span>
            </div>

            {/* Add Button */}
            <Button onClick={onAddBonus} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Bônus
            </Button>

            {/* Bonus List */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Histórico ({bonuses.length})
              </h4>
              <ScrollArea className="h-[400px]">
                {bonuses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Gift className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p>Nenhum bônus registrado</p>
                  </div>
                ) : (
                  <div className="space-y-3 pr-4">
                    {bonuses.map((bonus) => (
                      <div
                        key={bonus.id}
                        className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
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
                              {bonus.expires_at && (
                                <span className="flex items-center gap-1 text-amber-400">
                                  <Clock className="h-3 w-3" />
                                  Expira: {format(new Date(bonus.expires_at), "dd/MM/yyyy", { locale: ptBR })}
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
