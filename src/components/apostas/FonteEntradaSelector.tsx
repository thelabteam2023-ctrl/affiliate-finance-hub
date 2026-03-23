/**
 * FonteEntradaSelector - Pill-style selector for bet source tracking
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
        {sources.map((source) => (
          <button
            key={source}
            type="button"
            onClick={() => onChange(value === source ? null : source)}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-150",
              "hover:shadow-sm cursor-pointer",
              value === source
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-muted/50 text-muted-foreground border-border/50 hover:border-border hover:bg-muted"
            )}
          >
            {source}
          </button>
        ))}

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
              className="h-6 w-[120px] text-[11px] px-2 py-0"
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
            className="px-2 py-1 rounded-full text-[11px] font-medium border border-dashed border-border/60 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          >
            <Plus className="h-3 w-3 inline mr-0.5" />
          </button>
        )}
      </div>
    </div>
  );
}
