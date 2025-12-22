import { useState, useEffect, useCallback } from 'react';

export type FreebetViewMode = 'card' | 'list';
export type FreebetSubTab = 'ativas' | 'historico' | 'por-casa' | 'graficos';

interface FreebetViewPreferences {
  viewMode: FreebetViewMode;
  compactMode: boolean;
  subTab: FreebetSubTab;
}

const STORAGE_KEY = 'freebet-view-preferences';

const defaultPreferences: FreebetViewPreferences = {
  viewMode: 'card',
  compactMode: false,
  subTab: 'ativas',
};

export function useFreebetViewPreferences() {
  const [preferences, setPreferences] = useState<FreebetViewPreferences>(() => {
    if (typeof window === 'undefined') return defaultPreferences;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...defaultPreferences, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('Error loading freebet preferences:', e);
    }
    return defaultPreferences;
  });

  // Persist to localStorage whenever preferences change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (e) {
      console.error('Error saving freebet preferences:', e);
    }
  }, [preferences]);

  const setViewMode = useCallback((viewMode: FreebetViewMode) => {
    setPreferences(prev => ({ ...prev, viewMode }));
  }, []);

  const setCompactMode = useCallback((compactMode: boolean) => {
    setPreferences(prev => ({ ...prev, compactMode }));
  }, []);

  const setSubTab = useCallback((subTab: FreebetSubTab) => {
    setPreferences(prev => ({ ...prev, subTab }));
  }, []);

  const toggleCompactMode = useCallback(() => {
    setPreferences(prev => ({ ...prev, compactMode: !prev.compactMode }));
  }, []);

  return {
    ...preferences,
    setViewMode,
    setCompactMode,
    setSubTab,
    toggleCompactMode,
  };
}
