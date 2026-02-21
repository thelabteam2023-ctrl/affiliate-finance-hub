import { useState, useMemo, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  RefreshCw,
  Pencil,
  Check,
  X,
  DollarSign,
  AlertTriangle,
  Info,
} from "lucide-react";
import { useCotacoes, CotacaoSourceInfo } from "@/hooks/useCotacoes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createPortal } from "react-dom";

interface DeltaCambialCardProps {
  projetoId: string;
  cotacaoTrabalho: number | null;
  cotacaoTrabalhoEur?: number | null;
  cotacaoTrabalhoGbp?: number | null;
  cotacaoTrabalhoMyr?: number | null;
  cotacaoTrabalhoMxn?: number | null;
  cotacaoTrabalhoArs?: number | null;
  cotacaoTrabalhoCop?: number | null;
  onCotacaoUpdated?: () => void;
}

const CURRENCY_CONFIG = {
  USD: { symbol: "$", label: "Dólar", field: "cotacao_trabalho", default: 5.30, primary: true, hasPtaxFallback: true },
  EUR: { symbol: "€", label: "Euro", field: "cotacao_trabalho_eur", default: 6.10, primary: true, hasPtaxFallback: true },
  GBP: { symbol: "£", label: "Libra", field: "cotacao_trabalho_gbp", default: 7.10, primary: true, hasPtaxFallback: true },
  MYR: { symbol: "RM", label: "Ringgit", field: "cotacao_trabalho_myr", default: 1.20, primary: false, hasPtaxFallback: false },
  MXN: { symbol: "MX$", label: "P. Mexicano", field: "cotacao_trabalho_mxn", default: 0.26, primary: false, hasPtaxFallback: false },
  ARS: { symbol: "AR$", label: "P. Argentino", field: "cotacao_trabalho_ars", default: 0.005, primary: false, hasPtaxFallback: false },
  COP: { symbol: "CO$", label: "P. Colombiano", field: "cotacao_trabalho_cop", default: 0.0013, primary: false, hasPtaxFallback: false },
} as const;

type CurrencyKey = keyof typeof CURRENCY_CONFIG;

