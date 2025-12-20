import { useState } from "react";
import { useProjectBonuses, ProjectBonus, BonusFormData, FinalizeReason } from "@/hooks/useProjectBonuses";
import { BonusHistoryDrawer } from "./BonusHistoryDrawer";
import { BonusDialog } from "./BonusDialog";
import { FinalizeBonusDialog } from "./FinalizeBonusDialog";

interface VinculoBonusDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  bookmakerId: string;
  bookmakerName: string;
  bookmakerLogin?: string;
  bookmakerPassword?: string | null;
  bookmakerLogo?: string | null;
  bookmakerCatalogoId?: string | null;
  currency?: string;
  onBonusChange?: () => void;
}

export function VinculoBonusDrawer({
  open,
  onOpenChange,
  projectId,
  bookmakerId,
  bookmakerName,
  bookmakerLogin = "",
  bookmakerPassword,
  bookmakerLogo,
  bookmakerCatalogoId,
  currency = "BRL",
  onBonusChange,
}: VinculoBonusDrawerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBonus, setEditingBonus] = useState<ProjectBonus | null>(null);
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [bonusToFinalize, setBonusToFinalize] = useState<ProjectBonus | null>(null);

  const {
    bonuses,
    loading,
    saving,
    createBonus,
    updateBonus,
    finalizeBonus,
    deleteBonus,
    getBonusesByBookmaker,
    getSummary,
  } = useProjectBonuses({ projectId, bookmakerId });

  const bookmakerBonuses = getBonusesByBookmaker(bookmakerId);
  const summary = getSummary();

  const handleAddBonus = () => {
    setEditingBonus(null);
    setDialogOpen(true);
  };

  const handleEditBonus = (bonus: ProjectBonus) => {
    setEditingBonus(bonus);
    setDialogOpen(true);
  };

  const handleDeleteBonus = async (id: string): Promise<boolean> => {
    const success = await deleteBonus(id);
    if (success && onBonusChange) {
      onBonusChange();
    }
    return success;
  };

  const handleFinalizeBonus = (bonus: ProjectBonus) => {
    setBonusToFinalize(bonus);
    setFinalizeDialogOpen(true);
  };

  const handleConfirmFinalize = async (reason: FinalizeReason): Promise<boolean> => {
    if (!bonusToFinalize) return false;
    const success = await finalizeBonus(bonusToFinalize.id, reason);
    if (success) {
      setBonusToFinalize(null);
      if (onBonusChange) {
        onBonusChange();
      }
    }
    return success;
  };

  const handleSaveBonus = async (data: BonusFormData): Promise<boolean> => {
    let success: boolean;
    if (editingBonus) {
      success = await updateBonus(editingBonus.id, data);
      if (success) {
        setDialogOpen(false);
        setEditingBonus(null);
      }
    } else {
      success = await createBonus({
        ...data,
        bookmaker_id: bookmakerId,
      });
      if (success) {
        setDialogOpen(false);
      }
    }
    if (success && onBonusChange) {
      onBonusChange();
    }
    return success;
  };

  return (
    <>
      <BonusHistoryDrawer
        open={open}
        onOpenChange={onOpenChange}
        bookmakerName={bookmakerName}
        bookmakerLogin={bookmakerLogin}
        bookmakerLogo={bookmakerLogo}
        bonuses={bookmakerBonuses}
        totalCredited={summary.total_credited}
        currency={currency}
        onAddBonus={handleAddBonus}
        onEditBonus={handleEditBonus}
        onDeleteBonus={handleDeleteBonus}
        onFinalizeBonus={handleFinalizeBonus}
      />

      <BonusDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        bookmakers={[{ id: bookmakerId, nome: bookmakerName, login_username: bookmakerLogin, login_password_encrypted: bookmakerPassword, bookmaker_catalogo_id: bookmakerCatalogoId }]}
        bonus={editingBonus}
        preselectedBookmakerId={bookmakerId}
        saving={saving}
        onSubmit={handleSaveBonus}
      />

      {bonusToFinalize && (
        <FinalizeBonusDialog
          open={finalizeDialogOpen}
          onOpenChange={setFinalizeDialogOpen}
          bonusAmount={bonusToFinalize.bonus_amount}
          currency={bonusToFinalize.currency}
          onConfirm={handleConfirmFinalize}
        />
      )}
    </>
  );
}
