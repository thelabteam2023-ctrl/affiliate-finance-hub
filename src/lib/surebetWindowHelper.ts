/**
 * Helper para abrir a janela de Surebet em uma nova janela do navegador.
 * Usada tanto para criação quanto edição de surebets.
 */
export function openSurebetWindow(params: {
  projetoId: string;
  surebetId?: string | null;
  activeTab?: string;
}) {
  const { projetoId, surebetId, activeTab = 'surebet' } = params;
  
  const id = surebetId || 'novo';
  const url = `/janela/surebet/${id}?projetoId=${encodeURIComponent(projetoId)}&tab=${encodeURIComponent(activeTab)}`;
  const windowFeatures = 'width=1280,height=800,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';
  
  window.open(url, '_blank', windowFeatures);
}

/**
 * Hook para escutar eventos de salvamento de surebet vindos de janelas externas.
 * Usa BroadcastChannel para comunicação entre janelas.
 */
export function useSurebetWindowListener(callback: (projetoId: string) => void) {
  if (typeof window === 'undefined') return;
  
  try {
    const channel = new BroadcastChannel('surebet_channel');
    
    channel.onmessage = (event) => {
      if (event.data?.type === 'SUREBET_SAVED' && event.data?.projetoId) {
        callback(event.data.projetoId);
      }
    };
    
    return () => {
      channel.close();
    };
  } catch (err) {
    // Fallback: localStorage event
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'surebet_saved' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          if (data.projetoId) {
            callback(data.projetoId);
          }
        } catch (e) {
          console.error('Erro ao parsear surebet_saved:', e);
        }
      }
    };
    
    window.addEventListener('storage', handleStorage);
    
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }
}
