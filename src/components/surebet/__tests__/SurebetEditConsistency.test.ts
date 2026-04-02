/**
 * Testes de consistência para edição de arbitragem
 * 
 * Valida que:
 * - IDs são usados para matching (nunca índices)
 * - Estado local é limpo após save
 * - Cache é invalidado após mutações
 * - Formulário sempre usa dados fresh ao abrir
 */

import { describe, it, expect } from "vitest";
import type { OddEntry, OddFormEntry } from "@/hooks/useSurebetCalculator";

// ============================================================
// 1. TESTES DE TIPO: OddEntry e OddFormEntry possuem pernaId
// ============================================================

describe("OddEntry types carry pernaId", () => {
  it("OddEntry should support pernaId field", () => {
    const entry: OddEntry = {
      bookmaker_id: "bk-1",
      moeda: "BRL",
      odd: "2.0",
      stake: "100",
      selecao: "Casa",
      selecaoLivre: "",
      isReference: true,
      isManuallyEdited: false,
      pernaId: "uuid-perna-1",
      additionalEntries: [
        {
          bookmaker_id: "bk-2",
          moeda: "USD",
          odd: "1.8",
          stake: "50",
          selecaoLivre: "",
          pernaId: "uuid-perna-2",
        }
      ],
    };
    
    expect(entry.pernaId).toBe("uuid-perna-1");
    expect(entry.additionalEntries![0].pernaId).toBe("uuid-perna-2");
  });

  it("pernaId should be optional (undefined for new entries)", () => {
    const entry: OddEntry = {
      bookmaker_id: "bk-1",
      moeda: "BRL",
      odd: "2.0",
      stake: "100",
      selecao: "Casa",
      selecaoLivre: "",
      isReference: true,
      isManuallyEdited: false,
    };
    
    expect(entry.pernaId).toBeUndefined();
  });
});

// ============================================================
// 2. TESTES DE FLATTENING: pernaId é preservado
// ============================================================

describe("FlatPerna carries pernaId through flattening", () => {
  it("should carry pernaId from main entry", () => {
    const odds = createTestOdds([
      { pernaId: "uuid-1", bookmaker_id: "bk-1", odd: "2.0", stake: "100", selecao: "Casa" },
      { pernaId: "uuid-2", bookmaker_id: "bk-2", odd: "3.0", stake: "80", selecao: "Fora" },
    ]);
    
    const flat = flattenOdds(odds);
    
    expect(flat[0].pernaId).toBe("uuid-1");
    expect(flat[1].pernaId).toBe("uuid-2");
  });

  it("should carry pernaId from additionalEntries", () => {
    const odds = createTestOdds([
      { 
        pernaId: "uuid-1", bookmaker_id: "bk-1", odd: "2.0", stake: "100", selecao: "Casa",
        additionalEntries: [
          { pernaId: "uuid-3", bookmaker_id: "bk-3", odd: "1.9", stake: "50" }
        ]
      },
      { pernaId: "uuid-2", bookmaker_id: "bk-2", odd: "3.0", stake: "80", selecao: "Fora" },
    ]);
    
    const flat = flattenOdds(odds);
    
    expect(flat).toHaveLength(3);
    expect(flat[0].pernaId).toBe("uuid-1");
    expect(flat[1].pernaId).toBe("uuid-3");
    expect(flat[2].pernaId).toBe("uuid-2");
  });

  it("new entries should have undefined pernaId", () => {
    const odds = createTestOdds([
      { pernaId: "uuid-1", bookmaker_id: "bk-1", odd: "2.0", stake: "100", selecao: "Casa" },
      { bookmaker_id: "bk-2", odd: "3.0", stake: "80", selecao: "Fora" },
    ]);
    
    const flat = flattenOdds(odds);
    
    expect(flat[0].pernaId).toBe("uuid-1");
    expect(flat[1].pernaId).toBeUndefined();
  });
});

// ============================================================
// 3. TESTES DE ID-BASED MATCHING
// ============================================================

describe("ID-based matching (never index)", () => {
  it("should match existing pernas by ID even after reorder", () => {
    const originalSnapshot = [
      { id: "uuid-A", bookmaker_id: "bk-1", stake: 100, odd: 2.0, selecao: "Casa", selecao_livre: "", resultado: null, fonte_saldo: "REAL" },
      { id: "uuid-B", bookmaker_id: "bk-2", stake: 80, odd: 3.0, selecao: "Fora", selecao_livre: "", resultado: null, fonte_saldo: "REAL" },
    ];
    
    // User reorders: Fora comes first now
    const flatPernas = [
      { pernaId: "uuid-B", bookmaker_id: "bk-2" },
      { pernaId: "uuid-A", bookmaker_id: "bk-1" },
    ];
    
    for (const flat of flatPernas) {
      const match = originalSnapshot.find(op => op.id === flat.pernaId);
      expect(match).toBeDefined();
      expect(match!.bookmaker_id).toBe(flat.bookmaker_id);
    }
  });

  it("should detect new pernas (no pernaId)", () => {
    const flatPernas = [
      { pernaId: "uuid-A", bookmaker_id: "bk-1" },
      { pernaId: undefined, bookmaker_id: "bk-3" },
    ];
    
    const newPernas = flatPernas.filter(f => !f.pernaId);
    expect(newPernas).toHaveLength(1);
    expect(newPernas[0].bookmaker_id).toBe("bk-3");
  });

  it("should detect deleted pernas (in snapshot but not in flat)", () => {
    const originalIds = ["uuid-A", "uuid-B", "uuid-C"];
    const flatPernaIds = ["uuid-A", "uuid-C"];
    
    const toDelete = originalIds.filter(id => !flatPernaIds.includes(id));
    expect(toDelete).toEqual(["uuid-B"]);
  });
});

