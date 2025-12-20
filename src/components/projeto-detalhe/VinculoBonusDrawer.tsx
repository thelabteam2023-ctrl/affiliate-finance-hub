import { useState } from "react";
import { useProjectBonuses, ProjectBonus, BonusStatus, BonusFormData } from "@/hooks/useProjectBonuses";
import { BonusHistoryDrawer } from "./BonusHistoryDrawer";
import { BonusDialog } from "./BonusDialog";

interface VinculoBonusDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  bookmakerId: string;
  bookmakerName: string;
  bookmakerLogin?: string;
  bookmakerLogo?: string | null;
  currency?: string;
}

export function VinculoBonusDrawer({
  open,
  onOpenChange,
  projectId,
  bookmakerId,
  bookmakerName,
  bookmakerLogin = "",
  bookmakerLogo,
  currency = "BRL",
}: VinculoBonusDrawerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBonus, setEditingBonus] = useState<ProjectBonus | null>(null);

  const {
    bonuses,
    loading,
    saving,
    createBonus,
    updateBonus,
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
    return await deleteBonus(id);
  };

  const handleChangeStatus = async (id: string, status: BonusStatus): Promise<boolean> => {
    return await updateBonus(id, { status });
  };

  const handleSaveBonus = async (data: BonusFormData) => {
    if (editingBonus) {
      const success = await updateBonus(editingBonus.id, data);
      if (success) {
        setDialogOpen(false);
        setEditingBonus(null);
      }
    } else {
      const success = await createBonus({
        ...data,
        bookmaker_id: bookmakerId,
      });
      if (success) {
        setDialogOpen(false);
      }
    }
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
        onChangeStatus={handleChangeStatus}
      />

      <BonusDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        bookmakers={[{ id: bookmakerId, nome: bookmakerName, login_username: bookmakerLogin }]}
        bonus={editingBonus}
        preselectedBookmakerId={bookmakerId}
        saving={saving}
        onSubmit={async (data) => {
          if (editingBonus) {
            return await updateBonus(editingBonus.id, data);
          } else {
            return await createBonus(data);
          }
        }}
      />
    </>
  );
}
