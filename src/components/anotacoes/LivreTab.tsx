import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceGuard } from "@/hooks/useWorkspaceGuard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Send, Trash2, Image as ImageIcon } from "lucide-react";
import { AnotacaoLivre } from "./types";
import { cn } from "@/lib/utils";
import { useImageUpload } from "@/hooks/useImageUpload";

/**
 * Aba Livre - Espaço de escrita simples, silencioso e fluido
 */
export function LivreTab() {
  const { user } = useAuth();
  const { workspaceId, canOperate } = useWorkspaceGuard();

  const [anotacoes, setAnotacoes] = useState<AnotacaoLivre[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const saveTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Carregar anotações
  const loadData = useCallback(async () => {
    if (!user?.id || !workspaceId) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("anotacoes_livres")
        .select("*")
        .eq("user_id", user.id)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        await createNewNote();
        return;
      }

      setAnotacoes(data);
    } catch (error) {
      console.error("Erro ao carregar anotações:", error);
      toast.error("Erro ao carregar anotações");
    } finally {
      setLoading(false);
    }
  }, [user?.id, workspaceId]);

  // Criar nova anotação
  const createNewNote = async () => {
    if (!user?.id || !workspaceId) return null;

    try {
      const { data, error } = await supabase
        .from("anotacoes_livres")
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          conteudo: "",
        })
        .select()
        .single();

      if (error) throw error;

      setAnotacoes((prev) => [data, ...prev]);

      setTimeout(() => {
        const ref = textareaRefs.current.get(data.id);
        if (ref) ref.focus();
      }, 100);

      return data.id;
    } catch (error) {
      console.error("Erro ao criar anotação:", error);
      toast.error("Erro ao criar anotação");
      return null;
    }
  };

  // Atualizar anotação (autosave com debounce)
  const handleContentChange = (id: string, conteudo: string) => {
    setAnotacoes((prev) =>
      prev.map((a) => (a.id === id ? { ...a, conteudo } : a))
    );

    const existingTimeout = saveTimeouts.current.get(id);
    if (existingTimeout) clearTimeout(existingTimeout);

    const timeout = setTimeout(() => saveNote(id, conteudo), 800);
    saveTimeouts.current.set(id, timeout);
  };

  // Salvar anotação no banco
  const saveNote = async (id: string, conteudo: string) => {
    if (!user?.id) return;

    try {
      setSavingId(id);

      const { error } = await supabase
        .from("anotacoes_livres")
        .update({ conteudo })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    } catch (error) {
      console.error("Erro ao salvar:", error);
    } finally {
      setSavingId(null);
    }
  };

  // Enviar para o Fluxo (coluna Ideias)
  const handleSendToFluxo = async (anotacao: AnotacaoLivre) => {
    if (!user?.id || !workspaceId || !anotacao.conteudo.trim()) return;

    try {
      const { data: colunas, error: colunasError } = await supabase
        .from("fluxo_colunas")
        .select("id")
        .eq("user_id", user.id)
        .eq("workspace_id", workspaceId)
        .eq("nome", "Ideias")
        .single();

      if (colunasError) throw colunasError;

      const { data: cards } = await supabase
        .from("fluxo_cards")
        .select("ordem")
        .eq("coluna_id", colunas.id)
        .order("ordem", { ascending: false })
        .limit(1);

      const maxOrdem = cards && cards.length > 0 ? cards[0].ordem : -1;

      const { data: newCard, error: cardError } = await supabase
        .from("fluxo_cards")
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          coluna_id: colunas.id,
          conteudo: anotacao.conteudo,
          ordem: maxOrdem + 1,
          versao: 1,
        })
        .select()
        .single();

      if (cardError) throw cardError;

      await supabase.from("fluxo_cards_historico").insert({
        card_id: newCard.id,
        user_id: user.id,
        workspace_id: workspaceId,
        conteudo: anotacao.conteudo,
        coluna_id: colunas.id,
        versao: 1,
        tipo_mudanca: "criacao",
      });

      toast.success("Enviado para o Fluxo");

      setAnotacoes((prev) =>
        prev.map((a) => (a.id === anotacao.id ? { ...a, conteudo: "" } : a))
      );

      await supabase
        .from("anotacoes_livres")
        .update({ conteudo: "" })
        .eq("id", anotacao.id)
        .eq("user_id", user.id);
    } catch (error) {
      console.error("Erro ao enviar para fluxo:", error);
      toast.error("Erro ao enviar para o Fluxo");
    }
  };

  // Excluir anotação - CORRIGIDO
  const handleDeleteNote = async (id: string) => {
    if (!user?.id || deletingId) return;

    // Confirmação implícita - se é a última, não excluir
    const anotacoesAtuais = anotacoes.filter((a) => a.id !== id);

    try {
      setDeletingId(id);

      const { error } = await supabase
        .from("anotacoes_livres")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("Erro SQL ao excluir:", error);
        throw error;
      }

      // Atualizar estado local
      setAnotacoes(anotacoesAtuais);

      // Se não sobrou nenhuma, criar uma nova
      if (anotacoesAtuais.length === 0) {
        await createNewNote();
      }

      toast.success("Anotação excluída");
    } catch (error) {
      console.error("Erro ao excluir:", error);
      toast.error("Erro ao excluir anotação");
    } finally {
      setDeletingId(null);
    }
  };

  // Auto-resize textarea
  const autoResize = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  // Limpar timeouts ao desmontar
  useEffect(() => {
    return () => {
      saveTimeouts.current.forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

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
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Nova anotação */}
        <button
          onClick={createNewNote}
          className={cn(
            "w-full py-4 px-6 rounded-xl border border-dashed border-border/40",
            "text-sm text-muted-foreground/50 hover:text-muted-foreground",
            "hover:border-border/60 hover:bg-muted/10",
            "transition-all duration-200"
          )}
        >
          + nova anotação
        </button>

        {/* Lista de anotações */}
        {anotacoes.map((anotacao) => (
          <AnotacaoLivreCard
            key={anotacao.id}
            anotacao={anotacao}
            userId={user?.id || ""}
            isSaving={savingId === anotacao.id}
            isDeleting={deletingId === anotacao.id}
            onContentChange={handleContentChange}
            onDelete={handleDeleteNote}
            onSendToFluxo={handleSendToFluxo}
            textareaRef={(el) => {
              if (el) textareaRefs.current.set(anotacao.id, el);
            }}
            autoResize={autoResize}
          />
        ))}

        <div className="h-32" />
      </div>
    </div>
  );
}

