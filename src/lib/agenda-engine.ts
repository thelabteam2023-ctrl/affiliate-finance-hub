/**
 * Agenda engine — pega as células geradas pelo distribuidor
 * (CPF × Casa × Grupo) e atribui uma data a cada uma respeitando:
 *
 *   1. modo_execucao do grupo: AGENDADO entra no calendário, SOB_DEMANDA fica no backlog.
 *   2. meta diária em USD: empilha depósitos (na moeda nativa, convertidos pra USD)
 *      até atingir a meta; ao estourar, abre próximo dia.
 *   3. CPF não pode aparecer em dias consecutivos do mesmo grupo se houver alternativa.
 *      (busca slot → se o último depósito daquele dia for do mesmo CPF, tenta
 *       reordenar dentro do dia ou pula pro próximo.)
 *
 * Saída: lista achatada { celula_id, scheduled_date, ordem_dia } pronta pra
 * inserir em distribuicao_plano_agenda.
 */
import type { DistribuicaoCelula } from "./distribuicao-engine";

export type ModoExecucao = "AGENDADO" | "SOB_DEMANDA";

export interface CelulaParaAgendar extends DistribuicaoCelula {
  /** id da célula no banco (distribuicao_plano_celulas.id) */
  celula_id: string;
  /** modo do grupo desta célula */
  modo_execucao: ModoExecucao;
  /** valor sugerido na moeda nativa da casa */
  deposito_sugerido: number;
  /** moeda nativa da casa (BRL/USD/EUR...) */
  moeda: string;
}

export interface AgendaItem {
  celula_id: string;
  scheduled_date: string; // YYYY-MM-DD
  ordem_dia: number;
}

export interface AgendaBacklogItem {
  celula_id: string;
}

export interface AgendaResultado {
  agenda: AgendaItem[];
  backlog: AgendaBacklogItem[];
  warnings: string[];
}

export interface AgendaConfig {
  /** Primeira data possível (inclusive). YYYY-MM-DD. */
  startDate: string;
  /** Meta diária em USD. Se 0/null/undefined, tudo cai no mesmo dia. */
  metaDiariaUsd: number | null;
  /** Função de conversão moeda nativa → USD. */
  toUsd: (valor: number, moeda: string) => number;
}

function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function gerarAgenda(
  celulas: CelulaParaAgendar[],
  cfg: AgendaConfig
): AgendaResultado {
  const agenda: AgendaItem[] = [];
  const backlog: AgendaBacklogItem[] = [];
  const warnings: string[] = [];

  // Backlog: tudo que é SOB_DEMANDA
  const agendaveis: CelulaParaAgendar[] = [];
  celulas.forEach((c) => {
    if (c.modo_execucao === "SOB_DEMANDA") {
      backlog.push({ celula_id: c.celula_id });
    } else {
      agendaveis.push(c);
    }
  });

  if (agendaveis.length === 0) {
    return { agenda, backlog, warnings };
  }

  const meta = cfg.metaDiariaUsd && cfg.metaDiariaUsd > 0 ? cfg.metaDiariaUsd : Infinity;

  // Estado por dia: { somaUsd, lastParceiroPorGrupo, ordem }
  type DayState = {
    somaUsd: number;
    ordem: number;
    lastParceiroPorGrupo: Map<string, string>;
  };
  const days = new Map<string, DayState>();
  const ensureDay = (k: string): DayState => {
    if (!days.has(k)) {
      days.set(k, { somaUsd: 0, ordem: 0, lastParceiroPorGrupo: new Map() });
    }
    return days.get(k)!;
  };

  let cursorDate = cfg.startDate;
  // mantemos o cursor mas permitimos buscar adiante se houver conflito de CPF
  for (const cel of agendaveis) {
    const valorUsd = cfg.toUsd(cel.deposito_sugerido || 0, cel.moeda);

    let triedDate = cursorDate;
    let placed = false;
    // tenta no máximo 60 dias à frente para evitar loop infinito
    for (let attempt = 0; attempt < 60 && !placed; attempt++) {
      const day = ensureDay(triedDate);
      const last = day.lastParceiroPorGrupo.get(cel.grupo_id);
      const repeatedCpf = last === cel.parceiro_id && day.ordem > 0;
      const fitsMeta = day.somaUsd + valorUsd <= meta || day.ordem === 0;

      if (!fitsMeta) {
        // estourou meta → próximo dia
        triedDate = addDays(triedDate, 1);
        continue;
      }
      if (repeatedCpf) {
        // CPF repetido sequencial neste grupo → tenta próximo dia
        triedDate = addDays(triedDate, 1);
        continue;
      }

      // OK, encaixa
      agenda.push({
        celula_id: cel.celula_id,
        scheduled_date: triedDate,
        ordem_dia: day.ordem,
      });
      day.somaUsd += valorUsd;
      day.ordem += 1;
      day.lastParceiroPorGrupo.set(cel.grupo_id, cel.parceiro_id);

      // o cursor anda para o dia atual (não regredimos)
      if (triedDate > cursorDate) cursorDate = triedDate;
      placed = true;
    }

    if (!placed) {
      warnings.push(
        `Célula ${cel.celula_id.slice(0, 6)} não encontrou data adequada em 60 dias — caiu no backlog.`
      );
      backlog.push({ celula_id: cel.celula_id });
    }
  }

  return { agenda, backlog, warnings };
}
