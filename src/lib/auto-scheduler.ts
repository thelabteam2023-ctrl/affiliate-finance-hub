/**
 * Auto-scheduler de células de plano para o calendário de planejamento.
 *
 * Algoritmo greedy que distribui células CPF×Casa em dias do mês respeitando:
 *  - clones por dia (quantos parceiros/CPFs distintos podem ser criados em 1 dia)
 *  - máximo opcional de casas por dia
 *  - meta opcional de ganho por dia (soma dos depósitos sugeridos)
 *  - cooldown entre repetições da mesma casa
 *  - cooldown entre repetições do mesmo CPF (parceiro)
 *  - dia limite (ex.: só usa dias 1..23)
 *
 * Identidade do CPF: usa `parceiro_id` quando existir; caso contrário,
 * usa "cpf:<cpf_index>" como identidade canônica para garantir unicidade
 * mesmo em planos sem parceiro_id vinculado às células.
 *
 * 100% client-side, puro (sem React, sem Supabase). Saída usada para preview.
 */
import type { CelulaDisponivel } from "@/hooks/usePlanoCelulasDisponiveis";
import type { PlanningCampanha } from "@/hooks/usePlanningData";

export interface AutoSchedulerConfig {
  clonesPorDia: number;
  /** Máximo de casas por dia. 0 = sem limite. */
  maxCasasPorDia: number;
  /** Meta de ganho por dia (soma deposito_sugerido). 0 = desativado. */
  metaGanhoDia: number;
  cooldownCasaDias: number;
  cooldownCpfDias: number;
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
    agendadas: number;
    capacidadeMaxima: number;
    diasUsados: number;
    ganhoTotal: number;
    /** Capacidade teórica por CPF dado o cooldown e a janela. */
    capacidadePorCpf: number;
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

  const ultimoDia = new Date(year, month, 0).getDate();
  const limite = Math.min(diaLimite, ultimoDia);

  // Conta backlog por CPF para priorizar quem tem mais casas a colocar
  const backlogPorCpf = new Map<string, number>();
  candidatas.forEach((c) => {
    const k = cpfKey(c);
    if (!k) return;
    backlogPorCpf.set(k, (backlogPorCpf.get(k) ?? 0) + 1);
  });

  interface DaySlot {
    casas: Set<string>;
    cpfs: Set<string>;
    ganho: number;
  }
  const ocupacao = new Map<number, DaySlot>();
  for (let d = 1; d <= limite; d++) {
    ocupacao.set(d, { casas: new Set(), cpfs: new Set(), ganho: 0 });
  }

  const ultimoUsoCasa = new Map<string, number>();
  const ultimoUsoCpf = new Map<string, number>();

