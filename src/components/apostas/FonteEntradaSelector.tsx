/**
 * FonteEntradaSelector - Dynamic source tracking with per-workspace custom sources
 * No pre-defined sources. Each workspace manages its own.
 */
import { useState } from "react";
import { useWorkspaceBetSources, type BetSource } from "@/hooks/useWorkspaceBetSources";
import { Plus, Check, X, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FonteEntradaSelectorProps {
  workspaceId: string | null;
  value: string | null;
  onChange: (value: string | null) => void;
  className?: string;
}

function hexFromHsl(hslStr: string): { r: number; g: number; b: number } | null {
  const match = hslStr.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!match) return null;
  const [, h, s, l] = match.map(Number);
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

function getSourceStyle(source: BetSource, isActive: boolean, hasSelection: boolean) {
  const rgb = hexFromHsl(source.color);
  // When another source is selected and this one isn't, dim it
  const isDimmed = hasSelection && !isActive;

  if (!rgb) {
    if (isActive) return "bg-primary/15 border-primary/40 text-primary";
    if (isDimmed) return "bg-muted/20 border-border/20 text-muted-foreground/40 opacity-50";
    return "bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/50";
  }
  const { r, g, b } = rgb;
  if (isActive) {
    return {
      backgroundColor: `rgba(${r},${g},${b},0.15)`,
      borderColor: `rgba(${r},${g},${b},0.45)`,
      color: `rgb(${r},${g},${b})`,
      boxShadow: `0 0 8px -2px rgba(${r},${g},${b},0.25)`,
    };
  }
  if (isDimmed) {
    return {
      backgroundColor: `rgba(${r},${g},${b},0.03)`,
      borderColor: `rgba(${r},${g},${b},0.08)`,
      color: `rgba(${r},${g},${b},0.35)`,
      opacity: '0.6',
    };
  }
  return {
    backgroundColor: `rgba(${r},${g},${b},0.06)`,
    borderColor: `rgba(${r},${g},${b},0.15)`,
    color: `rgba(${r},${g},${b},0.7)`,
  };
}

export function FonteEntradaSelector({
  workspaceId,
  value,
  onChange,
  className,
}: FonteEntradaSelectorProps) {
  const { sources, addSource, toggleFavorite } = useWorkspaceBetSources(workspaceId);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (sources.some(s => s.name === trimmed)) {
      toast.error("Fonte já existe");
      return;
    }
    try {
      const isFirst = sources.length === 0;
      await addSource.mutateAsync({ name: trimmed, makeFavorite: isFirst });
      onChange(trimmed);
      setNewName("");
      setAdding(false);
    } catch {
      toast.error("Erro ao adicionar fonte");
    }
  };

  // Empty state
  if (sources.length === 0 && !adding) {
    return (
      <div className={cn("space-y-1", className)}>
        <Label className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">
          Fonte da Entrada
        </Label>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[5px] text-[11px] border border-dashed border-border/50 text-muted-foreground/70 hover:border-border hover:text-muted-foreground hover:bg-muted/30 transition-all duration-200"
        >
          <Plus className="h-3 w-3" />
          Adicionar fonte
        </button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">
        Fonte da Entrada
      </Label>
      <div className="flex items-center gap-1.5 flex-wrap">
        {sources.map((source) => {
          const isActive = value === source.name;
          const style = getSourceStyle(source, isActive, value !== null);
          const isStyleObj = typeof style === "object";

          return (
            <div key={source.id} className="relative group">
              <button
                type="button"
                onClick={() => onChange(isActive ? null : source.name)}
                onDoubleClick={(e) => { e.preventDefault(); toggleFavorite.mutate(source.id); }}
                style={isStyleObj ? style as React.CSSProperties : undefined}
                className={cn(
                  "px-2.5 py-1 rounded-[5px] text-[11px] font-medium border backdrop-blur-sm transition-all duration-200 cursor-pointer select-none",
                  !isStyleObj && style,
                  isActive && "ring-1 ring-current/20"
                )}
                title="Clique para selecionar · Duplo-clique para favoritar"
              >
                <span className="flex items-center gap-1">
                  {source.is_favorite && <Star className="h-2.5 w-2.5 fill-current" />}
                  {source.name}
                </span>
              </button>
              {/* Favorite toggle on hover - larger hit area */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleFavorite.mutate(source.id); }}
                className={cn(
                  "absolute -top-2 -right-2 h-5 w-5 rounded-full border flex items-center justify-center transition-all z-10",
                  source.is_favorite
                    ? "opacity-100 bg-background border-border shadow-sm"
                    : "opacity-0 group-hover:opacity-100 bg-background border-border/50 hover:bg-muted"
                )}
                title={source.is_favorite ? "Remover favorita" : "Definir como padrão"}
              >
                <Star className={cn("h-3 w-3", source.is_favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
              </button>
            </div>
          );
        })}

        {adding ? (
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
                if (e.key === "Escape") { setAdding(false); setNewName(""); }
              }}
              placeholder="Nome da fonte..."
              className="h-6 w-[130px] text-[11px] px-2 py-0 rounded-[5px]"
            />
            <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={handleAdd} disabled={!newName.trim() || addSource.isPending}>
              <Check className="h-3 w-3" />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setAdding(false); setNewName(""); }}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="px-1.5 py-1 rounded-[5px] text-[11px] border border-dashed border-border/40 text-muted-foreground/60 hover:border-border hover:text-muted-foreground hover:bg-muted/30 transition-all duration-200 backdrop-blur-sm"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
