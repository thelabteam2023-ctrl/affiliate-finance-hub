import { useState, useEffect } from "react";
import { useSearchParams, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SurebetDialog } from "@/components/projeto-detalhe/SurebetDialog";
import { Button } from "@/components/ui/button";
import { X, RefreshCcw, Loader2, AlertTriangle } from "lucide-react";

/**
 * Página standalone para o formulário de Surebet.
 * Rota: /janela/surebet/novo?projetoId=...&tab=...
 * Rota: /janela/surebet/:id?projetoId=...&tab=...
 * 
 * Esta página abre em uma janela separada do navegador,
 * permitindo ao usuário posicionar o formulário em qualquer área da tela.
 */
export default function SurebetWindowPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  
  const projetoId = searchParams.get("projetoId") || "";
  const activeTab = searchParams.get("tab") || "surebet";
  
  const isEditing = !!id && id !== "novo";
  
  const [surebet, setSurebet] = useState<any>(null);
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0); // Key para forçar remount do formulário
  
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
            observacoes
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
          observacoes: data.observacoes
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
  
  // Handler de sucesso - notifica janela pai e mantém janela aberta para novas inserções
  const handleSuccess = () => {
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
    // Se era novo registro, manter aberta para próximas inserções
    if (isEditing) {
      window.close();
    } else {
      // Resetar o estado e forçar remount do formulário com nova key
      setSurebet(null);
      setFormKey(prev => prev + 1);
    }
  };
  
  // Handler de fechamento
  const handleClose = () => {
    window.close();
  };
  
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
        <SurebetDialog
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
