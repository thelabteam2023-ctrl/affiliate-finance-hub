import { supabase } from "@/integrations/supabase/client";
import { decryptPassword } from "@/utils/cryptoPassword";
import { sealSecurePayload } from "./secureBlob";
import { normalizeExportedEstadoConta, normalizeExportedStatus } from "./bookmakerState";
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
          .select("banco, banco_id, agencia, conta, tipo_conta, titular, moeda, pix_key, pix_keys, observacoes, bancos(codigo, nome, is_system)")
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
            "id, nome, url, moeda, status, estado_conta, login_username, login_password_encrypted, instance_identifier, observacoes, bookmakers_catalogo(nome)",
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
  const includeCredentials = wantsBookmakers && categories.credentials && wantsCredentials;

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
      // Estado do vínculo viaja com a casa (nunca saldo/projeto/investidor).
      status: normalizeExportedStatus(b.status),
      estado_conta: normalizeExportedEstadoConta(b.estado_conta),
      has_credentials: includeCredentials ? true : undefined,
    })),
  );

  const credentials: PlainCredential[] = [];

  if (includeCredentials) {
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
    secure: null,
  };

  return { envelope, credentials };
}

/** Exportação de um único parceiro (compatibilidade com o formato v1). */
export async function buildPartnerExport(
  source: PartnerExportSource,
  categories: Categories,
  credentialsPassphrase?: string,
): Promise<ExportEnvelope> {
  const { envelope, credentials } = await buildOnePartner(
    source,
    categories,
    !!credentialsPassphrase,
  );
  if (credentialsPassphrase && credentials.length > 0) {
    envelope.secure = await sealSecurePayload({ credentials }, credentialsPassphrase);
  }
  return envelope;
}

export interface BatchExportProgress {
  done: number;
  total: number;
  current: string | null;
}

export interface BatchExportResult {
  bundle: ExportBundle;
  failures: { parceiroId: string; message: string }[];
}

/**
 * Exportação em lote: um único arquivo contendo N parceiros.
 * Cada parceiro é lido isoladamente e sempre restrito ao workspace informado.
 * As credenciais de todos os parceiros são seladas em um único blob (ext_id é
 * um hash único por casa/parceiro, então não há mistura possível).
 */
export async function buildPartnerBundle(
  parceiroIds: string[],
  workspaceId: string,
  categories: Categories,
  credentialsPassphrase?: string,
  onProgress?: (p: BatchExportProgress) => void,
): Promise<BatchExportResult> {
  const total = parceiroIds.length;
  const wantsCredentials = !!credentialsPassphrase;

  const limit = wantsCredentials ? BATCH_LIMIT_WITH_CREDENTIALS : BATCH_LIMIT_PLAIN;
  if (total > limit) {
    throw new Error(
      `Limite de ${limit} parceiros por exportação${wantsCredentials ? " com credenciais" : ""}. Selecionados: ${total}.`,
    );
  }

  const envelopes: ExportEnvelope[] = new Array(total);
  const allCredentials: PlainCredential[] = [];
  const failures: BatchExportResult["failures"] = [];
  let done = 0;

  const CONCURRENCY = wantsCredentials ? 2 : 4;
  let cursor = 0;

  const worker = async () => {
    while (cursor < total) {
      const index = cursor++;
      const parceiroId = parceiroIds[index];
      try {
        const { envelope, credentials } = await buildOnePartner(
          { parceiroId, workspaceId },
          categories,
          wantsCredentials,
        );
        envelopes[index] = envelope;
        allCredentials.push(...credentials);
        done++;
        onProgress?.({ done, total, current: envelope.partner.nome });
      } catch (e: any) {
        failures.push({ parceiroId, message: e?.message ?? "Falha ao ler parceiro" });
        done++;
        onProgress?.({ done, total, current: null });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));

  const partners = envelopes.filter(Boolean);
  if (partners.length === 0) {
    throw new Error("Nenhum parceiro pôde ser exportado.");
  }

  const secure =
    wantsCredentials && allCredentials.length > 0
      ? await sealSecurePayload({ credentials: allCredentials }, credentialsPassphrase!)
      : null;

  const bundle: ExportBundle = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exported_at: new Date().toISOString(),
    count: partners.length,
    categories,
    secure,
    partners,
  };

  return { bundle, failures };
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .slice(0, 40);
}

function triggerDownload(content: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadExportFile(envelope: ExportEnvelope, partnerName: string): void {
  triggerDownload(
    envelope,
    `parceiro-${slugify(partnerName)}-${new Date().toISOString().slice(0, 10)}.labbet`,
  );
}

export function downloadBundleFile(bundle: ExportBundle, singleName?: string): void {
  const date = new Date().toISOString().slice(0, 10);
  const filename =
    bundle.partners.length === 1 && singleName
      ? `parceiro-${slugify(singleName)}-${date}.labbet`
      : `parceiros-${bundle.partners.length}-${date}.labbet`;
  triggerDownload(bundle, filename);
}

