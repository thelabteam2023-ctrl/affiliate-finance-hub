import React from 'react';
import { ApostaPopupWrapper } from './ApostaPopupWrapper';
import { SurebetDialog } from '@/components/projeto-detalhe/SurebetDialog';
import { RefreshCcw } from 'lucide-react';

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
 * Janela flutuante arrastável para o formulário de Surebet.
 * 
 * Utiliza uma técnica de CSS para incorporar o SurebetDialog existente
 * dentro do ApostaPopupWrapper, substituindo a posição fixa do Dialog
 * por uma posição relativa dentro do wrapper.
 */
export const SurebetPopup: React.FC<SurebetPopupProps> = ({
  isOpen,
  isMinimized,
  position,
  onClose,
  onToggleMinimize,
  onPositionChange,
  projetoId,
  surebet,
  onSuccess,
  activeTab,
}) => {
  return (
    <ApostaPopupWrapper
      isOpen={isOpen}
      isMinimized={isMinimized}
      position={position}
      onClose={onClose}
      onToggleMinimize={onToggleMinimize}
      onPositionChange={onPositionChange}
      title={surebet ? "Editar Arbitragem" : "Nova Arbitragem"}
      icon={<RefreshCcw className="h-4 w-4 text-purple-500" />}
      minimizedIcon={<RefreshCcw className="h-5 w-5" />}
      defaultWidth={1200}
      defaultHeight={750}
      minWidth={800}
      minHeight={500}
      storageKey="surebet-popup-size"
    >
      {/* 
        Container com estilos que forçam o Dialog a renderizar inline
        ao invés de usar sua posição fixa padrão.
        
        O estilo [data-radix-dialog-overlay] esconde o overlay
        O estilo [data-radix-dialog-content] muda o posicionamento
      */}
      <div 
        className="surebet-popup-container h-full overflow-auto"
        style={{
          // CSS para forçar o dialog a renderizar inline
        }}
      >
        <style>{`
          .surebet-popup-container [data-radix-dialog-overlay] {
            display: none !important;
          }
          .surebet-popup-container [role="dialog"] {
            position: relative !important;
            transform: none !important;
            top: auto !important;
            left: auto !important;
            max-width: 100% !important;
            max-height: 100% !important;
            border: none !important;
            box-shadow: none !important;
            animation: none !important;
            margin: 0 !important;
          }
          .surebet-popup-container > div {
            display: contents;
          }
        `}</style>
        <SurebetDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
          projetoId={projetoId}
          surebet={surebet || null}
          onSuccess={onSuccess}
          activeTab={activeTab || 'surebet'}
        />
      </div>
    </ApostaPopupWrapper>
  );
};
