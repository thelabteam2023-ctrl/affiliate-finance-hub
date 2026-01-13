import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceGuard } from "@/hooks/useWorkspaceGuard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { FluxoColuna } from "./FluxoColuna";
import { FluxoCard as FluxoCardType } from "./types";

// Colunas padrão criadas automaticamente
const DEFAULT_COLUMNS = [
  { nome: "Ideias", ordem: 0 },
  { nome: "Em andamento", ordem: 1 },
  { nome: "Finalizado", ordem: 2 },
];

interface Coluna {
  id: string;
  nome: string;
  ordem: number;
}

/**
 * Aba Fluxo - Kanban pessoal minimalista
 * 
 * Cada usuário possui suas próprias colunas e cards.
 * Drag & drop entre colunas, autosave, histórico de versões.
 */
export function FluxoTab() {
  const { user } = useAuth();
  const { workspaceId, canOperate } = useWorkspaceGuard();
  
  const [colunas, setColunas] = useState<Coluna[]>([]);
  const [cards, setCards] = useState<FluxoCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);

  // Carregar dados
  const loadData = useCallback(async () => {
    if (!user?.id || !workspaceId) return;

    try {
      setLoading(true);

      // Buscar colunas do usuário
      const { data: colunasData, error: colunasError } = await supabase
        .from("fluxo_colunas")
        .select("*")
        .eq("user_id", user.id)
        .eq("workspace_id", workspaceId)
        .order("ordem");

      if (colunasError) throw colunasError;

      // Se não há colunas, criar as padrão
      if (!colunasData || colunasData.length === 0) {
        await createDefaultColumns();
        return; // loadData será chamado novamente após criar
      }

      setColunas(colunasData);

      // Buscar cards
      const { data: cardsData, error: cardsError } = await supabase
        .from("fluxo_cards")
        .select("*")
        .eq("user_id", user.id)
        .eq("workspace_id", workspaceId)
        .order("ordem");

      if (cardsError) throw cardsError;
      setCards(cardsData || []);

    } catch (error) {
      console.error("Erro ao carregar fluxo:", error);
      toast.error("Erro ao carregar anotações");
    } finally {
      setLoading(false);
    }
  }, [user?.id, workspaceId]);

  // Criar colunas padrão
  const createDefaultColumns = async () => {
    if (!user?.id || !workspaceId) return;

    try {
      const colunasToInsert = DEFAULT_COLUMNS.map(col => ({
        user_id: user.id,
        workspace_id: workspaceId,
        nome: col.nome,
        ordem: col.ordem,
      }));

      const { error } = await supabase
        .from("fluxo_colunas")
        .insert(colunasToInsert);

      if (error) throw error;

      // Recarregar após criar
      loadData();
    } catch (error) {
      console.error("Erro ao criar colunas padrão:", error);
      toast.error("Erro ao inicializar fluxo");
    }
  };

  // Criar novo card
  const handleCreateCard = async (colunaId: string) => {
    if (!user?.id || !workspaceId) return null;

    try {
      // Encontrar a maior ordem na coluna
      const cardsNaColuna = cards.filter(c => c.coluna_id === colunaId);
      const maxOrdem = cardsNaColuna.reduce((max, c) => Math.max(max, c.ordem), -1);

      const newCard = {
        user_id: user.id,
        workspace_id: workspaceId,
        coluna_id: colunaId,
        conteudo: "",
        ordem: maxOrdem + 1,
        versao: 1,
      };

      const { data, error } = await supabase
        .from("fluxo_cards")
        .insert(newCard)
        .select()
        .single();

      if (error) throw error;

      // Registrar no histórico
      await supabase.from("fluxo_cards_historico").insert({
        card_id: data.id,
        user_id: user.id,
        workspace_id: workspaceId,
        conteudo: "",
        coluna_id: colunaId,
        versao: 1,
        tipo_mudanca: "criacao",
      });

      setCards(prev => [...prev, data]);
      return data.id;

    } catch (error) {
      console.error("Erro ao criar card:", error);
      toast.error("Erro ao criar anotação");
      return null;
    }
  };

  // Atualizar conteúdo do card (autosave)
  const handleUpdateCard = async (cardId: string, conteudo: string) => {
    if (!user?.id || !workspaceId) return;

    try {
      const card = cards.find(c => c.id === cardId);
      if (!card) return;

      const novaVersao = card.versao + 1;

      const { error } = await supabase
        .from("fluxo_cards")
        .update({ 
          conteudo, 
          versao: novaVersao,
          updated_at: new Date().toISOString()
        })
        .eq("id", cardId)
        .eq("user_id", user.id); // Garantir que é do usuário

      if (error) throw error;

      // Registrar no histórico
      await supabase.from("fluxo_cards_historico").insert({
        card_id: cardId,
        user_id: user.id,
        workspace_id: workspaceId,
        conteudo,
        coluna_id: card.coluna_id,
        versao: novaVersao,
        tipo_mudanca: "edicao",
      });

      setCards(prev => prev.map(c => 
        c.id === cardId 
          ? { ...c, conteudo, versao: novaVersao, updated_at: new Date().toISOString() }
          : c
      ));

    } catch (error) {
      console.error("Erro ao atualizar card:", error);
      // Não mostrar toast para autosave para não poluir
    }
  };

  // Mover card para outra coluna
  const handleMoveCard = async (cardId: string, novaColunaId: string, novaOrdem: number) => {
    if (!user?.id || !workspaceId) return;

    try {
      const card = cards.find(c => c.id === cardId);
      if (!card) return;

      const colunaAnterior = card.coluna_id;
      const mudouColuna = colunaAnterior !== novaColunaId;

      const { error } = await supabase
        .from("fluxo_cards")
        .update({ 
          coluna_id: novaColunaId, 
          ordem: novaOrdem,
          updated_at: new Date().toISOString()
        })
        .eq("id", cardId)
        .eq("user_id", user.id);

      if (error) throw error;

      // Registrar movimentação no histórico apenas se mudou de coluna
      if (mudouColuna) {
        await supabase.from("fluxo_cards_historico").insert({
          card_id: cardId,
          user_id: user.id,
          workspace_id: workspaceId,
          conteudo: card.conteudo,
          coluna_id: novaColunaId,
          versao: card.versao,
          tipo_mudanca: "movimentacao",
        });
      }

      setCards(prev => prev.map(c => 
        c.id === cardId 
          ? { ...c, coluna_id: novaColunaId, ordem: novaOrdem }
          : c
      ));

    } catch (error) {
      console.error("Erro ao mover card:", error);
      toast.error("Erro ao mover anotação");
    }
  };

  // Deletar card
  const handleDeleteCard = async (cardId: string) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from("fluxo_cards")
        .delete()
        .eq("id", cardId)
        .eq("user_id", user.id);

      if (error) throw error;

      setCards(prev => prev.filter(c => c.id !== cardId));

    } catch (error) {
      console.error("Erro ao deletar card:", error);
      toast.error("Erro ao deletar anotação");
    }
  };

  // Carregar ao montar
  useEffect(() => {
    if (canOperate) {
      loadData();
    }
  }, [canOperate, loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canOperate) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Selecione um workspace para continuar.
      </div>
    );
  }

  return (
    <div className="h-full overflow-x-auto px-6 pb-6">
      <div className="flex gap-4 h-full min-w-max">
        {colunas.map(coluna => (
          <FluxoColuna
            key={coluna.id}
            coluna={coluna}
            cards={cards.filter(c => c.coluna_id === coluna.id)}
            onCreateCard={handleCreateCard}
            onUpdateCard={handleUpdateCard}
            onMoveCard={handleMoveCard}
            onDeleteCard={handleDeleteCard}
            draggingCardId={draggingCardId}
            setDraggingCardId={setDraggingCardId}
          />
        ))}
      </div>
    </div>
  );
}