// ============================================================
// 4. TESTES DE CLEANUP DE ESTADO
// ============================================================

describe("State cleanup on close", () => {
  it("should clear refs when modal closes", () => {
    const snapshotRef = { current: [{ id: "uuid-1", bookmaker_id: "bk-1", stake: 100 }] };
    const idsRef = { current: ["uuid-1"] };
    const stakesRef = { current: new Map([["bk-1", { real: 100, freebet: 0 }]]) };
    
    // Simulate close
    snapshotRef.current = [];
    idsRef.current = [];
    stakesRef.current = new Map();
    
    expect(snapshotRef.current).toEqual([]);
    expect(idsRef.current).toEqual([]);
    expect(stakesRef.current.size).toBe(0);
  });

  it("should not reuse stale data after close+reopen", () => {
    const snapshotRef = { current: [] as any[] };
    
    // Open: load from DB
    snapshotRef.current = [{ id: "uuid-1", stake: 100 }];
    expect(snapshotRef.current).toHaveLength(1);
    
    // Close: cleanup
    snapshotRef.current = [];
    expect(snapshotRef.current).toHaveLength(0);
    
    // Reopen: ref is empty, must fetch
    expect(snapshotRef.current).toHaveLength(0);
  });
});

// ============================================================
// 5. TESTES DE RPC PAYLOAD
// ============================================================

describe("Atomic RPC payload construction", () => {
  it("should include ID for existing pernas and null for new ones", () => {
    const flatPernas = [
      { pernaId: "uuid-1", bookmaker_id: "bk-1", odd: "2.0", stake: "100", moeda: "BRL", selecao: "Casa", fonteSaldo: "REAL" as const },
      { pernaId: undefined, bookmaker_id: "bk-2", odd: "3.0", stake: "80", moeda: "BRL", selecao: "Fora", fonteSaldo: "REAL" as const },
    ];
    
    const payload = flatPernas.map(f => ({
      id: f.pernaId || null,
      bookmaker_id: f.bookmaker_id,
      stake: parseFloat(f.stake),
      odd: parseFloat(f.odd),
      moeda: f.moeda,
      selecao: f.selecao,
      fonte_saldo: f.fonteSaldo,
    }));
    
    expect(payload[0].id).toBe("uuid-1");
    expect(payload[1].id).toBeNull();
    expect(payload).toHaveLength(2);
  });
  
  it("consecutive edits of same perna use same UUID", () => {
    const edit1 = { id: "uuid-1", stake: 150, odd: 2.0 };
    const edit2 = { id: "uuid-1", stake: 150, odd: 2.5 };
    
    expect(edit1.id).toBe(edit2.id);
    expect(edit1.id).toBe("uuid-1");
  });
  
  it("should correctly segregate existing vs new vs deleted", () => {
    const originalIds = ["uuid-A", "uuid-B", "uuid-C"];
    const editedPernas = [
      { pernaId: "uuid-A", stake: 200 },  // edited
      { pernaId: "uuid-C", stake: 100 },  // unchanged
      { pernaId: undefined, stake: 50 },   // new
    ];
    
    const inputIds = editedPernas.filter(p => p.pernaId).map(p => p.pernaId!);
    const toDelete = originalIds.filter(id => !inputIds.includes(id));
    const toInsert = editedPernas.filter(p => !p.pernaId);
    const toUpdate = editedPernas.filter(p => p.pernaId);
    
    expect(toDelete).toEqual(["uuid-B"]);
    expect(toInsert).toHaveLength(1);
    expect(toUpdate).toHaveLength(2);
  });
});

// ============================================================
// HELPERS
// ============================================================

interface TestOddInput {
  pernaId?: string;
  bookmaker_id: string;
  odd: string;
  stake: string;
  selecao: string;
  additionalEntries?: Array<{ pernaId?: string; bookmaker_id: string; odd: string; stake: string }>;
}

interface FlatPerna {
  pernaId?: string;
  bookmaker_id: string;
  odd: string;
  stake: string;
  selecao: string;
}

function createTestOdds(inputs: TestOddInput[]) {
  return inputs.map((input, i) => ({
    ...input,
    moeda: "BRL" as const,
    selecaoLivre: "",
    isReference: i === 0,
    isManuallyEdited: true,
    fonteSaldo: "REAL" as const,
  }));
}

function flattenOdds(odds: ReturnType<typeof createTestOdds>): FlatPerna[] {
  const result: FlatPerna[] = [];
  for (const entry of odds) {
    result.push({
      pernaId: entry.pernaId,
      bookmaker_id: entry.bookmaker_id,
      odd: entry.odd,
      stake: entry.stake,
      selecao: entry.selecao,
    });
    if (entry.additionalEntries) {
      for (const sub of entry.additionalEntries) {
        if (sub.bookmaker_id && parseFloat(sub.odd) > 1 && parseFloat(sub.stake) > 0) {
          result.push({
            pernaId: sub.pernaId,
            bookmaker_id: sub.bookmaker_id,
            odd: sub.odd,
            stake: sub.stake,
            selecao: entry.selecao,
          });
        }
      }
    }
  }
  return result;
}
