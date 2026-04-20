/**
 * Auto-scheduler de células de plano para o calendário de planejamento.
 *
 * Distingue duas categorias:
 *  - CLONES: células do grupo "CLONES" (case-insensitive). Sujeitas a:
 *      - clonesPorDia (limite de CPFs distintos clones por dia)
 *      - cooldownCpfDias (mesmo CPF não pode criar outra clone antes de N dias)
 *      - cooldownCasaDias (mesma casa não pode repetir antes de N dias)
 *  - OUTRAS (Arbitragem, Promoções, Value, etc.): só sujeitas a:
 *      - cooldownCasaDias (evita repetir a casa)
 *      - maxCasasPorDia (teto global do dia)
 *      - metaGanhoDia (teto de soma de depósito sugerido)
 *
 * 100% client-side, puro (sem React, sem Supabase).
 */
import type { CelulaDisponivel } from "@/hooks/usePlanoCelulasDisponiveis";
import type { PlanningCampanha } from "@/hooks/usePlanningData";

export interface AutoSchedulerConfig {
  /** Máximo de CPFs distintos da categoria CLONES por dia. */
  clonesPorDia: number;
  /** Máximo de casas (qualquer categoria) por dia. 0 = sem limite. */
  maxCasasPorDia: number;
  /** Meta de ganho por dia (soma deposito_sugerido). 0 = desativado. */
  metaGanhoDia: number;
  /** Cooldown entre repetições da mesma casa (qualquer grupo). */
  cooldownCasaDias: number;
  /** Cooldown entre repetições do mesmo CPF — APENAS para clones. */
  cooldownCpfDias: number;
  /** Último dia do mês a usar (ex.: 23). */
  diaLimite: number;
}

export interface AgendamentoSimulado {
  celula: CelulaDisponivel;
  dia: number; // 1..31
  dateKey: string; // YYYY-MM-DD
}

export interface CelulaNaoAgendadaDetalhe {
  celula: CelulaDisponivel;
  motivo: "cooldown_cpf" | "cooldown_casa" | "sem_capacidade" | "outro";
  detalhe: string;
}

