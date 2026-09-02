import { supabase } from "@/integrations/supabase/client";
import { encryptPassword } from "@/utils/cryptoPassword";
import { openSecurePayload } from "./secureBlob";
import type { ExportEnvelope } from "./schema";
import { labelBookmakerStatus, resolveImportState } from "./bookmakerState";
import {
  buildBookmakerIdentityKey,
  canonicalText,
  normalizeBookmakerCurrency,
} from "./bookmakerIdentity";

const BANK_CURRENCIES = ["BRL", "USD", "EUR", "GBP", "MXN", "MYR", "ARS", "COP"];

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
  /** Casas que já existiam para o parceiro no destino (não duplicadas). */
  bookmakersExisting: number;
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
  // IDEMPOTÊNCIA: a relação parceiro↔casa é identificada pela chave canônica
  // (catálogo do destino | nome canônico) + instância + moeda efetiva.
  let bookmakersImported = 0;
  let bookmakersSkipped = 0;
  let bookmakersExisting = 0;

  if (envelope.categories.bookmakers && envelope.bookmakers.length > 0) {
    const context = await loadBookmakerContext(workspaceId, parceiroId);

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

    const seenInFile = new Set<string>();

    for (const house of envelope.bookmakers) {
      if (skipped.has(house.ext_id)) {
        bookmakersSkipped++;
        continue;
      }

      const catalogoId = resolveCatalogId(context, house);
      const moeda = normalizeBookmakerCurrency(house.moeda);
      const key = buildBookmakerIdentityKey({
        catalogoId,
        nome: house.nome,
        instanceIdentifier: house.instance_identifier,
        moeda,
      });

      // 1) já existe no destino  2) repetida dentro do próprio arquivo
      if (context.existingKeys.has(key) || seenInFile.has(key)) {
        bookmakersExisting++;
        continue;
      }
      seenInFile.add(key);

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
        bookmaker_catalogo_id: catalogoId,
        nome: house.nome,
        url: house.url ?? null,
        moeda,
        status: state.status,
        estado_conta: state.estado_conta,
        login_username: username,
        login_password_encrypted: encrypted,
        instance_identifier: house.instance_identifier ?? null,
        observacoes: house.observacoes ?? null,
        // Trava de concorrência: índice único parcial
        // (workspace_id, parceiro_id, portability_ext_id).
        portability_ext_id: key,
      } as any);

      if (error) {
        if ((error as any).code === "23505") {
          // Corrida entre duas importações simultâneas: a outra já criou.
          bookmakersExisting++;
          context.existingKeys.add(key);
          continue;
        }
        bookmakersSkipped++;
        lines.push({ label: `Casa ${house.nome}`, ok: false, detail: error.message });
      } else {
        bookmakersImported++;
        context.existingKeys.add(key);

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

    if (bookmakersExisting > 0) {
      lines.push({
        label: "Casas já existentes",
        ok: true,
        detail: `${bookmakersExisting} casa(s) já vinculada(s) a este parceiro no destino — não duplicadas`,
      });
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
    bookmakersExisting,
  };
}

/* ------------------------------------------------------------------ */
/* Identidade das casas: contexto compartilhado entre preview e import */
/* ------------------------------------------------------------------ */

interface BookmakerContext {
  catalogByName: Map<string, string>;
  existingKeys: Set<string>;
}

async function loadBookmakerContext(
  workspaceId: string,
  parceiroId: string | null,
): Promise<BookmakerContext> {
  const [{ data: catalogo }, existingRes] = await Promise.all([
    supabase.from("bookmakers_catalogo").select("id, nome"),
    parceiroId
      ? supabase
          .from("bookmakers")
          .select("nome, instance_identifier, moeda, bookmaker_catalogo_id, portability_ext_id")
          .eq("parceiro_id", parceiroId)
          .eq("workspace_id", workspaceId)
      : Promise.resolve({ data: [] as any[] } as any),
  ]);

  const catalogByName = new Map<string, string>();
  ((catalogo ?? []) as any[]).forEach((c) => {
    const key = canonicalText(c.nome);
    if (!catalogByName.has(key)) catalogByName.set(key, c.id);
  });

  const existingKeys = new Set<string>();
  ((existingRes?.data ?? []) as any[]).forEach((b) => {
    existingKeys.add(
      buildBookmakerIdentityKey({
        catalogoId: b.bookmaker_catalogo_id,
        nome: b.nome,
        instanceIdentifier: b.instance_identifier,
        moeda: b.moeda,
      }),
    );
    // Casas antigas sem catálogo resolvido também batem pelo nome.
    if (b.bookmaker_catalogo_id) {
      existingKeys.add(
        buildBookmakerIdentityKey({
          catalogoId: null,
          nome: b.nome,
          instanceIdentifier: b.instance_identifier,
          moeda: b.moeda,
        }),
      );
    }
    if (b.portability_ext_id) existingKeys.add(b.portability_ext_id);
  });

  return { catalogByName, existingKeys };
}

function resolveCatalogId(
  context: BookmakerContext,
  house: { nome?: string | null; catalogo_nome?: string | null },
): string | null {
  return (
    context.catalogByName.get(canonicalText(house.catalogo_nome || house.nome)) ??
    context.catalogByName.get(canonicalText(house.nome)) ??
    null
  );
}

export interface BookmakerPlanItem {
  nome: string;
  exists: boolean;
}

export interface BookmakerPlan {
  items: BookmakerPlanItem[];
  novas: number;
  existentes: number;
}

/**
 * Preview: o que acontecerá com cada casa do envelope no workspace de destino.
 * Não escreve nada. `parceiroId` nulo (parceiro novo) ⇒ todas são novas.
 */
export async function planBookmakerImport(
  envelope: ExportEnvelope,
  workspaceId: string,
  parceiroId: string | null,
): Promise<BookmakerPlan> {
  if (!envelope.categories.bookmakers || envelope.bookmakers.length === 0) {
    return { items: [], novas: 0, existentes: 0 };
  }

  const context = await loadBookmakerContext(workspaceId, parceiroId);
  const seen = new Set<string>();
  const items: BookmakerPlanItem[] = [];

  for (const house of envelope.bookmakers) {
    const key = buildBookmakerIdentityKey({
      catalogoId: resolveCatalogId(context, house),
      nome: house.nome,
      instanceIdentifier: house.instance_identifier,
      moeda: house.moeda,
    });
    const exists = context.existingKeys.has(key) || seen.has(key);
    seen.add(key);
    items.push({
      nome: house.instance_identifier ? `${house.nome} (${house.instance_identifier})` : house.nome,
      exists,
    });
  }

  return {
    items,
    novas: items.filter((i) => !i.exists).length,
    existentes: items.filter((i) => i.exists).length,
  };
}

