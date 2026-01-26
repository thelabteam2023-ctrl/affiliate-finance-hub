import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ApostaDialog, type ApostaActionType } from '@/components/projeto-detalhe/ApostaDialog';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, CheckCircle2, X, Target, Trash2 } from 'lucide-react';
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
  const estrategia = searchParams.get('estrategia') || 'PUNTER';
  
  const isEditing = id && id !== 'novo';
  
  const [aposta, setAposta] = useState<any>(null);
  const [loading, setLoading] = useState(!!isEditing);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [saveCount, setSaveCount] = useState(0);

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
  // MODO OPERACIONAL CONTÍNUO: Nunca fecha automaticamente
  // O formulário permanece aberto após salvar, seja novo ou edição
  const handleSuccess = useCallback((action?: ApostaActionType) => {
    // Notificar janela principal para atualizar listas/KPIs/saldos
    try {
      const channel = new BroadcastChannel('aposta_channel');
      channel.postMessage({ type: 'APOSTA_SAVED', projetoId, action });
      channel.close();
    } catch (err) {
      localStorage.setItem('aposta_saved', JSON.stringify({ projetoId, action, timestamp: Date.now() }));
    }
    
    // Se foi exclusão, fechar a janela (não faz sentido continuar editando algo que não existe)
    if (action === 'delete') {
      toast.success("Aposta excluída!", {
        description: "A operação foi removida com sucesso.",
        icon: <Trash2 className="h-5 w-5 text-destructive" />,
        duration: 2000,
      });
      // Pequeno delay para o toast ser visto antes de fechar
      setTimeout(() => window.close(), 1500);
      return;
    }
    
    // Para salvamento: Incrementar contador e resetar formulário
    setSaveCount(prev => prev + 1);
    setAposta(null);
    setFormKey(prev => prev + 1);
    
    // Toast de confirmação visual
    toast.success(isEditing ? "Aposta atualizada!" : "Aposta registrada!", {
      description: `${saveCount + 1}ª operação salva. Formulário pronto para nova entrada.`,
      icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
      duration: 3000,
    });
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
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-12 items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-2 min-w-0">
            <Target className="h-5 w-5 text-blue-500 flex-shrink-0" />
            <h1 className="text-sm sm:text-base font-semibold truncate">
              {isEditing ? "Editar Aposta" : "Nova Aposta"}
            </h1>
            {saveCount > 0 && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {saveCount} salva(s)
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="h-8 w-8 p-0 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Conteúdo */}
      <div className="p-2 sm:p-4">
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
    </div>
  );
}
