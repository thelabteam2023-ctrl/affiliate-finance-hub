import { supabase } from "@/integrations/supabase/client";

/** Normaliza nome de banco para comparação entre workspaces. */
export function canonicalBankName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(s\.?a\.?|s\/a|ltda|me|epp|banco)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function canonicalBankCode(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits ? String(Number(digits)) : "";
}

export interface BancoRow {
  id: string;
  nome: string;
  codigo: string | null;
  is_system: boolean | null;
  workspace_id: string | null;
}

export interface BankResolutionInput {
  banco: string;
  banco_codigo?: string | null;
}

export interface BankResolution {
  bancoId: string | null;
  bancoNome: string;
  created: boolean;
  reason: "codigo_sistema" | "nome_sistema" | "workspace" | "criado" | "nao_reconciliado";
}

/**
 * Resolve o banco no workspace de destino:
 * 1) banco de sistema por código
 * 2) banco de sistema por nome normalizado
 * 3) banco do próprio workspace por código/nome
 * 4) cria banco do workspace
 */
export function matchBanco(
  bancos: BancoRow[],
  input: BankResolutionInput,
  workspaceId: string,
): { row: BancoRow; reason: BankResolution["reason"] } | null {
  const code = canonicalBankCode(input.banco_codigo);
  const name = canonicalBankName(input.banco);

  const system = bancos.filter((b) => b.is_system === true);
  if (code) {
    const hit = system.find((b) => canonicalBankCode(b.codigo) === code);
    if (hit) return { row: hit, reason: "codigo_sistema" };
  }
  if (name) {
    const hit = system.find((b) => canonicalBankName(b.nome) === name);
    if (hit) return { row: hit, reason: "nome_sistema" };
  }

  const own = bancos.filter((b) => b.is_system !== true && b.workspace_id === workspaceId);
  const hitOwn =
    (code ? own.find((b) => canonicalBankCode(b.codigo) === code) : undefined) ??
    (name ? own.find((b) => canonicalBankName(b.nome) === name) : undefined);
  if (hitOwn) return { row: hitOwn, reason: "workspace" };

  return null;
}

/** Carrega os bancos visíveis (sistema + do workspace). */
export async function fetchBancosVisiveis(workspaceId: string): Promise<BancoRow[]> {
  const { data } = await supabase
    .from("bancos")
    .select("id, nome, codigo, is_system, workspace_id")
    .or(`is_system.eq.true,workspace_id.eq.${workspaceId}`);
  return ((data ?? []) as any[]).map((b) => ({
    id: b.id,
    nome: b.nome,
    codigo: b.codigo ?? null,
    is_system: b.is_system ?? false,
    workspace_id: b.workspace_id ?? null,
  }));
}

/**
 * Resolve (e se necessário cria) o banco no workspace de destino.
 * Nunca lança: quando não consegue reconciliar, devolve bancoId=null e a conta
 * ainda é importada com o nome preservado.
 */
export async function resolveOrCreateBanco(
  cache: BancoRow[],
  input: BankResolutionInput,
  workspaceId: string,
  userId: string | null,
): Promise<BankResolution> {
  const matched = matchBanco(cache, input, workspaceId);
  if (matched) {
    return {
      bancoId: matched.row.id,
      bancoNome: matched.row.nome,
      created: false,
      reason: matched.reason,
    };
  }

  const nome = (input.banco ?? "").trim();
  if (!nome || !userId) {
    return { bancoId: null, bancoNome: nome, created: false, reason: "nao_reconciliado" };
  }

  const { data, error } = await supabase
    .from("bancos")
    .insert({
      nome,
      codigo: canonicalBankCode(input.banco_codigo) || "000",
      is_system: false,
      workspace_id: workspaceId,
      user_id: userId,
    } as any)
    .select("id, nome, codigo, is_system, workspace_id")
    .single();

  if (error || !data) {
    return { bancoId: null, bancoNome: nome, created: false, reason: "nao_reconciliado" };
  }

  const row: BancoRow = {
    id: (data as any).id,
    nome: (data as any).nome,
    codigo: (data as any).codigo ?? null,
    is_system: false,
    workspace_id: workspaceId,
  };
  cache.push(row);

  return { bancoId: row.id, bancoNome: row.nome, created: true, reason: "criado" };
}
