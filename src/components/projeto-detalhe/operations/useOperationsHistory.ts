import { useState, useCallback } from "react";
import type { HistorySubTab } from "./OperationsSubTabHeader";

const VIEW_MODE_STORAGE_KEY_PREFIX = "operations-view-mode-";

export interface UseOperationsHistoryOptions {
  /** Chave de storage para persistir preferências */
  storageKey: string;
  
  /** Sub-tab inicial */
  initialSubTab?: HistorySubTab;
  
  /** Modo de visualização inicial */
  initialViewMode?: "cards" | "list";
}

export interface UseOperationsHistoryReturn {
  /** Sub-tab atual (abertas/historico) */
  subTab: HistorySubTab;
  
  /** Função para mudar sub-tab */
  setSubTab: (tab: HistorySubTab) => void;
  
  /** Modo de visualização atual */
  viewMode: "cards" | "list";
  
  /** Função para mudar modo de visualização */
  setViewMode: (mode: "cards" | "list") => void;
}

/**
 * Hook para gerenciar estado do módulo Abertas/Histórico
 * 
 * Centraliza a lógica de estado e persistência de preferências
 * para o padrão de navegação entre operações abertas e histórico.
 */
export function useOperationsHistory({
  storageKey,
  initialSubTab = "abertas",
  initialViewMode = "list",
}: UseOperationsHistoryOptions): UseOperationsHistoryReturn {
  // Sub-tab state
  const [subTab, setSubTab] = useState<HistorySubTab>(initialSubTab);
  
  // View mode state with localStorage persistence
  const [viewMode, setViewModeState] = useState<"cards" | "list">(() => {
    if (typeof window === "undefined") return initialViewMode;
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY_PREFIX + storageKey);
    return (saved === "cards" || saved === "list") ? saved : initialViewMode;
  });

  const setViewMode = useCallback((mode: "cards" | "list") => {
    setViewModeState(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY_PREFIX + storageKey, mode);
    }
  }, [storageKey]);

  return {
    subTab,
    setSubTab,
    viewMode,
    setViewMode,
  };
}
