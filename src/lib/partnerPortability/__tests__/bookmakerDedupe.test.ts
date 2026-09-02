import { beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------------ */
/* Banco em memória com a MESMA regra de unicidade aplicada no Postgres */
/* (índice único parcial em workspace_id, parceiro_id, portability_ext_id) */
/* ------------------------------------------------------------------ */

interface Row {
  [key: string]: any;
}

const db: Record<string, Row[]> = {
  parceiros: [],
  bookmakers: [],
  bookmakers_catalogo: [],
  contas_bancarias: [],
  wallets_crypto: [],
  cash_ledger: [],
  financial_events: [],
};

let idSeq = 0;
const nextId = () => `id-${++idSeq}`;

function matches(row: Row, filters: [string, any][]): boolean {
  return filters.every(([col, value]) => row[col] === value);
}

function from(table: string) {
  const filters: [string, any][] = [];
  let mode: "select" | "insert" | "update" = "select";
  let payload: Row | null = null;

  const rows = () => (db[table] ?? []).filter((r) => matches(r, filters));

  const runInsert = () => {
    if (table === "bookmakers" && payload?.portability_ext_id) {
      const clash = db.bookmakers.find(
        (r) =>
          r.workspace_id === payload!.workspace_id &&
          r.parceiro_id === payload!.parceiro_id &&
          r.portability_ext_id === payload!.portability_ext_id,
      );
      if (clash) {
        return { data: null, error: { code: "23505", message: "duplicate key value" } };
      }
    }
    const row = { id: nextId(), ...payload };
    db[table].push(row);
    return { data: row, error: null };
  };

  const resolve = () => {
    if (mode === "insert") return runInsert();
    if (mode === "update") {
      rows().forEach((r) => Object.assign(r, payload));
      return { data: null, error: null };
    }
    return { data: rows(), error: null };
  };

  const builder: any = {
    select: (_cols?: string) => {
      if (mode === "insert") return builder; // insert(...).select().single()
      mode = "select";
      return builder;
    },
    insert: (values: Row) => {
      mode = "insert";
      payload = values;
      return builder;
    },
    update: (values: Row) => {
      mode = "update";
      payload = values;
      return builder;
    },
    eq: (col: string, value: any) => {
      filters.push([col, value]);
      return builder;
    },
    limit: () => builder,
    single: () => Promise.resolve(resolve()),
    maybeSingle: () => {
      const res = resolve() as any;
      if (mode === "select") return Promise.resolve({ data: res.data[0] ?? null, error: null });
      return Promise.resolve(res);
    },
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve(resolve()).then(onFulfilled, onRejected),
  };

  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => from(table),
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
  },
}));

vi.mock("@/utils/cryptoPassword", () => ({
  encryptPassword: async (p: string) => `enc:${p}`,
  decryptPassword: async (p: string) => p.replace("enc:", ""),
}));

import { applyPartnerImport, planBookmakerImport } from "../applyImport";
import { exportEnvelopeSchema } from "../schema";

const CATEGORIES = {
  personal: true,
  contact: true,
  address: true,
  notes: true,
  banking: false,
  crypto: false,
  bookmakers: true,
  credentials: false,
};

const WS_A = "ws-a";
const WS_B = "ws-b";

function house(nome: string, extra: Partial<Row> = {}) {
  return {
    ext_id: `ext-${nome}-${extra.instance_identifier ?? ""}`.toLowerCase(),
    nome,
    catalogo_nome: nome,
    url: null,
    moeda: "BRL",
    login_username: null,
    instance_identifier: null,
    observacoes: null,
    status: "ativo",
    estado_conta: null,
    ...extra,
  };
}

function envelope(nome: string, houses: Row[], cpf = "11111111111") {
  return exportEnvelopeSchema.parse({
    format: "LABBET_PARTNER_EXPORT",
    version: 1,
    exported_at: new Date().toISOString(),
    source_fingerprint: `fp-${nome}`,
    categories: CATEGORIES,
    partner: { nome, cpf, status: "ativo" },
    banking: [],
    crypto: [],
    bookmakers: houses,
    secure: null,
  });
}

