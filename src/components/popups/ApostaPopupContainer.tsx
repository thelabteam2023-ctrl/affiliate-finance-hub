import React from 'react';
import { useApostaPopup } from '@/contexts/ApostaPopupContext';
import { ApostaDialog } from '@/components/projeto-detalhe/ApostaDialog';
import { ApostaMultiplaDialog } from '@/components/projeto-detalhe/ApostaMultiplaDialog';
import { SurebetDialog } from '@/components/projeto-detalhe/SurebetDialog';
import { getEstrategiaFromTab } from '@/lib/apostaConstants';
import { DollarSign, Layers, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Container que renderiza os popups de apostas baseado no contexto
 * Gerencia qual dialog está aberto através do ApostaPopupContext
 * Inclui botão minimizado flutuante quando minimizado
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
    onSuccessCallback,
  } = useApostaPopup();

  const handleSuccess = () => {
    onSuccessCallback?.();
    closePopup();
  };

  if (!activePopup || !data) return null;

  // Configurações por tipo
  const getPopupConfig = () => {
    switch (activePopup) {
      case 'simples':
        return {
          title: data.aposta ? 'Editar Aposta' : 'Nova Aposta',
          icon: <DollarSign className="h-5 w-5" />,
          color: 'bg-emerald-500 hover:bg-emerald-600',
        };
      case 'multipla':
        return {
          title: data.aposta ? 'Editar Múltipla' : 'Nova Múltipla',
          icon: <Layers className="h-5 w-5" />,
          color: 'bg-blue-500 hover:bg-blue-600',
        };
      case 'surebet':
        return {
          title: data.surebet ? 'Editar Surebet' : 'Nova Surebet',
          icon: <RefreshCcw className="h-5 w-5" />,
          color: 'bg-purple-500 hover:bg-purple-600',
        };
      default:
        return {
          title: 'Popup',
          icon: <DollarSign className="h-5 w-5" />,
          color: 'bg-primary',
        };
    }
  };

  const config = getPopupConfig();

  // Quando minimizado, mostra apenas o FAB flutuante
  if (isMinimized) {
    return (
      <div
        className="fixed z-[9999] cursor-pointer"
        style={{ bottom: 20, right: 20 }}
      >
        <Button
          onClick={toggleMinimize}
          className={cn(
            "h-14 w-14 rounded-full shadow-lg",
            config.color
          )}
          title={config.title}
        >
          {config.icon}
        </Button>
      </div>
    );
  }

  // Renderiza o dialog apropriado
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
