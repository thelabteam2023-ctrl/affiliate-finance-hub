import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ProjectBonus } from "@/hooks/useProjectBonuses";
import { Progress } from "@/components/ui/progress";
import { Gift, Target, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface BonusRolloverSelectProps {
  bonuses: ProjectBonus[];
  selectedBonusId: string | null;
  onBonusChange: (bonusId: string | null) => void;
  bookmakerId?: string;
  currentOdd?: number;
  disabled?: boolean;
  compact?: boolean;
}

export function BonusRolloverSelect({
  bonuses,
  selectedBonusId,
  onBonusChange,
  bookmakerId,
  currentOdd,
  disabled = false,
  compact = false,
}: BonusRolloverSelectProps) {
  // Filtrar bônus elegíveis: status = credited, mesmo bookmaker
  const eligibleBonuses = useMemo(() => {
    return bonuses.filter((b) => {
      // Só bônus creditados
      if (b.status !== "credited") return false;
      // Se bookmakerId fornecido, filtrar pelo bookmaker
      if (bookmakerId && b.bookmaker_id !== bookmakerId) return false;
      // Só bônus com rollover configurado
      if (!b.rollover_target_amount || b.rollover_target_amount <= 0) return false;
      return true;
    });
  }, [bonuses, bookmakerId]);

  // Verificar se a odd atual atende o requisito de odd mínima
  const checkOddEligibility = (bonus: ProjectBonus) => {
    if (!bonus.min_odds) return true;
    if (!currentOdd) return null; // Indeterminado
    return currentOdd >= bonus.min_odds;
  };

  const selectedBonus = eligibleBonuses.find((b) => b.id === selectedBonusId);

  const formatCurrency = (value: number, currency: string) => {
    const symbols: Record<string, string> = {
      BRL: "R$",
      USD: "$",
      EUR: "€",
      GBP: "£",
    };
    const symbol = symbols[currency] || currency;
    return `${symbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (eligibleBonuses.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2", compact && "space-y-1")}>
      <div className="flex items-center gap-2">
        <Gift className="h-4 w-4 text-amber-500" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Vincular ao Rollover
        </span>
      </div>

      <Select
        value={selectedBonusId || "none"}
        onValueChange={(value) => onBonusChange(value === "none" ? null : value)}
        disabled={disabled}
      >
        <SelectTrigger className={cn("w-full", compact ? "h-8 text-xs" : "h-9 text-sm")}>
          <SelectValue placeholder="Não vincular a nenhum bônus">
            {selectedBonusId && selectedBonus ? (
              <span className="truncate">{selectedBonus.title}</span>
            ) : (
              "Não vincular a nenhum bônus"
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            <span className="text-muted-foreground">Não vincular a nenhum bônus</span>
          </SelectItem>
          {eligibleBonuses.map((bonus) => {
            const progress = bonus.rollover_target_amount
              ? Math.min(100, ((bonus.rollover_progress || 0) / bonus.rollover_target_amount) * 100)
              : 0;
            const isOddEligible = checkOddEligibility(bonus);

            return (
              <SelectItem key={bonus.id} value={bonus.id}>
                <div className="flex flex-col gap-1 py-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{bonus.title}</span>
                    <Badge variant="outline" className="text-[9px] px-1">
                      {bonus.rollover_multiplier}x
                    </Badge>
                    {bonus.min_odds && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] px-1",
                          isOddEligible === false && "bg-red-500/10 text-red-400 border-red-500/20",
                          isOddEligible === true && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        )}
                      >
                        Odd ≥ {bonus.min_odds}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Progress value={progress} className="h-1 flex-1 max-w-[100px]" />
                    <span>{progress.toFixed(0)}%</span>
                    <span>
                      ({formatCurrency(bonus.rollover_progress || 0, bonus.currency)} /{" "}
                      {formatCurrency(bonus.rollover_target_amount || 0, bonus.currency)})
                    </span>
                  </div>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {/* Aviso se odd não atende requisito */}
      {selectedBonus && selectedBonus.min_odds && currentOdd && currentOdd < selectedBonus.min_odds && (
        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Odd atual ({currentOdd}) é menor que a odd mínima ({selectedBonus.min_odds}). 
            Esta aposta <strong>não será contabilizada</strong> no rollover.
          </span>
        </div>
      )}

      {/* Info sobre o bônus selecionado */}
      {selectedBonus && (
        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
          <Target className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Rollover será atualizado automaticamente ao salvar. 
            {selectedBonus.min_odds && ` Odd mínima: ${selectedBonus.min_odds}.`}
          </span>
        </div>
      )}
    </div>
  );
}
