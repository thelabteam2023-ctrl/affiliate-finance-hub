import React, { useEffect } from 'react';

interface SurebetPopupProps {
  isOpen: boolean;
  isMinimized: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onToggleMinimize: () => void;
  onPositionChange: (pos: { x: number; y: number }) => void;
  projetoId: string;
  surebet?: any;
  onSuccess: () => void;
  activeTab?: string;
}

/**
 * Componente legado mantido para compatibilidade.
 * O Surebet agora abre em uma janela externa com URL própria.
 * 
 * Se este componente for renderizado, ele automaticamente abre
 * a janela externa e fecha o popup.
 */
export const SurebetPopup: React.FC<SurebetPopupProps> = ({
  isOpen,
  onClose,
  projetoId,
  surebet,
  activeTab = 'surebet',
}) => {
  useEffect(() => {
    if (isOpen) {
      // Abrir em nova janela do navegador
      const surebetId = surebet?.id || 'novo';
      const url = `/janela/surebet/${surebetId}?projetoId=${encodeURIComponent(projetoId)}&tab=${encodeURIComponent(activeTab)}`;
      const windowFeatures = 'width=780,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';
      window.open(url, '_blank', windowFeatures);
      
      // Fechar o popup imediatamente após abrir a janela
      onClose();
    }
  }, [isOpen, projetoId, surebet, activeTab, onClose]);
  
  // Este componente não renderiza nada visualmente
  return null;
};
