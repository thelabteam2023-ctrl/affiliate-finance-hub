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
  AlertTriangle,
  Info,
  ArrowUpDown,
} from "lucide-react";
import { useCotacoes } from "@/hooks/useCotacoes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DeltaCambialCardProps {
  projetoId: string;
  cotacaoTrabalho: number | null;
  onCotacaoUpdated?: () => void;
}

export function DeltaCambialCard({
  projetoId,
  cotacaoTrabalho,
  onCotacaoUpdated,
}: DeltaCambialCardProps) {
  const { cotacaoUSD, loading: cotacaoLoading, refreshAll, source } = useCotacoes();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const cotacaoTrabalhoValue = cotacaoTrabalho ?? 5.30;

  // Calcular delta cambial
  const delta = useMemo(() => {
    if (!cotacaoUSD || !cotacaoTrabalhoValue) return 0;
    return ((cotacaoUSD - cotacaoTrabalhoValue) / cotacaoTrabalhoValue) * 100;
  }, [cotacaoUSD, cotacaoTrabalhoValue]);

  const deltaAbs = Math.abs(delta);

  // Classificação do delta
  const getDeltaClassification = () => {
    if (deltaAbs < 1) {
      return {
        level: "neutral",
        color: "text-muted-foreground",
        bgColor: "bg-muted/50",
        borderColor: "border-border",
        icon: Minus,
        label: "Alinhado",
        description: "Cotação de trabalho alinhada ao mercado. Não há necessidade de ajuste.",
      };
    }
    if (deltaAbs < 3) {
      return {
        level: "attention",
        color: "text-yellow-400",
        bgColor: "bg-yellow-500/10",
        borderColor: "border-yellow-500/30",
        icon: AlertTriangle,
        label: "Atenção",
        description: "O mercado já se afastou da cotação usada nas apostas. Avalie atualizar se estiver iniciando novas operações.",
      };
    }
    return {
      level: "alert",
      color: "text-red-400",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/30",
      icon: AlertTriangle,
      label: "Defasagem",
      description: "Cotação de trabalho defasada. Pode distorcer cálculo de stakes e extração. Recomendado atualizar antes de novas apostas.",
    };
  };

  const classification = getDeltaClassification();
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;

  const handleStartEdit = () => {
    setEditValue(cotacaoTrabalhoValue.toFixed(2));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditValue("");
  };

  const handleSaveEdit = async () => {
    const newValue = parseFloat(editValue.replace(",", "."));
    if (isNaN(newValue) || newValue <= 0) {
      toast.error("Cotação inválida");
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from("projetos")
        .update({ cotacao_trabalho: newValue })
        .eq("id", projetoId);

      if (error) throw error;

      toast.success("Cotação de trabalho atualizada");
      setIsEditing(false);
      onCotacaoUpdated?.();
    } catch (error: any) {
      toast.error("Erro ao atualizar cotação: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUseCurrent = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from("projetos")
        .update({ cotacao_trabalho: cotacaoUSD })
        .eq("id", projetoId);

      if (error) throw error;

      toast.success("Cotação de trabalho atualizada para valor atual");
      onCotacaoUpdated?.();
    } catch (error: any) {
      toast.error("Erro ao atualizar cotação: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={`${classification.bgColor} ${classification.borderColor} border`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <ArrowUpDown className="h-4 w-4" />
          Delta Cambial
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full">
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="start">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <HelpCircle className="h-4 w-4 text-primary" />
                        <h4 className="font-semibold">Como usar esse alerta?</h4>
                      </div>
                      
                      <div className="space-y-3 text-sm">
                        <div className="flex gap-2 p-2 rounded bg-muted/50">
                          <span className="text-blue-400 font-medium">🔵</span>
                          <div>
                            <p className="font-medium text-muted-foreground">Delta próximo de 0%</p>
                            <p className="text-xs text-muted-foreground">
                              Cotação de trabalho alinhada ao mercado. ✔ Não há necessidade de ajuste.
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex gap-2 p-2 rounded bg-yellow-500/10">
                          <span className="text-yellow-400 font-medium">🟡</span>
                          <div>
                            <p className="font-medium text-yellow-400">Delta moderado (1% a 3%)</p>
                            <p className="text-xs text-muted-foreground">
                              O mercado já se afastou da cotação usada nas apostas. ⚠ Avalie atualizar se estiver iniciando novas operações.
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex gap-2 p-2 rounded bg-red-500/10">
                          <span className="text-red-400 font-medium">🔴</span>
                          <div>
                            <p className="font-medium text-red-400">Delta alto (≥ 3%)</p>
                            <p className="text-xs text-muted-foreground">
                              Cotação de trabalho defasada. ❗ Pode distorcer cálculo de stakes e extração. 👉 Recomendado atualizar antes de novas apostas.
                            </p>
                          </div>
                        </div>
                        
                        <div className="pt-2 border-t border-border/50">
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Info className="h-3 w-3" />
                            <strong>Importante:</strong> Atualizar a cotação não afeta apostas já criadas. Apenas novas apostas utilizarão o novo valor.
                          </p>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </TooltipTrigger>
              <TooltipContent>
                <p>Clique para entender como usar</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => refreshAll()}
          disabled={cotacaoLoading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${cotacaoLoading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Cotação Atual */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Cotação Atual (PTAX)</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-mono font-medium">
                  {cotacaoLoading ? "..." : cotacaoUSD.toFixed(2)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Fonte: {source.usd}</p>
                <p className="text-xs text-muted-foreground">Atualização automática a cada 60s</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        {/* Cotação de Trabalho */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Cotação de Trabalho</span>
          {isEditing ? (
            <div className="flex items-center gap-1">
              <Input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-6 w-16 text-xs font-mono text-right px-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") handleCancelEdit();
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={handleSaveEdit}
                disabled={saving}
              >
                <Check className="h-3 w-3 text-emerald-400" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={handleCancelEdit}
                disabled={saving}
              >
                <X className="h-3 w-3 text-red-400" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="font-mono font-medium">
                {cotacaoTrabalhoValue.toFixed(2)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={handleStartEdit}
              >
                <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </Button>
            </div>
          )}
        </div>
        
        {/* Delta */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <span className={`text-sm font-medium ${classification.color}`}>
            Δ Cambial
          </span>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={`${classification.bgColor} ${classification.borderColor} ${classification.color} font-mono`}
            >
              <DeltaIcon className="h-3 w-3 mr-1" />
              {delta > 0 ? "+" : ""}{delta.toFixed(2)}%
            </Badge>
          </div>
        </div>

        {/* Ação rápida para atualizar */}
        {deltaAbs >= 1 && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={handleUseCurrent}
              disabled={saving || cotacaoLoading}
            >
              <RefreshCw className={`h-3 w-3 mr-1.5 ${saving ? "animate-spin" : ""}`} />
              Usar cotação atual ({cotacaoUSD.toFixed(2)})
            </Button>
          </div>
        )}
        
        {/* Indicador de status */}
        <p className="text-[10px] text-muted-foreground text-center">
          {classification.description}
        </p>
      </CardContent>
    </Card>
  );
}
