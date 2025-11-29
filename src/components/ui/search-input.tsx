import * as React from "react";
import { Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  onAdd?: () => void;
  addButtonLabel?: string;
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, onAdd, addButtonLabel = "Adicionar", ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
        <input
          type="text"
          className={cn(
            "flex h-11 w-full rounded-lg border border-border bg-background/50 pl-10 pr-12 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
            className
          )}
          ref={ref}
          {...props}
        />
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            aria-label={addButtonLabel}
            className="absolute right-1 h-9 w-9 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }
);
SearchInput.displayName = "SearchInput";

export { SearchInput };
