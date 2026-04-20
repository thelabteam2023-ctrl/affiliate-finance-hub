/**
 * Auto-scheduler de células de plano para o calendário de planejamento.
 *
 * Algoritmo greedy que distribui células CPF×Casa em dias do mês respeitando:
 *  - máximo de N casas por dia
 *  - cooldown entre repetições da mesma casa
 *  - cooldown entre repetições do mesmo CPF (parceiro)
 *  - dia limite (ex.: só usa dias 1..23)
 *
 * 100% client-side, puro (sem React, sem Supabase). Saída usada para preview.
 */
import type { CelulaDisponivel } from "@/hooks/usePlanoCelulasDisponiveis";
import type { PlanningCampanha } from "@/hooks/usePlanningData";

export interface AutoSchedulerConfig {
  casasPorDia: number;
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
    capacidadeMaxima: number; // diaLimite * casasPorDia - ocupado por existentes
    diasUsados: number;
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function buildDateKey(year: number, month1Based: number, day: number) {
  return `${year}-${pad(month1Based)}-${pad(day)}`;
}

export function simularDistribuicao(input: {
  celulas: CelulaDisponivel[];
  campanhasExistentes: PlanningCampanha[];
  year: number;
  month: number; // 1..12
  config: AutoSchedulerConfig;
}): SimulacaoResultado {
  const { celulas, campanhasExistentes, year, month, config } = input;
  const { casasPorDia, cooldownCasaDias, cooldownCpfDias, diaLimite } = config;

  // Só agenda células ainda não agendadas
  const candidatas = celulas.filter((c) => !c.agendada_em && !c.campanha_id);

  // Dias válidos: 1..min(diaLimite, último dia real do mês)
  const ultimoDia = new Date(year, month, 0).getDate();
  const limite = Math.min(diaLimite, ultimoDia);

  // Estado de ocupação por dia (incluindo campanhas existentes)
  const ocupacao = new Map<number, { casas: Set<string>; cpfs: Set<string> }>();
  for (let d = 1; d <= limite; d++) {
    ocupacao.set(d, { casas: new Set(), cpfs: new Set() });
  }

  const ultimoUsoCasa = new Map<string, number>(); // catalogo_id -> dia
  const ultimoUsoCpf = new Map<string, number>(); // parceiro_id -> dia

  // Pré-popula com campanhas já existentes no mês
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

  // Pista de quantas vezes cada célula foi escolhida (sempre 0 ou 1 aqui — uma célula = um agendamento)
  const usosCelula = new Map<string, number>();
  candidatas.forEach((c) => usosCelula.set(c.id, 0));

  const agendamentos: AgendamentoSimulado[] = [];
  const warnings: string[] = [];
  const restantes = new Set(candidatas.map((c) => c.id));

  for (let dia = 1; dia <= limite; dia++) {
    const slot = ocupacao.get(dia)!;
    let agendadosNoDia = slot.casas.size; // conta as existentes como já ocupando o "casas/dia"
    for (let s = 0; s < casasPorDia && agendadosNoDia < casasPorDia; s++) {
      // Filtra candidatas válidas para este dia
      const elegiveis = candidatas
        .filter((c) => restantes.has(c.id))
        .filter((c) => {
          // Casa já no dia
          if (slot.casas.has(c.bookmaker_catalogo_id)) return false;
          // CPF já no dia
          if (c.parceiro_id && slot.cpfs.has(c.parceiro_id)) return false;
          // Cooldown casa
          const ucasa = ultimoUsoCasa.get(c.bookmaker_catalogo_id);
          if (ucasa !== undefined && dia - ucasa <= cooldownCasaDias) return false;
          // Cooldown CPF
          if (c.parceiro_id) {
            const ucpf = ultimoUsoCpf.get(c.parceiro_id);
            if (ucpf !== undefined && dia - ucpf <= cooldownCpfDias) return false;
          }
          return true;
        })
        .sort((a, b) => {
          // 1) menos usos
          const ua = usosCelula.get(a.id) ?? 0;
          const ub = usosCelula.get(b.id) ?? 0;
          if (ua !== ub) return ua - ub;
          // 2) maior gap desde último uso da casa
          const gA = dia - (ultimoUsoCasa.get(a.bookmaker_catalogo_id) ?? -999);
          const gB = dia - (ultimoUsoCasa.get(b.bookmaker_catalogo_id) ?? -999);
          if (gA !== gB) return gB - gA;
          // 3) maior gap desde último uso do CPF
          const cA = a.parceiro_id ? dia - (ultimoUsoCpf.get(a.parceiro_id) ?? -999) : 999;
          const cB = b.parceiro_id ? dia - (ultimoUsoCpf.get(b.parceiro_id) ?? -999) : 999;
          if (cA !== cB) return cB - cA;
          // 4) ordem original como tiebreak
          return (a.ordem ?? 0) - (b.ordem ?? 0);
        });

      const pick = elegiveis[0];
      if (!pick) {
        // Não há candidata para esse slot deste dia
        break;
      }

      slot.casas.add(pick.bookmaker_catalogo_id);
      if (pick.parceiro_id) slot.cpfs.add(pick.parceiro_id);
      ultimoUsoCasa.set(pick.bookmaker_catalogo_id, dia);
      if (pick.parceiro_id) ultimoUsoCpf.set(pick.parceiro_id, dia);
      usosCelula.set(pick.id, (usosCelula.get(pick.id) ?? 0) + 1);
      restantes.delete(pick.id);

      agendamentos.push({
        celula: pick,
        dia,
        dateKey: buildDateKey(year, month, dia),
      });
      agendadosNoDia++;
    }
  }

  const naoAgendadas = candidatas.filter((c) => restantes.has(c.id));
  if (naoAgendadas.length > 0) {
    warnings.push(
      `${naoAgendadas.length} célula(s) não couberam na janela (dias 1–${limite}, ${casasPorDia}/dia, cooldown casa ${cooldownCasaDias}d, CPF ${cooldownCpfDias}d).`
    );
  }

  // Capacidade efetiva: slots livres no período (descontando ocupação inicial)
  let ocupados = 0;
  ocupacao.forEach((s) => (ocupados += Math.min(s.casas.size, casasPorDia)));
  const capacidadeMaxima = limite * casasPorDia;
  const diasUsados = Array.from(
    new Set(agendamentos.map((a) => a.dia))
  ).length;

  if (candidatas.length > capacidadeMaxima) {
    warnings.unshift(
      `Plano excede capacidade da janela: ${candidatas.length} células para ${capacidadeMaxima} slots (${limite} dias × ${casasPorDia}/dia).`
    );
  }

  return {
    agendamentos,
    warnings,
    naoAgendadas,
    estatisticas: {
      totalCelulas: candidatas.length,
      agendadas: agendamentos.length,
      capacidadeMaxima,
      diasUsados,
    },
  };
}
