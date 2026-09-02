import { supabase } from "@/integrations/supabase/client";
import { encryptPassword } from "@/utils/cryptoPassword";
import { openSecurePayload } from "./secureBlob";
import type { ExportEnvelope } from "./schema";
import { labelBookmakerStatus, resolveImportState } from "./bookmakerState";

const BANK_CURRENCIES = ["BRL", "USD", "EUR", "GBP", "MXN", "MYR", "ARS", "COP"];
const BOOKMAKER_CURRENCIES = [
  "BRL", "USD", "EUR", "GBP", "MYR", "MXN", "ARS", "COP", "CAD", "AUD",
  "JPY", "CLP", "PEN", "TRY", "INR", "USDT", "USDC", "BTC", "ETH",
];

export type ImportResolution = "create" | "update";

export interface ImportOptions {
  envelope: ExportEnvelope;
  workspaceId: string;
  resolution: ImportResolution;
  existingPartnerId?: string | null;
  credentialsPassphrase?: string;
  /** Itens desmarcados na tela de conflitos (ext_id). */
  skippedExtIds?: Set<string>;
}

export interface ImportReportLine {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface ImportReport {
  parceiroId: string;
  created: boolean;
  lines: ImportReportLine[];
  banksImported: number;
  banksSkipped: number;
  walletsImported: number;
  walletsSkipped: number;
  bookmakersImported: number;
  bookmakersSkipped: number;
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Importação ESTRITAMENTE CADASTRAL.
 * Casas entram sempre com projeto_id = NULL e saldos zerados, de modo que
 * nenhum trigger financeiro (ex.: fn_ensure_deposito_virtual_on_insert) gere
 * lançamento em cash_ledger / financial_events.
 */
export async function applyPartnerImport(options: ImportOptions): Promise<ImportReport> {
  const { envelope, workspaceId, resolution, existingPartnerId, credentialsPassphrase } = options;
  const skipped = options.skippedExtIds ?? new Set<string>();

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error("Sessão expirada. Faça login novamente.");

  const lines: ImportReportLine[] = [];
  const p = envelope.partner;

  let parceiroId: string;
  let created = false;

  if (resolution === "update" && existingPartnerId) {
    const patch: Record<string, unknown> = {};
    const assign = (key: string, value: unknown) => {
      if (value !== null && value !== undefined && value !== "") patch[key] = value;
    };
    assign("email", p.email);
    assign("telefone", p.telefone);
    assign("endereco", p.endereco);
    assign("cidade", p.cidade);
    assign("cep", p.cep);
    assign("data_nascimento", p.data_nascimento);
    assign("observacoes", p.observacoes);
    assign("documentacao_url", p.documentacao_url);
    assign("qualidade", p.qualidade);

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase
        .from("parceiros")
        .update(patch)
        .eq("id", existingPartnerId)
        .eq("workspace_id", workspaceId);
      if (error) throw error;
    }
    parceiroId = existingPartnerId;
    lines.push({ label: "Parceiro existente atualizado", ok: true });
  } else {
    const { data, error } = await supabase
      .from("parceiros")
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        nome: p.nome,
        cpf: p.cpf ?? null,
        email: p.email ?? null,
        telefone: p.telefone ?? null,
        data_nascimento: p.data_nascimento ?? null,
        endereco: p.endereco ?? null,
        cidade: p.cidade ?? null,
        cep: p.cep ?? null,
        observacoes: p.observacoes ?? null,
        documentacao_url: p.documentacao_url ?? null,
        qualidade: p.qualidade ?? null,
        status: "ativo",
        is_caixa_operacional: false,
      } as any)
      .select("id")
      .single();

