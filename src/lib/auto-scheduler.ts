/**
 * Auto-scheduler de células de plano para o calendário de planejamento.
 *
 * Distingue duas categorias:
 *  - CLONES: células do grupo "CLONES" (case-insensitive). Sujeitas a:
 *      - clonesPorDia (limite ESTRITO de clones por dia — conta CASAS clone, não CPFs)
 *      - cooldownCpfDias (mesmo CPF não pode criar outra clone antes de N dias)
 *      - cooldownCasaDias (mesma casa não pode repetir antes de N dias)
 *  - OUTRAS (Arbitragem, Promoções, Value, etc.): só sujeitas a:
 *      - cooldownCasaDias (evita repetir a casa)
 *      - maxCasasPorDia (teto global do dia)
 *      - metaGanhoDia (teto de soma de depósito sugerido)
 *      - minOutrasPorJanela (mínimo de "outras" a cada janelaOutrasDias dias)
 *
 * Suporta `seed` para variar a combinação a cada recálculo (mantendo as restrições).
 *
 * 100% client-side, puro (sem React, sem Supabase).
 */
import type { CelulaDisponivel } from "@/hooks/usePlanoCelulasDisponiveis";
import type { PlanningCampanha } from "@/hooks/usePlanningData";

export interface FaixaMeta {
  /** Dia inicial da faixa (1..31). */
  diaInicio: number;
  /** Dia final da faixa (1..31). */
  diaFim: number;
  /** Meta de depósito (soma deposito_sugerido) para a faixa. */
  meta: number;
}

/** Regra de mínimo de criações por conjunto de dias da semana. */
export interface RegraDiaSemana {
  /** Dias da semana (0=Dom, 1=Seg, ..., 6=Sáb). */
  diasSemana: number[];
  /** Mínimo de casas que CADA dia selecionado deve ter no mês. */
  minimoPorDia: number;
  /** Rótulo opcional para warnings (ex.: "Fins de semana"). */
  label?: string;
}

export interface AutoSchedulerConfig {
  /** Máximo ESTRITO de casas clone por dia (conta cada agendamento, não CPFs distintos). */
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
  /** Mínimo de casas "não-clone" exigido a cada `janelaOutrasDias` dias. 0 = desativado. */
  minOutrasPorJanela?: number;
  /** Tamanho da janela deslizante (em dias) para a regra de mínimo de "outras". */
  janelaOutrasDias?: number;
  /** Faixas de dias com meta de depósito (somatório de deposito_sugerido). */
  faixas?: FaixaMeta[];
  /** Tolerância (%) que cada faixa pode ultrapassar a meta antes de "fechar". 0 = teto rígido. */
  toleranciaFaixaPct?: number;
  /** Regras de mínimo por dia da semana (warning-only — não bloqueia). */
  regrasDiaSemana?: RegraDiaSemana[];
  /** Seed numérica para variar a combinação a cada recálculo. */
  seed?: number;
  /**
   * Estratégia de distribuição:
   *  - "balanceado" (default): espalha as casas ao longo de diaLimite com curva suave.
   *  - "agrupado": coloca todas as suportes do CPF ativo no mesmo dia, completa com clones
   *    até clonesPorDia, e só avança para o próximo CPF quando o atual esgota. Se exceder
   *    maxCasasPorDia, distribui o excedente nos dias contíguos seguintes.
   */
  modoAgrupamento?: "balanceado" | "agrupado";
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

export interface FaixaResultado {
  diaInicio: number;
  diaFim: number;
  meta: number;
  acumulado: number;
  cheia: boolean;
  saturada: boolean; // ultrapassou meta + tolerância
}

export interface SimulacaoResultado {
  agendamentos: AgendamentoSimulado[];
  warnings: string[];
  naoAgendadas: CelulaDisponivel[];
  naoAgendadasDetalhe: CelulaNaoAgendadaDetalhe[];
  faixasResultado: FaixaResultado[];
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

/** Label curto do dia da semana (0=Dom..6=Sáb). */
const DIA_SEMANA_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function diaSemanaLabel(dow: number): string {
  return DIA_SEMANA_LABEL[((dow % 7) + 7) % 7];
}

/** PRNG determinístico (Mulberry32) — varia combinação por seed sem perder reprodutibilidade. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
    minOutrasPorJanela = 0,
    janelaOutrasDias = 3,
    faixas = [],
    toleranciaFaixaPct = 0,
    regrasDiaSemana = [],
    seed = 1,
    modoAgrupamento = "balanceado",
  } = config;

  // Pré-calcula dia-da-semana e quotas de regras
  const diaSemanaDe = (dia: number) => new Date(year, month - 1, dia).getDay();
  const regrasNorm = (regrasDiaSemana ?? [])
    .filter((r) => r && Array.isArray(r.diasSemana) && r.diasSemana.length > 0 && r.minimoPorDia > 0)
    .map((r) => ({
      diasSemana: new Set(r.diasSemana),
      minimoPorDia: r.minimoPorDia,
      label: r.label || r.diasSemana.map(diaSemanaLabel).join("/"),
    }));

  /** Para um dia D: maior déficit (faltante) entre as regras que cobrem o weekday de D. */
  function deficitDoDia(dia: number, slot: { casas: Set<string> }): number {
    if (regrasNorm.length === 0) return 0;
    const dow = diaSemanaDe(dia);
    let maxDef = 0;
    for (const r of regrasNorm) {
      if (!r.diasSemana.has(dow)) continue;
      const def = r.minimoPorDia - slot.casas.size;
      if (def > maxDef) maxDef = def;
    }
    return maxDef;
  }

