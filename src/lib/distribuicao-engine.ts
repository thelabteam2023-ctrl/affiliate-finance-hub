import type { RegraCasa, RegraIp } from "@/hooks/useDistribuicaoPlanos";

export interface GrupoConfig {
  grupo_id: string;
  grupo_nome: string;
  regra_casa: RegraCasa;
  regra_ip: RegraIp;
  /** Quantas casas cada CPF deve receber deste grupo. Se null/undefined, usa todas as casas disponíveis (ou todas até o limite imposto pela regra). */
  casas_por_cpf: number | null;
  /** IDs de catálogo membros do grupo */
  catalogo_ids: string[];
}

export interface DistribuicaoCelula {
  grupo_id: string;
  parceiro_id: string;
  bookmaker_catalogo_id: string;
  ip_slot: string;
  ordem: number;
}

export interface DistribuicaoWarning {
  level: "warn" | "error";
  grupo_id?: string;
  parceiro_id?: string;
  message: string;
}

export interface DistribuicaoResultado {
  celulas: DistribuicaoCelula[];
  warnings: DistribuicaoWarning[];
}

/**
 * Gera a matriz CPF × Casa aplicando as regras de cada grupo.
 *
 * Algoritmo (greedy por grupo):
 *  - REPETIR_LIVRE: cada CPF recebe as N primeiras casas do grupo (mesma lista para todos).
 *  - NAO_REPETIR_NO_CPF: cada CPF recebe N casas distintas; entre CPFs pode repetir.
 *  - RODIZIO_ENTRE_CPFS: distribui as casas em rodízio circular — só repete uma casa em outro CPF
 *    quando já tiver dado a volta em todas as casas.
 *
 * Regra de IP é só anotada no slot da célula:
 *  - IP_COMPARTILHADO_GRUPO: todas as casas do grupo num mesmo CPF compartilham slot "G:<grupo>:<cpf>"
 *  - IP_UNICO_POR_CASA: cada casa tem seu próprio slot "G:<grupo>:<cpf>:<idx>"
 */
export function gerarDistribuicao(
  parceiroIds: string[],
  grupos: GrupoConfig[]
): DistribuicaoResultado {
  const celulas: DistribuicaoCelula[] = [];
  const warnings: DistribuicaoWarning[] = [];

  if (parceiroIds.length === 0) {
    warnings.push({ level: "error", message: "Selecione ao menos um perfil." });
    return { celulas, warnings };
  }
  if (grupos.length === 0) {
    warnings.push({ level: "error", message: "Adicione ao menos um grupo." });
    return { celulas, warnings };
  }

  let ordem = 0;

  for (const g of grupos) {
    // Embaralha as casas do grupo para evitar distribuição alfabética/previsível
    const casas = shuffleArray(g.catalogo_ids);
    const totalCasas = casas.length;
    if (totalCasas === 0) {
      warnings.push({
        level: "warn",
        grupo_id: g.grupo_id,
        message: `Grupo "${g.grupo_nome}" não tem casas — ignorado.`,
      });
      continue;
    }

    const nCpfs = parceiroIds.length;
    const desejado = g.casas_por_cpf ?? totalCasas;

    switch (g.regra_casa) {
      case "REPETIR_LIVRE": {
        const usar = Math.min(desejado, totalCasas);
        if (desejado > totalCasas) {
          warnings.push({
            level: "warn",
            grupo_id: g.grupo_id,
            message: `"${g.grupo_nome}": pediu ${desejado} casas/CPF mas só há ${totalCasas} no grupo.`,
          });
        }
        for (const pid of parceiroIds) {
          for (let i = 0; i < usar; i++) {
            celulas.push({
              grupo_id: g.grupo_id,
              parceiro_id: pid,
              bookmaker_catalogo_id: casas[i],
              ip_slot: ipSlot(g, pid, i),
              ordem: ordem++,
            });
          }
        }
        break;
      }

      case "NAO_REPETIR_NO_CPF": {
        // Cada CPF recebe `desejado` casas distintas. Entre CPFs pode repetir.
        // Estratégia: para distribuir bem, fazemos rotação circular do índice inicial por CPF.
        const usar = Math.min(desejado, totalCasas);
        if (desejado > totalCasas) {
          warnings.push({
            level: "warn",
            grupo_id: g.grupo_id,
            message: `"${g.grupo_nome}": pediu ${desejado} casas/CPF mas só há ${totalCasas} no grupo.`,
          });
        }
        parceiroIds.forEach((pid, cpfIdx) => {
          for (let i = 0; i < usar; i++) {
            const casaIdx = (cpfIdx * usar + i) % totalCasas;
            celulas.push({
              grupo_id: g.grupo_id,
              parceiro_id: pid,
              bookmaker_catalogo_id: casas[casaIdx],
              ip_slot: ipSlot(g, pid, i),
              ordem: ordem++,
            });
          }
        });
        // Diversidade: se nCpfs * usar > totalCasas há sobreposição entre CPFs
        const slots = nCpfs * usar;
        if (slots > totalCasas) {
          warnings.push({
            level: "warn",
            grupo_id: g.grupo_id,
            message: `"${g.grupo_nome}": ${slots} usos para ${totalCasas} casas — haverá repetição entre CPFs.`,
          });
        }
        break;
      }

      case "RODIZIO_ENTRE_CPFS": {
        // Cada CPF deve receber casas únicas no grupo, e entre CPFs também só repete depois de
        // todas serem usadas. Ou seja: distribuição circular — CPF1 pega [0..k-1], CPF2 pega [k..2k-1], etc.
        const usar = Math.min(desejado, totalCasas);
        const necessario = nCpfs * usar;
        if (necessario > totalCasas) {
          warnings.push({
            level: "warn",
            grupo_id: g.grupo_id,
            message: `"${g.grupo_nome}": rodízio precisaria de ${necessario} casas distintas mas só há ${totalCasas}. Algumas casas se repetirão entre CPFs.`,
          });
        }
        if (usar > totalCasas) {
          warnings.push({
            level: "warn",
            grupo_id: g.grupo_id,
            message: `"${g.grupo_nome}": cada CPF pediu ${desejado} casas mas o grupo só tem ${totalCasas}.`,
          });
        }
        let cursor = 0;
        for (const pid of parceiroIds) {
          for (let i = 0; i < usar; i++) {
            const casaIdx = cursor % totalCasas;
            cursor++;
            celulas.push({
              grupo_id: g.grupo_id,
              parceiro_id: pid,
              bookmaker_catalogo_id: casas[casaIdx],
              ip_slot: ipSlot(g, pid, i),
              ordem: ordem++,
            });
          }
        }
        break;
      }
    }
  }

  return { celulas, warnings };
}

function ipSlot(g: GrupoConfig, parceiroId: string, idx: number): string {
  const cpfShort = parceiroId.slice(0, 4);
  const grupoShort = g.grupo_id.slice(0, 4);
  return g.regra_ip === "IP_COMPARTILHADO_GRUPO"
    ? `G:${grupoShort}:${cpfShort}`
    : `G:${grupoShort}:${cpfShort}:${idx + 1}`;
}
