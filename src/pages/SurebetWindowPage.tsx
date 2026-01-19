import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SurebetDialogTable } from "@/components/projeto-detalhe/SurebetDialogTable";
import { Button } from "@/components/ui/button";
import { X, RefreshCcw, Loader2, AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useApostaRascunho, type ApostaRascunho } from "@/hooks/useApostaRascunho";
/**
 * Página standalone para o formulário de Surebet.
 * Rota: /janela/surebet/novo?projetoId=...&tab=...&rascunhoId=...
 * Rota: /janela/surebet/:id?projetoId=...&tab=...
 * 
 * Esta página abre em uma janela separada do navegador,
 * permitindo ao usuário posicionar o formulário em qualquer área da tela.
 * 
 * COMPORTAMENTO:
 * - Novo registro: após salvar, formulário é resetado e janela permanece aberta
 * - Edição: após salvar, janela é fechada automaticamente
 * - Rascunho: carrega dados do localStorage e deleta ao salvar com sucesso
 * - Toast de confirmação visual ao salvar
 */
export default function SurebetWindowPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { workspaceId } = useWorkspace();
  
  const projetoId = searchParams.get("projetoId") || "";
  const activeTab = searchParams.get("tab") || "surebet";
  const rascunhoId = searchParams.get("rascunhoId");
  
  const isEditing = !!id && id !== "novo";
  const isFromRascunho = !!rascunhoId && !isEditing;
  
  const [surebet, setSurebet] = useState<any>(null);
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [saveCount, setSaveCount] = useState(0); // Contador de salvamentos
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
  
  // Buscar dados da surebet se estiver editando
  useEffect(() => {
    if (!isEditing || !id) {
      setLoading(false);
      return;
    }
    
    const fetchSurebet = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const { data, error: fetchError } = await supabase
          .from("apostas_unificada")
          .select(`
            id,
            data_aposta,
            evento,
            esporte,
            modelo,
            mercado,
            stake_total,
            spread_calculado,
            roi_esperado,
            lucro_esperado,
            lucro_prejuizo,
            roi_real,
            status,
            resultado,
            observacoes,
            forma_registro,
            estrategia,
            contexto_operacional
          `)
          .eq("id", id)
          .maybeSingle();
        
        if (fetchError) throw fetchError;
        
        if (!data) {
          setError("Operação não encontrada");
          return;
        }
        
        // Mapear para formato esperado pelo SurebetDialog
        setSurebet({
          id: data.id,
          data_operacao: data.data_aposta,
          evento: data.evento || "",
          esporte: data.esporte || "Futebol",
          modelo: data.modelo || "1-2",
          mercado: data.mercado,
          stake_total: data.stake_total || 0,
          spread_calculado: data.spread_calculado,
          roi_esperado: data.roi_esperado,
          lucro_esperado: data.lucro_esperado,
          lucro_real: data.lucro_prejuizo,
          roi_real: data.roi_real,
          status: data.status || "PENDENTE",
          resultado: data.resultado,
          observacoes: data.observacoes,
          // CRÍTICO: manter contexto/estratégia original como fonte da verdade
          forma_registro: data.forma_registro,
          estrategia: data.estrategia,
          contexto_operacional: data.contexto_operacional,
        });
      } catch (err: any) {
        console.error("Erro ao buscar surebet:", err);
        setError(err.message || "Erro ao carregar operação");
      } finally {
        setLoading(false);
      }
    };
    
    fetchSurebet();
  }, [id, isEditing]);
  
  // Handler de sucesso - notifica janela pai e gerencia ciclo de vida
  const handleSuccess = useCallback(() => {
    // Usar BroadcastChannel para notificar a janela principal
    try {
      const channel = new BroadcastChannel("surebet_channel");
      channel.postMessage({ 
        type: "SUREBET_SAVED", 
        projetoId,
        surebetId: id || "novo"
      });
      channel.close();
    } catch (err) {
      // Fallback: localStorage event
      localStorage.setItem("surebet_saved", JSON.stringify({ 
        projetoId, 
        surebetId: id || "novo",
        timestamp: Date.now() 
      }));
    }
    
    // Se estava editando, fechar a janela após salvar
    if (isEditing) {
      toast.success("Arbitragem atualizada!", {
        description: "Janela será fechada...",
        duration: 2000,
      });
      setTimeout(() => window.close(), 1500);
    } else {
      // Se veio de rascunho, deletar o rascunho após salvar com sucesso
      if (isFromRascunho && rascunhoCarregado) {
        deletarRascunho(rascunhoCarregado.id);
        setRascunhoCarregado(null);
      }
      
      // Novo registro: manter aberta e resetar formulário
      setSaveCount(prev => prev + 1);
      setSurebet(null);
      setFormKey(prev => prev + 1);
      
      // Toast de confirmação com contador
      toast.success("Arbitragem registrada!", {
        description: `${saveCount + 1}ª operação salva. Formulário pronto para nova entrada.`,
        icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
        duration: 3000,
      });
    }
  }, [isEditing, projetoId, id, saveCount, isFromRascunho, rascunhoCarregado, deletarRascunho]);
  
  // Handler de fechamento com confirmação
  const handleClose = useCallback(() => {
    window.close();
  }, []);
  
  // Validação de parâmetros
  if (!projetoId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
          <h1 className="text-xl font-semibold">Parâmetro ausente</h1>
          <p className="text-muted-foreground">
            O ID do projeto é obrigatório para abrir o formulário.
          </p>
          <Button onClick={handleClose}>Fechar</Button>
        </div>
      </div>
    );
  }
  
  // Estado de loading
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
  
  // Estado de erro
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold">Erro</h1>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={handleClose}>Fechar</Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header simples */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-12 items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-2 min-w-0">
            <RefreshCcw className="h-5 w-5 text-purple-500 flex-shrink-0" />
            <h1 className="text-sm sm:text-base font-semibold truncate">
              {isEditing ? "Editar Arbitragem" : "Nova Arbitragem"}
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
      
      {/* Conteúdo - SurebetDialog como modal sempre aberto */}
      <div className="p-2 sm:p-4">
        <SurebetDialogTable
          key={formKey}
          open={true}
          onOpenChange={(open) => {
            if (!open) handleClose();
          }}
          projetoId={projetoId}
          surebet={surebet}
          onSuccess={handleSuccess}
          activeTab={activeTab}
        />
      </div>
    </div>
  );
}
