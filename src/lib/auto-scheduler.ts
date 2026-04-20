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

export interface SimulacaoResultado {
  agendamentos: AgendamentoSimulado[];
  warnings: string[];
  naoAgendadas: CelulaDisponivel[];
  estatisticas: {
    totalCelulas: number;
    agendadas: number;
    capacidadeMaxima: number;
    diasUsados: number;
    ganhoTotal: number;
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
    // Loop até não conseguir mais agendar
    // Limite de segurança para evitar loop infinito
    for (let safety = 0; safety < 50; safety++) {
      // Limites
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
          // 1) maior gap desde último uso da casa (favorece variedade)
          const gA = dia - (ultimoUsoCasa.get(a.bookmaker_catalogo_id) ?? -999);
          const gB = dia - (ultimoUsoCasa.get(b.bookmaker_catalogo_id) ?? -999);
          if (gA !== gB) return gB - gA;
          // 2) maior gap desde último uso do CPF
          const ckA = cpfKey(a);
          const ckB = cpfKey(b);
          const cA = ckA ? dia - (ultimoUsoCpf.get(ckA) ?? -999) : 999;
          const cB = ckB ? dia - (ultimoUsoCpf.get(ckB) ?? -999) : 999;
          if (cA !== cB) return cB - cA;
          // 3) ordem original como tiebreak
          return (a.ordem ?? 0) - (b.ordem ?? 0);
        });

      const pick = elegiveis[0];
      if (!pick) break;

      slot.casas.add(pick.bookmaker_catalogo_id);
      const ck = cpfKey(pick);
      if (ck) slot.cpfs.add(ck);
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

  // Capacidade teórica: limita pelo menor critério ativo
  const capacidadePorClones = limite * clonesPorDia;
  const capacidadePorCasas = maxCasasPorDia > 0 ? limite * maxCasasPorDia : Infinity;
  const capacidadeMaxima = Math.min(capacidadePorClones, capacidadePorCasas);

  const diasUsados = new Set(agendamentos.map((a) => a.dia)).size;
  let ganhoTotal = 0;
  ocupacao.forEach((s) => (ganhoTotal += s.ganho));

  if (Number.isFinite(capacidadeMaxima) && candidatas.length > capacidadeMaxima) {
    warnings.unshift(
      `Plano excede capacidade da janela: ${candidatas.length} células para ${capacidadeMaxima} slots.`
    );
  }

  return {
    agendamentos,
    warnings,
    naoAgendadas,
    estatisticas: {
      totalCelulas: candidatas.length,
      agendadas: agendamentos.length,
      capacidadeMaxima: Number.isFinite(capacidadeMaxima) ? capacidadeMaxima : 0,
      diasUsados,
      ganhoTotal,
    },
  };
}