// Componente isolado para cada anotação livre
interface AnotacaoLivreCardProps {
  anotacao: AnotacaoLivre;
  userId: string;
  isSaving: boolean;
  isDeleting: boolean;
  onContentChange: (id: string, conteudo: string) => void;
  onDelete: (id: string) => void;
  onSendToFluxo: (anotacao: AnotacaoLivre) => void;
  textareaRef: (el: HTMLTextAreaElement | null) => void;
  autoResize: (textarea: HTMLTextAreaElement) => void;
}

function AnotacaoLivreCard({
  anotacao,
  userId,
  isSaving,
  isDeleting,
  onContentChange,
  onDelete,
  onSendToFluxo,
  textareaRef,
  autoResize,
}: AnotacaoLivreCardProps) {
  const textareaLocalRef = useRef<HTMLTextAreaElement | null>(null);

  // Hook de upload de imagem
  const { isUploading, handlePaste, handleDrop, handleDragOver } = useImageUpload({
    userId,
    onImageUploaded: (imageUrl) => {
      const textarea = textareaLocalRef.current;
      const currentContent = anotacao.conteudo || "";
      const start = textarea?.selectionStart ?? currentContent.length;
      const end = textarea?.selectionEnd ?? currentContent.length;
      const newContent =
        currentContent.slice(0, start) +
        `![imagem](${imageUrl})` +
        currentContent.slice(end);
      onContentChange(anotacao.id, newContent);
    },
  });

  const handleTextareaRef = (el: HTMLTextAreaElement | null) => {
    textareaLocalRef.current = el;
    textareaRef(el);
  };

  return (
    <div
      className={cn(
        "relative group rounded-xl",
        "bg-muted/10 border border-border/20",
        "focus-within:border-border/40 focus-within:bg-muted/20",
        "transition-all duration-200",
        isDeleting && "opacity-50 pointer-events-none"
      )}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Botão excluir */}
      <button
        onClick={() => onDelete(anotacao.id)}
        disabled={isDeleting}
        className={cn(
          "absolute top-3 right-3 p-1.5 rounded-lg z-10",
          "text-muted-foreground/40 hover:text-destructive",
          "hover:bg-destructive/10 transition-colors",
          "opacity-0 group-hover:opacity-100"
        )}
        title="Excluir anotação"
      >
        {isDeleting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Textarea */}
      <div className="relative">
        <textarea
          ref={handleTextareaRef}
          value={anotacao.conteudo}
          onChange={(e) => {
            onContentChange(anotacao.id, e.target.value);
            autoResize(e.target);
          }}
          onFocus={(e) => autoResize(e.target)}
          onPaste={handlePaste}
          placeholder="Comece a escrever... (cole ou arraste imagens)"
          className={cn(
            "w-full min-h-[120px] p-6 bg-transparent resize-none",
            "text-lg leading-relaxed text-foreground/90",
            "placeholder:text-muted-foreground/30",
            "focus:outline-none",
            "font-light tracking-wide"
          )}
          style={{ overflow: "hidden" }}
        />
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-xl">
            <div className="flex items-center gap-2 text-primary">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Enviando imagem...</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 pb-4">
        <div className="flex items-center gap-3">
          {isSaving && (
            <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              salvando...
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/30 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <ImageIcon className="h-2.5 w-2.5" />
            Cole ou arraste imagens
          </span>
        </div>

        {anotacao.conteudo.trim() && (
          <button
            onClick={() => onSendToFluxo(anotacao)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
              "text-xs text-muted-foreground/60 hover:text-muted-foreground",
              "hover:bg-muted/30 transition-colors",
              "opacity-0 group-hover:opacity-100"
            )}
          >
            <Send className="h-3 w-3" />
            <span>enviar para Fluxo</span>
          </button>
        )}
      </div>
    </div>
  );
}
