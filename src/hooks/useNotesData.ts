import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceGuard } from "@/hooks/useWorkspaceGuard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FluxoCard as FluxoCardType } from "@/components/anotacoes/types";

// Colunas padrão criadas automaticamente
const DEFAULT_COLUMNS = [
  { nome: "Geral", ordem: 0 },
  { nome: "Ideias", ordem: 1 },
  { nome: "Em andamento", ordem: 2 },
  { nome: "Finalizado", ordem: 3 },
];

export function useNotesData() {
  const { user } = useAuth();
  const { workspaceId, canOperate } = useWorkspaceGuard();
  
  const [colunas, setColunas] = useState<{ id: string; nome: string; ordem: number }[]>([]);
  const [cards, setCards] = useState<FluxoCardType[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user?.id || !workspaceId) return;

    try {
      setLoading(true);

      const { data: colunasData, error: colunasError } = await supabase
        .from("fluxo_colunas")
        .select("*")
        .eq("user_id", user.id)
        .eq("workspace_id", workspaceId)
        .order("ordem");

      if (colunasError) throw colunasError;

      if (!colunasData || colunasData.length === 0) {
        // Criar colunas padrão
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
        loadData();
        return;
      }

      setColunas(colunasData);

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
    } finally {
      setLoading(false);
    }
  }, [user?.id, workspaceId]);

  const handleCreateCard = async (colunaId: string, conteudo: string) => {
    if (!user?.id || !workspaceId) return null;

    try {
      const cardsNaColuna = cards.filter(c => c.coluna_id === colunaId);
      const maxOrdem = cardsNaColuna.reduce((max, c) => Math.max(max, c.ordem), -1);

      const newCard = {
        user_id: user.id,
        workspace_id: workspaceId,
        coluna_id: colunaId,
        conteudo: conteudo,
        ordem: maxOrdem + 1,
        versao: 1,
      };

      const { data, error } = await supabase
        .from("fluxo_cards")
        .insert(newCard)
        .select()
        .single();

      if (error) throw error;

      await supabase.from("fluxo_cards_historico").insert({
        card_id: data.id,
        user_id: user.id,
        workspace_id: workspaceId,
        conteudo: conteudo,
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
        .eq("user_id", user.id);

      if (error) throw error;

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
    }
  };

  const handleMoveCard = async (cardId: string, novaColunaId: string) => {
    if (!user?.id || !workspaceId) return;

    try {
      const card = cards.find(c => c.id === cardId);
      if (!card) return;

      // Calcular nova ordem (no final da coluna)
      const cardsNaColuna = cards.filter(c => c.coluna_id === novaColunaId);
      const maxOrdem = cardsNaColuna.reduce((max, c) => Math.max(max, c.ordem), -1);
      const novaOrdem = maxOrdem + 1;

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

      if (card.coluna_id !== novaColunaId) {
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

  useEffect(() => {
    if (canOperate) {
      loadData();
    }
  }, [canOperate, loadData]);

  return {
    colunas,
    cards,
    loading,
    handleCreateCard,
    handleUpdateCard,
    handleMoveCard,
    handleDeleteCard,
    canOperate
  };
}