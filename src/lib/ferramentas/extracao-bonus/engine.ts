import { ExtractionConfig } from "./types";

/**
 * Motor de simulação e cálculo da ferramenta de Extração de Bônus.
 */

export function calculateScenarios(config: ExtractionConfig, o1: number, o2: number) {
  const { 
    bonusAmount, 
    spread, 
    exchangeCommission, 
    model, 
    capitalType 
  } = config;

  const k = 1 - (exchangeCommission / 100);
  const stake = capitalType === 'real' ? bonusAmount : 0;
  const oLay1 = o1 * (1 + (spread / 100));
  const oLay2 = o2 * (1 + (spread / 100));
  const oMult = o1 * o2;
  const lucroCasas = bonusAmount * (oMult - 1);

  let lay1, resp1, ret1, lay2, resp2, ret2, c1, c2, c3;

  if (model === 'Equilibrado') {
    // Modelo Equilibrado — resolve sistema onde C1 = C2 = C3 = X:
    // A = a + b * (1 + a) onde a = (oLay1 - 1) / k e b = (oLay2 - 1) / k
    const a = (oLay1 - 1) / k;
    const b = (oLay2 - 1) / k;
    const A = a + b * (1 + a);
    const X = lucroCasas / (1 + A) - stake;

    lay1 = (X + stake) / k;
    resp1 = lay1 * (oLay1 - 1);
    ret1 = lay1 * k;

    lay2 = (X + stake + resp1) / k;
    resp2 = lay2 * (oLay2 - 1);
    ret2 = lay2 * k;

    c1 = ret1 - stake;
    c2 = -resp1 + ret2 - stake;
    c3 = lucroCasas - resp1 - resp2 - stake;
  } else if (model === 'Cenário 3 Zero') {
    // Modelo Cenário 3 Zero: Resolve as stakes para que C3 = 0.
    // C3 = lucroCasas - resp1 - resp2 - stake = 0
    // resp1 = lay1 * (oLay1 - 1)
    // resp2 = lay2 * (oLay2 - 1)
    // lay2 = (ret1 + resp1) / k = (lay1 * k + lay1 * (oLay1 - 1)) / k = lay1 * (k + oLay1 - 1) / k
    // resp2 = [lay1 * (k + oLay1 - 1) / k] * (oLay2 - 1)
    
    // Substituindo em C3:
    // lucroCasas - stake = lay1 * (oLay1 - 1) + lay1 * [(k + oLay1 - 1) / k] * (oLay2 - 1)
    // lay1 = (lucroCasas - stake) / [(oLay1 - 1) + ((k + oLay1 - 1) / k) * (oLay2 - 1)]
    
    const fatorLay2 = (k + oLay1 - 1) / k;
    lay1 = (lucroCasas - stake) / ((oLay1 - 1) + fatorLay2 * (oLay2 - 1));
    resp1 = lay1 * (oLay1 - 1);
    ret1 = lay1 * k;

    lay2 = lay1 * fatorLay2;
    resp2 = lay2 * (oLay2 - 1);
    ret2 = lay2 * k;

    c1 = ret1 - stake;
    c2 = -resp1 + ret2 - stake;
    c3 = 0; // Forçado por construção
  } else {
    // Modelo Cascata — lay1 fixado pelo bônus, lay2 cobre perda do lay1 + meta:
    lay1 = bonusAmount;
    resp1 = lay1 * (oLay1 - 1);
    ret1 = lay1 * k;

    lay2 = (ret1 + resp1) / k;
    resp2 = lay2 * (oLay2 - 1);
    ret2 = lay2 * k;

    c1 = ret1 - stake;
    c2 = -resp1 + ret2 - stake;
    c3 = lucroCasas - resp1 - resp2 - stake;
  }

  // Probabilidades
  const pC1 = 1 - (1 / o1);
  const pC2 = (1 / o1) * (1 - (1 / o2));
  const pC3 = (1 / o1) * (1 / o2);

  // Valor Esperado
  const eVal = pC1 * c1 + pC2 * c2 + pC3 * c3;
  const std = Math.sqrt(pC1 * Math.pow(c1, 2) + pC2 * Math.pow(c2, 2) + pC3 * Math.pow(c3, 2) - Math.pow(eVal, 2));

  return {
    oLay1,
    oLay2,
    oMult,
    lay1,
    resp1,
    ret1,
    lay2,
    resp2,
    ret2,
    c1,
    c2,
    c3,
    // Resultados específicos da Exchange (para rastrear extração real)
    cEx1: ret1,
    cEx2: ret2 - resp1,
    cEx3: -(resp1 + resp2),
    pC1,
    pC2,
    pC3,
    eVal,
    eValEx: pC1 * ret1 + pC2 * (ret2 - resp1) + pC3 * (-(resp1 + resp2)),
    std,
    limCompleta: resp1 + resp2,
    limP1: resp1
  };
}

