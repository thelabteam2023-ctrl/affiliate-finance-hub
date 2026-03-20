import { describe, it, expect } from "vitest";
import {
  buildOriginalStakesMap,
  applyVirtualCredits,
  validateBalance,
  type BookmakerBalance,
  type OddEntry,
  type OriginalCredits,
} from "../surebetBalanceValidation";

// ============ Helpers ============
const bk = (id: string, real: number, fb = 0): BookmakerBalance => ({
  id,
  saldo_operavel: real,
  saldo_disponivel: real,
  saldo_freebet: fb,
});

const entry = (
  bkId: string,
  stake: string,
  fonte: string = "REAL",
  additionalEntries: OddEntry["additionalEntries"] = []
): OddEntry => ({
  bookmaker_id: bkId,
  stake,
  fonteSaldo: fonte,
  additionalEntries,
});

// ============ buildOriginalStakesMap ============
describe("buildOriginalStakesMap", () => {
  it("separates real and freebet stakes correctly", () => {
    const pernas = [
      { bookmaker_id: "bk1", stake: 100, fonte_saldo: null },
      { bookmaker_id: "bk1", stake: 50, fonte_saldo: "FREEBET" },
      { bookmaker_id: "bk2", stake: 80, fonte_saldo: "FREEBET" },
    ];
    const map = buildOriginalStakesMap(pernas);
    expect(map.get("bk1")).toEqual({ real: 100, freebet: 50 });
    expect(map.get("bk2")).toEqual({ real: 0, freebet: 80 });
  });

  it("handles empty pernas", () => {
    const map = buildOriginalStakesMap([]);
    expect(map.size).toBe(0);
  });

  it("accumulates multiple real stakes for same bookmaker", () => {
    const pernas = [
      { bookmaker_id: "bk1", stake: 30, fonte_saldo: null },
      { bookmaker_id: "bk1", stake: 70, fonte_saldo: null },
    ];
    const map = buildOriginalStakesMap(pernas);
    expect(map.get("bk1")).toEqual({ real: 100, freebet: 0 });
  });
});

// ============ applyVirtualCredits ============
describe("applyVirtualCredits", () => {
  it("adds real credit to saldo_operavel and saldo_disponivel", () => {
    const bookmakers = [bk("bk1", 50, 10)];
    const credits = new Map<string, OriginalCredits>([
      ["bk1", { real: 100, freebet: 0 }],
    ]);
    const result = applyVirtualCredits(bookmakers, credits);
    expect(result[0].saldo_operavel).toBe(150);
    expect(result[0].saldo_disponivel).toBe(150);
    expect(result[0].saldo_freebet).toBe(10); // unchanged
  });

  it("adds freebet credit to saldo_freebet", () => {
    const bookmakers = [bk("bk1", 100, 20)];
    const credits = new Map<string, OriginalCredits>([
      ["bk1", { real: 0, freebet: 50 }],
    ]);
    const result = applyVirtualCredits(bookmakers, credits);
    expect(result[0].saldo_operavel).toBe(100); // unchanged
    expect(result[0].saldo_freebet).toBe(70);   // 20 + 50
  });

  it("adds both real and freebet credits simultaneously", () => {
    const bookmakers = [bk("bk1", 200, 30)];
    const credits = new Map<string, OriginalCredits>([
      ["bk1", { real: 100, freebet: 48 }],
    ]);
    const result = applyVirtualCredits(bookmakers, credits);
    expect(result[0].saldo_operavel).toBe(300);
    expect(result[0].saldo_freebet).toBe(78);
  });

  it("does not modify bookmakers without credits", () => {
    const bookmakers = [bk("bk1", 100, 50), bk("bk2", 200, 0)];
    const credits = new Map<string, OriginalCredits>([
      ["bk1", { real: 10, freebet: 5 }],
    ]);
    const result = applyVirtualCredits(bookmakers, credits);
    expect(result[1]).toEqual(bookmakers[1]); // bk2 unchanged
  });

  it("handles undefined saldo_freebet gracefully", () => {
    const bookmakers: BookmakerBalance[] = [
      { id: "bk1", saldo_operavel: 100, saldo_disponivel: 100 },
    ];
    const credits = new Map<string, OriginalCredits>([
      ["bk1", { real: 0, freebet: 25 }],
    ]);
    const result = applyVirtualCredits(bookmakers, credits);
    expect(result[0].saldo_freebet).toBe(25); // 0 + 25
  });
});

