import { useCallback, useState } from "react";
import { NovaEntradaDialog, type ApostaParaEditar } from "@/components/projeto-detalhe/NovaEntradaDialog";

/**
 * Hook compartilhado para padronizar a edição de apostas registradas pelo
 * novo formulário "Nova Entrada". Quando `is_novo_formulario === true`,
 * a edição abre o NovaEntradaDialog inline (pré-preenchido) em vez do
 * formulário legado em janela externa.
 *
 * Uso:
 *   const { tryOpenEdit, dialog } = useNovaEntradaEdit({
 *     projetoId,
 *     estrategia: "DUPLO_GREEN",
 *     onUpdated: fetchData,
 *   });
 *
 *   // No handler de abertura:
 *   if (tryOpenEdit(aposta)) return;       // tratado pelo novo formulário
 *   // ... senão, fluxo legado (window.open)
 *
 *   // No JSX:
 *   {dialog}
 */
export interface AnyApostaLike {
  id: string;
  is_novo_formulario?: boolean | null;
  status?: string | null;
  evento?: string | null;
  esporte?: string | null;
  liga?: string | null;
  data_aposta?: string | null;
  bookmaker_id?: string | null;
  moeda_operacao?: string | null;
  odd?: number | null;
  stake?: number | null;
  fonte_entrada?: string | null;
  modelo_aposta?: string | null;
  fair_value?: number | null;
  mercado_categoria?: string | null;
  mercado_objeto?: string | null;
  mercado_formato?: string | null;
  mercado_direcao?: string | null;
  mercado_linha?: number | null;
  mercado_display?: string | null;
  time_casa?: string | null;
  time_fora?: string | null;
}

interface UseNovaEntradaEditOptions {
  projetoId: string;
  /** Estratégia da aba que está consumindo o hook (DUPLO_GREEN, VALUEBET, PUNTER, FREEBET...). */
  estrategia: string;
  /** Callback chamado após o salvamento bem-sucedido. */
  onUpdated?: () => void;
}

export function useNovaEntradaEdit({ projetoId, estrategia, onUpdated }: UseNovaEntradaEditOptions) {
  const [editing, setEditing] = useState<ApostaParaEditar | null>(null);
  const [open, setOpen] = useState(false);

  const tryOpenEdit = useCallback((aposta: AnyApostaLike | null | undefined): boolean => {
    if (!aposta?.is_novo_formulario || !aposta.id) return false;
    setEditing({
      id: aposta.id,
      status: aposta.status ?? null,
      evento: aposta.evento ?? "",
      esporte: aposta.esporte ?? "",
      liga: aposta.liga ?? null,
      data_aposta: aposta.data_aposta ?? new Date().toISOString(),
      bookmaker_id: aposta.bookmaker_id ?? "",
      moeda_operacao: aposta.moeda_operacao ?? "BRL",
      odd: aposta.odd ?? 0,
      stake: aposta.stake ?? 0,
      fonte_entrada: aposta.fonte_entrada ?? null,
      modelo_aposta: aposta.modelo_aposta ?? null,
      fair_value: aposta.fair_value ?? null,
      mercado_categoria: aposta.mercado_categoria ?? null,
      mercado_objeto: aposta.mercado_objeto ?? null,
      mercado_formato: aposta.mercado_formato ?? null,
      mercado_direcao: aposta.mercado_direcao ?? null,
      mercado_linha: aposta.mercado_linha ?? null,
      mercado_display: aposta.mercado_display ?? null,
      time_casa: aposta.time_casa ?? null,
      time_fora: aposta.time_fora ?? null,
    });
    setOpen(true);
    return true;
  }, []);

  const dialog = editing ? (
    <NovaEntradaDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setEditing(null);
      }}
      projetoId={projetoId}
      estrategia={estrategia as any}
      apostaParaEditar={editing}
      onCreated={onUpdated}
    />
  ) : null;

  return { tryOpenEdit, dialog };
}