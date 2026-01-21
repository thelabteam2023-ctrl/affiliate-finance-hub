import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
} from "lucide-react";
import { useCotacoes } from "@/hooks/useCotacoes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DeltaCambialCardProps {
  projetoId: string;
  cotacaoTrabalho: number | null;
  cotacaoTrabalhoEur?: number | null;
  cotacaoTrabalhoGbp?: number | null;
  onCotacaoUpdated?: () => void;
}

// Configuração de moedas
const CURRENCY_CONFIG = {
  USD: { symbol: "$", label: "Dólar", field: "cotacao_trabalho", default: 5.30 },
  EUR: { symbol: "€", label: "Euro", field: "cotacao_trabalho_eur", default: 6.10 },
  GBP: { symbol: "£", label: "Libra", field: "cotacao_trabalho_gbp", default: 7.10 },
} as const;

type CurrencyKey = keyof typeof CURRENCY_CONFIG;

export function DeltaCambialCard({
  projetoId,
  cotacaoTrabalho,
  cotacaoTrabalhoEur,
  cotacaoTrabalhoGbp,
  onCotacaoUpdated,
}: DeltaCambialCardProps) {
  const { rates, loading: cotacaoLoading, refreshAll, source } = useCotacoes();
  const [editingCurrency, setEditingCurrency] = useState<CurrencyKey | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Valores de trabalho para cada moeda
  const workRates: Record<CurrencyKey, number> = {
    USD: cotacaoTrabalho ?? CURRENCY_CONFIG.USD.default,
    EUR: cotacaoTrabalhoEur ?? CURRENCY_CONFIG.EUR.default,
    GBP: cotacaoTrabalhoGbp ?? CURRENCY_CONFIG.GBP.default,
  };

  // Calcular deltas
  const deltas = useMemo(() => {
    return {
      USD: rates.USDBRL && workRates.USD ? ((rates.USDBRL - workRates.USD) / workRates.USD) * 100 : 0,
      EUR: rates.EURBRL && workRates.EUR ? ((rates.EURBRL - workRates.EUR) / workRates.EUR) * 100 : 0,
      GBP: rates.GBPBRL && workRates.GBP ? ((rates.GBPBRL - workRates.GBP) / workRates.GBP) * 100 : 0,
    };
  }, [rates, workRates]);

  // Classificação do delta
  const getDeltaClassification = (delta: number) => {
    const deltaAbs = Math.abs(delta);
    if (deltaAbs < 1) {
      return { color: "text-muted-foreground", bgColor: "bg-muted/50" };
    }
    if (deltaAbs < 3) {
      return { color: "text-yellow-400", bgColor: "bg-yellow-500/10" };
    }
    return { color: "text-destructive", bgColor: "bg-destructive/10" };
  };

  const handleStartEdit = (currency: CurrencyKey) => {
    setEditValue(workRates[currency].toFixed(2));
    setEditingCurrency(currency);
  };

  const handleCancelEdit = () => {
    setEditingCurrency(null);
    setEditValue("");
  };

  const handleSaveEdit = async () => {
    if (!editingCurrency) return;
    
    const newValue = parseFloat(editValue.replace(",", "."));
    if (isNaN(newValue) || newValue <= 0) {
      toast.error("Cotação inválida");
      return;
    }

    try {
      setSaving(true);
      const field = CURRENCY_CONFIG[editingCurrency].field;
      const { error } = await supabase
        .from("projetos")
        .update({ [field]: newValue })
        .eq("id", projetoId);

      if (error) throw error;

      toast.success(`Cotação de trabalho ${editingCurrency} atualizada`);
      setEditingCurrency(null);
      onCotacaoUpdated?.();
    } catch (error: any) {
      toast.error("Erro ao atualizar cotação: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUsePtax = async (currency: CurrencyKey) => {
    const ptaxValue = currency === "USD" ? rates.USDBRL : currency === "EUR" ? rates.EURBRL : rates.GBPBRL;
    
    try {
      setSaving(true);
      const field = CURRENCY_CONFIG[currency].field;
      const { error } = await supabase
        .from("projetos")
        .update({ [field]: ptaxValue })
        .eq("id", projetoId);

      if (error) throw error;

      toast.success(`Cotação ${currency} sincronizada com PTAX`);
      onCotacaoUpdated?.();
    } catch (error: any) {
      toast.error("Erro ao atualizar cotação: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Dados para renderização
  const ratesData: Array<{
    key: CurrencyKey;
    ptax: number;
    work: number;
    delta: number;
    sourceInfo: string;
  }> = [
    { key: "USD", ptax: rates.USDBRL, work: workRates.USD, delta: deltas.USD, sourceInfo: source.usd },
    { key: "EUR", ptax: rates.EURBRL, work: workRates.EUR, delta: deltas.EUR, sourceInfo: source.eur },
    { key: "GBP", ptax: rates.GBPBRL, work: workRates.GBP, delta: deltas.GBP, sourceInfo: source.gbp },
  ];

  return (
    <Card className="border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <DollarSign className="h-4 w-4 text-primary" />
          Cotações PTAX
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-4 w-4 rounded-full p-0">
                <HelpCircle className="h-3 w-3 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Cotações do Banco Central</h4>
                <p className="text-xs text-muted-foreground">
                  As cotações PTAX são obtidas em tempo real do BCB e atualizadas automaticamente.
                </p>
                <div className="text-xs space-y-1 border-t pt-2">
                  <p><strong>Delta (Δ):</strong> Diferença entre PTAX e cotação de trabalho</p>
                  <p className="text-muted-foreground">• &lt;1%: Alinhado</p>
                  <p className="text-yellow-400">• 1-3%: Atenção</p>
                  <p className="text-destructive">• ≥3%: Defasagem</p>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={() => refreshAll()}
          disabled={cotacaoLoading}
        >
          <RefreshCw className={`h-3 w-3 ${cotacaoLoading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Grid de cotações - vertical para cada moeda */}
        <div className="grid grid-cols-3 gap-3">
          {ratesData.map((rate) => {
            const config = CURRENCY_CONFIG[rate.key];
            const classification = getDeltaClassification(rate.delta);
            const DeltaIcon = rate.delta > 0 ? TrendingUp : rate.delta < 0 ? TrendingDown : Minus;
            const isEditing = editingCurrency === rate.key;
            const showSyncButton = Math.abs(rate.delta) >= 1 && !isEditing;

            return (
              <div 
                key={rate.key} 
                className="flex flex-col gap-1.5 p-2 rounded-lg bg-background/50 border border-border/50"
              >
                {/* Header: Moeda + PTAX */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-center cursor-help">
                        <div className="text-[10px] text-muted-foreground font-medium">
                          {config.symbol} {rate.key}
                        </div>
                        <div className="text-base font-mono font-bold text-foreground">
                          {cotacaoLoading ? "..." : rate.ptax.toFixed(2)}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p>PTAX: R$ {rate.ptax.toFixed(4)}</p>
                      <p className="text-muted-foreground">Fonte: {rate.sourceInfo}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Delta Badge */}
                <div className="flex justify-center">
                  <Badge 
                    variant="outline" 
                    className={`${classification.bgColor} ${classification.color} font-mono text-[9px] px-1 py-0`}
                  >
                    <DeltaIcon className="h-2 w-2 mr-0.5" />
                    {rate.delta > 0 ? "+" : ""}{rate.delta.toFixed(1)}%
                  </Badge>
                </div>

                {/* Cotação de Trabalho - Editável */}
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
                          <Check className="h-2 w-2 text-emerald-400" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-3 w-3 p-0" onClick={handleCancelEdit} disabled={saving}>
                          <X className="h-2 w-2 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-sm font-mono font-medium text-foreground">
                        {rate.work.toFixed(2)}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-4 w-4 p-0" 
                        onClick={() => handleStartEdit(rate.key)}
                      >
                        <Pencil className="h-2.5 w-2.5 text-muted-foreground hover:text-foreground" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Botão Sincronizar */}
                {showSyncButton && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[9px] text-muted-foreground hover:text-foreground px-1"
                    onClick={() => handleUsePtax(rate.key)}
                    disabled={saving || cotacaoLoading}
                  >
                    <RefreshCw className={`h-2 w-2 mr-0.5 ${saving ? "animate-spin" : ""}`} />
                    Usar PTAX
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