    if (error) {
      if ((error as any).code === "23505") {
        throw new Error("Já existe um parceiro com este CPF neste workspace. Escolha 'Atualizar existente'.");
      }
      throw error;
    }
    parceiroId = data.id;
    created = true;
    lines.push({ label: "Parceiro criado", ok: true });
  }

  // ---------- Bancos ----------
  let banksImported = 0;
  let banksSkipped = 0;

  if (envelope.categories.banking && envelope.banking.length > 0) {
    const { data: existing } = await supabase
      .from("contas_bancarias")
      .select("banco, agencia, conta, moeda")
      .eq("parceiro_id", parceiroId);

    const existingKeys = new Set(
      ((existing ?? []) as any[]).map((c) =>
        [normalizeName(c.banco), normalizeName(c.agencia), normalizeName(c.conta), c.moeda].join("|"),
      ),
    );

    for (const bank of envelope.banking) {
      const key = [
        normalizeName(bank.banco),
        normalizeName(bank.agencia),
        normalizeName(bank.conta),
        bank.moeda,
      ].join("|");

      if (skipped.has(bank.ext_id) || existingKeys.has(key) || !BANK_CURRENCIES.includes(bank.moeda)) {
        banksSkipped++;
        continue;
      }

      const { error } = await supabase.from("contas_bancarias").insert({
        parceiro_id: parceiroId,
        banco: bank.banco,
        agencia: bank.agencia ?? null,
        conta: bank.conta ?? null,
        tipo_conta: bank.tipo_conta,
        titular: bank.titular || p.nome,
        moeda: bank.moeda,
        pix_key: bank.pix_key ?? null,
        pix_keys: bank.pix_keys ?? null,
        observacoes: bank.observacoes ?? null,
      } as any);

      if (error) {
        banksSkipped++;
        lines.push({
          label: `Conta ${bank.banco}`,
          ok: false,
          detail: error.message.includes("PIX") ? "chave PIX já usada neste workspace" : error.message,
        });
      } else {
        banksImported++;
        existingKeys.add(key);
      }
    }
  }

  // ---------- Wallets ----------
  let walletsImported = 0;
  let walletsSkipped = 0;

  if (envelope.categories.crypto && envelope.crypto.length > 0) {
    const { data: existing } = await supabase
      .from("wallets_crypto")
      .select("endereco")
      .eq("parceiro_id", parceiroId);
    const existingAddresses = new Set(((existing ?? []) as any[]).map((w) => normalizeName(w.endereco)));

    for (const wallet of envelope.crypto) {
      if (skipped.has(wallet.ext_id) || existingAddresses.has(normalizeName(wallet.endereco))) {
        walletsSkipped++;
        continue;
      }

      const { error } = await supabase.from("wallets_crypto").insert({
        parceiro_id: parceiroId,
        endereco: wallet.endereco,
        network: wallet.network,
        exchange: wallet.exchange ?? null,
        label: wallet.label ?? null,
        moeda: wallet.moeda ?? [],
      } as any);

      if (error) {
        walletsSkipped++;
        lines.push({
          label: `Wallet ${wallet.network}`,
          ok: false,
          detail: error.message.includes("já está cadastrado")
            ? "endereço já cadastrado neste workspace"
            : error.message,
        });
      } else {
        walletsImported++;
        existingAddresses.add(normalizeName(wallet.endereco));
      }
    }
  }

  // ---------- Casas ----------
  let bookmakersImported = 0;
  let bookmakersSkipped = 0;

  if (envelope.categories.bookmakers && envelope.bookmakers.length > 0) {
    const [{ data: catalogo }, { data: existing }] = await Promise.all([
      supabase.from("bookmakers_catalogo").select("id, nome"),
      supabase
        .from("bookmakers")
        .select("nome, instance_identifier, moeda")
        .eq("parceiro_id", parceiroId)
        .eq("workspace_id", workspaceId),
    ]);

    const catalogByName = new Map<string, string>();
    ((catalogo ?? []) as any[]).forEach((c) => {
      const key = normalizeName(c.nome);
      if (!catalogByName.has(key)) catalogByName.set(key, c.id);
    });

    const existingKeys = new Set(
      ((existing ?? []) as any[]).map((b) =>
        [normalizeName(b.nome), normalizeName(b.instance_identifier), b.moeda].join("|"),
      ),
    );

    // Credenciais (opcional): abre o blob cifrado uma única vez.
    let credentialsByExtId = new Map<string, { login_username: string | null; password: string | null }>();
    if (envelope.secure && credentialsPassphrase) {
      const payload = await openSecurePayload(envelope.secure, credentialsPassphrase);
      credentialsByExtId = new Map(
        payload.credentials.map((c) => [
          c.ext_id,
          { login_username: c.login_username ?? null, password: c.password ?? null },
        ]),
      );
    }

    for (const house of envelope.bookmakers) {
      const key = [normalizeName(house.nome), normalizeName(house.instance_identifier), house.moeda].join("|");
      if (skipped.has(house.ext_id) || existingKeys.has(key)) {
        bookmakersSkipped++;
        continue;
      }

      const cred = credentialsByExtId.get(house.ext_id);
      const username = cred?.login_username ?? house.login_username ?? "";
      const plainPassword = cred?.password ?? "";
      let encrypted = "";
      if (plainPassword) {
        try {
          encrypted = await encryptPassword(plainPassword);
        } catch {
          encrypted = "";
        }
      }

      const moeda = BOOKMAKER_CURRENCIES.includes(house.moeda) ? house.moeda : "BRL";
      // Estado do vínculo preservado da origem (arquivos antigos → "ativo").
      const state = resolveImportState(house.status, house.estado_conta);

      const { error } = await supabase.from("bookmakers").insert({
        workspace_id: workspaceId,
        user_id: userId,
        parceiro_id: parceiroId,
        // ISOLAMENTO FINANCEIRO: nunca vincular a projeto nem trazer saldo.
        projeto_id: null,
        saldo_atual: 0,
        saldo_freebet: 0,
        saldo_usd: 0,
        saldo_irrecuperavel: 0,
        bookmaker_catalogo_id: catalogByName.get(normalizeName(house.catalogo_nome || house.nome)) ?? null,
        nome: house.nome,
        url: house.url ?? null,
        moeda,
        status: state.status,
        estado_conta: state.estado_conta,
        login_username: username,
        login_password_encrypted: encrypted,
        instance_identifier: house.instance_identifier ?? null,
        observacoes: house.observacoes ?? null,
      } as any);

      if (error) {
        bookmakersSkipped++;
        lines.push({ label: `Casa ${house.nome}`, ok: false, detail: error.message });
      } else {
        bookmakersImported++;
        existingKeys.add(key);

        const catalogoId = catalogByName.get(normalizeName(house.catalogo_nome || house.nome));
        if (!catalogoId) {
          lines.push({
            label: `Casa ${house.nome}`,
            ok: false,
            detail: `não encontrada no catálogo do destino — criada avulsa com estado "${labelBookmakerStatus(state.status)}"`,
          });
        } else if (state.downgradedFrom) {
          lines.push({
            label: `Casa ${house.nome}`,
            ok: true,
            detail: `estado "${labelBookmakerStatus(state.downgradedFrom)}" é transitório na origem — importada como "${labelBookmakerStatus(state.status)}"`,
          });
        } else if (state.status !== "ativo") {
          lines.push({
            label: `Casa ${house.nome}`,
            ok: true,
            detail: `estado preservado: ${labelBookmakerStatus(state.status)}`,
          });
        }
      }
    }
  }

  return {
    parceiroId,
    created,
    lines,
    banksImported,
    banksSkipped,
    walletsImported,
    walletsSkipped,
    bookmakersImported,
    bookmakersSkipped,
  };
}
