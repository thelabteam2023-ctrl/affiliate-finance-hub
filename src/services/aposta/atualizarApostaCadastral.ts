import { supabase } from "@/integrations/supabase/client";

/**
 * Campos SEM efeito financeiro de uma aposta.
 *
 * Este é o único caminho autorizado para gravar alterações cadastrais
 * (data/hora do evento, times, mercado, observações...) em uma aposta —
 * inclusive quando ela já está LIQUIDADA.
 *
 * Por que existe:
 * - Não toca em `status`, `resultado`, `stake*`, `odd*`, `bookmaker_id`,
 *   `fonte_saldo` nem `usar_freebet`, portanto NÃO dispara o gatilho
 *   `tg_sync_aposta_simples_resultado_financeiro` nem reemite eventos no ledger.
 * - Falha alto: erro do banco vira exceção, nunca `console.warn` silencioso.
 */
export interface ApostaCadastralInput {
  data_aposta?: string | null;
  evento?: string | null;
  esporte?: string | null;
  mercado?: string | null;
  selecao?: string | null;
  observacoes?: string | null;
  estrategia?: string | null;
  contexto_operacional?: string | null;
  fonte_entrada?: string | null;
}

export const CAMPOS_CADASTRAIS: (keyof ApostaCadastralInput)[] = [
  "data_aposta",
  "evento",
  "esporte",
  "mercado",
  "selecao",
  "observacoes",
  "estrategia",
  "contexto_operacional",
  "fonte_entrada",
];

/** Extrai apenas os campos cadastrais de um payload maior. */
export function pickCamposCadastrais(payload: Record<string, any>): ApostaCadastralInput {
  const out: Record<string, any> = {};
  for (const key of CAMPOS_CADASTRAIS) {
    if (key in payload && payload[key] !== undefined) out[key] = payload[key];
  }
  return out as ApostaCadastralInput;
}

/** Compara campos cadastrais entre a aposta persistida e o novo payload. */
export function houveMudancaCadastral(
  apostaAtual: Record<string, any> | null | undefined,
  novo: ApostaCadastralInput,
): boolean {
  if (!apostaAtual) return true;
  return CAMPOS_CADASTRAIS.some((key) => {
    if (!(key in novo)) return false;
    const antes = apostaAtual[key] ?? null;
    const depois = (novo as any)[key] ?? null;
    if (key === "data_aposta") {
      const a = antes ? new Date(antes).getTime() : null;
      const b = depois ? new Date(depois).getTime() : null;
      return a !== b;
    }
    return String(antes) !== String(depois);
  });
}

/**
 * Grava os campos cadastrais da aposta. Lança em caso de erro.
 */
export async function atualizarApostaCadastral(
  apostaId: string,
  input: ApostaCadastralInput,
): Promise<void> {
  const payload = pickCamposCadastrais(input as Record<string, any>);
  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase
    .from("apostas_unificada")
    .update(payload as any)
    .eq("id", apostaId);

  if (error) {
    throw new Error(`Falha ao salvar dados cadastrais da aposta: ${error.message}`);
  }
}