export function runMonteCarlo(
  config: ExtractionConfig, 
  o1: number, 
  o2: number, 
  meta: number, 
  nOps: number, 
  nSims: number,
  initialBanca?: number
) {
  const sc = calculateScenarios(config, o1, o2);
  const results = [];
  
  let successCount = 0;
  let brokeCount = 0;
  let stayInBetweenCount = 0; // Entre saldo inicial e meta
  const opsParaMeta = [];
  const saldosFinaisRaw = [];

  for (let s = 0; s < nSims; s++) {
    let saldo = initialBanca !== undefined ? initialBanca : 0;
    const initialSaldo = saldo;
    const metaAlvo = initialBanca !== undefined ? initialBanca + meta : meta;
    let hitMeta = saldo >= metaAlvo;
    let broke = false;
    let vezSemP2 = 0;
    let vezFatalSemP2 = 0;
    let maxSeqFalhas = 0;
    let currentSeqFalhas = 0;

    for (let i = 0; i < nOps; i++) {
      // Nível 3: Quebra Total
      if (saldo < sc.limP1) {
        broke = true;
        break;
      }

      const completa = saldo >= sc.limCompleta;
      if (!completa) vezSemP2++;

      const r = Math.random();
      
      if (completa) {
        if (r < sc.pC1) {
          saldo += sc.cEx1;
          // Sucesso na extração (dinheiro foi para a exchange)
          maxSeqFalhas = Math.max(maxSeqFalhas, currentSeqFalhas); 
          currentSeqFalhas = 0;
        } else if (r < sc.pC1 + sc.pC2) {
          saldo += sc.cEx2;
          // Sucesso na extração (dinheiro foi para a exchange)
          maxSeqFalhas = Math.max(maxSeqFalhas, currentSeqFalhas); 
          currentSeqFalhas = 0;
        } else {
          saldo += sc.cEx3;
          // Falha na extração (dinheiro ficou na casa - Cenário 3)
          currentSeqFalhas++;
        }
      } else {
        // Zona de Risco
        if (r < sc.pC1) {
          saldo += sc.cEx1;
          maxSeqFalhas = Math.max(maxSeqFalhas, currentSeqFalhas);
          currentSeqFalhas = 0;
        } else {
          // Perna 1 passou mas não tinha capital para Perna 2 (Falha crítica)
          vezFatalSemP2++;
          saldo -= sc.limP1;
          currentSeqFalhas++;
        }
      }

      if (saldo >= metaAlvo && !hitMeta) {
        hitMeta = true;
        opsParaMeta.push(i + 1);
      }
    }

    maxSeqFalhas = Math.max(maxSeqFalhas, currentSeqFalhas);
    if (hitMeta) {
      successCount++;
    } else if (broke) {
      brokeCount++;
    } else if (saldo > initialSaldo) {
      stayInBetweenCount++;
    }

    saldosFinaisRaw.push(saldo);
    results.push({
      saldoFinal: saldo,
      hitMeta,
      broke,
      vezSemP2,
      vezFatalSemP2,
      maxSeqFalhas
    });
  }

  // Mediana de ops para meta
  opsParaMeta.sort((a, b) => a - b);
  const medOps = opsParaMeta.length > 0 ? opsParaMeta[Math.floor(opsParaMeta.length / 2)] : 0;

  // Estatísticas de saldos finais
  const sortedSaldos = [...saldosFinaisRaw].sort((a, b) => a - b);
  const getPercentile = (p: number) => sortedSaldos[Math.floor(sortedSaldos.length * (p / 100))] || 0;

  const stats = {
    min: sortedSaldos[0],
    max: sortedSaldos[sortedSaldos.length - 1],
    avg: saldosFinaisRaw.reduce((a, b) => a + b, 0) / nSims,
    p5: getPercentile(5),
    p25: getPercentile(25),
    p50: getPercentile(50),
    p75: getPercentile(75),
    p95: getPercentile(95)
  };

  // Mediana de sequencia de falhas
  const seqFalhas = results.map(r => r.maxSeqFalhas).sort((a, b) => a - b);
  const medSeq = seqFalhas[Math.floor(seqFalhas.length / 2)];

  // Diagnóstico
  const diagnostics = {
    input: {
      meta,
      nOps,
      nSims,
      initialBanca: initialBanca || 0,
      odd1: o1,
      odd2: o2,
      evPerOp: sc.eVal
    },
    counts: {
      success: successCount,
      broke: brokeCount,
      stayInBetween: stayInBetweenCount,
      total: nSims
    },
    stats,
    alerts: [] as string[]
  };

  // Validação de Consistência (Regras do Sentinel)
  if (sc.eVal > 0 && stats.avg > (initialBanca || 0) && successCount === 0) {
    diagnostics.alerts.push("Possível inconsistência: expectativa positiva com probabilidade de meta nula.");
  }

  return {
    pMeta: successCount / nSims,
    medOps,
    medSeq,
    p50: stats.p50,
    results,
    diagnostics
  };
}
