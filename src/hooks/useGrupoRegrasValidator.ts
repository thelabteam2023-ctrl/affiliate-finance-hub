import { useMemo } from "react";
import { useBookmakerGrupos } from "./useBookmakerGrupos";
import { useBookmakerGrupoRegras, BookmakerGrupoRegra, REGRA_TIPO_LABELS } from "./useBookmakerGrupoRegras";
import { PlanningCampanha } from "./usePlanningData";

export interface ValidationContext {
  bookmaker_catalogo_id: string | null;
  parceiro_id: string | null;
  ip_id: string | null;
  wallet_id: string | null;
  scheduled_date: string;
  excludeCampanhaId?: string;
}

export interface Violation {
  regra: BookmakerGrupoRegra;
  grupoNome: string;
  mensagem: string;
}

function diffDias(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.abs(Math.round((da - db) / (1000 * 60 * 60 * 24)));
}

/**
 * Valida um contexto (casa+perfil+ip+data) contra todas as regras ativas
 * dos grupos aos quais a casa em questão pertence.
 */
export function useGrupoRegrasValidator(allCampanhas: PlanningCampanha[]) {
  const { grupos, membros, getGrupoIdsByCatalogo } = useBookmakerGrupos();
  const { regras } = useBookmakerGrupoRegras();

  const grupoMap = useMemo(() => {
    const m = new Map<string, string>();
    grupos.forEach((g) => m.set(g.id, g.nome));
    return m;
  }, [grupos]);

  // Por catálogo → IDs de catálogos no mesmo grupo (qualquer grupo onde o catálogo participa)
  const catalogosPorGrupo = useMemo(() => {
    const map = new Map<string, Set<string>>();
    membros.forEach((m) => {
      if (!map.has(m.grupo_id)) map.set(m.grupo_id, new Set());
      map.get(m.grupo_id)!.add(m.bookmaker_catalogo_id);
    });
    return map;
  }, [membros]);

  const validate = (ctx: ValidationContext): { ok: boolean; violations: Violation[]; warnings: Violation[] } => {
    const violations: Violation[] = [];
    const warnings: Violation[] = [];

    if (!ctx.bookmaker_catalogo_id) {
      return { ok: true, violations, warnings };
    }

    const grupoIds = getGrupoIdsByCatalogo(ctx.bookmaker_catalogo_id);
    if (grupoIds.length === 0) {
      return { ok: true, violations, warnings };
    }

    const otherCampanhas = allCampanhas.filter(
      (c) => c.id !== ctx.excludeCampanhaId && c.bookmaker_catalogo_id
    );

    for (const grupoId of grupoIds) {
      const regrasDoGrupo = regras.filter((r) => r.grupo_id === grupoId && r.ativa);
      if (regrasDoGrupo.length === 0) continue;

      const catalogosDoGrupo = catalogosPorGrupo.get(grupoId) ?? new Set();
      const grupoNome = grupoMap.get(grupoId) ?? "grupo";

      // Campanhas existentes que envolvem este grupo
      const campanhasNoGrupo = otherCampanhas.filter(
        (c) => c.bookmaker_catalogo_id && catalogosDoGrupo.has(c.bookmaker_catalogo_id)
      );

      for (const regra of regrasDoGrupo) {
        const push = (mensagem: string) => {
          const v: Violation = {
            regra,
            grupoNome,
            mensagem: regra.mensagem_violacao || mensagem,
          };
          if (regra.severidade === "BLOQUEIO") violations.push(v);
          else warnings.push(v);
        };

        switch (regra.tipo_regra) {
          case "LIMITE_MAX_POR_PERFIL": {
            if (!ctx.parceiro_id || !regra.valor_numerico) break;
            const usos = new Set(
              campanhasNoGrupo
                .filter((c) => c.parceiro_id === ctx.parceiro_id)
                .map((c) => c.bookmaker_catalogo_id!)
            );
            usos.add(ctx.bookmaker_catalogo_id);
            if (usos.size > regra.valor_numerico) {
              push(
                `Limite excedido: máximo ${regra.valor_numerico} casas do grupo "${grupoNome}" por perfil.`
              );
            }
            break;
          }

          case "UNICA_POR_PERFIL": {
            if (!ctx.parceiro_id) break;
            const jaUsada = campanhasNoGrupo.some(
              (c) =>
                c.parceiro_id === ctx.parceiro_id &&
                c.bookmaker_catalogo_id === ctx.bookmaker_catalogo_id
            );
            if (jaUsada) {
              push(
                `Esta casa do grupo "${grupoNome}" já foi usada por este perfil.`
              );
            }
            break;
          }

          case "IP_UNICO_OBRIGATORIO": {
            if (!ctx.ip_id || !ctx.parceiro_id) break;
            const ipRepetido = campanhasNoGrupo.some(
              (c) =>
                c.parceiro_id === ctx.parceiro_id &&
                c.scheduled_date === ctx.scheduled_date &&
                c.ip_id === ctx.ip_id
            );
            if (ipRepetido) {
              push(
                `Casas do grupo "${grupoNome}" exigem IP único por perfil no mesmo dia.`
              );
            }
            break;
          }

          case "COOLDOWN_DIAS": {
            if (!ctx.parceiro_id || !regra.valor_numerico) break;
            const recente = campanhasNoGrupo.find((c) => {
              if (c.parceiro_id !== ctx.parceiro_id) return false;
              return diffDias(c.scheduled_date, ctx.scheduled_date) < regra.valor_numerico!;
            });
            if (recente) {
              push(
                `Cooldown ativo: aguarde ${regra.valor_numerico} dia(s) entre casas do grupo "${grupoNome}" para o mesmo perfil.`
              );
            }
            break;
          }
        }
      }
    }

    return { ok: violations.length === 0, violations, warnings };
  };

  return { validate };
}

export function describeRegra(r: BookmakerGrupoRegra): string {
  const base = REGRA_TIPO_LABELS[r.tipo_regra];
  if (r.tipo_regra === "LIMITE_MAX_POR_PERFIL") return `${base}: ${r.valor_numerico ?? "?"}`;
  if (r.tipo_regra === "COOLDOWN_DIAS") return `${base}: ${r.valor_numerico ?? "?"} dia(s)`;
  return base;
}
