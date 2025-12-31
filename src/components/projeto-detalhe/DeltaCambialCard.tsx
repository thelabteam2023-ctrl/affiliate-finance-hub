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
          Δ Cambial
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-4 w-4 rounded-full p-0">
                <HelpCircle className="h-3 w-3 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="start">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold text-sm">Como usar?</h4>
                </div>
                
                <div className="space-y-2 text-xs">
                  <div className="flex gap-2 p-1.5 rounded bg-muted/50">
                    <span className="text-blue-400">🔵</span>
                    <div>
                      <p className="font-medium text-muted-foreground">Δ &lt; 1%</p>
                      <p className="text-muted-foreground">Alinhado, sem ajuste necessário</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 p-1.5 rounded bg-yellow-500/10">
                    <span className="text-yellow-400">🟡</span>
                    <div>
                      <p className="font-medium text-yellow-400">1% a 3%</p>
                      <p className="text-muted-foreground">Avalie atualizar</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 p-1.5 rounded bg-red-500/10">
                    <span className="text-red-400">🔴</span>
                    <div>
                      <p className="font-medium text-red-400">≥ 3%</p>
                      <p className="text-muted-foreground">Recomendado atualizar</p>
                    </div>
                  </div>
                  
                  <p className="text-muted-foreground flex items-center gap-1 pt-1 border-t border-border/50">
                    <Info className="h-3 w-3" />
                    Atualizar não afeta apostas existentes
                  </p>
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
      <CardContent className="space-y-1 pt-0">
        {/* Delta Badge - Destaque principal */}
        <div className="flex items-center justify-between">
          <Badge 
            variant="outline" 
            className={`${classification.bgColor} ${classification.borderColor} ${classification.color} font-mono text-sm px-2 py-0.5`}
          >
            <DeltaIcon className="h-3 w-3 mr-1" />
            {delta > 0 ? "+" : ""}{delta.toFixed(2)}%
          </Badge>
          <span className={`text-[10px] ${classification.color}`}>{classification.label}</span>
        </div>
        
        {/* Cotações lado a lado */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>PTAX: <span className="font-mono text-foreground">{cotacaoLoading ? "..." : cotacaoUSD.toFixed(2)}</span></span>
          <span className="flex items-center gap-0.5">
            Trab: <span className="font-mono text-foreground">{cotacaoTrabalhoValue.toFixed(2)}</span>
            {isEditing ? (
              <div className="flex items-center gap-0.5 ml-1">
                <Input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="h-5 w-12 text-[10px] font-mono text-right px-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit();
                    if (e.key === "Escape") handleCancelEdit();
                  }}
                />
                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={handleSaveEdit} disabled={saving}>
                  <Check className="h-2.5 w-2.5 text-emerald-400" />
                </Button>
                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={handleCancelEdit} disabled={saving}>
                  <X className="h-2.5 w-2.5 text-red-400" />
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="icon" className="h-4 w-4" onClick={handleStartEdit}>
                <Pencil className="h-2.5 w-2.5 text-muted-foreground hover:text-foreground" />
              </Button>
            )}
          </span>
        </div>

        {/* Ação rápida - compacta */}
        {deltaAbs >= 1 && !isEditing && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-6 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={handleUseCurrent}
            disabled={saving || cotacaoLoading}
          >
            <RefreshCw className={`h-2.5 w-2.5 mr-1 ${saving ? "animate-spin" : ""}`} />
            Usar {cotacaoUSD.toFixed(2)}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
