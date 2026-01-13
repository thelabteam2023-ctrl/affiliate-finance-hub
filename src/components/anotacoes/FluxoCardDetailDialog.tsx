import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { FluxoCard } from "./types";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { History } from "lucide-react";

interface FluxoCardDetailDialogProps {
  card: FluxoCard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (cardId: string, conteudo: string) => Promise<void>;
}

interface HistoricoItem {
  id: string;
  versao: number;
  tipo_mudanca: string;
  created_at: string;
}

export function FluxoCardDetailDialog({
  card,
  open,
  onOpenChange,
  onUpdate,
}: FluxoCardDetailDialogProps) {
  const [content, setContent] = useState(card.conteudo);
  const [showHistorico, setShowHistorico] = useState(false);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  // Sync content when dialog opens
  useEffect(() => {
    if (open) {
      setContent(card.conteudo);
      setShowHistorico(false);
    }
  }, [open, card.conteudo]);

  // Carregar histórico
  const loadHistorico = async () => {
    if (historico.length > 0) {
      setShowHistorico(!showHistorico);
      return;
    }

    setLoadingHistorico(true);
    try {
      const { data, error } = await supabase
        .from("fluxo_cards_historico")
        .select("id, versao, tipo_mudanca, created_at")
        .eq("card_id", card.id)
        .order("versao", { ascending: false })
        .limit(20);

      if (error) throw error;
      setHistorico(data || []);
      setShowHistorico(true);
    } catch (error) {
      console.error("Erro ao carregar histórico:", error);
    } finally {
      setLoadingHistorico(false);
    }
  };

  // Salvar ao fechar
  const handleOpenChange = async (newOpen: boolean) => {
    if (!newOpen && content !== card.conteudo) {
      await onUpdate(card.id, content);
    }
    onOpenChange(newOpen);
  };

  // Calcular estatísticas discretas
  const qtdEdicoes = card.versao - 1;
  const temEvolucao = qtdEdicoes > 0;

  // Formatar tipo de mudança
  const formatTipoMudanca = (tipo: string) => {
    switch (tipo) {
      case "criacao": return "criado";
      case "edicao": return "editado";
      case "movimentacao": return "movido";
      default: return tipo;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Detalhes da anotação</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Área de edição principal */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escreva sua ideia..."
            className={cn(
              "w-full min-h-[200px] bg-transparent border border-border/30 rounded-lg p-4",
              "resize-none outline-none focus:ring-1 focus:ring-primary/30",
              "text-sm text-foreground/90 leading-relaxed",
              "placeholder:text-muted-foreground/40"
            )}
            autoFocus
          />

          {/* Info discreta */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground/60 px-1">
            <div className="flex items-center gap-2">
              {temEvolucao && (
                <span>
                  editado {qtdEdicoes}x · evoluiu
                </span>
              )}
              {!temEvolucao && (
                <span>
                  criado {formatDistanceToNow(new Date(card.created_at), { 
                    addSuffix: true, 
                    locale: ptBR 
                  })}
                </span>
              )}
            </div>

            {temEvolucao && (
              <button
                onClick={loadHistorico}
                disabled={loadingHistorico}
                className="flex items-center gap-1 hover:text-muted-foreground transition-colors"
              >
                <History className="h-3 w-3" />
                <span>{showHistorico ? "ocultar" : "ver histórico"}</span>
              </button>
            )}
          </div>

          {/* Histórico (opcional) */}
          {showHistorico && historico.length > 0 && (
            <div className="border-t border-border/30 pt-3 mt-2">
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {historico.map((h) => (
                  <div 
                    key={h.id}
                    className="flex items-center justify-between text-[10px] text-muted-foreground/50 px-1"
                  >
                    <span>v{h.versao} · {formatTipoMudanca(h.tipo_mudanca)}</span>
                    <span>
                      {formatDistanceToNow(new Date(h.created_at), { 
                        addSuffix: true, 
                        locale: ptBR 
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
