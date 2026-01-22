import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SimplePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
  onFirstPage?: () => void;
  onLastPage?: () => void;
  className?: string;
  showItemCount?: boolean;
  compact?: boolean;
}

export function SimplePagination({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  hasNextPage,
  hasPrevPage,
  onNextPage,
  onPrevPage,
  onFirstPage,
  onLastPage,
  className,
  showItemCount = true,
  compact = false,
}: SimplePaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      {/* Item count info */}
      {showItemCount && (
        <div className="text-sm text-muted-foreground">
          {compact ? (
            <span>{startIndex + 1}-{endIndex} de {totalItems}</span>
          ) : (
            <span>
              Exibindo <span className="font-medium">{startIndex + 1}</span> a{" "}
              <span className="font-medium">{endIndex}</span> de{" "}
              <span className="font-medium">{totalItems}</span> registros
            </span>
          )}
        </div>
      )}
      
      {/* Navigation controls */}
      <div className="flex items-center gap-1">
        {/* First page button */}
        {onFirstPage && !compact && (
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onFirstPage}
            disabled={!hasPrevPage}
          >
            <ChevronsLeft className="h-4 w-4" />
            <span className="sr-only">Primeira página</span>
          </Button>
        )}
        
        {/* Previous page button */}
        <Button
          variant="outline"
          size={compact ? "icon" : "sm"}
          className={compact ? "h-8 w-8" : "h-8 gap-1"}
          onClick={onPrevPage}
          disabled={!hasPrevPage}
        >
          <ChevronLeft className="h-4 w-4" />
          {!compact && <span>Anterior</span>}
          {compact && <span className="sr-only">Anterior</span>}
        </Button>
        
        {/* Page indicator */}
        <div className="flex items-center gap-1 px-2 text-sm">
          <span className="font-medium">{currentPage}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">{totalPages}</span>
        </div>
        
        {/* Next page button */}
        <Button
          variant="outline"
          size={compact ? "icon" : "sm"}
          className={compact ? "h-8 w-8" : "h-8 gap-1"}
          onClick={onNextPage}
          disabled={!hasNextPage}
        >
          {!compact && <span>Próxima</span>}
          {compact && <span className="sr-only">Próxima</span>}
          <ChevronRight className="h-4 w-4" />
        </Button>
        
        {/* Last page button */}
        {onLastPage && !compact && (
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onLastPage}
            disabled={!hasNextPage}
          >
            <ChevronsRight className="h-4 w-4" />
            <span className="sr-only">Última página</span>
          </Button>
        )}
      </div>
    </div>
  );
}
