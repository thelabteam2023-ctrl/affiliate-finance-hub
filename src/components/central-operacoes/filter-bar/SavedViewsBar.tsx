import { useState } from "react";
import { Bookmark, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FilterState, SavedView } from "./types";

interface Props {
  views: SavedView[];
  currentState: FilterState;
  activeViewId: string | null;
  hasActiveFilters: boolean;
  onApply: (view: SavedView) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}

function statesEqual(a: FilterState, b: FilterState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function SavedViewsBar({
  views,
  currentState,
  activeViewId,
  hasActiveFilters,
  onApply,
  onSave,
  onDelete,
}: Props) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");

  if (views.length === 0 && !hasActiveFilters) return null;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName("");
    setSaveOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {views.map((view) => {
          const isActive = view.id === activeViewId && statesEqual(view.state, currentState);
          return (
            <div
              key={view.id}
              className={cn(
                "group inline-flex items-center gap-0.5 rounded-full border transition-colors",
                isActive
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-muted/30 border-border/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <button
                type="button"
                onClick={() => onApply(view)}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1 h-7 text-[11px] font-medium"
              >
                <Bookmark className={cn("h-3 w-3", isActive ? "fill-current" : "")} />
                <span className="truncate max-w-[140px]">{view.name}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-7 w-5 flex items-center justify-center opacity-60 hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => onDelete(view.id)}
                    className="text-xs gap-2 text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remover view
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground border border-dashed border-border/60 hover:border-border transition-colors"
          >
            <Plus className="h-3 w-3" />
            Salvar view
          </button>
        )}
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Salvar view atual</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Ex.: Atrasados > 30d"
            className="text-sm"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)} size="sm">
              Cancelar
            </Button>
            <Button onClick={submit} disabled={!name.trim()} size="sm">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}