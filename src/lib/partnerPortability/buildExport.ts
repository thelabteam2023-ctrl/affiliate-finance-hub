import { supabase } from "@/integrations/supabase/client";
import { decryptPassword } from "@/utils/cryptoPassword";
import { sealSecurePayload } from "./secureBlob";
import {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  stableExtId,
  type Categories,
  type ExportBanking,
  type ExportBookmaker,
  type ExportBundle,
  type ExportCrypto,
  type ExportEnvelope,
  type SecurePayload,
} from "./schema";

export interface PartnerExportSource {
  parceiroId: string;
  workspaceId: string;
}

type PlainCredential = SecurePayload["credentials"][number];

/** Limites práticos de lote (ver documento de portabilidade). */
export const BATCH_LIMIT_PLAIN = 200;
export const BATCH_LIMIT_WITH_CREDENTIALS = 50;

/**
 * Monta o pacote de exportação lendo APENAS dados cadastrais.
 * Nenhum saldo, projeto, ciclo, aposta ou lançamento financeiro é lido.
 */
async function buildOnePartner(
  { parceiroId, workspaceId }: PartnerExportSource,
  categories: Categories,
  wantsCredentials: boolean,
): Promise<{ envelope: ExportEnvelope; credentials: PlainCredential[] }> {

  const { data: parceiro, error: parceiroError } = await supabase
    .from("parceiros")
    .select(
      "id, nome, cpf, email, telefone, data_nascimento, endereco, cidade, cep, observacoes, documentacao_url, qualidade, status",
    )
    .eq("id", parceiroId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (parceiroError) throw parceiroError;
  if (!parceiro) throw new Error("Parceiro não encontrado neste workspace.");

  const wantsBanking = categories.banking;
  const wantsCrypto = categories.crypto;
  const wantsBookmakers = categories.bookmakers;

  const [contasRes, walletsRes, bookmakersRes] = await Promise.all([
    wantsBanking
      ? supabase
          .from("contas_bancarias")
          .select("banco, agencia, conta, tipo_conta, titular, moeda, pix_key, pix_keys, observacoes")
          .eq("parceiro_id", parceiroId)
      : Promise.resolve({ data: [], error: null } as const),
    wantsCrypto
      ? supabase
          .from("wallets_crypto")
          .select("label, exchange, network, endereco, moeda")
          .eq("parceiro_id", parceiroId)
      : Promise.resolve({ data: [], error: null } as const),
    wantsBookmakers
      ? supabase
          .from("bookmakers")
          .select(
            "id, nome, url, moeda, login_username, login_password_encrypted, instance_identifier, observacoes, bookmakers_catalogo(nome)",
          )
          .eq("parceiro_id", parceiroId)
          .eq("workspace_id", workspaceId)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  if (contasRes.error) throw contasRes.error;
  if (walletsRes.error) throw walletsRes.error;
  if (bookmakersRes.error) throw bookmakersRes.error;

  const cpfKey = parceiro.cpf ?? parceiro.nome;

  const banking: ExportBanking[] = await Promise.all(
    ((contasRes.data ?? []) as any[]).map(async (c) => ({
      ext_id: await stableExtId([cpfKey, "bank", c.banco, c.agencia, c.conta, c.moeda]),
      banco: c.banco,
      agencia: c.agencia ?? null,
      conta: c.conta ?? null,
      tipo_conta: (c.tipo_conta ?? "corrente") as ExportBanking["tipo_conta"],
      titular: c.titular ?? "",
      moeda: c.moeda ?? "BRL",
      pix_key: c.pix_key ?? null,
      pix_keys: c.pix_keys ?? null,
      observacoes: c.observacoes ?? null,
    })),
  );

  const cryptoWallets: ExportCrypto[] = await Promise.all(
    ((walletsRes.data ?? []) as any[]).map(async (w) => ({
      ext_id: await stableExtId([cpfKey, "wallet", w.endereco, w.network]),
      label: w.label ?? null,
      exchange: w.exchange ?? null,
      network: w.network,
      endereco: w.endereco,
      moeda: Array.isArray(w.moeda) ? w.moeda : [],
    })),
  );

  const rawBookmakers = (bookmakersRes.data ?? []) as any[];
  const includeCredentials = wantsBookmakers && categories.credentials && !!credentialsPassphrase;

  const bookmakers: ExportBookmaker[] = await Promise.all(
    rawBookmakers.map(async (b) => ({
      ext_id: await stableExtId([cpfKey, "bookmaker", b.nome, b.instance_identifier, b.moeda]),
      nome: b.nome,
      catalogo_nome: b.bookmakers_catalogo?.nome ?? b.nome ?? null,
      url: b.url ?? null,
      moeda: b.moeda ?? "BRL",
      login_username: includeCredentials ? null : (b.login_username ?? null),
      instance_identifier: b.instance_identifier ?? null,
      observacoes: b.observacoes ?? null,
      has_credentials: includeCredentials ? true : undefined,
    })),
  );

  let secure: ExportEnvelope["secure"] = null;

  if (includeCredentials) {
    const credentials: SecurePayload["credentials"] = [];
    for (let i = 0; i < rawBookmakers.length; i++) {
      const raw = rawBookmakers[i];
      const password = raw.login_password_encrypted
        ? await decryptPassword(raw.login_password_encrypted)
        : "";
      credentials.push({
        ext_id: bookmakers[i].ext_id,
        login_username: raw.login_username ?? null,
        password: password || null,
      });
    }
    secure = await sealSecurePayload({ credentials }, credentialsPassphrase!);
  }

  const envelope: ExportEnvelope = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    source_fingerprint: await stableExtId([cpfKey, parceiro.nome]),
    categories,
    partner: {
      nome: parceiro.nome,
      cpf: categories.personal ? (parceiro.cpf ?? null) : null,
      data_nascimento: categories.personal ? (parceiro.data_nascimento ?? null) : null,
      qualidade: categories.personal ? (parceiro.qualidade ?? null) : null,
      documentacao_url: categories.personal ? (parceiro.documentacao_url ?? null) : null,
      email: categories.contact ? (parceiro.email ?? null) : null,
      telefone: categories.contact ? (parceiro.telefone ?? null) : null,
      endereco: categories.address ? (parceiro.endereco ?? null) : null,
      cidade: categories.address ? (parceiro.cidade ?? null) : null,
      cep: categories.address ? (parceiro.cep ?? null) : null,
      observacoes: categories.notes ? (parceiro.observacoes ?? null) : null,
      status: "ativo",
    },
    banking,
    crypto: cryptoWallets,
    bookmakers,
    secure,
  };

  return envelope;
}

export function downloadExportFile(envelope: ExportEnvelope, partnerName: string): void {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const slug = partnerName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .slice(0, 40);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `parceiro-${slug}-${new Date().toISOString().slice(0, 10)}.labbet`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
