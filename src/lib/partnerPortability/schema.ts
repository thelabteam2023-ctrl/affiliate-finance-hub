import { z } from "zod";

/**
 * LABBET_PARTNER_EXPORT — formato de portabilidade cadastral de parceiros
 * entre workspaces. NUNCA contém IDs internos do workspace de origem,
 * nem qualquer dado operacional/financeiro.
 */
export const EXPORT_FORMAT = "LABBET_PARTNER_EXPORT" as const;
export const EXPORT_VERSION = 1 as const;
export const EXPORT_FILE_EXTENSION = ".labbet";

export const CATEGORY_KEYS = [
  "personal",
  "contact",
  "address",
  "notes",
  "banking",
  "crypto",
  "bookmakers",
  "credentials",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];
export type Categories = Record<CategoryKey, boolean>;

export const DEFAULT_CATEGORIES: Categories = {
  personal: true,
  contact: true,
  address: true,
  notes: true,
  banking: false,
  crypto: false,
  bookmakers: false,
  credentials: false,
};

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  personal: "Dados de identificação",
  contact: "Contatos",
  address: "Endereço",
  notes: "Observações",
  banking: "Dados bancários",
  crypto: "Dados cripto",
  bookmakers: "Casas utilizadas",
  credentials: "Credenciais das casas",
};

const nullableString = z.string().nullable().optional();

export const partnerSchema = z.object({
  nome: z.string().min(1).max(200),
  cpf: nullableString,
  data_nascimento: nullableString,
  email: nullableString,
  telefone: nullableString,
  endereco: nullableString,
  cidade: nullableString,
  cep: nullableString,
  observacoes: nullableString,
  documentacao_url: nullableString,
  qualidade: z.number().int().min(1).max(5).nullable().optional(),
  status: z.enum(["ativo", "inativo", "suspenso"]).optional(),
});

export const bankingSchema = z.object({
  ext_id: z.string().min(4).max(128),
  banco: z.string().min(1).max(200),
  agencia: nullableString,
  conta: nullableString,
  tipo_conta: z.enum(["corrente", "poupanca", "pagamento"]),
  titular: z.string().max(200),
  moeda: z.string().min(2).max(5),
  pix_key: nullableString,
  pix_keys: z.any().nullable().optional(),
  observacoes: nullableString,
});

export const cryptoSchema = z.object({
  ext_id: z.string().min(4).max(128),
  label: nullableString,
  exchange: nullableString,
  network: z.string().min(1).max(100),
  endereco: z.string().min(1).max(300),
  moeda: z.array(z.string().max(15)).default([]),
});

export const bookmakerSchema = z.object({
  ext_id: z.string().min(4).max(128),
  nome: z.string().min(1).max(200),
  catalogo_nome: nullableString,
  url: nullableString,
  moeda: z.string().min(2).max(5),
  login_username: nullableString,
  instance_identifier: nullableString,
  observacoes: nullableString,
  /** Presente apenas quando a categoria "credentials" foi exportada sem passphrase-blob. */
  has_credentials: z.boolean().optional(),
});

export const secureBlobSchema = z.object({
  alg: z.literal("AES-GCM"),
  kdf: z.literal("PBKDF2-SHA256"),
  iterations: z.number().int().min(100_000),
  salt: z.string().min(8),
  iv: z.string().min(8),
  ciphertext: z.string().min(8),
});

export const exportEnvelopeSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exported_at: z.string(),
  source_fingerprint: z.string().max(128),
  categories: z.object(
    CATEGORY_KEYS.reduce(
      (acc, key) => ({ ...acc, [key]: z.boolean() }),
      {} as Record<CategoryKey, z.ZodBoolean>,
    ),
  ),
  partner: partnerSchema,
  banking: z.array(bankingSchema).max(200).default([]),
  crypto: z.array(cryptoSchema).max(200).default([]),
  bookmakers: z.array(bookmakerSchema).max(500).default([]),
  secure: secureBlobSchema.nullable().optional(),
});

export type ExportEnvelope = z.infer<typeof exportEnvelopeSchema>;
export type ExportPartner = z.infer<typeof partnerSchema>;
export type ExportBanking = z.infer<typeof bankingSchema>;
export type ExportCrypto = z.infer<typeof cryptoSchema>;
export type ExportBookmaker = z.infer<typeof bookmakerSchema>;
export type SecureBlob = z.infer<typeof secureBlobSchema>;

/** Conteúdo cifrado dentro de `secure`: senhas em claro, nunca no JSON aberto. */
export const securePayloadSchema = z.object({
  credentials: z.array(
    z.object({
      ext_id: z.string(),
      login_username: z.string().nullable().optional(),
      password: z.string().nullable().optional(),
    }),
  ),
});

export type SecurePayload = z.infer<typeof securePayloadSchema>;

export interface ParsedFileResult {
  ok: boolean;
  envelope?: ExportEnvelope;
  error?: string;
}

export function parseExportFile(raw: string): ParsedFileResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Arquivo inválido: não é um JSON válido." };
  }

  const shallow = json as Record<string, unknown> | null;
  if (!shallow || shallow.format !== EXPORT_FORMAT) {
    return { ok: false, error: "Arquivo não é um pacote LABBET_PARTNER_EXPORT." };
  }
  if (typeof shallow.version === "number" && shallow.version > EXPORT_VERSION) {
    return {
      ok: false,
      error: `Versão do arquivo (${shallow.version}) é mais nova que a suportada (${EXPORT_VERSION}). Atualize o sistema.`,
    };
  }

  const parsed = exportEnvelopeSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      ok: false,
      error: `Arquivo malformado ou adulterado: ${first?.path.join(".") || "envelope"} — ${first?.message ?? "estrutura inválida"}.`,
    };
  }

  return { ok: true, envelope: parsed.data };
}

/** Identificador estável derivado de chaves naturais (sem UUID de origem). */
export async function stableExtId(parts: (string | null | undefined)[]): Promise<string> {
  const base = parts.map((p) => (p ?? "").toString().trim().toLowerCase()).join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(base));
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