/** Overlay for secondary currencies and editing */
function CotacoesOverlay({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = orig;
      document.removeEventListener("keydown", handler);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ background: "rgba(0,0,0,0.45)" }}
    >
      <div
        className="relative bg-background border border-border rounded-xl shadow-2xl flex flex-col"
        style={{ width: "min(640px, 90vw)", maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 h-7 w-7 z-10"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="overflow-y-auto p-5 pr-10">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export function DeltaCambialCard({
  projetoId,
  cotacaoTrabalho,
  cotacaoTrabalhoEur,
  cotacaoTrabalhoGbp,
  cotacaoTrabalhoMyr,
  cotacaoTrabalhoMxn,
  cotacaoTrabalhoArs,
  cotacaoTrabalhoCop,
  onCotacaoUpdated,
}: DeltaCambialCardProps) {
  const { rates, loading: cotacaoLoading, refreshAll, sources } = useCotacoes();
  const [editingCurrency, setEditingCurrency] = useState<CurrencyKey | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  const openOverlay = useCallback(() => setIsOverlayOpen(true), []);
  const closeOverlay = useCallback(() => { setIsOverlayOpen(false); setEditingCurrency(null); }, []);

  const workRates: Record<CurrencyKey, number> = {
    USD: cotacaoTrabalho ?? CURRENCY_CONFIG.USD.default,
    EUR: cotacaoTrabalhoEur ?? CURRENCY_CONFIG.EUR.default,
    GBP: cotacaoTrabalhoGbp ?? CURRENCY_CONFIG.GBP.default,
    MYR: cotacaoTrabalhoMyr ?? CURRENCY_CONFIG.MYR.default,
    MXN: cotacaoTrabalhoMxn ?? CURRENCY_CONFIG.MXN.default,
    ARS: cotacaoTrabalhoArs ?? CURRENCY_CONFIG.ARS.default,
    COP: cotacaoTrabalhoCop ?? CURRENCY_CONFIG.COP.default,
  };

  const officialRates: Record<CurrencyKey, number> = {
    USD: rates.USDBRL,
    EUR: rates.EURBRL,
    GBP: rates.GBPBRL,
    MYR: rates.MYRBRL,
    MXN: rates.MXNBRL,
    ARS: rates.ARSBRL,
    COP: rates.COPBRL,
  };

  const sourceMap: Record<CurrencyKey, CotacaoSourceInfo> = {
    USD: sources.usd,
    EUR: sources.eur,
    GBP: sources.gbp,
    MYR: sources.myr,
    MXN: sources.mxn,
    ARS: sources.ars,
    COP: sources.cop,
  };

  const deltas = useMemo(() => {
    const result: Record<CurrencyKey, number> = {} as Record<CurrencyKey, number>;
    (Object.keys(CURRENCY_CONFIG) as CurrencyKey[]).forEach(key => {
      const official = officialRates[key];
      const work = workRates[key];
      const sourceInfo = sourceMap[key];
      if (sourceInfo.isOfficial && official && work) {
        result[key] = ((official - work) / work) * 100;
      } else {
        result[key] = 0;
      }
    });
    return result;
  }, [officialRates, workRates, sourceMap]);

  const getDeltaClassification = (delta: number) => {
    const deltaAbs = Math.abs(delta);
    if (deltaAbs < 1) return { color: "text-muted-foreground", bgColor: "bg-muted/50" };
    if (deltaAbs < 3) return { color: "text-primary", bgColor: "bg-primary/10" };
    return { color: "text-destructive", bgColor: "bg-destructive/10" };
  };

  const handleStartEdit = (currency: CurrencyKey) => {
    setEditValue(workRates[currency].toFixed(4));
    setEditingCurrency(currency);
  };

  const handleCancelEdit = () => { setEditingCurrency(null); setEditValue(""); };

  const handleSaveEdit = async () => {
    if (!editingCurrency) return;
    const newValue = parseFloat(editValue.replace(",", "."));
    if (isNaN(newValue) || newValue <= 0) { toast.error("Cotação inválida"); return; }
    try {
      setSaving(true);
      const field = CURRENCY_CONFIG[editingCurrency].field;
      const { error } = await supabase.from("projetos").update({ [field]: newValue }).eq("id", projetoId);
      if (error) throw error;
      toast.success(`Cotação de trabalho ${editingCurrency} atualizada`);
      setEditingCurrency(null);
      await Promise.resolve(onCotacaoUpdated?.());
    } catch (error: any) {
      toast.error("Erro ao atualizar cotação: " + error.message);
    } finally { setSaving(false); }
  };

  const handleUseOfficial = async (currency: CurrencyKey) => {
    try {
      setSaving(true);
      const field = CURRENCY_CONFIG[currency].field;
      const { error } = await supabase.from("projetos").update({ [field]: officialRates[currency] }).eq("id", projetoId);
      if (error) throw error;
      toast.success(`Cotação ${currency} sincronizada`);
      await Promise.resolve(onCotacaoUpdated?.());
    } catch (error: any) {
      toast.error("Erro ao atualizar cotação: " + error.message);
    } finally { setSaving(false); }
  };

  const primaryCurrencies = (Object.keys(CURRENCY_CONFIG) as CurrencyKey[]).filter(k => CURRENCY_CONFIG[k].primary);
  const secondaryCurrencies = (Object.keys(CURRENCY_CONFIG) as CurrencyKey[]).filter(k => !CURRENCY_CONFIG[k].primary);

  const renderCompactCurrency = (key: CurrencyKey) => {
    const config = CURRENCY_CONFIG[key];
    const official = officialRates[key];
    const work = workRates[key];
    const delta = deltas[key];
    const sourceInfo = sourceMap[key];
    const isFallback = sourceInfo?.isFallback ?? true;
    const displayValue = isFallback ? work : official;
    const decimals = displayValue < 0.1 ? 4 : 2;
    const classification = getDeltaClassification(delta);
    const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;

    return (
      <TooltipProvider key={key}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col items-center gap-0.5 cursor-help">
              <span className="text-[9px] text-muted-foreground font-medium">{config.symbol} {key}</span>
              <span className="text-xs font-mono font-bold text-foreground">
                {cotacaoLoading ? "..." : displayValue.toFixed(decimals)}
              </span>
              {!isFallback ? (
                <Badge variant="outline" className={`${classification.bgColor} ${classification.color} font-mono text-[8px] px-1 py-0`}>
                  <DeltaIcon className="h-2 w-2 mr-0.5" />
                  {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 font-mono text-[8px] px-1 py-0">
                  <AlertTriangle className="h-2 w-2 mr-0.5" />
                  FB
                </Badge>
              )}
              <div className="text-[8px] text-muted-foreground">
                Trab. {work.toFixed(decimals)}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-[200px]">
            <p className="font-medium">{config.label}</p>
            <p>Oficial: R$ {official.toFixed(4)}</p>
            <p>Trabalho: R$ {work.toFixed(4)}</p>
            <p>Δ = {delta > 0 ? "+" : ""}{delta.toFixed(2)}%</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const renderFullCurrencyCard = (key: CurrencyKey) => {
    const config = CURRENCY_CONFIG[key];
    const official = officialRates[key];
    const work = workRates[key];
    const delta = deltas[key];
    const sourceInfo = sourceMap[key];
    const isFallback = sourceInfo?.isFallback ?? true;
    const isPtaxFallback = sourceInfo?.isPtaxFallback ?? false;
    const isOfficialAvailable = sourceInfo?.isOfficial ?? false;
    const displayValue = isFallback ? work : official;
    const decimals = displayValue < 0.1 ? 4 : 2;
    const classification = getDeltaClassification(delta);
    const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
    const isEditing = editingCurrency === key;
    const showSyncButton = isOfficialAvailable && Math.abs(delta) >= 1 && !isEditing;

    return (
      <div key={key} className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-muted/20 border border-border/50">
        <div className="text-center">
          <div className="text-[10px] text-muted-foreground font-medium">{config.symbol} {key}</div>
          <div className="font-mono font-bold text-base text-foreground">
            {cotacaoLoading ? "..." : displayValue.toFixed(decimals)}
          </div>
        </div>
        <div className="flex justify-center">
          {isFallback ? (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 font-mono text-[9px] px-1.5 py-0">
              <AlertTriangle className="h-2 w-2 mr-0.5" />Fallback
            </Badge>
          ) : (
            <Badge variant="outline" className={`${classification.bgColor} ${classification.color} font-mono text-[9px] px-1 py-0`}>
              <DeltaIcon className="h-2 w-2 mr-0.5" />{delta > 0 ? "+" : ""}{delta.toFixed(1)}%
            </Badge>
          )}
        </div>
        <div className="border-t border-border/30 pt-1.5">
          <div className="text-[9px] text-muted-foreground text-center mb-0.5">Trabalho</div>
          {isEditing ? (
            <div className="flex items-center gap-0.5">
              <Input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-6 text-[11px] font-mono text-center px-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") handleCancelEdit();
                }}
              />
              <div className="flex flex-col gap-0.5">
                <Button variant="ghost" size="icon" className="h-3 w-3 p-0" onClick={handleSaveEdit} disabled={saving}>
                  <Check className="h-2 w-2 text-primary" />
                </Button>
                <Button variant="ghost" size="icon" className="h-3 w-3 p-0" onClick={handleCancelEdit} disabled={saving}>
                  <X className="h-2 w-2 text-destructive" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1">
              <span className="font-mono font-medium text-sm text-foreground">{work.toFixed(decimals)}</span>
              <Button variant="ghost" size="icon" className="h-4 w-4 p-0" onClick={() => handleStartEdit(key)}>
                <Pencil className="h-2.5 w-2.5 text-muted-foreground hover:text-foreground" />
              </Button>
            </div>
          )}
        </div>
        {showSyncButton && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[9px] text-muted-foreground hover:text-foreground px-1"
            onClick={() => handleUseOfficial(key)}
            disabled={saving || cotacaoLoading}
          >
            <RefreshCw className={`h-2 w-2 mr-0.5 ${saving ? "animate-spin" : ""}`} />
            Usar {isPtaxFallback ? 'PTAX' : 'FastForex'}
          </Button>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Compact inline strip */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-card">
        <DollarSign className="h-3.5 w-3.5 text-primary flex-shrink-0" />

        <div className="flex items-center gap-3">
          {primaryCurrencies.map(renderCompactCurrency)}
        </div>

        <div className="flex items-center gap-1 ml-auto flex-shrink-0">
          {secondaryCurrencies.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[9px] text-muted-foreground hover:text-foreground px-1.5"
              onClick={openOverlay}
            >
              <Info className="h-2.5 w-2.5 mr-0.5" />
              +{secondaryCurrencies.length}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => refreshAll()}
            disabled={cotacaoLoading}
          >
            <RefreshCw className={`h-3 w-3 ${cotacaoLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Full overlay with all currencies + editing */}
      <CotacoesOverlay isOpen={isOverlayOpen} onClose={closeOverlay}>
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border/50">
            <DollarSign className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Cotações Oficiais</h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 ml-auto"
              onClick={() => refreshAll()}
              disabled={cotacaoLoading}
            >
              <RefreshCw className={`h-3 w-3 ${cotacaoLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Principais</span>
            <div className="grid grid-cols-3 gap-3">
              {primaryCurrencies.map(renderFullCurrencyCard)}
            </div>
          </div>

          {secondaryCurrencies.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Secundárias</span>
              <div className="grid grid-cols-4 gap-2">
                {secondaryCurrencies.map(renderFullCurrencyCard)}
              </div>
            </div>
          )}

          <div className="text-[10px] text-muted-foreground bg-muted/20 p-2 rounded border border-border/30 space-y-1">
            <p><strong>Hierarquia:</strong> FastForex → PTAX (USD/EUR/GBP) → Trabalho</p>
            <p><strong>Delta (Δ):</strong> &lt;1% Alinhado • 1-3% Atenção • ≥3% Defasagem</p>
          </div>
        </div>
      </CotacoesOverlay>
    </>
  );
}
