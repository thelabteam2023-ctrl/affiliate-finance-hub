import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ApostaPopupType = 'simples' | 'multipla' | 'surebet' | null;

interface ApostaPopupData {
  projetoId: string;
  activeTab?: string;
  // Para edição
  aposta?: any;
  surebet?: any;
}

interface ApostaPopupState {
  activePopup: ApostaPopupType;
  isMinimized: boolean;
  position: { x: number; y: number };
  data: ApostaPopupData | null;
}

interface ApostaPopupContextType extends ApostaPopupState {
  // Abrir popups
  openApostaSimples: (projetoId: string, activeTab?: string, aposta?: any) => void;
  openApostaMultipla: (projetoId: string, activeTab?: string, aposta?: any) => void;
  openSurebet: (projetoId: string, activeTab?: string, surebet?: any) => void;
  
  // Controles
  closePopup: () => void;
  toggleMinimize: () => void;
  setPosition: (pos: { x: number; y: number }) => void;
  
  // Callbacks após sucesso (para refrescar dados)
  onSuccessCallback: (() => void) | null;
  setOnSuccessCallback: (callback: (() => void) | null) => void;
}

const defaultState: ApostaPopupState = {
  activePopup: null,
  isMinimized: false,
  position: { x: Math.max(20, window.innerWidth - 900), y: 80 },
  data: null,
};

const ApostaPopupContext = createContext<ApostaPopupContextType | null>(null);

export const useApostaPopup = () => {
  const context = useContext(ApostaPopupContext);
  if (!context) {
    throw new Error('useApostaPopup must be used within ApostaPopupProvider');
  }
  return context;
};

export const ApostaPopupProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ApostaPopupState>(defaultState);
  const [onSuccessCallback, setOnSuccessCallback] = useState<(() => void) | null>(null);

  const openApostaSimples = useCallback((projetoId: string, activeTab?: string, aposta?: any) => {
    setState({
      activePopup: 'simples',
      isMinimized: false,
      position: { x: Math.max(20, window.innerWidth - 900), y: 80 },
      data: { projetoId, activeTab, aposta },
    });
  }, []);

  const openApostaMultipla = useCallback((projetoId: string, activeTab?: string, aposta?: any) => {
    setState({
      activePopup: 'multipla',
      isMinimized: false,
      position: { x: Math.max(20, window.innerWidth - 900), y: 80 },
      data: { projetoId, activeTab, aposta },
    });
  }, []);

  const openSurebet = useCallback((projetoId: string, activeTab?: string, surebet?: any) => {
    setState({
      activePopup: 'surebet',
      isMinimized: false,
      position: { x: Math.max(20, window.innerWidth - 1000), y: 60 },
      data: { projetoId, activeTab, surebet },
    });
  }, []);

  const closePopup = useCallback(() => {
    setState(prev => ({ ...prev, activePopup: null, data: null }));
    setOnSuccessCallback(null);
  }, []);

  const toggleMinimize = useCallback(() => {
    setState(prev => ({ ...prev, isMinimized: !prev.isMinimized }));
  }, []);

  const setPosition = useCallback((pos: { x: number; y: number }) => {
    setState(prev => ({ ...prev, position: pos }));
  }, []);

  return (
    <ApostaPopupContext.Provider
      value={{
        ...state,
        openApostaSimples,
        openApostaMultipla,
        openSurebet,
        closePopup,
        toggleMinimize,
        setPosition,
        onSuccessCallback,
        setOnSuccessCallback,
      }}
    >
      {children}
    </ApostaPopupContext.Provider>
  );
};
