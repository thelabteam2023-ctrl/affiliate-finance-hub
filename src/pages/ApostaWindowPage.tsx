import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ApostaDialog, type ApostaActionType } from '@/components/projeto-detalhe/ApostaDialog';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, CheckCircle2, X, Target, Trash2 } from 'lucide-react';
import { useResizeWindowToContent } from '@/hooks/useResizeWindowToContent';
import { toast } from 'sonner';

// Debug: Confirm this file is loading in standalone window
console.error("🚨🚨🚨 ApostaWindowPage MODULE LOADED");

/**
 * Página standalone para o formulário de Aposta Simples.
 * Abre em uma janela separada do navegador para posicionamento flexível.
 * 
 * COMPORTAMENTO:
 * - Novo registro: após salvar, formulário é resetado e janela permanece aberta
 * - Edição: após salvar, janela é fechada automaticamente
 * - Toast de confirmação visual ao salvar
 */
export default function ApostaWindowPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  
  const projetoId = searchParams.get('projetoId') || '';
  const activeTab = searchParams.get('tab') || 'apostas';
  const estrategia = searchParams.get('estrategia') || null;
  const duplicateFrom = searchParams.get('duplicateFrom') || null;
  
  const isEditing = id && id !== 'novo' && !duplicateFrom;
  const isDuplicating = !!duplicateFrom;
  
  const [aposta, setAposta] = useState<any>(null);
  const [loading, setLoading] = useState(!!isEditing || isDuplicating);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [saveCount, setSaveCount] = useState(0);

  // Auto-resize window to fit content (MUST be before any early returns - Rules of Hooks)
  const contentRef = useResizeWindowToContent([formKey, loading]);

  // Debug: Log when component mounts
  useEffect(() => {
    console.error("🚨🚨🚨 ApostaWindowPage MOUNTED", { 
      projetoId, 
      isEditing, 
      aposta: !!aposta,
      windowLocation: window.location.href 
    });
   
   // Add a global paste listener to detect ANY paste in this window
   const globalPasteDetector = (e: ClipboardEvent) => {
     console.error("🚨🚨🚨 [ApostaWindowPage] PASTE GLOBAL DETECTADO!", {
       timestamp: new Date().toISOString(),
       target: (e.target as HTMLElement)?.tagName,
       hasClipboardData: !!e.clipboardData,
       itemsCount: e.clipboardData?.items?.length || 0,
       types: e.clipboardData?.types || []
     });
   };
   
   window.addEventListener("paste", globalPasteDetector);
   console.error("🚨🚨🚨 [ApostaWindowPage] ✅ Listener global de paste ativado na window");
   
   return () => {
     console.error("🚨🚨🚨 [ApostaWindowPage] ❌ Removendo listener global");
     window.removeEventListener("paste", globalPasteDetector);
   };
  }, []);

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

  // Notificar janela principal após salvar OU excluir
  // FLUXO DISTINTO: Criação mantém aberto, Edição fecha automaticamente
  const handleSuccess = useCallback((action?: ApostaActionType) => {
    // Notificar janela principal para atualizar listas/KPIs/saldos
    const payload = { 
      type: 'APOSTA_SAVED', 
      projetoId, 
      action,
      source: 'aposta_window',
    };

    // 1. BroadcastChannel (same-origin tabs/windows)
    try {
      const channel = new BroadcastChannel('aposta_channel');
      channel.postMessage(payload);
      channel.close();
    } catch (err) {
      console.warn('[ApostaWindowPage] BroadcastChannel não disponível:', err);
    }

    // 2. window.opener.postMessage (cross-context, iframe scenarios)
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, '*');
      }
    } catch (err) {
      // ignore
    }

    // 3. localStorage fallback (triggers StorageEvent in other windows)
    try {
      localStorage.setItem('aposta_saved', JSON.stringify({ 
        ...payload,
        timestamp: Date.now() 
      }));
      // Remove immediately to allow re-triggering
      setTimeout(() => localStorage.removeItem('aposta_saved'), 100);
    } catch (err) {
      // ignore
    }
    
    // Se foi exclusão, fechar a janela
    if (action === 'delete') {
      toast.success("Aposta excluída!", {
        description: "A operação foi removida com sucesso.",
        icon: <Trash2 className="h-5 w-5 text-destructive" />,
        duration: 2000,
      });
      setTimeout(() => window.close(), 1500);
      return;
    }
    
    // FLUXO DISTINTO POR MODO
    if (isEditing) {
      // EDIÇÃO: Fechar e retornar à lista
      toast.success("Aposta atualizada!", {
        description: "Alterações salvas com sucesso.",
        icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
        duration: 2000,
      });
      setTimeout(() => window.close(), 1000);
    } else {
      // CRIAÇÃO: Resetar formulário e manter aberto
      setSaveCount(prev => prev + 1);
      setAposta(null);
      setFormKey(prev => prev + 1);
      
      toast.success("Aposta registrada!", {
        description: `${saveCount + 1}ª operação salva. Formulário pronto para nova entrada.`,
        icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
        duration: 3000,
      });
    }
  }, [isEditing, projetoId, saveCount]);

  const handleClose = useCallback(() => {
    window.close();
  }, []);

  if (!projetoId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
          <h1 className="text-xl font-semibold">Parâmetro ausente</h1>
          <p className="text-muted-foreground">ID do projeto não fornecido.</p>
          <Button variant="outline" onClick={handleClose}>Fechar</Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold">Erro</h1>
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={handleClose}>Fechar</Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }


  return (
    <div ref={contentRef} className="bg-background">
      <ApostaDialog
        key={formKey}
        open={true}
        onOpenChange={(open) => !open && handleClose()}
        aposta={aposta}
        projetoId={projetoId}
        onSuccess={handleSuccess}
        defaultEstrategia={estrategia as any}
        activeTab={activeTab}
        embedded={true}
      />
    </div>
  );
}
