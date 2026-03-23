import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ApostaMultiplaDialog, type ApostaMultiplaActionType } from '@/components/projeto-detalhe/ApostaMultiplaDialog';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, CheckCircle2, X, Layers, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useApostaRascunho, type ApostaRascunho } from '@/hooks/useApostaRascunho';

/**
 * Página standalone para o formulário de Aposta Múltipla.
 * Abre em uma janela separada do navegador para posicionamento flexível.
 * 
 * COMPORTAMENTO:
 * - Novo registro: após salvar, formulário é resetado e janela permanece aberta
 * - Edição: após salvar, janela é fechada automaticamente
 * - Rascunho: carrega dados do localStorage e deleta ao salvar com sucesso
 * - Toast de confirmação visual ao salvar
 */
export default function ApostaMultiplaWindowPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { workspaceId } = useWorkspace();
  
  const projetoId = searchParams.get('projetoId') || '';
  const activeTab = searchParams.get('tab') || 'apostas';
  const estrategia = searchParams.get('estrategia') || null;
  const rascunhoId = searchParams.get('rascunhoId');
  const duplicateFrom = searchParams.get('duplicateFrom') || null;
  
  const isEditing = id && id !== 'novo' && !duplicateFrom;
  const isDuplicating = !!duplicateFrom;
  const isFromRascunho = !!rascunhoId && !isEditing;
  
  const [aposta, setAposta] = useState<any>(null);
  const [loading, setLoading] = useState(!!isEditing);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [saveCount, setSaveCount] = useState(0);
  const [rascunhoCarregado, setRascunhoCarregado] = useState<ApostaRascunho | null>(null);
  
  // Hook de rascunhos
  const { buscarRascunho, deletarRascunho } = useApostaRascunho(projetoId, workspaceId || '');
  
  // Carregar rascunho se tiver rascunhoId
  useEffect(() => {
    if (!isFromRascunho || !rascunhoId || !workspaceId) return;
    
    const rascunho = buscarRascunho(rascunhoId);
    if (rascunho) {
      setRascunhoCarregado(rascunho);
      toast.info("Rascunho carregado", {
        description: rascunho.motivo_incompleto || "Continue de onde parou",
        icon: <FileText className="h-5 w-5 text-blue-500" />,
      });
    }
  }, [rascunhoId, isFromRascunho, workspaceId, buscarRascunho]);

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
        console.error('Erro ao buscar aposta múltipla:', err);
        setError(err.message || 'Erro ao carregar aposta');
      } finally {
        setLoading(false);
      }
    };

    fetchAposta();
  }, [id, isEditing]);

  // FLUXO DISTINTO: Criação mantém aberto, Edição fecha automaticamente
  const handleSuccess = useCallback((action?: ApostaMultiplaActionType) => {
    // Notificar janela principal para atualizar listas/KPIs/saldos
    const payload = { 
      type: 'APOSTA_MULTIPLA_SAVED', 
      projetoId, 
      action,
      source: 'aposta_multipla_window',
    };

    // 1. BroadcastChannel (same-origin tabs/windows)
    try {
      const channel = new BroadcastChannel('aposta_multipla_channel');
      channel.postMessage(payload);
      channel.close();
    } catch (err) {
      console.warn('[ApostaMultiplaWindowPage] BroadcastChannel não disponível:', err);
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
      localStorage.setItem('aposta_multipla_saved', JSON.stringify({ 
        ...payload,
        timestamp: Date.now() 
      }));
      setTimeout(() => localStorage.removeItem('aposta_multipla_saved'), 100);
    } catch (err) {
      // ignore
    }
    
    // Se veio de rascunho, deletar o rascunho após salvar com sucesso (não em delete)
    if (action === 'save' && isFromRascunho && rascunhoCarregado) {
      deletarRascunho(rascunhoCarregado.id);
      setRascunhoCarregado(null);
    }
    
    // Se foi exclusão, fechar a janela
    if (action === 'delete') {
      toast.success("Múltipla excluída!", {
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
      toast.success("Múltipla atualizada!", {
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
      
      toast.success("Múltipla registrada!", {
        description: `${saveCount + 1}ª operação salva. Formulário pronto para nova entrada.`,
        icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
        duration: 3000,
      });
    }
  }, [isEditing, projetoId, saveCount, isFromRascunho, rascunhoCarregado, deletarRascunho]);

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
    <div className="min-h-screen bg-background">
      <div className="max-w-[520px] mx-auto">
        {/* Conteúdo */}
        <ApostaMultiplaDialog
          key={formKey}
          open={true}
          onOpenChange={(open) => !open && handleClose()}
          aposta={aposta}
          projetoId={projetoId}
          onSuccess={handleSuccess}
          defaultEstrategia={estrategia as any}
          activeTab={activeTab}
          rascunho={rascunhoCarregado}
          embedded={true}
        />
      </div>
    </div>
  );
}
