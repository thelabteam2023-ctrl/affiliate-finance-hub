import { useState, useEffect, useMemo, useRef } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Loader2, Gift, Building2, Sparkles, Check, Info, AlertTriangle, Clock, Lock, Search } from "lucide-react";
import { BonusFormData, BonusStatus, ProjectBonus } from "@/hooks/useProjectBonuses";
import { getFirstLastName } from "@/lib/utils";
import { useBookmakerBonusTemplates, BonusTemplate, calculateRolloverTarget } from "@/hooks/useBookmakerBonusTemplates";
import { format, addDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  FIAT_CURRENCIES, 
  CRYPTO_CURRENCIES, 
  getCurrencySymbol,
  type SupportedCurrency 
} from "@/types/currency";

interface BookmakerOption {
  id: string;
  nome: string;
  login_username: string;
  login_password_encrypted?: string | null;
  logo_url?: string | null;
  bookmaker_catalogo_id?: string | null;
  saldo_atual?: number;
  saldo_usd?: number;
  moeda?: string;
  parceiro_nome?: string;
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

// Todas as moedas suportadas pelo sistema (FIAT + CRYPTO mais comuns)
const ALL_CURRENCY_OPTIONS: { value: string; label: string }[] = [
  ...FIAT_CURRENCIES.map(c => ({ value: c.value, label: `${c.symbol} ${c.value}` })),
  ...CRYPTO_CURRENCIES.filter(c => c.isStablecoin).map(c => ({ value: c.value, label: `${c.symbol} ${c.value}` })),
];

const ROLLOVER_BASE_OPTIONS: { value: string; label: string }[] = [
  { value: "DEPOSITO", label: "Depósito" },
  { value: "BONUS", label: "Bônus" },
  { value: "DEPOSITO_BONUS", label: "Dep. + Bônus" },
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
  const { toast } = useToast();
  const [bookmakerId, setBookmakerId] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [status, setStatus] = useState<BonusStatus>("pending");
  const [creditedAt, setCreditedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [showCreditConfirmation, setShowCreditConfirmation] = useState(false);
  
  // New rollover fields
  const [rolloverMultiplier, setRolloverMultiplier] = useState("");
  const [rolloverBase, setRolloverBase] = useState("DEPOSITO_BONUS");
  const [depositAmount, setDepositAmount] = useState("");
  const [minOdds, setMinOdds] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("");
  
  // Template tracking
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [filledFromTemplate, setFilledFromTemplate] = useState(false);
  const [templatePercent, setTemplatePercent] = useState<number | null>(null);
  const [templateMaxValue, setTemplateMaxValue] = useState<number | null>(null);
  const [bookmakerSearch, setBookmakerSearch] = useState("");
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
        
        setRolloverMultiplier(bonus.rollover_multiplier ? String(bonus.rollover_multiplier) : "");
        setRolloverBase(bonus.rollover_base || "DEPOSITO_BONUS");
        setDepositAmount(bonus.deposit_amount ? String(bonus.deposit_amount) : "");
        setMinOdds(bonus.min_odds ? String(bonus.min_odds) : "");
        setDeadlineDays(bonus.deadline_days ? String(bonus.deadline_days) : "");
        setFilledFromTemplate(bonus.source === "template");
        setSelectedTemplateId(null);
      } else {
        // Create mode - default to credited (most bookmakers credit immediately)
        setBookmakerId(preselectedBookmakerId || "");
        setTitle("");
        setAmount("");
        setCurrency("BRL");
        setStatus("credited");
        setCreditedAt(format(new Date(), "yyyy-MM-dd"));
        setExpiresAt("");
        
        setRolloverMultiplier("");
        setRolloverBase("DEPOSITO_BONUS");
        setDepositAmount("");
        setMinOdds("");
        setDeadlineDays("");
        setFilledFromTemplate(false);
        setSelectedTemplateId(null);
        setTemplatePercent(null);
        setTemplateMaxValue(null);
        setShowCreditConfirmation(false);
      }
    }
  }, [open, bonus, preselectedBookmakerId]);

  // Reset template selection when bookmaker changes AND inherit currency from bookmaker
  useEffect(() => {
    if (!isEditMode && bookmakerId) {
      setSelectedTemplateId(null);
      setFilledFromTemplate(false);
      setTemplatePercent(null);
      setTemplateMaxValue(null);
      
      // CRÍTICO: Herdar moeda da bookmaker selecionada
      // A moeda do bônus deve ser a mesma da casa para evitar inconsistências
      const bk = bookmakers.find(b => b.id === bookmakerId);
      if (bk?.moeda) {
        setCurrency(bk.moeda);
      }
    }
  }, [bookmakerId, isEditMode, bookmakers]);

  // Auto-calculate bonus value when deposit changes and template has percentage
  useEffect(() => {
    if (templatePercent && depositAmount) {
      const deposit = parseFloat(depositAmount);
      if (!isNaN(deposit) && deposit > 0) {
        let calculatedBonus = (deposit * templatePercent) / 100;
        // Apply max value cap if exists
        if (templateMaxValue && calculatedBonus > templateMaxValue) {
          calculatedBonus = templateMaxValue;
        }
        setAmount(calculatedBonus.toFixed(2));
      }
    }
  }, [depositAmount, templatePercent, templateMaxValue]);

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
    
    // Store percentage for auto-calculation
    if (template.percent) {
      setTemplatePercent(parseFloat(template.percent));
    } else {
      setTemplatePercent(null);
    }
    
    // Store max value for capping
    if (template.valorMax) {
      setTemplateMaxValue(parseFloat(template.valorMax));
    } else {
      setTemplateMaxValue(null);
    }
    
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
      // Auto-set expiration date based on credit date (or today)
      const baseDate = creditedAt ? new Date(creditedAt) : new Date();
      const expiration = addDays(baseDate, Number(template.prazo));
      setExpiresAt(format(expiration, "yyyy-MM-dd"));
    }
    
    // If deposit already filled, calculate bonus
    if (depositAmount) {
      const deposit = parseFloat(depositAmount);
      if (!isNaN(deposit) && deposit > 0 && template.percent) {
        let calculatedBonus = (deposit * parseFloat(template.percent)) / 100;
        if (template.valorMax && calculatedBonus > parseFloat(template.valorMax)) {
          calculatedBonus = parseFloat(template.valorMax);
        }
        setAmount(calculatedBonus.toFixed(2));
      }
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

    // If creating new bonus with credited status, show confirmation first
    if (!isEditMode && status === "credited" && !showCreditConfirmation) {
      setShowCreditConfirmation(true);
      return;
    }

    await executeSubmit();
  };

  const executeSubmit = async () => {
    const parsedAmount = parseFloat(amount);
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
      notes: null,
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

        <div className="space-y-5 py-4">
          {/* Bookmaker Select - Centralizado (sem ID Card) */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground text-center block">Casa de Apostas</Label>
            <Select
              value={bookmakerId}
              onValueChange={setBookmakerId}
              disabled={isEditMode || !!preselectedBookmakerId}
            >
              <SelectTrigger className="h-10 justify-center [&>span]:flex [&>span]:items-center [&>span]:justify-center">
                <SelectValue placeholder="Selecione a casa" />
              </SelectTrigger>
              <SelectContent>
                <div className="p-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar casa..."
                      value={bookmakerSearch}
                      onChange={(e) => setBookmakerSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="pl-8 h-8"
                    />
                  </div>
                </div>
                {bookmakers
                  .filter((bk) => {
                    if (!bookmakerSearch) return true;
                    const search = bookmakerSearch.toLowerCase();
                    return (
                      bk.nome.toLowerCase().includes(search) ||
                      bk.login_username?.toLowerCase().includes(search) ||
                      bk.parceiro_nome?.toLowerCase().includes(search)
                    );
                  })
                  .map((bk) => {
                    const moeda = bk.moeda || "BRL";
                    const usaUsd = moeda === "USD" || moeda === "USDT";
                    const currencySymbol = usaUsd
                      ? "$"
                      : moeda === "EUR"
                        ? "€"
                        : moeda === "GBP"
                          ? "£"
                          : "R$";

                    const saldo = bk.saldo_atual ?? 0;

                    return (
                      <SelectItem key={bk.id} value={bk.id} className="py-2">
                        <div className="flex items-center justify-between w-full gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {bk.logo_url ? (
                              <img
                                src={bk.logo_url}
                                alt={bk.nome}
                                className="h-6 w-6 rounded object-contain logo-blend shrink-0"
                              />
                            ) : (
                              <Building2 className="h-6 w-6 shrink-0" />
                            )}
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-foreground truncate">{bk.nome}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${usaUsd ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                  {bk.moeda || "BRL"}
                                </span>
                              </div>
                              {bk.parceiro_nome && (
                                <span className="text-xs text-muted-foreground truncate">{getFirstLastName(bk.parceiro_nome)}</span>
                              )}
                            </div>
                          </div>
                          <span className="text-success font-semibold whitespace-nowrap shrink-0">
                            {currencySymbol}{" "}
                            {saldo.toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                {bookmakers.filter((bk) => {
                  if (!bookmakerSearch) return true;
                  const search = bookmakerSearch.toLowerCase();
                  return (
                    bk.nome.toLowerCase().includes(search) ||
                    bk.login_username?.toLowerCase().includes(search) ||
                    bk.parceiro_nome?.toLowerCase().includes(search)
                  );
                }).length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Nenhuma casa encontrada
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Template Suggestions - Centralizado */}
          {!isEditMode && hasTemplates && bookmakerId && (
            <div className="space-y-2 p-3 rounded-lg border border-primary/20 bg-primary/5">
              <div className="flex items-center justify-center gap-2 text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4" />
                Sugestões de bônus
              </div>
              <div className="flex flex-wrap justify-center gap-2">
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
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
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

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {/* LINHA 1 — Título / Campanha (centralizado) */}
          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div className="space-y-1.5">
            <Label className="flex items-center justify-center gap-2 text-sm font-medium">
              Título / Campanha
              {filledFromTemplate && (
                <Badge variant="secondary" className="text-[10px]">Catálogo</Badge>
              )}
            </Label>
            <Input
              placeholder="Ex: Bônus 100% Depósito, Reload Semanal..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-center text-base font-medium h-10"
            />
          </div>

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {/* LINHA 2 — Valores monetários (Depósito + Bônus + Moeda) */}
          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div className="grid grid-cols-3 gap-3">
            {/* Depósito de Referência (informativo, não financeiro) */}
            <div className="flex flex-col">
              <div className="h-5 flex items-center justify-center gap-1">
                <Label className="text-xs text-muted-foreground">Depósito Referência</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px] text-xs">
                      <p>Valor informativo para cálculo do rollover. <strong>Não representa depósito financeiro</strong> — depósitos reais são registrados no Caixa.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="relative mt-1.5">
                <div className="absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center bg-muted/50 border-r border-border rounded-l-md">
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="8" width="18" height="11" rx="2" className="fill-slate-500/20 stroke-slate-400" strokeWidth="1.5"/>
                    <path d="M3 10h18" className="stroke-slate-400" strokeWidth="1.5"/>
                    <path d="M7 4h10M9 4v4M15 4v4" className="stroke-slate-400" strokeWidth="1.5" strokeLinecap="round"/>
                    <rect x="6" y="13" width="4" height="3" rx="0.5" className="fill-slate-400/50"/>
                    <rect x="12" y="13" width="5" height="1.5" rx="0.5" className="fill-slate-400/30"/>
                    <rect x="12" y="15.5" width="3" height="1.5" rx="0.5" className="fill-slate-400/30"/>
                  </svg>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="h-10 text-center pl-12"
                />
              </div>
              <div className="h-4 mt-1">
                {templatePercent && (
                  <p className="text-[10px] text-muted-foreground text-center truncate">
                    Bônus {templatePercent}%{templateMaxValue ? ` (máx. ${templateMaxValue})` : ''}
                  </p>
                )}
              </div>
            </div>
            {/* Bônus */}
            <div className="flex flex-col">
              <div className="h-5 flex items-center justify-center gap-1">
                <Label className="text-xs text-muted-foreground">Valor do Bônus *</Label>
                {templatePercent && amount && (
                  <Badge variant="secondary" className="text-[9px] px-1 h-4">Auto</Badge>
                )}
              </div>
              <div className="relative mt-1.5">
                <div className="absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center bg-primary/10 border-r border-primary/20 rounded-l-md">
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="4" width="20" height="16" rx="3" className="fill-primary/20 stroke-primary" strokeWidth="1.5"/>
                    <circle cx="12" cy="12" r="4" className="stroke-primary" strokeWidth="1.5"/>
                    <path d="M12 10v4M10.5 11.5l1.5-1.5 1.5 1.5" className="stroke-primary" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="5.5" cy="8" r="1" className="fill-primary/60"/>
                    <circle cx="18.5" cy="16" r="1" className="fill-primary/60"/>
                    <path d="M5 15.5h2M17 8.5h2" className="stroke-primary/40" strokeWidth="1" strokeLinecap="round"/>
                  </svg>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-10 text-center pl-12"
                />
              </div>
              <div className="h-4 mt-1" />
            </div>
            {/* Moeda - Travada pela bookmaker selecionada */}
            <div className="flex flex-col">
              <div className="h-5 flex items-center justify-center gap-1">
                <Label className="text-xs text-muted-foreground">Moeda</Label>
                {bookmakerId && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Lock className="h-3 w-3 text-muted-foreground/60" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px] text-xs">
                        <p>Moeda herdada da casa de apostas para garantir consistência financeira.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <Select 
                value={currency} 
                onValueChange={setCurrency}
                disabled={!!bookmakerId}
              >
                <SelectTrigger className={cn(
                  "h-10 mt-1.5 justify-center [&>span]:text-center",
                  bookmakerId && "bg-muted/50 cursor-not-allowed"
                )}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_CURRENCY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="justify-center">
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="h-4 mt-1" />
            </div>
          </div>

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {/* LINHA 3 — Regras de Rollover (Rollover + Base + Odd Mín.) */}
          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div className="grid grid-cols-3 gap-3">
            {/* Rollover */}
            <div className="flex flex-col">
              <div className="h-5 flex items-center justify-center gap-1">
                <Label className="text-xs text-muted-foreground">Rollover</Label>
                {filledFromTemplate && rolloverMultiplier && (
                  <Badge variant="secondary" className="text-[9px] px-1 h-4">Cat.</Badge>
                )}
              </div>
              <div className="relative mt-1.5">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="6"
                  value={rolloverMultiplier}
                  onChange={(e) => setRolloverMultiplier(e.target.value)}
                  className="h-10 pr-7 text-center"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">x</span>
              </div>
            </div>
            {/* Base Rollover */}
            <div className="flex flex-col">
              <div className="h-5 flex items-center justify-center">
                <Label className="text-xs text-muted-foreground">Base Rollover</Label>
              </div>
              <Select value={rolloverBase} onValueChange={setRolloverBase}>
                <SelectTrigger 
                  className="h-10 mt-1.5 justify-center [&>span]:flex-1 [&>span]:text-center [&>span]:min-w-0 [&>svg]:shrink-0"
                  title={ROLLOVER_BASE_OPTIONS.find(o => o.value === rolloverBase)?.label}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLLOVER_BASE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="justify-center">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Odd Mín. */}
            <div className="flex flex-col">
              <div className="h-5 flex items-center justify-center gap-1">
                <Label className="text-xs text-muted-foreground">Odd Mín.</Label>
                {filledFromTemplate && minOdds && (
                  <Badge variant="secondary" className="text-[9px] px-1 h-4">Cat.</Badge>
                )}
              </div>
              <Input
                type="number"
                step="0.01"
                min="1"
                placeholder="1.50"
                value={minOdds}
                onChange={(e) => setMinOdds(e.target.value)}
                className="h-10 mt-1.5 text-center"
              />
            </div>
          </div>

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {/* LINHA 4 — Prazo e Datas (Prazo + Data Crédito + Expiração) */}
          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div className="grid grid-cols-3 gap-3">
            {/* Prazo */}
            <div className="flex flex-col">
              <div className="h-5 flex items-center justify-center gap-1">
                <Label className="text-xs text-muted-foreground">Prazo</Label>
                {filledFromTemplate && deadlineDays && (
                  <Badge variant="secondary" className="text-[9px] px-1 h-4">Cat.</Badge>
                )}
              </div>
              <div className="relative mt-1.5">
                <Input
                  type="number"
                  step="1"
                  min="1"
                  placeholder="30"
                  value={deadlineDays}
                  onChange={(e) => {
                    setDeadlineDays(e.target.value);
                    if (e.target.value && creditedAt) {
                      const baseDate = creditedAt ? new Date(creditedAt) : new Date();
                      const expiration = addDays(baseDate, Number(e.target.value));
                      setExpiresAt(format(expiration, "yyyy-MM-dd"));
                    }
                  }}
                  className="h-10 pr-10 text-center"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">dias</span>
              </div>
            </div>
            {/* Data do Crédito */}
            <div className="flex flex-col">
              <div className="h-5 flex items-center justify-center">
                <Label className="text-xs text-muted-foreground">Data do Crédito</Label>
              </div>
              <div className="[&_button]:h-10 [&_button]:justify-center mt-1.5">
                {status === "credited" ? (
                  <DatePicker
                    value={creditedAt}
                    onChange={(val) => {
                      setCreditedAt(val);
                      // Auto-recalculate expiration from new credit date + deadline
                      if (val && deadlineDays) {
                        const baseDate = new Date(val);
                        const expiration = addDays(baseDate, Number(deadlineDays));
                        setExpiresAt(format(expiration, "yyyy-MM-dd"));
                      }
                    }}
                    maxDate={new Date()}
                  />
                ) : (
                  <div className="h-10 flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-md">
                    —
                  </div>
                )}
              </div>
            </div>
            {/* Expiração */}
            <div className="flex flex-col">
              <div className="h-5 flex items-center justify-center gap-1">
                <Label className="text-xs text-muted-foreground">Expiração</Label>
                {filledFromTemplate && expiresAt && (
                  <Badge variant="secondary" className="text-[9px] px-1 h-4">Auto</Badge>
                )}
              </div>
              <div className="[&_button]:h-10 [&_button]:justify-center mt-1.5">
                <DatePicker
                  value={expiresAt}
                  onChange={setExpiresAt}
                />
              </div>
            </div>
          </div>

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {/* LINHA 5 — Status (centralizado) com confirmação */}
          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div className="flex justify-center pt-2">
            <div className="space-y-1.5 w-48">
              <Label className="text-xs text-muted-foreground text-center block">Status</Label>
              <Select 
                value={status} 
                onValueChange={(v) => {
                  const newStatus = v as BonusStatus;
                  // If changing to credited and not in edit mode, show confirmation
                  if (newStatus === "credited" && !isEditMode && status !== "credited") {
                    setShowCreditConfirmation(true);
                  } else {
                    setStatus(newStatus);
                    // Auto-fill credited date when status changes to credited
                    if (newStatus === "credited" && !creditedAt) {
                      setCreditedAt(format(new Date(), "yyyy-MM-dd"));
                    }
                  }
                }}
              >
                <SelectTrigger className="h-10 justify-center [&>span]:flex [&>span]:items-center [&>span]:justify-center">
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
              
              {/* Hint for pending status */}
              {status === "pending" && !isEditMode && (
                <p className="text-[10px] text-center text-muted-foreground">
                  Altere para "Creditado" quando o bônus aparecer na sua conta
                </p>
              )}
            </div>
          </div>
          
          {/* Warning banner when credited is selected */}
          {status === "credited" && !isEditMode && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-amber-400">
                  Confirme que o bônus foi creditado
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Ao marcar como "Creditado", o rollover começará a ser contado imediatamente. 
                  Só marque este status se o valor já está disponível na sua conta da casa.
                </p>
              </div>
            </div>
          )}
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
      
      {/* Confirmation dialog shown when creating a new bonus */}
      <AlertDialog open={showCreditConfirmation} onOpenChange={setShowCreditConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              O bônus já foi creditado?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-3">
              <p>
                A maioria das casas credita o bônus automaticamente ao depositar. 
                Confirme se o valor <strong>já está disponível</strong> na sua conta.
              </p>
              <div className="bg-muted/50 border rounded-lg p-3 text-sm space-y-2">
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">Creditado:</strong> O rollover começa a contar imediatamente
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">Pendente:</strong> Aguardando crédito pela casa (altere depois)
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:space-x-2">
            <AlertDialogCancel 
              onClick={async () => {
                setStatus("pending");
                setCreditedAt("");
                setShowCreditConfirmation(false);
                // Submit with pending status
                const parsedAmount = parseFloat(amount);
                const parsedRollover = rolloverMultiplier ? parseFloat(rolloverMultiplier) : null;
                const parsedDeposit = depositAmount ? parseFloat(depositAmount) : null;
                const parsedMinOdds = minOdds ? parseFloat(minOdds) : null;
                const parsedDeadline = deadlineDays ? parseInt(deadlineDays) : null;

                let rolloverTarget: number | null = null;
                if (parsedRollover && parsedRollover > 0) {
                  rolloverTarget = calculateRolloverTarget({
                    bonusValue: parsedAmount,
                    depositAmount: parsedDeposit,
                    multiplier: parsedRollover,
                    baseType: rolloverBase,
                  });
                }

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
                  status: "pending",
                  credited_at: null,
                  expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
                  notes: null,
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
              }}
              className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
            >
              Ainda não foi creditado
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={async () => {
                setShowCreditConfirmation(false);
                await executeSubmit();
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Sim, já foi creditado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
