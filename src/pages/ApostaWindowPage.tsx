import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ApostaDialog } from '@/components/projeto-detalhe/ApostaDialog';
import { Button } from '@/components/ui/button';

/**
 * Página standalone para o formulário de Aposta Simples.
 * Abre em uma janela separada do navegador para posicionamento flexível.
 */
export default function ApostaWindowPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  
  const projetoId = searchParams.get('projetoId') || '';
  const activeTab = searchParams.get('tab') || 'apostas';
  const estrategia = searchParams.get('estrategia') || 'PUNTER';
  
  const isEditing = id && id !== 'novo';
  
  const [aposta, setAposta] = useState<any>(null);
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState<string | null>(null);

  // Buscar dados da aposta se estiver editando
  useEffect(() => {
    if (!isEditing) {
      setLoading(false);
      return;
    }

    const fetchAposta = async () => {
      try {
        setLoading(true);
        const { data, error: fetchError } = await supabase
          .from('apostas_unificada')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchError) throw fetchError;
        setAposta(data);
      } catch (err: any) {
        console.error('Erro ao buscar aposta:', err);
        setError(err.message || 'Erro ao carregar aposta');
      } finally {
        setLoading(false);
      }
    };

    fetchAposta();
  }, [id, isEditing]);

  // Notificar janela principal após salvar
  const handleSuccess = () => {
    try {
      const channel = new BroadcastChannel('aposta_channel');
      channel.postMessage({ type: 'APOSTA_SAVED', projetoId });
      channel.close();
    } catch (err) {
      // Fallback para localStorage
      localStorage.setItem('aposta_saved', JSON.stringify({ projetoId, timestamp: Date.now() }));
    }
    window.close();
  };

  const handleClose = () => {
    window.close();
  };

  if (!projetoId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center text-destructive">
          <p>Erro: ID do projeto não fornecido.</p>
          <Button variant="outline" onClick={handleClose} className="mt-4">
            Fechar
          </Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center text-destructive">
          <p>Erro: {error}</p>
          <Button variant="outline" onClick={handleClose} className="mt-4">
            Fechar
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ApostaDialog
        open={true}
        onOpenChange={(open) => !open && handleClose()}
        aposta={aposta}
        projetoId={projetoId}
        onSuccess={handleSuccess}
        defaultEstrategia={estrategia as any}
        activeTab={activeTab}
      />
    </div>
  );
}