function seedCatalog(nomes: string[]) {
  nomes.forEach((nome) => db.bookmakers_catalogo.push({ id: `cat-${nome}`, nome }));
}

function seedPartner(workspaceId: string, nome: string): string {
  const id = nextId();
  db.parceiros.push({ id, workspace_id: workspaceId, nome, is_caixa_operacional: false });
  return id;
}

function seedHouse(workspaceId: string, parceiroId: string, nome: string, extra: Row = {}) {
  db.bookmakers.push({
    id: nextId(),
    workspace_id: workspaceId,
    parceiro_id: parceiroId,
    nome,
    instance_identifier: null,
    moeda: "BRL",
    bookmaker_catalogo_id: `cat-${nome}`,
    saldo_atual: 0,
    portability_ext_id: null,
    ...extra,
  });
}

function housesOf(parceiroId: string, workspaceId: string) {
  return db.bookmakers.filter(
    (b) => b.parceiro_id === parceiroId && b.workspace_id === workspaceId,
  );
}

async function importInto(
  workspaceId: string,
  parceiroId: string | null,
  env: ReturnType<typeof envelope>,
) {
  return applyPartnerImport({
    envelope: env,
    workspaceId,
    resolution: parceiroId ? "update" : "create",
    existingPartnerId: parceiroId,
  });
}

beforeEach(() => {
  Object.keys(db).forEach((k) => (db[k] = []));
  idSeq = 0;
  seedCatalog(["Betano", "Bet365", "Pinnacle", "BetXYZ"]);
});