  // Pré-popula com campanhas existentes (não conhecemos cpf_index aqui — só parceiro_id)
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
    if (c.parceiro_id) {
      slot.cpfs.add(c.parceiro_id);
      const prev = ultimoUsoCpf.get(c.parceiro_id);
      if (prev === undefined || cd > prev) ultimoUsoCpf.set(c.parceiro_id, cd);
    }
  });

  const agendamentos: AgendamentoSimulado[] = [];
  const warnings: string[] = [];
  const restantes = new Set(candidatas.map((c) => c.id));

  for (let dia = 1; dia <= limite; dia++) {
    const slot = ocupacao.get(dia)!;
    // Tenta encher o dia até estourar QUALQUER limite ativo
    // (clonesPorDia, maxCasasPorDia, metaGanhoDia)
    for (let safety = 0; safety < 100; safety++) {
      if (slot.cpfs.size >= clonesPorDia) break;
      if (maxCasasPorDia > 0 && slot.casas.size >= maxCasasPorDia) break;
      if (metaGanhoDia > 0 && slot.ganho >= metaGanhoDia) break;

      const elegiveis = candidatas
        .filter((c) => restantes.has(c.id))
        .filter((c) => {
          if (slot.casas.has(c.bookmaker_catalogo_id)) return false;
          const ck = cpfKey(c);
          if (ck && slot.cpfs.has(ck)) return false;
          const ucasa = ultimoUsoCasa.get(c.bookmaker_catalogo_id);
          if (ucasa !== undefined && dia - ucasa <= cooldownCasaDias) return false;
          if (ck) {
            const ucpf = ultimoUsoCpf.get(ck);
            if (ucpf !== undefined && dia - ucpf <= cooldownCpfDias) return false;
          }
          return true;
        })
        .sort((a, b) => {
          // 1) CPF com MAIOR backlog primeiro (distribui CPFs grandes ao longo do mês)
          const ckA = cpfKey(a);
          const ckB = cpfKey(b);
          const blA = ckA ? backlogPorCpf.get(ckA) ?? 0 : 0;
          const blB = ckB ? backlogPorCpf.get(ckB) ?? 0 : 0;
          if (blA !== blB) return blB - blA;
          // 2) maior gap desde último uso da casa (favorece variedade)
          const gA = dia - (ultimoUsoCasa.get(a.bookmaker_catalogo_id) ?? -999);
          const gB = dia - (ultimoUsoCasa.get(b.bookmaker_catalogo_id) ?? -999);
          if (gA !== gB) return gB - gA;
          // 3) maior gap desde último uso do CPF
          const cA = ckA ? dia - (ultimoUsoCpf.get(ckA) ?? -999) : 999;
          const cB = ckB ? dia - (ultimoUsoCpf.get(ckB) ?? -999) : 999;
          if (cA !== cB) return cB - cA;
          // 4) ordem original como tiebreak
          return (a.ordem ?? 0) - (b.ordem ?? 0);
        });

      const pick = elegiveis[0];
      if (!pick) break;

      slot.casas.add(pick.bookmaker_catalogo_id);
      const ck = cpfKey(pick);
      if (ck) {
        slot.cpfs.add(ck);
        backlogPorCpf.set(ck, (backlogPorCpf.get(ck) ?? 1) - 1);
      }
      slot.ganho += Number(pick.deposito_sugerido) || 0;
      ultimoUsoCasa.set(pick.bookmaker_catalogo_id, dia);
      if (ck) ultimoUsoCpf.set(ck, dia);
      restantes.delete(pick.id);

      agendamentos.push({
        celula: pick,
        dia,
        dateKey: buildDateKey(year, month, dia),
      });
    }
  }

  const naoAgendadas = candidatas.filter((c) => restantes.has(c.id));

  // Diagnóstico: para cada não agendada, simula uma busca por dia e
  // descobre o motivo dominante (cooldown CPF, cooldown casa, ou sem capacidade)
  const naoAgendadasDetalhe: CelulaNaoAgendadaDetalhe[] = naoAgendadas.map((c) => {
    const ck = cpfKey(c);
    const catId = c.bookmaker_catalogo_id;
    let bloqueioCpf = 0;
    let bloqueioCasa = 0;
    let semCapacidade = 0;
    for (let dia = 1; dia <= limite; dia++) {
      const slot = ocupacao.get(dia)!;
      const slotCheio =
        slot.cpfs.size >= clonesPorDia ||
        (maxCasasPorDia > 0 && slot.casas.size >= maxCasasPorDia) ||
        (metaGanhoDia > 0 && slot.ganho >= metaGanhoDia);
      if (slotCheio) {
        semCapacidade++;
        continue;
      }
      const ucasa = ultimoUsoCasa.get(catId);
      const blockedCasa =
        slot.casas.has(catId) ||
        (ucasa !== undefined && Math.abs(dia - ucasa) <= cooldownCasaDias);
      const ucpf = ck ? ultimoUsoCpf.get(ck) : undefined;
      const blockedCpf =
        (ck && slot.cpfs.has(ck)) ||
        (ucpf !== undefined && Math.abs(dia - ucpf) <= cooldownCpfDias);
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
      detalhe = `CPF ${c.cpf_index ?? "?"} bloqueado por cooldown em ${bloqueioCpf}/${limite} dias`;
    } else if (bloqueioCasa === max) {
      motivo = "cooldown_casa";
      detalhe = `${c.bookmaker_nome} bloqueada por cooldown em ${bloqueioCasa}/${limite} dias`;
    } else {
      motivo = "sem_capacidade";
      detalhe = `${semCapacidade}/${limite} dias já cheios (clones/dia ou meta atingida)`;
    }
    return { celula: c, motivo, detalhe };
  });

  // Capacidade teórica por CPF: aproximação = janela / (cooldown + 1)
  const capacidadePorCpf =
    cooldownCpfDias >= 0 ? Math.floor(limite / (cooldownCpfDias + 1)) : limite;

  // Capacidade global: limita pelo menor critério ativo
  const capacidadePorClones = limite * clonesPorDia;
  const capacidadePorCasas = maxCasasPorDia > 0 ? limite * maxCasasPorDia : Infinity;
  const capacidadeMaxima = Math.min(capacidadePorClones, capacidadePorCasas);

  // Diagnóstico por CPF: backlog inicial vs capacidade teórica do CPF
  const backlogInicialPorCpf = new Map<string, number>();
  candidatas.forEach((c) => {
    const k = cpfKey(c);
    if (!k) return;
    backlogInicialPorCpf.set(k, (backlogInicialPorCpf.get(k) ?? 0) + 1);
  });

  const cpfsExcedentes: string[] = [];
  backlogInicialPorCpf.forEach((qtd, k) => {
    if (qtd > capacidadePorCpf) {
      const c = candidatas.find((x) => cpfKey(x) === k);
      const label = c?.cpf_index ? `CPF ${c.cpf_index}` : k;
      cpfsExcedentes.push(`${label}: ${qtd} casas, capacidade ${capacidadePorCpf}`);
    }
  });
  if (cpfsExcedentes.length > 0) {
    warnings.push(
      `Cooldown CPF de ${cooldownCpfDias}d em janela de ${limite}d permite só ${capacidadePorCpf} casa(s) por CPF: ${cpfsExcedentes.join("; ")}.`
    );
  }

  if (Number.isFinite(capacidadeMaxima) && candidatas.length > capacidadeMaxima) {
    warnings.unshift(
      `Plano excede capacidade da janela: ${candidatas.length} células para ${capacidadeMaxima} slots.`
    );
  }

  if (naoAgendadas.length > 0) {
    const partes: string[] = [
      `dias 1–${limite}`,
      `${clonesPorDia} clones/dia`,
    ];
    if (maxCasasPorDia > 0) partes.push(`máx ${maxCasasPorDia} casas/dia`);
    if (metaGanhoDia > 0) partes.push(`meta ${metaGanhoDia.toFixed(2)}/dia`);
    partes.push(`cooldown casa ${cooldownCasaDias}d`);
    partes.push(`CPF ${cooldownCpfDias}d`);
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
      agendadas: agendamentos.length,
      capacidadeMaxima: Number.isFinite(capacidadeMaxima) ? capacidadeMaxima : 0,
      diasUsados,
      ganhoTotal,
      capacidadePorCpf,
    },
  };
}
