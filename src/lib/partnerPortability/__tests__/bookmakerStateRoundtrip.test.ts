import { describe, expect, it } from "vitest";
import {
  labelBookmakerStatus,
  normalizeExportedEstadoConta,
  normalizeExportedStatus,
  resolveImportState,
} from "../bookmakerState";
import { bundleSchema, exportEnvelopeSchema, parseImportFile } from "../schema";

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

function house(nome: string, status: string, estado?: string) {
  return {
    ext_id: `ext-${nome}-${status}`.toLowerCase(),
    nome,
    catalogo_nome: nome,
    url: null,
    moeda: "BRL",
    login_username: `user_${nome}`,
    instance_identifier: null,
    observacoes: null,
    status: normalizeExportedStatus(status),
    estado_conta: normalizeExportedEstadoConta(estado ?? status),
  };
}

function envelope(nome: string, houses: ReturnType<typeof house>[]) {
  return exportEnvelopeSchema.parse({
    format: "LABBET_PARTNER_EXPORT",
    version: 1,
    exported_at: new Date().toISOString(),
    source_fingerprint: `fp-${nome}`,
    categories: CATEGORIES,
    partner: { nome, cpf: null, status: "ativo" },
    banking: [],
    crypto: [],
    bookmakers: houses,
    secure: null,
  });
}

/** Simula o round-trip completo: serializa, parseia e resolve o estado final. */
function roundtrip(envelopes: ReturnType<typeof envelope>[]) {
  const bundle = bundleSchema.parse({
    format: "LABBET_PARTNER_BUNDLE",
    version: 1,
    exported_at: new Date().toISOString(),
    count: envelopes.length,
    categories: CATEGORIES,
    secure: null,
    partners: envelopes,
  });
  const parsed = parseImportFile(JSON.stringify(bundle));
  expect(parsed.ok).toBe(true);
  return (parsed.partners ?? []).map((env) => ({
    nome: env.partner.nome,
    casas: env.bookmakers.map((b) => ({
      nome: b.nome,
      ...resolveImportState(b.status, b.estado_conta),
    })),
  }));
}

describe("portabilidade — estado do vínculo das casas", () => {
  it("Teste 1 — casa Ativa permanece Ativa", () => {
    const [p] = roundtrip([envelope("Ana", [house("Bet365", "ativo")])]);
    expect(p.casas[0].status).toBe("ativo");
    expect(p.casas[0].estado_conta).toBe("ativo");
  });

  it("Teste 2 — casa Limitada permanece Limitada", () => {
    const [p] = roundtrip([envelope("Bruno", [house("Betano", "limitada")])]);
    expect(p.casas[0].status).toBe("limitada");
    expect(p.casas[0].estado_conta).toBe("limitada");
    expect(labelBookmakerStatus(p.casas[0].status)).toBe("Limitada");
  });

  it("Teste 3 — casa Bloqueada/Encerrada preserva o estado", () => {
    const [p] = roundtrip([
      envelope("Carla", [house("Casa X", "bloqueada"), house("Casa Y", "encerrada")]),
    ]);
    expect(p.casas[0].status).toBe("bloqueada");
    // estado_conta não aceita "bloqueada" (CHECK do banco) → cai para ativo
    expect(p.casas[0].estado_conta).toBe("ativo");
    expect(p.casas[1].status).toBe("encerrada");
    expect(p.casas[1].estado_conta).toBe("encerrada");
  });

  it("Teste 4 — lote com vários parceiros não mistura estados", () => {
    const result = roundtrip([
      envelope("Parceiro A", [
        house("Bet365", "ativo"),
        house("Betano", "limitada"),
        house("Casa X", "bloqueada"),
      ]),
      envelope("Parceiro B", [house("Betano", "ativo"), house("Casa Y", "limitada")]),
    ]);

    expect(result[0].nome).toBe("Parceiro A");
    expect(result[0].casas.map((c) => [c.nome, c.status])).toEqual([
      ["Bet365", "ativo"],
      ["Betano", "limitada"],
      ["Casa X", "bloqueada"],
    ]);
    expect(result[1].nome).toBe("Parceiro B");
    expect(result[1].casas.map((c) => [c.nome, c.status])).toEqual([
      ["Betano", "ativo"],
      ["Casa Y", "limitada"],
    ]);
  });

  it("estados transitórios (financeiros) são rebaixados para ativo", () => {
    const [p] = roundtrip([
      envelope("Duda", [house("Casa Z", "aguardando_saque"), house("Casa W", "em_uso")]),
    ]);
    expect(p.casas[0].status).toBe("ativo");
    expect(p.casas[0].downgradedFrom).toBe("aguardando_saque");
    expect(p.casas[1].status).toBe("ativo");
    expect(p.casas[1].downgradedFrom).toBe("em_uso");
  });

  it("arquivos antigos (sem status) continuam entrando como ativo", () => {
    const legacy = exportEnvelopeSchema.parse({
      format: "LABBET_PARTNER_EXPORT",
      version: 1,
      exported_at: new Date().toISOString(),
      source_fingerprint: "fp-legacy",
      categories: CATEGORIES,
      partner: { nome: "Legado", cpf: null },
      banking: [],
      crypto: [],
      bookmakers: [
        {
          ext_id: "legacy-1",
          nome: "Bet Antiga",
          catalogo_nome: "Bet Antiga",
          url: null,
          moeda: "BRL",
          login_username: "u",
          instance_identifier: null,
          observacoes: null,
        },
      ],
      secure: null,
    });
    const parsed = parseImportFile(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    const b = parsed.partners![0].bookmakers[0];
    expect(resolveImportState(b.status, b.estado_conta).status).toBe("ativo");
  });

  it("Teste 5 — o envelope não carrega nenhum dado financeiro", () => {
    const [p] = roundtrip([envelope("Eva", [house("Bet365", "limitada")])]);
    const raw = JSON.stringify(p);
    for (const forbidden of [
      "saldo_atual",
      "saldo_freebet",
      "saldo_usd",
      "projeto_id",
      "investidor_id",
      "patrimonio",
      "lucro",
      "cash_ledger",
      "financial_events",
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });
});
