import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Pencil, AlertTriangle, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProjectBonus } from "@/hooks/useProjectBonuses";
import { format, differenceInDays, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RolloverProgressProps {
  bonus: ProjectBonus;
  onUpdateProgress?: (id: string, progress: number) => Promise<boolean>;
  compact?: boolean;
}

export function RolloverProgress({ bonus, onUpdateProgress, compact = false }: RolloverProgressProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const target = bonus.rollover_target_amount || 0;
  const progress = bonus.rollover_progress || 0;
  const percentage = target > 0 ? Math.min(100, (progress / target) * 100) : 0;
  const isComplete = percentage >= 100;

  // Check expiration
  const expiresAt = bonus.expires_at ? new Date(bonus.expires_at) : null;
  const isExpired = expiresAt ? isPast(expiresAt) : false;
  const daysRemaining = expiresAt ? differenceInDays(expiresAt, new Date()) : null;
  const isNearExpiry = daysRemaining !== null && daysRemaining <= 5 && daysRemaining > 0;

  const handleSaveProgress = async () => {
    if (!onUpdateProgress) return;
    const value = parseFloat(editValue);
    if (isNaN(value) || value < 0) return;

    setSaving(true);
    const success = await onUpdateProgress(bonus.id, value);
    if (success) {
      setIsEditing(false);
    }
    setSaving(false);
  };

  // Don't show if no rollover target
  if (!target || target <= 0) {
    return null;
  }

  const formatCurrency = (value: number) => {
    const symbols: Record<string, string> = {
      BRL: "R$",
      USD: "$",
      EUR: "€",
      GBP: "£",
      USDT: "USDT",
    };
    const symbol = symbols[bonus.currency] || bonus.currency;
    return `${symbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const rolloverBaseLabel = (() => {
    switch (bonus.rollover_base) {
      case "DEPOSITO":
        return "Base: Depósito";
      case "BONUS":
        return "Base: Bônus";
      case "DEPOSITO_BONUS":
        return "Base: Dep + Bônus";
      default:
        return "";
    }
  })();

  if (compact) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Rollover: {bonus.rollover_multiplier}x
          </span>
          <span className={cn(
            "font-medium",
            isComplete && "text-emerald-500",
            isNearExpiry && !isComplete && "text-amber-500",
            isExpired && !isComplete && "text-red-500"
          )}>
            {percentage.toFixed(0)}%
          </span>
        </div>
        <Progress 
          value={percentage} 
          className={cn(
            "h-1.5",
            isComplete && "[&>div]:bg-emerald-500",
            isNearExpiry && !isComplete && "[&>div]:bg-amber-500",
            isExpired && !isComplete && "[&>div]:bg-red-500"
          )} 
        />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{formatCurrency(progress)}</span>
          <span>{formatCurrency(target)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3 rounded-lg border bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            Rollover {bonus.rollover_multiplier}x
          </span>
          {rolloverBaseLabel && (
            <Badge variant="outline" className="text-[10px]">
              {rolloverBaseLabel}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isComplete ? (
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
              <Check className="h-3 w-3 mr-1" />
              Concluído
            </Badge>
          ) : isExpired ? (
            <Badge variant="destructive">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Expirado
            </Badge>
          ) : isNearExpiry ? (
            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
              <Clock className="h-3 w-3 mr-1" />
              {daysRemaining}d restantes
            </Badge>
          ) : daysRemaining !== null ? (
            <Badge variant="outline" className="text-xs">
              {daysRemaining}d restantes
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progresso</span>
          <span className={cn(
            "font-semibold",
            isComplete && "text-emerald-500",
            isNearExpiry && !isComplete && "text-amber-500",
            isExpired && !isComplete && "text-red-500"
          )}>
            {percentage.toFixed(1)}%
          </span>
        </div>
        <Progress 
          value={percentage} 
          className={cn(
            "h-2",
            isComplete && "[&>div]:bg-emerald-500",
            isNearExpiry && !isComplete && "[&>div]:bg-amber-500",
            isExpired && !isComplete && "[&>div]:bg-red-500"
          )}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatCurrency(progress)} apostado</span>
          <span>Meta: {formatCurrency(target)}</span>
        </div>
      </div>

      {/* Edit Progress */}
      {onUpdateProgress && !isComplete && (
        <Popover open={isEditing} onOpenChange={setIsEditing}>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full mt-2"
              onClick={() => {
                setEditValue(String(progress));
                setIsEditing(true);
              }}
            >
              <Pencil className="h-3 w-3 mr-2" />
              Atualizar Volume
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="start">
            <div className="space-y-3">
              <Label className="text-xs">Volume Apostado ({bonus.currency})</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="0.00"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={handleSaveProgress}
                  disabled={saving}
                >
                  Salvar
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Min Odds if set */}
      {bonus.min_odds && (
        <div className="text-xs text-muted-foreground mt-1">
          Odd mínima: {bonus.min_odds}
        </div>
      )}
    </div>
  );
}