export interface SimulacaoResultado {
  agendamentos: AgendamentoSimulado[];
  warnings: string[];
  naoAgendadas: CelulaDisponivel[];
  naoAgendadasDetalhe: CelulaNaoAgendadaDetalhe[];
  estatisticas: {
    totalCelulas: number;
    totalClones: number;
    totalOutras: number;
    agendadas: number;
    capacidadeMaxima: number;
    diasUsados: number;
    ganhoTotal: number;
    capacidadePorCpfClone: number;
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function buildDateKey(year: number, month1Based: number, day: number) {
  return `${year}-${pad(month1Based)}-${pad(day)}`;
}

/** Identidade canônica do CPF: usa parceiro_id; cai para "cpf:<idx>" como chave estável. */
function cpfKey(c: CelulaDisponivel): string | null {
  if (c.parceiro_id) return c.parceiro_id;
  if (c.cpf_index) return `cpf:${c.cpf_index}`;
  return null;
}

/** True se a célula pertence à categoria CLONES (cooldown CPF + clones/dia). */
function isClone(c: CelulaDisponivel): boolean {
  const n = (c.grupo_nome || "").toLowerCase();
  return n.includes("clone");
}

export function simularDistribuicao(input: {
  celulas: CelulaDisponivel[];
  campanhasExistentes: PlanningCampanha[];
  year: number;
  month: number; // 1..12
  config: AutoSchedulerConfig;
}): SimulacaoResultado {
  const { celulas, campanhasExistentes, year, month, config } = input;
  const {
    clonesPorDia,
    maxCasasPorDia,
    metaGanhoDia,
    cooldownCasaDias,
    cooldownCpfDias,
    diaLimite,
  } = config;

  const candidatas = celulas.filter((c) => !c.agendada_em && !c.campanha_id);
  const totalClones = candidatas.filter(isClone).length;
  const totalOutras = candidatas.length - totalClones;

  const ultimoDia = new Date(year, month, 0).getDate();
  const limite = Math.min(diaLimite, ultimoDia);

  // Backlog por CPF — só considera clones (CPFs de outras categorias não importam)
  const backlogPorCpf = new Map<string, number>();
  candidatas.forEach((c) => {
    if (!isClone(c)) return;
    const k = cpfKey(c);
    if (!k) return;
    backlogPorCpf.set(k, (backlogPorCpf.get(k) ?? 0) + 1);
  });

  interface DaySlot {
    casas: Set<string>; // todas as casas (clone + não-clone)
    cpfsClone: Set<string>; // CPFs de clones nesse dia
    ganho: number;
  }
  const ocupacao = new Map<number, DaySlot>();
  for (let d = 1; d <= limite; d++) {
    ocupacao.set(d, { casas: new Set(), cpfsClone: new Set(), ganho: 0 });
  }

  const ultimoUsoCasa = new Map<string, number>();
  const ultimoUsoCpfClone = new Map<string, number>(); // só clones

  // Pré-popula com campanhas existentes — bloqueio da casa sempre, CPF só se for de clone
  // (não conhecemos grupo_nome das campanhas existentes aqui; tratamos a casa sempre)
  campanhasExistentes.forEach((c) => {
    const parts = c.scheduled_date.split("-");
    const cy = Number(parts[0]);
    const cm = Number(parts[1]);
    const cd = Number(parts[2]);
    if (cy !== year || cm !== month) return;
    if (cd < 1 || cd > limite) return;
    const slot = ocupacao.get(cd);
    if (!slot) return;
    const catId = (c as any).bookmaker_catalogo_id as string | undefined;
    if (catId) {
      slot.casas.add(catId);
      const prev = ultimoUsoCasa.get(catId);
      if (prev === undefined || cd > prev) ultimoUsoCasa.set(catId, cd);
    }
    // Conservador: NÃO assume que campanha existente é clone (sem essa info aqui).
    // Se for clone real, o usuário verá a sobreposição visualmente; cooldown se aplica
    // só entre células sendo agendadas pela simulação.
  });

  const agendamentos: AgendamentoSimulado[] = [];
  const warnings: string[] = [];
  const restantes = new Set(candidatas.map((c) => c.id));

  // Helper: tenta selecionar a melhor célula elegível para o dia
  function selecionar(dia: number, slot: DaySlot): CelulaDisponivel | null {
    const elegiveis = candidatas
      .filter((c) => restantes.has(c.id))
      .filter((c) => {
        // 1) Casa não pode repetir no MESMO dia
        if (slot.casas.has(c.bookmaker_catalogo_id)) return false;
        // 2) Cooldown casa (vale para todos)
        const ucasa = ultimoUsoCasa.get(c.bookmaker_catalogo_id);
        if (ucasa !== undefined && dia - ucasa <= cooldownCasaDias) return false;
        // 3) Limite total de casas no dia
        if (maxCasasPorDia > 0 && slot.casas.size >= maxCasasPorDia) return false;
        // 4) Meta de ganho atingida
        if (metaGanhoDia > 0 && slot.ganho >= metaGanhoDia) return false;
        // Regras específicas de clones
        if (isClone(c)) {
          if (slot.cpfsClone.size >= clonesPorDia) {
            // só rejeita se esse CPF não está já no slot (entrar com casa adicional do mesmo CPF
            // estouraria clones distintos? Aqui contamos CPFs distintos, então adicionar nova
            // casa do MESMO CPF não incrementa cpfsClone — permitimos.)
            const ck = cpfKey(c);
            if (!ck || !slot.cpfsClone.has(ck)) return false;
          }
          const ck = cpfKey(c);
          if (ck) {
            const ucpf = ultimoUsoCpfClone.get(ck);
            if (ucpf !== undefined && dia - ucpf <= cooldownCpfDias) return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        // 1) Clones primeiro (mais restritos, ocupam slots escassos)
        const cloneA = isClone(a) ? 1 : 0;
        const cloneB = isClone(b) ? 1 : 0;
        if (cloneA !== cloneB) return cloneB - cloneA;
        // 2) CPFs com maior backlog primeiro (só faz diferença pra clones)
        const ckA = cpfKey(a);
        const ckB = cpfKey(b);
        const blA = ckA ? backlogPorCpf.get(ckA) ?? 0 : 0;
        const blB = ckB ? backlogPorCpf.get(ckB) ?? 0 : 0;
        if (blA !== blB) return blB - blA;
        // 3) maior gap desde último uso da casa (variedade)
        const gA = dia - (ultimoUsoCasa.get(a.bookmaker_catalogo_id) ?? -999);
        const gB = dia - (ultimoUsoCasa.get(b.bookmaker_catalogo_id) ?? -999);
        if (gA !== gB) return gB - gA;
        // 4) ordem original como tiebreak
        return (a.ordem ?? 0) - (b.ordem ?? 0);
      });
    return elegiveis[0] ?? null;
  }

  for (let dia = 1; dia <= limite; dia++) {
    const slot = ocupacao.get(dia)!;
    for (let safety = 0; safety < 200; safety++) {
      // Limites globais que param o dia inteiro
      if (maxCasasPorDia > 0 && slot.casas.size >= maxCasasPorDia) break;
      if (metaGanhoDia > 0 && slot.ganho >= metaGanhoDia) break;

      const pick = selecionar(dia, slot);
      if (!pick) break;

      slot.casas.add(pick.bookmaker_catalogo_id);
      const ck = cpfKey(pick);
      if (isClone(pick) && ck) {
        slot.cpfsClone.add(ck);
        ultimoUsoCpfClone.set(ck, dia);
        backlogPorCpf.set(ck, (backlogPorCpf.get(ck) ?? 1) - 1);
      }
      slot.ganho += Number(pick.deposito_sugerido) || 0;
      ultimoUsoCasa.set(pick.bookmaker_catalogo_id, dia);
      restantes.delete(pick.id);

      agendamentos.push({
        celula: pick,
        dia,
        dateKey: buildDateKey(year, month, dia),
      });
    }
  }

  const naoAgendadas = candidatas.filter((c) => restantes.has(c.id));

  // Diagnóstico do motivo dominante por célula não agendada
  const naoAgendadasDetalhe: CelulaNaoAgendadaDetalhe[] = naoAgendadas.map((c) => {
    const ck = cpfKey(c);
    const catId = c.bookmaker_catalogo_id;
    const ehClone = isClone(c);
    let bloqueioCpf = 0;
    let bloqueioCasa = 0;
    let semCapacidade = 0;
    for (let dia = 1; dia <= limite; dia++) {
      const slot = ocupacao.get(dia)!;
      const slotCheioGlobal =
        (maxCasasPorDia > 0 && slot.casas.size >= maxCasasPorDia) ||
        (metaGanhoDia > 0 && slot.ganho >= metaGanhoDia);
      if (slotCheioGlobal) {
        semCapacidade++;
        continue;
      }
      const ucasa = ultimoUsoCasa.get(catId);
      const blockedCasa =
        slot.casas.has(catId) ||
        (ucasa !== undefined && Math.abs(dia - ucasa) <= cooldownCasaDias);
      let blockedCpf = false;
      if (ehClone && ck) {
        const ucpf = ultimoUsoCpfClone.get(ck);
        blockedCpf =
          (slot.cpfsClone.size >= clonesPorDia && !slot.cpfsClone.has(ck)) ||
          (ucpf !== undefined && Math.abs(dia - ucpf) <= cooldownCpfDias);
      }
      if (blockedCpf) bloqueioCpf++;
      else if (blockedCasa) bloqueioCasa++;
      else semCapacidade++;
    }
    let motivo: CelulaNaoAgendadaDetalhe["motivo"] = "outro";
    let detalhe = "";
    const max = Math.max(bloqueioCpf, bloqueioCasa, semCapacidade);
    if (max === 0) {
      motivo = "outro";
      detalhe = "sem janela disponível";
    } else if (bloqueioCpf === max) {
      motivo = "cooldown_cpf";
      detalhe = `[CLONE] CPF ${c.cpf_index ?? "?"} bloqueado em ${bloqueioCpf}/${limite} dias (cooldown ${cooldownCpfDias}d ou clones/dia cheio)`;
    } else if (bloqueioCasa === max) {
      motivo = "cooldown_casa";
      detalhe = `${c.bookmaker_nome} bloqueada em ${bloqueioCasa}/${limite} dias (cooldown casa ${cooldownCasaDias}d)`;
    } else {
      motivo = "sem_capacidade";
      detalhe = `${semCapacidade}/${limite} dias já cheios (máx casas/dia ou meta de ganho)`;
    }
    return { celula: c, motivo, detalhe };
  });

  // Capacidade por CPF clone: aproximação = janela / (cooldown + 1)
  const capacidadePorCpfClone =
    cooldownCpfDias >= 0 ? Math.floor(limite / (cooldownCpfDias + 1)) : limite;

  // Capacidade global de slots (limite superior)
  const capacidadePorCasas =
    maxCasasPorDia > 0 ? limite * maxCasasPorDia : Infinity;
  const capacidadeMaxima = Number.isFinite(capacidadePorCasas)
    ? (capacidadePorCasas as number)
    : limite * 50; // só pra ter um número finito quando ilimitado

  // Diagnóstico: CPFs de clones que excedem capacidade teórica
  const cpfsExcedentes: string[] = [];
  const backlogInicialClones = new Map<string, number>();
  candidatas.forEach((c) => {
    if (!isClone(c)) return;
    const k = cpfKey(c);
    if (!k) return;
    backlogInicialClones.set(k, (backlogInicialClones.get(k) ?? 0) + 1);
  });
  backlogInicialClones.forEach((qtd, k) => {
    if (qtd > capacidadePorCpfClone) {
      const c = candidatas.find((x) => cpfKey(x) === k);
      const label = c?.cpf_index ? `CPF ${c.cpf_index}` : k;
      cpfsExcedentes.push(`${label}: ${qtd} clones, capacidade ${capacidadePorCpfClone}`);
    }
  });
  if (cpfsExcedentes.length > 0) {
    warnings.push(
      `Cooldown CPF de ${cooldownCpfDias}d em ${limite}d permite só ${capacidadePorCpfClone} clone(s) por CPF: ${cpfsExcedentes.join("; ")}.`
    );
  }

  if (maxCasasPorDia > 0 && candidatas.length > capacidadeMaxima) {
    warnings.unshift(
      `Plano excede capacidade da janela: ${candidatas.length} células para ${capacidadeMaxima} slots (máx casas/dia ${maxCasasPorDia}).`
    );
  }

  if (naoAgendadas.length > 0) {
    const partes: string[] = [
      `dias 1–${limite}`,
      `clones: ${clonesPorDia}/dia, cooldown CPF ${cooldownCpfDias}d`,
    ];
    if (maxCasasPorDia > 0) partes.push(`máx ${maxCasasPorDia} casas/dia`);
    if (metaGanhoDia > 0) partes.push(`meta ${metaGanhoDia.toFixed(2)}/dia`);
    partes.push(`cooldown casa ${cooldownCasaDias}d`);
    warnings.push(
      `${naoAgendadas.length} célula(s) não couberam (${partes.join(", ")}).`
    );
  }

  const diasUsados = new Set(agendamentos.map((a) => a.dia)).size;
  let ganhoTotal = 0;
  ocupacao.forEach((s) => (ganhoTotal += s.ganho));

  return {
    agendamentos,
    warnings,
    naoAgendadas,
    naoAgendadasDetalhe,
    estatisticas: {
      totalCelulas: candidatas.length,
      totalClones,
      totalOutras,
      agendadas: agendamentos.length,
      capacidadeMaxima: maxCasasPorDia > 0 ? (capacidadePorCasas as number) : 0,
      diasUsados,
      ganhoTotal,
      capacidadePorCpfClone,
    },
  };
}
