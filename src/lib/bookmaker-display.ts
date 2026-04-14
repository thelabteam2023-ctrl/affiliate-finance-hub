import { getFirstLastName } from "@/lib/utils";

/**
 * Formata o nome de exibição de uma bookmaker dentro do contexto de PROJETO.
 * Padrão: "CASA - PARCEIRO" (ex: "BETÃO - GLAYZA")
 * 
 * Regras:
 * - Se instance_identifier existe e é DIFERENTE do primeiro nome do parceiro, usa o identifier
 * - Senão, usa o primeiro/último nome do parceiro
 * - Nunca duplica informação entre parênteses
 * 
 * @param nome Nome da casa (ex: "BETÃO")
 * @param parceiroNome Nome completo do parceiro (ex: "GLAYZA LIMA SARAIVA")
 * @param instanceIdentifier Identificador de instância (ex: "GLAYZA")
 */
export function formatBookmakerProjectName(
  nome: string,
  parceiroNome?: string | null,
  instanceIdentifier?: string | null,
): string {
  const shortName = parceiroNome ? getFirstLastName(parceiroNome) : "";
  
  if (!shortName && !instanceIdentifier) return nome;
  
  // Determinar o vínculo a exibir
  let vinculo = shortName;
  
  // Se tem identifier e é diferente do primeiro nome do parceiro, usar identifier
  if (instanceIdentifier && shortName) {
    const firstNameOfParceiro = shortName.split(/\s+/)[0]?.toUpperCase();
    const identifierUpper = instanceIdentifier.toUpperCase().trim();
    if (identifierUpper !== firstNameOfParceiro) {
      vinculo = `${shortName} (${instanceIdentifier})`;
    }
  } else if (instanceIdentifier && !shortName) {
    vinculo = instanceIdentifier;
  }
  
  return vinculo ? `${nome} - ${vinculo}` : nome;
}

/**
 * Formata o display de um nome completo de bookmaker (já no formato "CASA - PARCEIRO")
 * Abrevia o parceiro se necessário.
 */
export function formatBookmakerDisplay(nomeCompleto: string): string {
  const separatorIdx = nomeCompleto.indexOf(" - ");
  if (separatorIdx > 0) {
    const casa = nomeCompleto.substring(0, separatorIdx).trim();
    const vinculoRaw = nomeCompleto.substring(separatorIdx + 3).trim();
    const vinculoAbreviado = getFirstLastName(vinculoRaw);
    return `${casa} - ${vinculoAbreviado}`;
  }
  return nomeCompleto;
}

/**
 * Constrói um Map<bookmaker_id, nome_formatado> para uso em SurebetCard e similares.
 * Centraliza a lógica para evitar duplicação em múltiplas tabs.
 */
export function buildBookmakerNomeMap(
  bookmakers: Array<{
    id: string;
    nome: string;
    parceiro_nome?: string | null;
    parceiro?: { nome: string } | null;
    instance_identifier?: string | null;
  }>
): Map<string, string> {
  const map = new Map<string, string>();
  bookmakers.forEach(bk => {
    const parceiroNome = bk.parceiro_nome || bk.parceiro?.nome || null;
    const nomeCompleto = formatBookmakerProjectName(bk.nome, parceiroNome, bk.instance_identifier);
    map.set(bk.id, nomeCompleto);
  });
  return map;
}

/**
 * Extrai bookmaker_ids de pernas que NÃO estão no mapa do projeto.
 * Usado para identificar bookmakers desvinculadas que precisam de query separada.
 */
export function collectMissingBookmakerIds(
  projectMap: Map<string, string>,
  operacoes: Array<{
    bookmaker_id?: string | null;
    pernas?: Array<{
      bookmaker_id?: string | null;
      entries?: Array<{ bookmaker_id?: string }>;
    }>;
  }>
): string[] {
  const missing = new Set<string>();
  for (const op of operacoes) {
    if (op.bookmaker_id && !projectMap.has(op.bookmaker_id)) {
      missing.add(op.bookmaker_id);
    }
    for (const perna of (op.pernas || [])) {
      if (perna.bookmaker_id && !projectMap.has(perna.bookmaker_id)) {
        missing.add(perna.bookmaker_id);
      }
      for (const entry of (perna.entries || [])) {
        if (entry.bookmaker_id && !projectMap.has(entry.bookmaker_id)) {
          missing.add(entry.bookmaker_id);
        }
      }
    }
  }
  return [...missing];
}

/**
 * Mescla dois mapas de nomes. O primeiro tem prioridade.
 */
export function mergeBookmakerNomeMaps(
  primary: Map<string, string>,
  secondary: Map<string, string>
): Map<string, string> {
  const merged = new Map(primary);
  for (const [id, nome] of secondary) {
    if (!merged.has(id)) {
      merged.set(id, nome);
    }
  }
  return merged;
}
