import { useState, useMemo, useCallback } from "react";

export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
}

export interface UsePaginationOptions {
  initialPageSize?: number;
  initialPage?: number;
}

export interface UsePaginationReturn<T> {
  // Pagination state
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  
  // Derived data
  paginatedItems: T[];
  startIndex: number;
  endIndex: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  
  // Actions
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  goToNextPage: () => void;
  goToPrevPage: () => void;
  goToFirstPage: () => void;
  goToLastPage: () => void;
  reset: () => void;
}

/**
 * Hook para paginação client-side de arrays
 * Útil quando os dados já estão carregados mas precisam ser paginados para renderização
 */
export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions = {}
): UsePaginationReturn<T> {
  const { initialPageSize = 50, initialPage = 1 } = options;
  
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  
  // Ensure currentPage is within bounds
  const validatedPage = useMemo(() => {
    if (currentPage < 1) return 1;
    if (currentPage > totalPages) return totalPages;
    return currentPage;
  }, [currentPage, totalPages]);
  
  // Calculate indices
  const startIndex = (validatedPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  
  // Slice items for current page
  const paginatedItems = useMemo(() => {
    return items.slice(startIndex, endIndex);
  }, [items, startIndex, endIndex]);
  
  const hasNextPage = validatedPage < totalPages;
  const hasPrevPage = validatedPage > 1;
  
  const goToNextPage = useCallback(() => {
    if (hasNextPage) {
      setCurrentPage(validatedPage + 1);
    }
  }, [hasNextPage, validatedPage]);
  
  const goToPrevPage = useCallback(() => {
    if (hasPrevPage) {
      setCurrentPage(validatedPage - 1);
    }
  }, [hasPrevPage, validatedPage]);
  
  const goToFirstPage = useCallback(() => {
    setCurrentPage(1);
  }, []);
  
  const goToLastPage = useCallback(() => {
    setCurrentPage(totalPages);
  }, [totalPages]);
  
  const reset = useCallback(() => {
    setCurrentPage(initialPage);
    setPageSize(initialPageSize);
  }, [initialPage, initialPageSize]);
  
  return {
    currentPage: validatedPage,
    pageSize,
    totalPages,
    totalItems,
    paginatedItems,
    startIndex,
    endIndex,
    hasNextPage,
    hasPrevPage,
    setCurrentPage,
    setPageSize,
    goToNextPage,
    goToPrevPage,
    goToFirstPage,
    goToLastPage,
    reset,
  };
}

/**
 * Hook para paginação server-side (offset-based)
 * Retorna parâmetros para query com limit/offset
 */
export function useServerPagination(options: UsePaginationOptions = {}) {
  const { initialPageSize = 50, initialPage = 1 } = options;
  
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [totalItems, setTotalItems] = useState(0);
  
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  
  const offset = (currentPage - 1) * pageSize;
  const limit = pageSize;
  
  const hasNextPage = currentPage < totalPages;
  const hasPrevPage = currentPage > 1;
  
  const goToNextPage = useCallback(() => {
    if (hasNextPage) {
      setCurrentPage(p => p + 1);
    }
  }, [hasNextPage]);
  
  const goToPrevPage = useCallback(() => {
    if (hasPrevPage) {
      setCurrentPage(p => p - 1);
    }
  }, [hasPrevPage]);
  
  const reset = useCallback(() => {
    setCurrentPage(initialPage);
  }, [initialPage]);
  
  return {
    // Query params
    offset,
    limit,
    
    // State
    currentPage,
    pageSize,
    totalPages,
    totalItems,
    hasNextPage,
    hasPrevPage,
    
    // Actions
    setCurrentPage,
    setPageSize,
    setTotalItems,
    goToNextPage,
    goToPrevPage,
    reset,
  };
}
