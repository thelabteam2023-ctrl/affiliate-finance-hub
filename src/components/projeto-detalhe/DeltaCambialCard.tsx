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
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import { useCotacoes, CotacaoSourceInfo } from "@/hooks/useCotacoes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

/**
 * Configuração de moedas
 * Nova hierarquia: FastForex (primário) → PTAX (fallback USD/EUR/GBP) → Trabalho
 * Todas as moedas usam FastForex como fonte primária unificada
 */
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
  const [showSecondary, setShowSecondary] = useState(false);

  // Valores de trabalho para cada moeda (fonte secundária/comparação)
  const workRates: Record<CurrencyKey, number> = {
    USD: cotacaoTrabalho ?? CURRENCY_CONFIG.USD.default,
    EUR: cotacaoTrabalhoEur ?? CURRENCY_CONFIG.EUR.default,
    GBP: cotacaoTrabalhoGbp ?? CURRENCY_CONFIG.GBP.default,
    MYR: cotacaoTrabalhoMyr ?? CURRENCY_CONFIG.MYR.default,
    MXN: cotacaoTrabalhoMxn ?? CURRENCY_CONFIG.MXN.default,
    ARS: cotacaoTrabalhoArs ?? CURRENCY_CONFIG.ARS.default,
    COP: cotacaoTrabalhoCop ?? CURRENCY_CONFIG.COP.default,
  };

  // Cotações oficiais (PTAX ou FastForex)
  const officialRates: Record<CurrencyKey, number> = {
    USD: rates.USDBRL,
    EUR: rates.EURBRL,
    GBP: rates.GBPBRL,
    MYR: rates.MYRBRL,
    MXN: rates.MXNBRL,
    ARS: rates.ARSBRL,
    COP: rates.COPBRL,
  };

  // Mapear sources para cada moeda
  const sourceMap: Record<CurrencyKey, CotacaoSourceInfo> = {
    USD: sources.usd,
    EUR: sources.eur,
    GBP: sources.gbp,
    MYR: sources.myr,
    MXN: sources.mxn,
    ARS: sources.ars,
    COP: sources.cop,
  };

  /**
   * Calcular deltas: SEMPRE compara fonte oficial vs trabalho
   * Nunca trabalho vs trabalho
   */
  const deltas = useMemo(() => {
    const result: Record<CurrencyKey, number> = {} as Record<CurrencyKey, number>;
    (Object.keys(CURRENCY_CONFIG) as CurrencyKey[]).forEach(key => {
      const official = officialRates[key];
      const work = workRates[key];
      const sourceInfo = sourceMap[key];
      
      // Só calcula delta se a fonte oficial estiver disponível
      // Se estiver em fallback, o delta é 0 (evita comparar trabalho vs trabalho)
      if (sourceInfo.isOfficial && official && work) {
        result[key] = ((official - work) / work) * 100;
      } else {
        result[key] = 0;
      }
    });
    return result;
  }, [officialRates, workRates, sourceMap]);

  // Classificação do delta
  const getDeltaClassification = (delta: number) => {
    const deltaAbs = Math.abs(delta);
    if (deltaAbs < 1) {
      return { color: "text-muted-foreground", bgColor: "bg-muted/50" };
    }
    if (deltaAbs < 3) {
      return { color: "text-primary", bgColor: "bg-primary/10" };
    }
    return { color: "text-destructive", bgColor: "bg-destructive/10" };
  };

  const handleStartEdit = (currency: CurrencyKey) => {
    setEditValue(workRates[currency].toFixed(4));
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
      await Promise.resolve(onCotacaoUpdated?.());
    } catch (error: any) {
      toast.error("Erro ao atualizar cotação: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUseOfficial = async (currency: CurrencyKey) => {
    const officialValue = officialRates[currency];
    
    try {
      setSaving(true);
      const field = CURRENCY_CONFIG[currency].field;
      const { error } = await supabase
        .from("projetos")
        .update({ [field]: officialValue })
        .eq("id", projetoId);

      if (error) throw error;

      const sourceLabel = sourceMap[currency].label;
      toast.success(`Cotação ${currency} sincronizada com ${sourceLabel}`);
      await Promise.resolve(onCotacaoUpdated?.());
    } catch (error: any) {
      toast.error("Erro ao atualizar cotação: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Separar moedas principais e secundárias
  const primaryCurrencies = (Object.keys(CURRENCY_CONFIG) as CurrencyKey[]).filter(
    key => CURRENCY_CONFIG[key].primary
  );
  const secondaryCurrencies = (Object.keys(CURRENCY_CONFIG) as CurrencyKey[]).filter(
    key => !CURRENCY_CONFIG[key].primary
  );

  const renderCurrencyCard = (key: CurrencyKey, compact = false) => {
    const config = CURRENCY_CONFIG[key];
    const official = officialRates[key];
    const work = workRates[key];
    const delta = deltas[key];
    const sourceInfo = sourceMap[key];
    const classification = getDeltaClassification(delta);
    const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
    const isEditing = editingCurrency === key;
    
    // Verificar se está usando fonte oficial ou fallback
    const isOfficialAvailable = sourceInfo?.isOfficial ?? false;
    const isFallback = sourceInfo?.isFallback ?? true;
    const isPtaxFallback = sourceInfo?.isPtaxFallback ?? false;
    
    // Valor exibido no topo: sempre a fonte oficial (ou trabalho se em fallback)
    const displayValue = isFallback ? work : official;
    
    // Determinar label da fonte
    const getSourceLabel = () => {
      if (isFallback) return 'Trabalho (fallback)';
      if (isPtaxFallback) return 'PTAX (fallback)';
      return 'FastForex';
    };
    
    // Só mostrar botão de sincronizar se:
    // 1. Fonte oficial disponível
    // 2. Delta significativo (>=1%)
    // 3. Não está editando
    const showSyncButton = isOfficialAvailable && Math.abs(delta) >= 1 && !isEditing;

    // Para moedas com valores muito pequenos (ARS, COP), mostrar mais decimais
    const decimals = displayValue < 0.1 ? 4 : 2;

    return (
      <div 
        key={key} 
        className={`flex flex-col gap-1.5 p-2 rounded-lg bg-background/50 border border-border/50 ${compact ? 'p-1.5' : ''}`}
      >
        {/* Header: Moeda + Cotação Oficial */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-center cursor-help">
                <div className={`text-muted-foreground font-medium ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
                  {config.symbol} {key}
                </div>
                <div className={`font-mono font-bold text-foreground ${compact ? 'text-sm' : 'text-base'}`}>
                  {cotacaoLoading ? "..." : displayValue.toFixed(decimals)}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[220px]">
              {isFallback ? (
                <>
                  <p className="font-medium text-amber-500 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Fonte oficial indisponível
                  </p>
                  <p className="text-muted-foreground mt-1">
                    FastForex{config.hasPtaxFallback ? ' e PTAX' : ''} não disponível.
                    Exibindo cotação de trabalho como fallback.
                  </p>
                  <p className="mt-1">Trabalho: R$ {work.toFixed(6)}</p>
                </>
              ) : isPtaxFallback ? (
                <>
                  <p className="font-medium text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Usando PTAX como fallback
                  </p>
                  <p className="text-muted-foreground mt-1">
                    FastForex indisponível. Usando PTAX do Banco Central.
                  </p>
                  <p className="mt-1">PTAX: R$ {official.toFixed(6)}</p>
                  <p className="text-muted-foreground">Trabalho: R$ {work.toFixed(6)}</p>
                  <p className="text-muted-foreground mt-1">
                    Δ = {delta > 0 ? "+" : ""}{delta.toFixed(2)}%
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-primary">{getSourceLabel()}</p>
                  <p className="mt-1">Oficial: R$ {official.toFixed(6)}</p>
                  <p className="text-muted-foreground">Trabalho: R$ {work.toFixed(6)}</p>
                  <p className="text-muted-foreground mt-1">
                    Δ = {delta > 0 ? "+" : ""}{delta.toFixed(2)}%
                  </p>
                </>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Badge: Fonte + Delta */}
        <div className="flex justify-center">
          {isFallback ? (
            <Badge 
              variant="outline" 
              className="bg-amber-500/10 text-amber-600 border-amber-500/30 font-mono text-[9px] px-1.5 py-0"
            >
              <AlertTriangle className="h-2 w-2 mr-0.5" />
              Fallback
            </Badge>
          ) : (
            <Badge 
              variant="outline" 
              className={`${classification.bgColor} ${classification.color} font-mono text-[9px] px-1 py-0`}
            >
              <DeltaIcon className="h-2 w-2 mr-0.5" />
              {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
            </Badge>
          )}
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
                  <Check className="h-2 w-2 text-primary" />
                </Button>
                <Button variant="ghost" size="icon" className="h-3 w-3 p-0" onClick={handleCancelEdit} disabled={saving}>
                  <X className="h-2 w-2 text-destructive" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1">
              <span className={`font-mono font-medium text-foreground ${compact ? 'text-xs' : 'text-sm'}`}>
                {work.toFixed(decimals)}
              </span>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-4 w-4 p-0" 
                onClick={() => handleStartEdit(key)}
              >
                <Pencil className="h-2.5 w-2.5 text-muted-foreground hover:text-foreground" />
              </Button>
            </div>
          )}
        </div>

        {/* Botão Sincronizar - só aparece se fonte oficial disponível */}
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
    <Card className="border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <DollarSign className="h-4 w-4 text-primary" />
          Cotações Oficiais
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-4 w-4 rounded-full p-0">
                <HelpCircle className="h-3 w-3 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Fontes de Cotação</h4>
                <div className="text-xs space-y-2">
                  <div>
                    <p className="font-medium text-primary">Todas as moedas</p>
                    <p className="text-muted-foreground">Fonte primária: FastForex API</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">USD, EUR, GBP (fallback)</p>
                    <p className="text-muted-foreground">PTAX BCB se FastForex indisponível</p>
                  </div>
                </div>
                <div className="text-xs space-y-1 border-t pt-2">
                  <p><strong>Hierarquia de fallback:</strong></p>
                  <p className="text-muted-foreground">1. FastForex (primária)</p>
                  <p className="text-muted-foreground">2. PTAX BCB (USD/EUR/GBP)</p>
                  <p className="text-muted-foreground">3. Cotação de Trabalho</p>
                </div>
                <div className="text-xs space-y-1 border-t pt-2">
                  <p><strong>Delta (Δ):</strong> Diferença entre cotação oficial e de trabalho</p>
                  <p className="text-muted-foreground">• &lt;1%: Alinhado</p>
                  <p className="text-primary">• 1-3%: Atenção</p>
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
        {/* Grid de cotações principais */}
        <div className="grid grid-cols-3 gap-3">
          {primaryCurrencies.map((key) => renderCurrencyCard(key))}
        </div>

        {/* Moedas secundárias em collapsible */}
        <Collapsible open={showSecondary} onOpenChange={setShowSecondary}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full h-6 text-[10px] text-muted-foreground hover:text-foreground"
            >
              {showSecondary ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Ocultar moedas adicionais
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Mostrar mais moedas (MYR, MXN, ARS, COP)
                </>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="grid grid-cols-4 gap-2">
              {secondaryCurrencies.map((key) => renderCurrencyCard(key, true))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
