/**
 * FonteEntradaSelector - Filter-style buttons for bet source tracking
 * Only shown when estrategia = VALUEBET
 */
import { useState } from "react";
import { useWorkspaceBetSources } from "@/hooks/useWorkspaceBetSources";
import { Plus, Check, X } from "lucide-react";
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

const SOURCE_COLORS: Record<string, { active: string; idle: string }> = {
  OddsNotifier: {
    active: "bg-blue-500/15 border-blue-500/40 text-blue-400 shadow-[0_0_8px_-2px_rgba(59,130,246,0.2)]",
    idle: "text-blue-400/60 hover:bg-blue-500/8 hover:border-blue-500/25",
  },
  RebelBetting: {
    active: "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-[0_0_8px_-2px_rgba(16,185,129,0.2)]",
    idle: "text-emerald-400/60 hover:bg-emerald-500/8 hover:border-emerald-500/25",
  },
};

const DEFAULT_COLORS = {
  active: "bg-primary/15 border-primary/40 text-primary shadow-[0_0_8px_-2px_hsl(var(--primary)/0.2)]",
  idle: "text-muted-foreground hover:bg-muted/60 hover:border-border",
};

function getColors(name: string) {
  return SOURCE_COLORS[name] || DEFAULT_COLORS;
}

export function FonteEntradaSelector({
  workspaceId,
  value,
  onChange,
  className,
}: FonteEntradaSelectorProps) {
  const { sources, addSource } = useWorkspaceBetSources(workspaceId);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (sources.includes(trimmed)) {
      toast.error("Fonte já existe");
      return;
    }
    try {
      await addSource.mutateAsync(trimmed);
      onChange(trimmed);
      setNewName("");
      setAdding(false);
    } catch {
      toast.error("Erro ao adicionar fonte");
    }
  };

  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">
        Fonte da Entrada
      </Label>
      <div className="flex items-center gap-1.5 flex-wrap">
        {sources.map((source) => {
          const isActive = value === source;
          const colors = getColors(source);
          return (
            <button
              key={source}
              type="button"
              onClick={() => onChange(isActive ? null : source)}
              className={cn(
                "px-2.5 py-1 rounded-[5px] text-[11px] font-medium border backdrop-blur-sm transition-all duration-200",
                "cursor-pointer select-none",
                isActive
                  ? colors.active
                  : cn("bg-muted/30 border-border/40", colors.idle)
              )}
            >
              {source}
            </button>
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
              placeholder="Nova fonte..."
              className="h-6 w-[120px] text-[11px] px-2 py-0 rounded-[5px]"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={handleAdd}
              disabled={!newName.trim() || addSource.isPending}
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => { setAdding(false); setNewName(""); }}
            >
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
