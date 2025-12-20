import { useState, useEffect, useMemo } from "react";
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
import { Loader2, Gift, Building2, Sparkles, Check } from "lucide-react";
import { BonusFormData, BonusStatus, ProjectBonus } from "@/hooks/useProjectBonuses";
import { useBookmakerBonusTemplates, BonusTemplate, calculateRolloverTarget } from "@/hooks/useBookmakerBonusTemplates";
import { format, addDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface BookmakerOption {
  id: string;
  nome: string;
  login_username: string;
  logo_url?: string | null;
  bookmaker_catalogo_id?: string | null;
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

const ROLLOVER_BASE_OPTIONS: { value: string; label: string }[] = [
  { value: "DEPOSITO", label: "Depósito" },
  { value: "BONUS", label: "Bônus" },
  { value: "DEPOSITO_BONUS", label: "Depósito + Bônus" },
];

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
  
  // New rollover fields
  const [rolloverMultiplier, setRolloverMultiplier] = useState("");
  const [rolloverBase, setRolloverBase] = useState("DEPOSITO_BONUS");
  const [depositAmount, setDepositAmount] = useState("");
  const [minOdds, setMinOdds] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("");
  
  // Template tracking
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [filledFromTemplate, setFilledFromTemplate] = useState(false);

  const isEditMode = !!bonus;

  // Get the selected bookmaker to find its catalogo_id
  const selectedBookmaker = useMemo(() => {
    return bookmakers.find((b) => b.id === bookmakerId);
  }, [bookmakerId, bookmakers]);

  // Fetch bonus templates for the selected bookmaker
  const { templates, hasTemplates, loading: loadingTemplates, getTemplateLabel } = useBookmakerBonusTemplates({
    bookmakerCatalogoId: selectedBookmaker?.bookmaker_catalogo_id,
  });

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
        setRolloverMultiplier(bonus.rollover_multiplier ? String(bonus.rollover_multiplier) : "");
        setRolloverBase(bonus.rollover_base || "DEPOSITO_BONUS");
        setDepositAmount(bonus.deposit_amount ? String(bonus.deposit_amount) : "");
        setMinOdds(bonus.min_odds ? String(bonus.min_odds) : "");
        setDeadlineDays(bonus.deadline_days ? String(bonus.deadline_days) : "");
        setFilledFromTemplate(bonus.source === "template");
        setSelectedTemplateId(null);
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
        setRolloverMultiplier("");
        setRolloverBase("DEPOSITO_BONUS");
        setDepositAmount("");
        setMinOdds("");
        setDeadlineDays("");
        setFilledFromTemplate(false);
        setSelectedTemplateId(null);
      }
    }
  }, [open, bonus, preselectedBookmakerId]);

  // Reset template selection when bookmaker changes
  useEffect(() => {
    if (!isEditMode) {
      setSelectedTemplateId(null);
      setFilledFromTemplate(false);
    }
  }, [bookmakerId, isEditMode]);

  const handleSelectTemplate = (template: BonusTemplate) => {
    setSelectedTemplateId(template.id);
    setFilledFromTemplate(true);
    
    // Auto-fill fields from template
    const tipoLabel = template.tipoBônus === "OUTRO" && template.tipoOutro 
      ? template.tipoOutro 
      : formatBonusTypeLabel(template.tipoBônus);
    const percentLabel = template.percent ? `${template.percent}%` : "";
    setTitle([tipoLabel, percentLabel].filter(Boolean).join(" "));
    
    setCurrency(template.moeda || "BRL");
    
    if (template.rolloverVezes) {
      setRolloverMultiplier(template.rolloverVezes);
    }
    if (template.rolloverBase) {
      setRolloverBase(template.rolloverBase);
    }
    if (template.oddMin) {
      setMinOdds(template.oddMin);
    }
    if (template.prazo) {
      setDeadlineDays(template.prazo);
      // Auto-set expiration date
      const today = new Date();
      const expiration = addDays(today, Number(template.prazo));
      setExpiresAt(format(expiration, "yyyy-MM-dd"));
    }
  };

  const handleSubmit = async () => {
    if (!bookmakerId) {
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return;
    }

    const parsedRollover = rolloverMultiplier ? parseFloat(rolloverMultiplier) : null;
    const parsedDeposit = depositAmount ? parseFloat(depositAmount) : null;
    const parsedMinOdds = minOdds ? parseFloat(minOdds) : null;
    const parsedDeadline = deadlineDays ? parseInt(deadlineDays) : null;

    // Calculate rollover target if we have the data
    let rolloverTarget: number | null = null;
    if (parsedRollover && parsedRollover > 0) {
      rolloverTarget = calculateRolloverTarget({
        bonusValue: parsedAmount,
        depositAmount: parsedDeposit,
        multiplier: parsedRollover,
        baseType: rolloverBase,
      });
    }

    // Build template snapshot if from template
    let templateSnapshot: Record<string, unknown> | null = null;
    if (filledFromTemplate && selectedTemplateId) {
      const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
      if (selectedTemplate) {
        templateSnapshot = { ...selectedTemplate };
      }
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
      source: filledFromTemplate ? "template" : "manual",
      template_snapshot: templateSnapshot,
      rollover_multiplier: parsedRollover,
      rollover_base: rolloverBase,
      rollover_target_amount: rolloverTarget,
      deposit_amount: parsedDeposit,
      min_odds: parsedMinOdds,
      deadline_days: parsedDeadline,
    };

    const success = await onSubmit(data);
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
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

          {/* Template Suggestions */}
          {!isEditMode && hasTemplates && bookmakerId && (
            <div className="space-y-2 p-3 rounded-lg border border-primary/20 bg-primary/5">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4" />
                Sugestões de bônus da casa
              </div>
              <div className="flex flex-wrap gap-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleSelectTemplate(template)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                      selectedTemplateId === template.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border border-border hover:bg-muted"
                    )}
                  >
                    {selectedTemplateId === template.id && (
                      <Check className="h-3 w-3" />
                    )}
                    {getTemplateLabel(template)}
                  </button>
                ))}
              </div>
              {filledFromTemplate && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Check className="h-3 w-3 text-emerald-500" />
                  Campos preenchidos pelo catálogo
                </p>
              )}
            </div>
          )}

          {loadingTemplates && bookmakerId && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando sugestões...
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Título / Campanha
              {filledFromTemplate && (
                <Badge variant="secondary" className="text-[10px]">Catálogo</Badge>
              )}
            </Label>
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

          {/* Deposit Amount (optional for rollover calculation) */}
          <div className="space-y-2">
            <Label>Valor do Depósito (para cálculo de rollover)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
          </div>

          {/* Rollover Section */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Rollover (vezes)
                {filledFromTemplate && rolloverMultiplier && (
                  <Badge variant="secondary" className="text-[10px]">Catálogo</Badge>
                )}
              </Label>
              <Input
                type="number"
                step="1"
                min="0"
                placeholder="Ex: 6"
                value={rolloverMultiplier}
                onChange={(e) => setRolloverMultiplier(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Base do Rollover</Label>
              <Select value={rolloverBase} onValueChange={setRolloverBase}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLLOVER_BASE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Min Odds and Deadline */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Odd Mínima</Label>
              <Input
                type="number"
                step="0.01"
                min="1"
                placeholder="Ex: 1.50"
                value={minOdds}
                onChange={(e) => setMinOdds(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Prazo (dias)
                {filledFromTemplate && deadlineDays && (
                  <Badge variant="secondary" className="text-[10px]">Catálogo</Badge>
                )}
              </Label>
              <Input
                type="number"
                step="1"
                min="1"
                placeholder="Ex: 30"
                value={deadlineDays}
                onChange={(e) => {
                  setDeadlineDays(e.target.value);
                  // Auto-update expiration date
                  if (e.target.value && creditedAt) {
                    const baseDate = creditedAt ? new Date(creditedAt) : new Date();
                    const expiration = addDays(baseDate, Number(e.target.value));
                    setExpiresAt(format(expiration, "yyyy-MM-dd"));
                  }
                }}
              />
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
            <Label className="flex items-center gap-2">
              Data de Expiração
              {filledFromTemplate && expiresAt && (
                <Badge variant="secondary" className="text-[10px]">Auto-calculada</Badge>
              )}
            </Label>
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

function formatBonusTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    BOAS_VINDAS: "Boas-vindas",
    CASHBACK: "Cashback",
    FREE_BET: "Free Bet",
    RELOAD: "Reload",
    OUTRO: "Outro",
  };
  return labels[type] || type;
}