  const rand = mulberry32(seed || 1);

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
    clonesCount: number; // contagem ESTRITA de casas clone agendadas
    outrasCount: number; // contagem de casas não-clone agendadas
    ganho: number;
  }
  const ocupacao = new Map<number, DaySlot>();
  for (let d = 1; d <= limite; d++) {
    ocupacao.set(d, {
      casas: new Set(),
      cpfsClone: new Set(),
      clonesCount: 0,
      outrasCount: 0,
      ganho: 0,
    });
  }

  const ultimoUsoCasa = new Map<string, number>();
  const ultimoUsoCpfClone = new Map<string, number>(); // só clones

  // Pré-popula com campanhas existentes — bloqueio da casa sempre, CPF só se for de clone
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
  });

  const agendamentos: AgendamentoSimulado[] = [];
  const warnings: string[] = [];
  const restantes = new Set(candidatas.map((c) => c.id));

  // ---- Faixas: normalização e tracking de acumulado por faixa ----
  const faixasNorm = (faixas ?? [])
    .filter((f) => f && f.diaInicio >= 1 && f.diaFim >= f.diaInicio && f.meta > 0)
    .map((f) => ({ ...f, diaFim: Math.min(f.diaFim, limite) }))
    .filter((f) => f.diaInicio <= limite);
  const acumuladoFaixa = new Array<number>(faixasNorm.length).fill(0);
  const tetoFaixa = faixasNorm.map((f) => f.meta * (1 + (toleranciaFaixaPct || 0) / 100));

  /** Retorna o índice da faixa que cobre `dia`, ou -1 se nenhuma. */
  function faixaDoDia(dia: number): number {
    for (let i = 0; i < faixasNorm.length; i++) {
      const f = faixasNorm[i];
      if (dia >= f.diaInicio && dia <= f.diaFim) return i;
    }
    return -1;
  }

  /** True se adicionar `valor` ao dia estouraria o teto (meta + tolerância) da faixa correspondente. */
  function estouraFaixa(dia: number, valor: number): boolean {
    if (faixasNorm.length === 0) return false;
    const idx = faixaDoDia(dia);
    if (idx < 0) return false;
    return acumuladoFaixa[idx] + valor > tetoFaixa[idx];
  }

  /** Conta "outras" agendadas em [diaInicio, diaFim] (inclusivo). */
  function contarOutrasJanela(diaInicio: number, diaFim: number): number {
    let total = 0;
    for (let d = Math.max(1, diaInicio); d <= Math.min(limite, diaFim); d++) {
      total += ocupacao.get(d)?.outrasCount ?? 0;
    }
    return total;
  }

  /** True se permitir adicionar uma CLONE neste dia violaria a regra de mínimo de outras
   * em ALGUMA janela que termine em dia ≤ diaAtual (já fechada — não tem como compensar). */
  function violaJanelaOutras(diaAtual: number): boolean {
    if (minOutrasPorJanela <= 0 || janelaOutrasDias <= 0) return false;
    // Janelas "fechadas": terminam em diaAtual ou antes. A primeira janela completa
    // fecha em janelaOutrasDias. Se já estamos preenchendo o último dia de uma janela,
    // verificamos se ela atingiu o mínimo de outras.
    if (diaAtual < janelaOutrasDias) return false;
    // Verifica a janela que TERMINA em diaAtual: [diaAtual - janelaOutrasDias + 1, diaAtual]
    const inicio = diaAtual - janelaOutrasDias + 1;
    const outras = contarOutrasJanela(inicio, diaAtual);
    return outras < minOutrasPorJanela;
  }

  type SelecionarOptions = {
    forcarOutra?: boolean;
    somenteClones?: boolean;
    excluirSuporteCpf?: number | null;
  };

  // Helper: tenta selecionar a melhor célula elegível para o dia
  function selecionar(dia: number, slot: DaySlot, options: SelecionarOptions = {}): CelulaDisponivel | null {
    const { forcarOutra = false, somenteClones = false, excluirSuporteCpf = null } = options;

    // CPF mínimo "ativo" para SUPORTE (não-clone): enquanto houver qualquer outra pendente
    // do CPF N, NÃO permitimos agendar outras de CPF > N. Isso esgota um CPF de cada vez
    // (CPF1 → CPF2 → ...) mantendo as suporte agrupadas por CPF ao longo do mês.
    let menorCpfOutraPendente = Number.POSITIVE_INFINITY;
    // Casas (bookmaker_catalogo_id) que ainda têm SUPORTE pendente do menor CPF.
    // Reservamos essas casas — CPFs maiores não podem "roubá-las" no mesmo dia.
    const casasReservadasMenorCpf = new Set<string>();
    for (const c of candidatas) {
      if (!restantes.has(c.id)) continue;
      if (isClone(c)) continue;
      const ci = c.cpf_index ?? 9999;
      if (ci < menorCpfOutraPendente) menorCpfOutraPendente = ci;
    }
    if (Number.isFinite(menorCpfOutraPendente)) {
      for (const c of candidatas) {
        if (!restantes.has(c.id)) continue;
        if (isClone(c)) continue;
        const ci = c.cpf_index ?? 9999;
        if (ci === menorCpfOutraPendente) {
          casasReservadasMenorCpf.add(c.bookmaker_catalogo_id);
        }
      }
    }

    const elegiveis = candidatas
      .filter((c) => restantes.has(c.id))
      .filter((c) => {
        const clone = isClone(c);
        if (forcarOutra && clone) return false;
        if (somenteClones && !clone) return false;
        if (!clone && excluirSuporteCpf != null && (c.cpf_index ?? 9999) === excluirSuporteCpf) {
          return false;
        }
        // PRIORIZAÇÃO POR CPF (suporte): só libera CPF maior se o menor já esgotou
        if (!clone) {
          const ci = c.cpf_index ?? 9999;
          if (ci > menorCpfOutraPendente) return false;
        }
        // RESERVA DE CASAS: se esta célula é suporte de um CPF > menor pendente OU é clone,
        // e a casa pertence ao "pool reservado" do menor CPF pendente, bloqueia.
        // Isso impede que CPF2 (suporte ou clone) consuma uma casa que o CPF1 ainda precisa.
        if (Number.isFinite(menorCpfOutraPendente)) {
          const ci = c.cpf_index ?? 9999;
          const ehMenorCpf = !clone && ci === menorCpfOutraPendente;
          if (!ehMenorCpf && casasReservadasMenorCpf.has(c.bookmaker_catalogo_id)) {
            return false;
          }
        }
        if (slot.casas.has(c.bookmaker_catalogo_id)) return false;
        if (clone) {
          const ucasa = ultimoUsoCasa.get(c.bookmaker_catalogo_id);
          if (ucasa !== undefined && dia - ucasa <= cooldownCasaDias) return false;
        }
        if (maxCasasPorDia > 0 && slot.casas.size >= maxCasasPorDia) return false;
        if (metaGanhoDia > 0 && slot.ganho >= metaGanhoDia) return false;
        const valor = Number(c.deposito_sugerido) || 0;
        if (estouraFaixa(dia, valor)) return false;
        if (clone) {
          if (slot.clonesCount >= clonesPorDia) return false;
          const ck = cpfKey(c);
          if (ck) {
            const ucpf = ultimoUsoCpfClone.get(ck);
            if (ucpf !== undefined && dia - ucpf <= cooldownCpfDias) return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (!forcarOutra && !somenteClones) {
          const cloneA = isClone(a) ? 1 : 0;
          const cloneB = isClone(b) ? 1 : 0;
          if (cloneA !== cloneB) return cloneB - cloneA;
        }
        const aClone = isClone(a);
        const bClone = isClone(b);
        if (!aClone && !bClone) {
          const ciA = a.cpf_index ?? 9999;
          const ciB = b.cpf_index ?? 9999;
          if (ciA !== ciB) return ciA - ciB;
        }
        const ckA = cpfKey(a);
        const ckB = cpfKey(b);
        const blA = ckA ? backlogPorCpf.get(ckA) ?? 0 : 0;
        const blB = ckB ? backlogPorCpf.get(ckB) ?? 0 : 0;
        if (blA !== blB) return blB - blA;
        const gA = dia - (ultimoUsoCasa.get(a.bookmaker_catalogo_id) ?? -999);
        const gB = dia - (ultimoUsoCasa.get(b.bookmaker_catalogo_id) ?? -999);
        if (gA !== gB) return gB - gA;
        if (aClone && bClone) return rand() - 0.5;
        return 0;
      });
    return elegiveis[0] ?? null;
  }

  function efetivarAgendamento(pick: CelulaDisponivel, dia: number, slot: DaySlot) {
    slot.casas.add(pick.bookmaker_catalogo_id);
    const ck = cpfKey(pick);
    if (isClone(pick)) {
      slot.clonesCount++;
      if (ck) {
        slot.cpfsClone.add(ck);
        ultimoUsoCpfClone.set(ck, dia);
        backlogPorCpf.set(ck, (backlogPorCpf.get(ck) ?? 1) - 1);
      }
    } else {
      slot.outrasCount++;
    }
    slot.ganho += Number(pick.deposito_sugerido) || 0;
    ultimoUsoCasa.set(pick.bookmaker_catalogo_id, dia);
    const idxFaixa = faixaDoDia(dia);
    if (idxFaixa >= 0) acumuladoFaixa[idxFaixa] += Number(pick.deposito_sugerido) || 0;
    restantes.delete(pick.id);
    agendamentos.push({ celula: pick, dia, dateKey: buildDateKey(year, month, dia) });
  }

  function tentarPasso(dia: number, slot: DaySlot, options: SelecionarOptions = {}): boolean {
    if (maxCasasPorDia > 0 && slot.casas.size >= maxCasasPorDia) return false;
    if (metaGanhoDia > 0 && slot.ganho >= metaGanhoDia) return false;
    const precisaOutra = !options.somenteClones && violaJanelaOutras(dia);
    let pick = precisaOutra
      ? selecionar(dia, slot, { ...options, forcarOutra: true })
      : selecionar(dia, slot, options);
    if (!pick && precisaOutra) pick = selecionar(dia, slot, options);
    if (!pick) return false;
    efetivarAgendamento(pick, dia, slot);
    return true;
  }

  function temPendenciaSuporteCpf(cpfIdx: number): boolean {
    return candidatas.some(
      (c) => restantes.has(c.id) && !isClone(c) && (c.cpf_index ?? 9999) === cpfIdx
    );
  }

  function tentarSuporteCpfNoDia(cpfIdx: number, dia: number, slot: DaySlot): boolean {
    if (maxCasasPorDia > 0 && slot.casas.size >= maxCasasPorDia) return false;
    if (metaGanhoDia > 0 && slot.ganho >= metaGanhoDia) return false;

    const pick = candidatas
      .filter(
        (c) =>
          restantes.has(c.id) &&
          !isClone(c) &&
          (c.cpf_index ?? 9999) === cpfIdx &&
          !slot.casas.has(c.bookmaker_catalogo_id) &&
          !estouraFaixa(dia, Number(c.deposito_sugerido) || 0)
      )
      .sort((a, b) => {
        const gA = dia - (ultimoUsoCasa.get(a.bookmaker_catalogo_id) ?? -999);
        const gB = dia - (ultimoUsoCasa.get(b.bookmaker_catalogo_id) ?? -999);
        if (gA !== gB) return gB - gA;
        return (a.bookmaker_nome || "").localeCompare(b.bookmaker_nome || "");
      })[0];

    if (!pick) return false;
    efetivarAgendamento(pick, dia, slot);
    return true;
  }

  const cpfsSuporte = Array.from(
    new Set(
      candidatas
        .filter((c) => !isClone(c))
        .map((c) => c.cpf_index ?? 9999)
    )
  ).sort((a, b) => a - b);

  // Meta suave de distribuição: reparte o total de casas ao longo do diaLimite,
  // evitando inflar o começo do mês e permitindo múltiplas casas no mesmo dia.
  const metaDistribuicaoPorDia = new Map<number, number>();
  for (let dia = 1; dia <= limite; dia++) {
    const acumuladoAtual = Math.floor((candidatas.length * dia) / limite);
    const acumuladoAnterior = Math.floor((candidatas.length * (dia - 1)) / limite);
    metaDistribuicaoPorDia.set(dia, acumuladoAtual - acumuladoAnterior);
  }

  // ---- PASS 1: Distribuição balanceada por dia ----
  // Em cada dia, colocamos uma fração das suportes do CPF ativo e reservamos espaço
  // para intercalar clones/outras, evitando blocos inteiros de um CPF no começo do mês.
  let progrediuBalanceado = true;
  let safetyBalanceado = 0;
  const maxRoundsBalanceado = candidatas.length * 3 + limite;
  while (progrediuBalanceado && safetyBalanceado++ < maxRoundsBalanceado) {
    progrediuBalanceado = false;
    for (let dia = 1; dia <= limite; dia++) {
      const slot = ocupacao.get(dia)!;
      const alvoDia = metaDistribuicaoPorDia.get(dia) ?? 0;
      if (alvoDia <= 0) continue;

      let cpfSuporteAtivo: number | null = null;
      for (const cpfIdx of cpfsSuporte) {
        if (temPendenciaSuporteCpf(cpfIdx)) {
          cpfSuporteAtivo = cpfIdx;
          break;
        }
      }

      const espacoRestante = alvoDia - slot.casas.size;
      if (espacoRestante <= 0) continue;

      let progrediuNoDia = false;
      if (cpfSuporteAtivo != null) {
        const metaSuporteDia = Math.min(
          espacoRestante,
          Math.max(1, Math.ceil(alvoDia * 0.6))
        );
        let suporteAgendado = 0;
        let safetySuporte = 0;
        while (suporteAgendado < metaSuporteDia && safetySuporte++ < 50) {
          if (!tentarSuporteCpfNoDia(cpfSuporteAtivo, dia, slot)) break;
          suporteAgendado++;
          progrediuNoDia = true;
        }
      }

      let safetyIntercalado = 0;
      while (slot.casas.size < alvoDia && safetyIntercalado++ < 50) {
        const agendou = tentarPasso(dia, slot, {
          somenteClones: cpfSuporteAtivo != null,
          excluirSuporteCpf: cpfSuporteAtivo,
        });
        if (!agendou) break;
        progrediuNoDia = true;
      }

      if (progrediuNoDia) progrediuBalanceado = true;
    }
  }

  // ---- PASS 2: Garantia de mínimo por dia da semana (warning-only) ----
  if (regrasNorm.length > 0) {
    for (let dia = 1; dia <= limite; dia++) {
      const slot = ocupacao.get(dia)!;
      const dow = diaSemanaDe(dia);
      let alvo = 0;
      for (const r of regrasNorm) {
        if (r.diasSemana.has(dow) && r.minimoPorDia > alvo) alvo = r.minimoPorDia;
      }
      if (alvo === 0) continue;
      let safety = 0;
      while (slot.casas.size < alvo && safety++ < 50) {
        if (!tentarPasso(dia, slot)) break;
      }
    }
  }

  // ---- PASS 3: Overflow final para sobras que não encaixaram na curva ideal ----
  let progrediuSobras = true;
  let safetySobras = 0;
  const maxRoundsSobras = candidatas.length * 2 + 10;
  while (progrediuSobras && safetySobras++ < maxRoundsSobras) {
    progrediuSobras = false;
    for (let dia = 1; dia <= limite; dia++) {
      const slot = ocupacao.get(dia)!;
      if (tentarPasso(dia, slot)) progrediuSobras = true;
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
        (metaGanhoDia > 0 && slot.ganho >= metaGanhoDia) ||
        (ehClone && slot.clonesCount >= clonesPorDia);
      if (slotCheioGlobal) {
        semCapacidade++;
        continue;
      }
      const ucasa = ultimoUsoCasa.get(catId);
      const blockedCasa =
        slot.casas.has(catId) ||
        (ehClone && ucasa !== undefined && Math.abs(dia - ucasa) <= cooldownCasaDias);
      let blockedCpf = false;
      if (ehClone && ck) {
        const ucpf = ultimoUsoCpfClone.get(ck);
        blockedCpf = ucpf !== undefined && Math.abs(dia - ucpf) <= cooldownCpfDias;
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
      detalhe = `[CLONE] CPF ${c.cpf_index ?? "?"} bloqueado em ${bloqueioCpf}/${limite} dias (cooldown ${cooldownCpfDias}d)`;
    } else if (bloqueioCasa === max) {
      motivo = "cooldown_casa";
      detalhe = `${c.bookmaker_nome} bloqueada em ${bloqueioCasa}/${limite} dias (cooldown casa ${cooldownCasaDias}d)`;
    } else {
      motivo = "sem_capacidade";
      detalhe = `${semCapacidade}/${limite} dias já cheios (clones/dia, máx casas/dia ou meta de ganho)`;
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

  // Diagnóstico: janelas que não atingiram mínimo de outras
  if (minOutrasPorJanela > 0 && janelaOutrasDias > 0) {
    const janelasFalhas: string[] = [];
    for (let fim = janelaOutrasDias; fim <= limite; fim += janelaOutrasDias) {
      const inicio = fim - janelaOutrasDias + 1;
      const outras = contarOutrasJanela(inicio, fim);
      if (outras < minOutrasPorJanela) {
        janelasFalhas.push(`dias ${inicio}–${fim}: ${outras}/${minOutrasPorJanela}`);
      }
    }
    if (janelasFalhas.length > 0) {
      warnings.push(
        `Mínimo de "outras" não atingido em ${janelasFalhas.length} janela(s): ${janelasFalhas.join("; ")}.`
      );
    }
  }

  // Diagnóstico: regras de dia-da-semana não atingidas (warning-only)
  if (regrasNorm.length > 0) {
    const falhas: string[] = [];
    for (const r of regrasNorm) {
      const diasAfetados: string[] = [];
      for (let d = 1; d <= limite; d++) {
        const dow = diaSemanaDe(d);
        if (!r.diasSemana.has(dow)) continue;
        const slot = ocupacao.get(d)!;
        if (slot.casas.size < r.minimoPorDia) {
          diasAfetados.push(`${d}/${diaSemanaLabel(dow)}:${slot.casas.size}`);
        }
      }
      if (diasAfetados.length > 0) {
        falhas.push(`${r.label} (mín ${r.minimoPorDia}) — ${diasAfetados.join(", ")}`);
      }
    }
    if (falhas.length > 0) {
      warnings.push(`Mínimo por dia da semana não atingido: ${falhas.join("; ")}.`);
    }
  }

  if (naoAgendadas.length > 0) {
    const partes: string[] = [
      `dias 1–${limite}`,
      `clones: ${clonesPorDia}/dia, cooldown CPF ${cooldownCpfDias}d`,
    ];
    if (maxCasasPorDia > 0) partes.push(`máx ${maxCasasPorDia} casas/dia`);
    if (metaGanhoDia > 0) partes.push(`meta ${metaGanhoDia.toFixed(2)}/dia`);
    partes.push(`cooldown casa ${cooldownCasaDias}d`);
    if (minOutrasPorJanela > 0)
      partes.push(`mín ${minOutrasPorJanela} outras/${janelaOutrasDias}d`);
    warnings.push(
      `${naoAgendadas.length} célula(s) não couberam (${partes.join(", ")}).`
    );
  }

  const diasUsados = new Set(agendamentos.map((a) => a.dia)).size;
  let ganhoTotal = 0;
  ocupacao.forEach((s) => (ganhoTotal += s.ganho));

  // Resultado por faixa
  const faixasResultado: FaixaResultado[] = faixasNorm.map((f, i) => {
    const acumulado = acumuladoFaixa[i];
    const cheia = acumulado >= f.meta;
    const saturada = acumulado >= tetoFaixa[i];
    return { diaInicio: f.diaInicio, diaFim: f.diaFim, meta: f.meta, acumulado, cheia, saturada };
  });

  // Warning de faixas que não atingiram a meta
  const faixasNaoAtingidas = faixasResultado.filter((f) => !f.cheia);
  if (faixasNaoAtingidas.length > 0) {
    const desc = faixasNaoAtingidas
      .map((f) => `dias ${f.diaInicio}–${f.diaFim}: ${f.acumulado.toFixed(2)}/${f.meta.toFixed(2)}`)
      .join("; ");
    warnings.push(`Faixa(s) não atingiram a meta: ${desc}.`);
  }

  return {
    agendamentos,
    warnings,
    naoAgendadas,
    naoAgendadasDetalhe,
    faixasResultado,
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