// ============ validateBalance ============
describe("validateBalance", () => {
  // --- Cenário 1: Modo CRIAÇÃO, saldo real suficiente ---
  it("no issues when real balance is sufficient (new mode)", () => {
    const bookmakers = [bk("bk1", 200), bk("bk2", 200)];
    const odds: OddEntry[] = [
      entry("bk1", "100"),
      entry("bk2", "100"),
    ];
    const result = validateBalance(odds, bookmakers, false, new Map());
    expect(result.hasInsufficientBalance).toBe(false);
    expect(result.insufficientLegs).toHaveLength(0);
  });

  // --- Cenário 2: Modo CRIAÇÃO, saldo real insuficiente ---
  it("flags insufficient real balance in new mode", () => {
    const bookmakers = [bk("bk1", 50)];
    const odds: OddEntry[] = [entry("bk1", "100")];
    const result = validateBalance(odds, bookmakers, false, new Map());
    expect(result.hasInsufficientBalance).toBe(true);
    expect(result.insufficientEntries.has("main-0")).toBe(true);
  });

  // --- Cenário 3: Modo CRIAÇÃO, freebet suficiente ---
  it("no issues when freebet balance is sufficient (new mode)", () => {
    const bookmakers = [bk("bk1", 200, 50)];
    const odds: OddEntry[] = [
      entry("bk1", "100", "REAL"),
      entry("bk1", "50", "FREEBET"),
    ];
    // Nota: mesma bk1 mas fontes diferentes
    const result = validateBalance(odds, bookmakers, false, new Map());
    expect(result.hasInsufficientBalance).toBe(false);
  });

  // --- Cenário 4: Modo CRIAÇÃO, freebet insuficiente ---
  it("flags insufficient freebet in new mode", () => {
    const bookmakers = [bk("bk1", 500, 20)];
    const odds: OddEntry[] = [entry("bk1", "50", "FREEBET")];
    const result = validateBalance(odds, bookmakers, false, new Map());
    expect(result.hasInsufficientBalance).toBe(true);
    expect(result.bookmakerFBInsuficientes.has("bk1")).toBe(true);
    expect(result.insufficientEntries.has("main-0")).toBe(true);
  });

  // --- Cenário 5: Modo EDIÇÃO, freebet com crédito virtual ---
  // ESTE É O BUG PRINCIPAL QUE FOI CORRIGIDO
  it("edit mode: freebet credit restores original freebet stake", () => {
    // Bookmaker atualmente tem saldo_freebet = 0 (porque a aposta original consumiu os 48)
    const bookmakers = [bk("bk1", 400, 0)];
    const odds: OddEntry[] = [entry("bk1", "48", "FREEBET")];
    // A aposta original tinha 48 de freebet
    const credits = new Map<string, OriginalCredits>([
      ["bk1", { real: 0, freebet: 48 }],
    ]);
    const result = validateBalance(odds, bookmakers, true, credits);
    // Com crédito virtual: saldoFB = 0 + 48 = 48, alocado.freebet = 48 → OK
    expect(result.hasInsufficientBalance).toBe(false);
    expect(result.bookmakerFBInsuficientes.has("bk1")).toBe(false);
  });

  // --- Cenário 6: Modo EDIÇÃO sem crédito → insuficiente ---
  it("edit mode WITHOUT credits: freebet would be insufficient", () => {
    const bookmakers = [bk("bk1", 400, 0)];
    const odds: OddEntry[] = [entry("bk1", "48", "FREEBET")];
    // Sem créditos → simula o bug antigo
    const result = validateBalance(odds, bookmakers, true, new Map());
    expect(result.hasInsufficientBalance).toBe(true);
  });

  // --- Cenário 7: Modo EDIÇÃO, real com crédito virtual ---
  it("edit mode: real credit restores original real stake", () => {
    const bookmakers = [bk("bk1", 300)]; // saldo após débito
    const odds: OddEntry[] = [entry("bk1", "400")];
    const credits = new Map<string, OriginalCredits>([
      ["bk1", { real: 100, freebet: 0 }],
    ]);
    // saldoReal = 300 + 100 = 400 → suficiente
    const result = validateBalance(odds, bookmakers, true, credits);
    expect(result.hasInsufficientBalance).toBe(false);
  });

  // --- Cenário 8: Modo EDIÇÃO, misto real+freebet com crédito ---
  it("edit mode: mixed real+freebet with credits both sufficient", () => {
    const bookmakers = [bk("bk1", 300, 0)]; // saldo após débito original (100 real + 50 fb)
    const odds: OddEntry[] = [
      entry("bk1", "100", "REAL"),
      entry("bk1", "50", "FREEBET"),
    ];
    const credits = new Map<string, OriginalCredits>([
      ["bk1", { real: 100, freebet: 50 }],
    ]);
    // Real: 300 + 100 = 400 ≥ 100 ✓  |  FB: 0 + 50 = 50 ≥ 50 ✓
    const result = validateBalance(odds, bookmakers, true, credits);
    expect(result.hasInsufficientBalance).toBe(false);
  });

  // --- Cenário 9: Sub-entries (additionalEntries) com freebet ---
  it("validates sub-entries freebet correctly", () => {
    const bookmakers = [bk("bk1", 200, 30)];
    const odds: OddEntry[] = [
      entry("bk1", "100", "REAL", [
        { bookmaker_id: "bk1", stake: "25", fonteSaldo: "FREEBET" },
      ]),
    ];
    const result = validateBalance(odds, bookmakers, false, new Map());
    expect(result.hasInsufficientBalance).toBe(false);
  });

  // --- Cenário 10: Sub-entries freebet insuficiente ---
  it("flags insufficient sub-entry freebet", () => {
    const bookmakers = [bk("bk1", 200, 10)];
    const odds: OddEntry[] = [
      entry("bk1", "100", "REAL", [
        { bookmaker_id: "bk1", stake: "25", fonteSaldo: "FREEBET" },
      ]),
    ];
    const result = validateBalance(odds, bookmakers, false, new Map());
    expect(result.hasInsufficientBalance).toBe(true);
    expect(result.insufficientEntries.has("sub-0-0")).toBe(true);
    // A entrada principal (real) NÃO deve ser marcada como insuficiente
    expect(result.insufficientEntries.has("main-0")).toBe(false);
  });

  // --- Cenário 11: Mesma casa em múltiplas pernas (acumulação) ---
  it("accumulates stakes across legs for same bookmaker", () => {
    const bookmakers = [bk("bk1", 150)];
    const odds: OddEntry[] = [
      entry("bk1", "80"),
      entry("bk1", "80"),
    ];
    // Total alocado: 160 > 150 → insuficiente
    const result = validateBalance(odds, bookmakers, false, new Map());
    expect(result.hasInsufficientBalance).toBe(true);
  });

  // --- Cenário 12: Casas diferentes, independentes ---
  it("validates different bookmakers independently", () => {
    const bookmakers = [bk("bk1", 100), bk("bk2", 100)];
    const odds: OddEntry[] = [
      entry("bk1", "100"),
      entry("bk2", "100"),
    ];
    const result = validateBalance(odds, bookmakers, false, new Map());
    expect(result.hasInsufficientBalance).toBe(false);
  });

  // --- Cenário 13: Edição com aumento de stake freebet além do crédito ---
  it("edit mode: increasing freebet beyond credit + current balance flags insufficient", () => {
    const bookmakers = [bk("bk1", 500, 0)]; // freebet foi consumido
    const odds: OddEntry[] = [entry("bk1", "80", "FREEBET")]; // user wants more
    const credits = new Map<string, OriginalCredits>([
      ["bk1", { real: 0, freebet: 48 }], // original was only 48
    ]);
    // saldoFB = 0 + 48 = 48 < 80 → insuficiente
    const result = validateBalance(odds, bookmakers, true, credits);
    expect(result.hasInsufficientBalance).toBe(true);
  });

  // --- Cenário 14: Tolerância de centavos (0.01) ---
  it("tolerates rounding within 0.01", () => {
    const bookmakers = [bk("bk1", 99.995)];
    const odds: OddEntry[] = [entry("bk1", "100")];
    const result = validateBalance(odds, bookmakers, false, new Map());
    expect(result.hasInsufficientBalance).toBe(false);
  });

  // --- Cenário 15: Stake vazia ou zero não gera erro ---
  it("empty or zero stakes don't cause issues", () => {
    const bookmakers = [bk("bk1", 0, 0)];
    const odds: OddEntry[] = [
      entry("bk1", ""),
      entry("bk1", "0"),
    ];
    const result = validateBalance(odds, bookmakers, false, new Map());
    expect(result.hasInsufficientBalance).toBe(false);
  });

  // --- Cenário 16: Modo criação NÃO aplica créditos ---
  it("creation mode ignores credits even if passed", () => {
    const bookmakers = [bk("bk1", 50, 0)];
    const odds: OddEntry[] = [entry("bk1", "100")];
    const credits = new Map<string, OriginalCredits>([
      ["bk1", { real: 100, freebet: 0 }],
    ]);
    // isEditing = false → creditos são ignorados → 50 < 100 → insuficiente
    const result = validateBalance(odds, bookmakers, false, credits);
    expect(result.hasInsufficientBalance).toBe(true);
  });

  // --- Cenário 17: 3 pernas, mix de casas e fontes ---
  it("complex 3-leg scenario with mixed sources", () => {
    const bookmakers = [
      bk("bet365", 400, 48),
      bk("betano", 400, 0),
      bk("sportingbet", 200, 100),
    ];
    const odds: OddEntry[] = [
      entry("bet365", "100", "REAL", [
        { bookmaker_id: "bet365", stake: "48", fonteSaldo: "FREEBET" },
      ]),
      entry("betano", "100", "REAL"),
      entry("sportingbet", "50", "FREEBET"),
    ];
    const result = validateBalance(odds, bookmakers, false, new Map());
    expect(result.hasInsufficientBalance).toBe(false);
  });

  // --- Cenário 18: Sub-entry herda bookmaker_id do pai ---
  it("sub-entry inherits parent bookmaker_id when not specified", () => {
    const bookmakers = [bk("bk1", 200, 30)];
    const odds: OddEntry[] = [
      entry("bk1", "100", "REAL", [
        { stake: "20", fonteSaldo: "FREEBET" }, // sem bookmaker_id explícito
      ]),
    ];
    const result = validateBalance(odds, bookmakers, false, new Map());
    // FB: 20 ≤ 30 ✓  |  Real: 100 ≤ 200 ✓
    expect(result.hasInsufficientBalance).toBe(false);
  });
});
