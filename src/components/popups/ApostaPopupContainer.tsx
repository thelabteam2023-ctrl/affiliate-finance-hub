import React from 'react';
import { useApostaPopup } from '@/contexts/ApostaPopupContext';
import { ApostaDialog } from '@/components/projeto-detalhe/ApostaDialog';
import { ApostaMultiplaDialog } from '@/components/projeto-detalhe/ApostaMultiplaDialog';
import { SurebetDialog } from '@/components/projeto-detalhe/SurebetDialog';
import { getEstrategiaFromTab } from '@/lib/apostaConstants';

/**
 * Container que renderiza os popups de apostas baseado no contexto
 * Gerencia qual dialog está aberto através do ApostaPopupContext
 */
export const ApostaPopupContainer: React.FC = () => {
  const {
    activePopup,
    data,
    closePopup,
    onSuccessCallback,
  } = useApostaPopup();

  const handleSuccess = () => {
    onSuccessCallback?.();
    closePopup();
  };

  if (!activePopup || !data) return null;

  return (
    <>
      {activePopup === 'simples' && (
        <ApostaDialog
          open={true}
          onOpenChange={(open) => !open && closePopup()}
          aposta={data.aposta || null}
          projetoId={data.projetoId}
          onSuccess={handleSuccess}
          defaultEstrategia={getEstrategiaFromTab(data.activeTab || 'apostas')}
          activeTab={data.activeTab || 'apostas'}
        />
      )}

      {activePopup === 'multipla' && (
        <ApostaMultiplaDialog
          open={true}
          onOpenChange={(open) => !open && closePopup()}
          aposta={data.aposta || null}
          projetoId={data.projetoId}
          onSuccess={handleSuccess}
          defaultEstrategia={getEstrategiaFromTab(data.activeTab || 'apostas')}
          activeTab={data.activeTab || 'apostas'}
        />
      )}

      {activePopup === 'surebet' && (
        <SurebetDialog
          open={true}
          onOpenChange={(open) => !open && closePopup()}
          projetoId={data.projetoId}
          surebet={data.surebet || null}
          onSuccess={handleSuccess}
          activeTab={data.activeTab || 'surebet'}
        />
      )}
    </>
  );
};
