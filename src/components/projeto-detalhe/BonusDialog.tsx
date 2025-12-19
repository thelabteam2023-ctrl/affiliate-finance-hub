import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Loader2, Gift, Building2 } from "lucide-react";
import { BonusFormData, BonusStatus, ProjectBonus } from "@/hooks/useProjectBonuses";
import { format } from "date-fns";

interface BookmakerOption {
  id: string;
  nome: string;
  login_username: string;
  logo_url?: string | null;
}

interface BonusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  bookmakers: BookmakerOption[];
  bonus?: ProjectBonus | null;
  preselectedBookmakerId?: string;
  saving: boolean;
  onSubmit: (data: BonusFormData) => Promise<boolean>;
}

const STATUS_OPTIONS: { value: BonusStatus; label: string; color: string }[] = [
  { value: "credited", label: "Creditado", color: "text-emerald-400" },
  { value: "pending", label: "Pendente", color: "text-yellow-400" },
  { value: "failed", label: "Falhou", color: "text-red-400" },
  { value: "expired", label: "Expirado", color: "text-gray-400" },
  { value: "reversed", label: "Estornado", color: "text-orange-400" },
];

const CURRENCY_OPTIONS = ["BRL", "USD", "EUR", "GBP", "USDT"];

export function BonusDialog({
  open,
  onOpenChange,
  projectId,
  bookmakers,
  bonus,
  preselectedBookmakerId,
  saving,
  onSubmit,
}: BonusDialogProps) {
  const [bookmakerId, setBookmakerId] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [status, setStatus] = useState<BonusStatus>("credited");
  const [creditedAt, setCreditedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");

  const isEditMode = !!bonus;

  useEffect(() => {
    if (open) {
      if (bonus) {
        // Edit mode
        setBookmakerId(bonus.bookmaker_id);
        setTitle(bonus.title);
        setAmount(String(bonus.bonus_amount));
        setCurrency(bonus.currency);
        setStatus(bonus.status);
        setCreditedAt(bonus.credited_at ? format(new Date(bonus.credited_at), "yyyy-MM-dd") : "");
        setExpiresAt(bonus.expires_at ? format(new Date(bonus.expires_at), "yyyy-MM-dd") : "");
        setNotes(bonus.notes || "");
      } else {
        // Create mode
        setBookmakerId(preselectedBookmakerId || "");
        setTitle("");
        setAmount("");
        setCurrency("BRL");
        setStatus("credited");
        setCreditedAt(format(new Date(), "yyyy-MM-dd"));
        setExpiresAt("");
        setNotes("");
      }
    }
  }, [open, bonus, preselectedBookmakerId]);

  const handleSubmit = async () => {
    if (!bookmakerId) {
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return;
    }

    const data: BonusFormData = {
      bookmaker_id: bookmakerId,
      title: title.trim(),
      bonus_amount: parsedAmount,
      currency,
      status,
      credited_at: status === "credited" && creditedAt ? new Date(creditedAt).toISOString() : null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      notes: notes.trim() || null,
    };

    const success = await onSubmit(data);
    if (success) {
      onOpenChange(false);
    }
  };

  const selectedBookmaker = bookmakers.find((b) => b.id === bookmakerId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            {isEditMode ? "Editar Bônus" : "Registrar Bônus"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Atualize as informações do bônus"
              : "Registre um novo bônus recebido pelo vínculo"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Bookmaker Select */}
          <div className="space-y-2">
            <Label>Casa de Apostas *</Label>
            <Select
              value={bookmakerId}
              onValueChange={setBookmakerId}
              disabled={isEditMode || !!preselectedBookmakerId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a casa" />
              </SelectTrigger>
              <SelectContent>
                {bookmakers.map((bk) => (
                  <SelectItem key={bk.id} value={bk.id}>
                    <div className="flex items-center gap-2">
                      {bk.logo_url ? (
                        <img
                          src={bk.logo_url}
                          alt={bk.nome}
                          className="h-5 w-5 rounded object-contain bg-white"
                        />
                      ) : (
                        <Building2 className="h-4 w-4" />
                      )}
                      <span>{bk.nome}</span>
                      <span className="text-muted-foreground text-xs">({bk.login_username})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label>Título / Campanha</Label>
            <Input
              placeholder="Ex: Bônus 100% Depósito, Reload Semanal, VIP..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Amount and Currency */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label>Valor do Bônus *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Moeda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Status *</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as BonusStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className={opt.color}>{opt.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Credited At - only show if status is credited */}
          {status === "credited" && (
            <div className="space-y-2">
              <Label>Data do Crédito</Label>
              <DatePicker
                value={creditedAt}
                onChange={setCreditedAt}
              />
            </div>
          )}

          {/* Expires At */}
          <div className="space-y-2">
            <Label>Data de Expiração (opcional)</Label>
            <DatePicker
              value={expiresAt}
              onChange={setExpiresAt}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              placeholder="Detalhes adicionais sobre o bônus..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !bookmakerId || !amount || parseFloat(amount) <= 0}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditMode ? "Salvar Alterações" : "Registrar Bônus"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
