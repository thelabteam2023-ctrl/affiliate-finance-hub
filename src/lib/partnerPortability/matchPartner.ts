import { supabase } from "@/integrations/supabase/client";
import type { ExportEnvelope } from "./schema";

export type MatchStrength = "cpf" | "email" | "telefone" | "nome" | null;

export interface PartnerMatch {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  strength: Exclude<MatchStrength, null>;
}

function normalizeDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Procura, no workspace DESTINO, um parceiro que possa ser a mesma pessoa.
 * Ordem: CPF (forte) > e-mail > telefone > nome exato (fraco, apenas sugestão).
 */
export async function findPartnerMatch(
  envelope: ExportEnvelope,
  workspaceId: string,
): Promise<PartnerMatch | null> {
  const { data, error } = await supabase
    .from("parceiros")
    .select("id, nome, cpf, email, telefone")
    .eq("workspace_id", workspaceId)
    .eq("is_caixa_operacional", false)
    .limit(10000);

  if (error) throw error;

  const rows = (data ?? []) as any[];
  const cpf = normalizeDigits(envelope.partner.cpf);
  const email = (envelope.partner.email ?? "").trim().toLowerCase();
  const phone = normalizeDigits(envelope.partner.telefone);
  const nome = envelope.partner.nome.trim().toLowerCase();

  const byCpf = cpf ? rows.find((r) => normalizeDigits(r.cpf) === cpf) : undefined;
  if (byCpf) return { ...byCpf, strength: "cpf" };

  const byEmail = email
    ? rows.find((r) => (r.email ?? "").trim().toLowerCase() === email)
    : undefined;
  if (byEmail) return { ...byEmail, strength: "email" };

  const byPhone = phone ? rows.find((r) => normalizeDigits(r.telefone) === phone) : undefined;
  if (byPhone) return { ...byPhone, strength: "telefone" };

  const byName = rows.find((r) => (r.nome ?? "").trim().toLowerCase() === nome);
  if (byName) return { ...byName, strength: "nome" };

  return null;
}

export const MATCH_LABEL: Record<Exclude<MatchStrength, null>, string> = {
  cpf: "mesmo CPF",
  email: "mesmo e-mail",
  telefone: "mesmo telefone",
  nome: "mesmo nome",
};