describe("importação de casas — idempotência", () => {
  it("Teste 1 — casa inexistente é criada", async () => {
    const p = seedPartner(WS_B, "João");
    seedHouse(WS_B, p, "Betano");

    const report = await importInto(WS_B, p, envelope("João", [house("Bet365")]));

    expect(report.bookmakersImported).toBe(1);
    expect(housesOf(p, WS_B).map((h) => h.nome).sort()).toEqual(["Bet365", "Betano"]);
  });

  it("Teste 2 — casas já existentes não são duplicadas", async () => {
    const p = seedPartner(WS_B, "João");
    seedHouse(WS_B, p, "Betano");
    seedHouse(WS_B, p, "Bet365");

    const report = await importInto(
      WS_B,
      p,
      envelope("João", [house("Betano"), house("Bet365")]),
    );

    expect(report.bookmakersImported).toBe(0);
    expect(report.bookmakersExisting).toBe(2);
    expect(housesOf(p, WS_B)).toHaveLength(2);
  });

  it("Teste 3 — importar o mesmo arquivo 3x não duplica", async () => {
    const p = seedPartner(WS_B, "João");
    const env = envelope("João", [house("Betano"), house("Bet365"), house("Pinnacle")]);

    await importInto(WS_B, p, env);
    await importInto(WS_B, p, env);
    await importInto(WS_B, p, env);

    expect(housesOf(p, WS_B)).toHaveLength(3);
  });

  it("Teste 4 — parte existente, parte nova", async () => {
    const p = seedPartner(WS_B, "João");
    seedHouse(WS_B, p, "Betano");
    seedHouse(WS_B, p, "Bet365");

    const report = await importInto(
      WS_B,
      p,
      envelope("João", [house("Betano"), house("Bet365"), house("Pinnacle")]),
    );

    expect(report.bookmakersImported).toBe(1);
    expect(report.bookmakersExisting).toBe(2);
    expect(housesOf(p, WS_B).map((h) => h.nome).sort()).toEqual([
      "Bet365",
      "Betano",
      "Pinnacle",
    ]);
  });

  it("Teste 5 — a mesma casa em parceiros diferentes é permitida", async () => {
    const joao = seedPartner(WS_B, "João");
    const maria = seedPartner(WS_B, "Maria");
    seedHouse(WS_B, joao, "Betano");

    await importInto(WS_B, joao, envelope("João", [house("Betano")]));
    await importInto(WS_B, maria, envelope("Maria", [house("Betano")], "22222222222"));

    expect(housesOf(joao, WS_B)).toHaveLength(1);
    expect(housesOf(maria, WS_B)).toHaveLength(1);
  });

  it("Teste 6 — origem em outro workspace não bloqueia nem duplica", async () => {
    const joaoA = seedPartner(WS_A, "João");
    seedHouse(WS_A, joaoA, "Betano");
    const joaoB = seedPartner(WS_B, "João");
    seedHouse(WS_B, joaoB, "Betano");

    await importInto(WS_B, joaoB, envelope("João", [house("Betano")]));

    expect(housesOf(joaoB, WS_B)).toHaveLength(1);
    expect(housesOf(joaoA, WS_A)).toHaveLength(1);
  });

  it("Teste 7 — status não cria uma segunda relação", async () => {
    const p = seedPartner(WS_B, "João");
    seedHouse(WS_B, p, "BetXYZ", { status: "limitada", estado_conta: "limitada" });

    await importInto(
      WS_B,
      p,
      envelope("João", [house("BetXYZ", { status: "limitada", estado_conta: "limitada" })]),
    );

    const rows = housesOf(p, WS_B);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("limitada");
  });

  it("Teste 8 — duplicata dentro do próprio arquivo cria apenas uma", async () => {
    const p = seedPartner(WS_B, "João");

    const report = await importInto(
      WS_B,
      p,
      envelope("João", [house("Betano"), house("Betano"), house("Bet365")]),
    );

    expect(report.bookmakersImported).toBe(2);
    expect(housesOf(p, WS_B)).toHaveLength(2);
  });

  it("Teste 9 — nenhuma escrita financeira e nenhum vínculo operacional", async () => {
    const p = seedPartner(WS_B, "João");
    await importInto(WS_B, p, envelope("João", [house("Betano")]));

    const created = housesOf(p, WS_B)[0];
    expect(created.saldo_atual).toBe(0);
    expect(created.projeto_id).toBeNull();
    expect(created.investidor_id).toBeUndefined();
    expect(db.cash_ledger).toHaveLength(0);
    expect(db.financial_events).toHaveLength(0);
  });

  it("nome divergente no destino ainda é reconhecido pelo catálogo", async () => {
    const p = seedPartner(WS_B, "João");
    // No destino a casa foi renomeada, mas aponta para o mesmo catálogo.
    seedHouse(WS_B, p, "Betano - conta principal", { bookmaker_catalogo_id: "cat-Betano" });

    const report = await importInto(WS_B, p, envelope("João", [house("Betano")]));

    expect(report.bookmakersExisting).toBe(1);
    expect(housesOf(p, WS_B)).toHaveLength(1);
  });

  it("multi-instância legítima continua permitida", async () => {
    const p = seedPartner(WS_B, "João");
    seedHouse(WS_B, p, "Betano");

    await importInto(
      WS_B,
      p,
      envelope("João", [house("Betano"), house("Betano", { instance_identifier: "2ª conta" })]),
    );

    expect(housesOf(p, WS_B)).toHaveLength(2);
  });

  it("moeda inválida é normalizada antes da chave (sem duplicar em reimportação)", async () => {
    const p = seedPartner(WS_B, "João");
    const env = envelope("João", [house("Betano", { moeda: "XXX" })]);

    await importInto(WS_B, p, env);
    await importInto(WS_B, p, env);

    const rows = housesOf(p, WS_B);
    expect(rows).toHaveLength(1);
    expect(rows[0].moeda).toBe("BRL");
  });

  it("preview antecipa o que será criado e o que já existe", async () => {
    const p = seedPartner(WS_B, "João");
    seedHouse(WS_B, p, "Betano");

    const plan = await planBookmakerImport(
      envelope("João", [house("Betano"), house("Pinnacle")]),
      WS_B,
      p,
    );

    expect(plan.existentes).toBe(1);
    expect(plan.novas).toBe(1);
    expect(plan.items.find((i) => i.nome === "Betano")?.exists).toBe(true);
  });
});
