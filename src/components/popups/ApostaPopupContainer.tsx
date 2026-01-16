import React, { useEffect } from 'react';
import { useApostaPopup } from '@/contexts/ApostaPopupContext';
import { SurebetPopup } from './SurebetPopup';
import { openApostaWindow, openApostaMultiplaWindow } from '@/lib/windowHelper';
import { getEstrategiaFromTab } from '@/lib/apostaConstants';

/**
 * Container que renderiza os popups de apostas baseado no contexto
 * Gerencia qual popup/dialog está aberto através do ApostaPopupContext
 * 
 * - Surebet: Abre em janela externa via SurebetPopup (bridge)
 * - Simples: Abre em janela externa
 * - Múltipla: Abre em janela externa
 */
export const ApostaPopupContainer: React.FC = () => {
  const {
    activePopup,
    isMinimized,
    position,
    data,
    closePopup,
    toggleMinimize,
    setPosition,
  } = useApostaPopup();

  // Quando um popup é ativado, abrir a janela externa correspondente
  useEffect(() => {
    if (!activePopup || !data) return;

    if (activePopup === 'simples') {
      const estrategia = getEstrategiaFromTab(data.activeTab || 'apostas');
      openApostaWindow({
        projetoId: data.projetoId,
        id: data.aposta?.id || null,
        activeTab: data.activeTab,
        estrategia,
      });
      closePopup();
    }

    if (activePopup === 'multipla') {
      const estrategia = getEstrategiaFromTab(data.activeTab || 'apostas');
      openApostaMultiplaWindow({
        projetoId: data.projetoId,
        id: data.aposta?.id || null,
        activeTab: data.activeTab,
        estrategia,
      });
      closePopup();
    }
  }, [activePopup, data, closePopup]);

  if (!activePopup || !data) return null;

  // ============================================================
  // SUREBET - Janela flutuante arrastável (bridge para janela externa)
  // ============================================================
  if (activePopup === 'surebet') {
    return (
      <SurebetPopup
        isOpen={true}
        isMinimized={isMinimized}
        position={position}
        onClose={closePopup}
        onToggleMinimize={toggleMinimize}
        onPositionChange={setPosition}
        projetoId={data.projetoId}
        surebet={data.surebet}
        onSuccess={closePopup}
        activeTab={data.activeTab}
      />
    );
  }

  // Simples e Múltipla são tratados no useEffect acima
  return null;
};
