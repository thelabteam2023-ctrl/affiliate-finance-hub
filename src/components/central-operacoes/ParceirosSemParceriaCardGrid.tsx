/**
 * ParceirosSemParceriaCardGrid — Grid de cards para parceiros sem origem
 */

import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFirstLastName } from "@/lib/utils";
import type { ParceiroSemParceria } from "@/hooks/useCentralOperacoesData";

interface ParceirosSemParceriaCardGridProps {
  parceiros: ParceiroSemParceria[];
  onDefinirOrigem: (parceiro: ParceiroSemParceria) => void;
}

export function ParceirosSemParceriaCardGrid({ parceiros, onDefinirOrigem }: ParceirosSemParceriaCardGridProps) {
  if (parceiros.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Nenhum parceiro sem origem.</p>;
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
      {parceiros.map((parceiro) => (
        <div
          key={parceiro.id}
          className={cn(
            "group rounded-xl border p-3 transition-all duration-200",
            "bg-card/80 border-border/50",
            "hover:border-border hover:shadow-sm"
          )}
        >
          {/* Row 1: Icon + Name */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <UserPlus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-bold text-foreground truncate uppercase tracking-wide">
                {getFirstLastName(parceiro.nome)}
              </span>
            </div>
          </div>

          {/* Row 2: Ação */}
          <div className="flex items-center justify-end mt-2">
            <Button size="sm" variant="outline" onClick={() => onDefinirOrigem(parceiro)} className="h-6 text-[10px] px-2.5 shrink-0 font-semibold">
              Definir Origem
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
