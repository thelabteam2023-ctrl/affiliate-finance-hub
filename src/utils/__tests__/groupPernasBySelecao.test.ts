import { describe, it, expect } from "vitest";
import { groupPernasBySelecao } from "../groupPernasBySelecao";

describe("groupPernasBySelecao", () => {
  // ============================================================
  // CASO BASE: Pernas sem sub-entries (cada seleção tem 1 perna)
  // ============================================================
  it("retorna pernas simples sem agrupamento quando não há duplicatas", () => {
    const pernas = [
      { id: "p1", bookmaker_id: "bk1", bookmaker_nome: "Bet365", selecao: "Casa", odd: 2.1, stake: 100, resultado: "GREEN", moeda: "BRL" },
      { id: "p2", bookmaker_id: "bk2", bookmaker_nome: "Betfair", selecao: "Empate", odd: 3.0, stake: 70, resultado: "RED", moeda: "BRL" },
      { id: "p3", bookmaker_id: "bk3", bookmaker_nome: "Pinnacle", selecao: "Fora", odd: 4.0, stake: 50, resultado: "RED", moeda: "BRL" },
    ];

    const result = groupPernasBySelecao(pernas);

    expect(result).toHaveLength(3);
    expect(result[0].selecao).toBe("Casa");
    expect(result[1].selecao).toBe("Empate");
    expect(result[2].selecao).toBe("Fora");
    
    // Sem sub-entries
    expect(result[0].entries).toBeUndefined();
    expect(result[1].entries).toBeUndefined();
    expect(result[2].entries).toBeUndefined();
  });

  // ============================================================
  // CASO CRÍTICO: Sub-entries (múltiplas pernas na mesma seleção)
  // Este é o caso que causava o bug de liquidação
  // ============================================================
  it("agrupa pernas com mesma seleção e cria entries", () => {
    const pernas = [
      { id: "p1", bookmaker_id: "bk-sport", bookmaker_nome: "SPORTMARKET", selecao: "Sim", odd: 2.38, stake: 146, resultado: "RED", moeda: "EUR" },
      { id: "p2", bookmaker_id: "bk-pistolo", bookmaker_nome: "PISTOLO", selecao: "Não", odd: 2.75, stake: 100, resultado: "RED", moeda: "USD" },
      { id: "p3", bookmaker_id: "bk-hugewin", bookmaker_nome: "HUGEWIN", selecao: "Não", odd: 2.86, stake: 42.7, resultado: "RED", moeda: "USD" },
      { id: "p4", bookmaker_id: "bk-supabet", bookmaker_nome: "SUPABET", selecao: "Fora", odd: 3.7, stake: 107, resultado: "GREEN", moeda: "USD" },
    ];

    const result = groupPernasBySelecao(pernas);

    // Deve gerar 3 GRUPOS (não 4 pernas flat)
    expect(result).toHaveLength(3);
    
    // Grupo 0: Sim (1 perna)
    expect(result[0].selecao).toBe("Sim");
    expect(result[0].bookmaker_nome).toBe("SPORTMARKET");
    expect(result[0].entries).toBeUndefined();
    
    // Grupo 1: Não (2 pernas agrupadas)
    expect(result[1].selecao).toBe("Não");
    expect(result[1].entries).toBeDefined();
    expect(result[1].entries).toHaveLength(2);
    expect(result[1].entries![0].bookmaker_nome).toBe("PISTOLO");
    expect(result[1].entries![1].bookmaker_nome).toBe("HUGEWIN");
    expect(result[1].odd_media).toBeDefined();
    expect(result[1].stake_total).toBe(142.7); // 100 + 42.7
    
    // Grupo 2: Fora (1 perna)
    expect(result[2].selecao).toBe("Fora");
    expect(result[2].bookmaker_nome).toBe("SUPABET");
    expect(result[2].entries).toBeUndefined();
  });

  // ============================================================
  // TESTE DE MAPEAMENTO DE ÍNDICES (simula o fluxo de quickResolve)
  // Verifica que winners[2] mapeia para grupo "Fora", não perna flat[2]
  // ============================================================
  it("índices de grupo alinham com lógica de winners do menu", () => {
    const pernas = [
      { id: "p1", bookmaker_id: "bk1", bookmaker_nome: "BK1", selecao: "Sim", odd: 2.0, stake: 100, resultado: null, moeda: "USD" },
      { id: "p2", bookmaker_id: "bk2", bookmaker_nome: "BK2", selecao: "Não", odd: 2.5, stake: 80, resultado: null, moeda: "USD" },
      { id: "p3", bookmaker_id: "bk3", bookmaker_nome: "BK3", selecao: "Não", odd: 2.8, stake: 40, resultado: null, moeda: "USD" },
      { id: "p4", bookmaker_id: "bk4", bookmaker_nome: "BK4", selecao: "Fora", odd: 3.5, stake: 60, resultado: null, moeda: "USD" },
    ];

    const grupos = groupPernasBySelecao(pernas);
    
    // Simular quickResolve com winners = [2] (Fora ganha)
    const winners = [2]; // índice de GRUPO
    
    const resultadosPorPerna: Record<string, string> = {};
    
    for (let i = 0; i < grupos.length; i++) {
      const grupo = grupos[i];
      const isWinner = winners.includes(i);
      const resultado = isWinner ? "GREEN" : "RED";
      
      if (grupo.entries && grupo.entries.length > 1) {
        // Sub-entries: TODAS recebem o mesmo resultado do grupo
        for (const entry of grupo.entries) {
          resultadosPorPerna[entry.id!] = resultado;
        }
      } else {
        resultadosPorPerna[grupo.id] = resultado;
      }
    }
    
    // VERIFICAÇÕES CRÍTICAS:
    // BK1 (Sim, grupo 0) → RED
    expect(resultadosPorPerna["p1"]).toBe("RED");
    // BK2 (Não, grupo 1) → RED (sub-entry)
    expect(resultadosPorPerna["p2"]).toBe("RED");
    // BK3 (Não, grupo 1) → RED (sub-entry, MESMA seleção que BK2)
    expect(resultadosPorPerna["p3"]).toBe("RED");
    // BK4 (Fora, grupo 2) → GREEN (vencedor)
    expect(resultadosPorPerna["p4"]).toBe("GREEN");
  });

  // ============================================================
  // SIMULAÇÃO DO BUG ORIGINAL: sem agrupamento, flat index mapping
  // Demonstra que o bug causava resultados errados
  // ============================================================
  it("demonstra o bug quando usa índices flat em vez de grupos", () => {
    const pernasFlat = [
      { id: "p1", bookmaker_id: "bk1", selecao: "Sim", odd: 2.0, stake: 100 },
      { id: "p2", bookmaker_id: "bk2", selecao: "Não", odd: 2.5, stake: 80 },
      { id: "p3", bookmaker_id: "bk3", selecao: "Não", odd: 2.8, stake: 40 },
      { id: "p4", bookmaker_id: "bk4", selecao: "Fora", odd: 3.5, stake: 60 },
    ];

    // Menu gera winners = [2] baseado em GRUPOS (Fora é grupo 2)
    const winners = [2];
    
    // BUG: usar flat index
    const buggyResults: Record<string, string> = {};
    for (let i = 0; i < pernasFlat.length; i++) {
      const isWinner = winners.includes(i); // BUG: i é flat, winners é grupo
      buggyResults[pernasFlat[i].id] = isWinner ? "GREEN" : "RED";
    }
    
    // Com o bug: p3 (BK3, "Não") recebe GREEN incorretamente!
    expect(buggyResults["p3"]).toBe("GREEN"); // BUG! Deveria ser RED
    expect(buggyResults["p4"]).toBe("RED");   // BUG! Deveria ser GREEN
    
    // CORRETO: usar grupos
    const grupos = groupPernasBySelecao(pernasFlat.map(p => ({
      ...p, bookmaker_nome: "BK", resultado: null, moeda: "USD"
    })));
    
    const correctResults: Record<string, string> = {};
    for (let i = 0; i < grupos.length; i++) {
      const isWinner = winners.includes(i);
      const resultado = isWinner ? "GREEN" : "RED";
      if (grupos[i].entries && grupos[i].entries!.length > 1) {
        for (const entry of grupos[i].entries!) {
          correctResults[entry.id!] = resultado;
        }
      } else {
        correctResults[grupos[i].id] = resultado;
      }
    }
    
    // Correto: p3 (BK3, "Não") recebe RED, p4 (BK4, "Fora") recebe GREEN
    expect(correctResults["p3"]).toBe("RED");
    expect(correctResults["p4"]).toBe("GREEN");
  });

  // ============================================================
  // EDGE CASE: Todas pernas com seleção diferente (sem agrupamento)
  // ============================================================
  it("modelo 1-2 simples sem sub-entries", () => {
    const pernas = [
      { id: "p1", bookmaker_id: "bk1", bookmaker_nome: "BK1", selecao: "Casa", odd: 1.8, stake: 100, resultado: null, moeda: "BRL" },
      { id: "p2", bookmaker_id: "bk2", bookmaker_nome: "BK2", selecao: "Fora", odd: 2.2, stake: 80, resultado: null, moeda: "BRL" },
    ];

    const result = groupPernasBySelecao(pernas);
    expect(result).toHaveLength(2);
    expect(result[0].entries).toBeUndefined();
    expect(result[1].entries).toBeUndefined();
  });

  // ============================================================
  // EDGE CASE: 3 pernas na mesma seleção
  // ============================================================
  it("agrupa 3+ pernas na mesma seleção corretamente", () => {
    const pernas = [
      { id: "p1", bookmaker_id: "bk1", bookmaker_nome: "BK1", selecao: "Over 2.5", odd: 2.0, stake: 50, resultado: null, moeda: "USD" },
      { id: "p2", bookmaker_id: "bk2", bookmaker_nome: "BK2", selecao: "Over 2.5", odd: 2.1, stake: 30, resultado: null, moeda: "USD" },
      { id: "p3", bookmaker_id: "bk3", bookmaker_nome: "BK3", selecao: "Over 2.5", odd: 1.9, stake: 20, resultado: null, moeda: "EUR" },
      { id: "p4", bookmaker_id: "bk4", bookmaker_nome: "BK4", selecao: "Under 2.5", odd: 1.85, stake: 100, resultado: null, moeda: "BRL" },
    ];

    const result = groupPernasBySelecao(pernas);
    
    expect(result).toHaveLength(2); // 2 grupos
    expect(result[0].selecao).toBe("Over 2.5");
    expect(result[0].entries).toHaveLength(3);
    expect(result[0].stake_total).toBe(100); // 50 + 30 + 20
    expect(result[1].selecao).toBe("Under 2.5");
    expect(result[1].entries).toBeUndefined();
  });

  // ============================================================
  // EDGE CASE: Odd média ponderada
  // ============================================================
  it("calcula odd média ponderada corretamente", () => {
    const pernas = [
      { id: "p1", bookmaker_id: "bk1", bookmaker_nome: "BK1", selecao: "Casa", odd: 2.0, stake: 100, resultado: null, moeda: "USD" },
      { id: "p2", bookmaker_id: "bk2", bookmaker_nome: "BK2", selecao: "Casa", odd: 3.0, stake: 50, resultado: null, moeda: "USD" },
    ];

    const result = groupPernasBySelecao(pernas);
    
    // Odd média ponderada = (2.0*100 + 3.0*50) / (100+50) = 350/150 = 2.333...
    expect(result[0].odd_media).toBeCloseTo(2.333, 2);
    expect(result[0].stake_total).toBe(150);
  });

  // ============================================================
  // EDGE CASE: Lucro agregado de sub-entries
  // ============================================================
  it("agrega lucro de sub-entries corretamente", () => {
    const pernas = [
      { id: "p1", bookmaker_id: "bk1", bookmaker_nome: "BK1", selecao: "Casa", odd: 2.0, stake: 100, resultado: "RED", lucro_prejuizo: -100, moeda: "USD" },
      { id: "p2", bookmaker_id: "bk2", bookmaker_nome: "BK2", selecao: "Casa", odd: 3.0, stake: 50, resultado: "RED", lucro_prejuizo: -50, moeda: "USD" },
    ];

    const result = groupPernasBySelecao(pernas);
    
    // Lucro agregado = -100 + -50 = -150
    expect(result[0].lucro_prejuizo).toBe(-150);
  });

  // ============================================================
  // SIMULAÇÃO: Duplo Green com sub-entries
  // ============================================================
  it("simulação de duplo green com sub-entries funciona corretamente", () => {
    const pernas = [
      { id: "p1", bookmaker_id: "bk1", bookmaker_nome: "BK1", selecao: "Casa", odd: 2.5, stake: 100, resultado: null, moeda: "USD" },
      { id: "p2", bookmaker_id: "bk2", bookmaker_nome: "BK2", selecao: "Empate", odd: 3.0, stake: 60, resultado: null, moeda: "USD" },
      { id: "p3", bookmaker_id: "bk3", bookmaker_nome: "BK3", selecao: "Empate", odd: 3.2, stake: 30, resultado: null, moeda: "EUR" },
      { id: "p4", bookmaker_id: "bk4", bookmaker_nome: "BK4", selecao: "Fora", odd: 4.0, stake: 50, resultado: null, moeda: "USD" },
    ];

    const grupos = groupPernasBySelecao(pernas.map(p => ({ ...p })));
    
    // Simular Duplo Green: Casa + Fora ganham (grupos 0 e 2)
    const winners = [0, 2];
    
    const resultados: Record<string, string> = {};
    for (let i = 0; i < grupos.length; i++) {
      const isWinner = winners.includes(i);
      const resultado = isWinner ? "GREEN" : "RED";
      if (grupos[i].entries && grupos[i].entries!.length > 1) {
        for (const entry of grupos[i].entries!) {
          resultados[entry.id!] = resultado;
        }
      } else {
        resultados[grupos[i].id] = resultado;
      }
    }
    
    expect(resultados["p1"]).toBe("GREEN"); // Casa
    expect(resultados["p2"]).toBe("RED");   // Empate sub-entry 1
    expect(resultados["p3"]).toBe("RED");   // Empate sub-entry 2 (MESMO resultado!)
    expect(resultados["p4"]).toBe("GREEN"); // Fora
  });

  // ============================================================
  // SIMULAÇÃO: VOID total com sub-entries
  // ============================================================
  it("void total aplica VOID em todas sub-entries", () => {
    const pernas = [
      { id: "p1", bookmaker_id: "bk1", bookmaker_nome: "BK1", selecao: "Casa", odd: 2.0, stake: 100, resultado: null, moeda: "USD" },
      { id: "p2", bookmaker_id: "bk2", bookmaker_nome: "BK2", selecao: "Fora", odd: 2.5, stake: 80, resultado: null, moeda: "USD" },
      { id: "p3", bookmaker_id: "bk3", bookmaker_nome: "BK3", selecao: "Fora", odd: 2.3, stake: 40, resultado: null, moeda: "USD" },
    ];

    const grupos = groupPernasBySelecao(pernas.map(p => ({ ...p })));
    
    // Void total
    const resultados: Record<string, string> = {};
    for (let i = 0; i < grupos.length; i++) {
      const resultado = "VOID";
      if (grupos[i].entries && grupos[i].entries!.length > 1) {
        for (const entry of grupos[i].entries!) {
          resultados[entry.id!] = resultado;
        }
      } else {
        resultados[grupos[i].id] = resultado;
      }
    }
    
    expect(resultados["p1"]).toBe("VOID");
    expect(resultados["p2"]).toBe("VOID");
    expect(resultados["p3"]).toBe("VOID");
  });
});
