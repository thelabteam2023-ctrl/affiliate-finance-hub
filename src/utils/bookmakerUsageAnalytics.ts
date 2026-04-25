import { getFirstLastName } from "@/lib/utils";
import { convertPernaToConsolidacao } from "@/lib/currency-conversion-snapshot";
import { getConsolidatedLucro, getConsolidatedStake } from "@/utils/consolidatedValues";

type ConvertFn = (valor: number, moedaOrigem: string) => number;

export interface BookmakerUsageEntry {
  id?: string | null;
  bookmaker_id?: string | null;
  bookmaker_nome?: string | null;
  parceiro_nome?: string | null;
  instance_identifier?: string | null;
  logo_url?: string | null;
  stake?: number | null;
  stake_total?: number | null;
  lucro_prejuizo?: number | null;
  moeda?: string | null;
  resultado?: string | null;
  stake_brl_referencia?: number | null;
  lucro_prejuizo_brl_referencia?: number | null;
  cotacao_snapshot?: number | null;
  bookmakers?: {
    nome?: string | null;
    instance_identifier?: string | null;
    parceiro?: { nome?: string | null } | null;
    bookmakers_catalogo?: { logo_url?: string | null } | null;
  } | null;
  bookmaker?: {
    nome?: string | null;
    instance_identifier?: string | null;
    parceiro?: { nome?: string | null } | null;
    bookmakers_catalogo?: { logo_url?: string | null } | null;
  } | null;
}

export interface BookmakerUsageOperation extends BookmakerUsageEntry {
  status?: string | null;
  forma_registro?: string | null;
  moeda_operacao?: string | null;
  stake_consolidado?: number | null;
  pl_consolidado?: number | null;
  consolidation_currency?: string | null;
  valor_brl_referencia?: number | null;
  is_multicurrency?: boolean | null;
  pernas?: Array<BookmakerUsageEntry & { entries?: BookmakerUsageEntry[] | null }> | null;
  _sub_entries?: BookmakerUsageEntry[] | null;
}

export interface BookmakerParticipation {
  bookmaker_id?: string | null;
  bookmaker_nome: string;
  parceiro_nome: string | null;
  instance_identifier: string | null;
  logo_url: string | null;
  stake: number;
  lucro: number;
  resolved: boolean;
  moeda: string;
}

export interface BookmakerUsageAggregate {
  casa: string;
  apostas: number;
  volume: number;
  lucro: number;
  roi: number;
  moeda?: string;
  logo_url?: string | null;
  vinculos: Array<{
    vinculo: string;
    apostas: number;
    volume: number;
    lucro: number;
    roi: number;
  }>;
}

interface AggregateOptions {
  moedaConsolidacao?: string;
  convertToConsolidation?: ConvertFn;
  resolveLogo?: (casa: string) => string | null | undefined;
}

const normalizeBookmakerInfo = (entry: BookmakerUsageEntry) => {
  const joined = entry.bookmakers || entry.bookmaker;
  const parceiroNome = entry.parceiro_nome ?? joined?.parceiro?.nome ?? null;
  const instanceIdentifier = entry.instance_identifier ?? joined?.instance_identifier ?? null;
  const baseNome = entry.bookmaker_nome ?? joined?.nome ?? "Desconhecida";
  const bookmakerNome = parceiroNome && !baseNome.includes(" - ")
    ? `${baseNome} - ${parceiroNome}${instanceIdentifier ? ` (${instanceIdentifier})` : ""}`
    : baseNome;

  return {
    bookmakerNome,
    parceiroNome,
    instanceIdentifier,
    logoUrl: entry.logo_url ?? joined?.bookmakers_catalogo?.logo_url ?? null,
  };
};

export const extractCasaVinculo = (
  bookmakerNome: string,
  parceiroNome?: string | null,
  instanceIdentifier?: string | null,
) => {
  const separatorIdx = bookmakerNome.indexOf(" - ");
  const casa = separatorIdx > 0 ? bookmakerNome.substring(0, separatorIdx).trim() : bookmakerNome;
  const vinculo = instanceIdentifier
    ? instanceIdentifier
    : parceiroNome
      ? getFirstLastName(parceiroNome)
      : separatorIdx > 0
        ? getFirstLastName(bookmakerNome.substring(separatorIdx + 3).trim())
        : "Principal";

  return { casa, vinculo };
};

const convertEntryValue = (
  valor: number,
  entry: BookmakerUsageEntry,
  moedaFallback: string,
  options: AggregateOptions,
  brlReference?: number | null,
) => {
  const moedaConsolidacao = options.moedaConsolidacao || "BRL";
  const moeda = entry.moeda || moedaFallback || moedaConsolidacao;
  if (!valor) return 0;
  if (moeda === moedaConsolidacao) return valor;
  if (moedaConsolidacao === "BRL" && typeof brlReference === "number") return brlReference;
  if (!options.convertToConsolidation) return valor;
  return convertPernaToConsolidacao(
    { valor, moedaOrigem: moeda, cotacaoSnapshot: entry.cotacao_snapshot },
    { moedaConsolidacao, convertToConsolidationFallback: options.convertToConsolidation },
  );
};

export function extractBookmakerParticipations(
  operation: BookmakerUsageOperation,
  options: AggregateOptions = {},
): BookmakerParticipation[] {
  const moedaConsolidacao = options.moedaConsolidacao || "BRL";
  const moedaFallback = operation.moeda_operacao || moedaConsolidacao;
  const resolved = !!(operation.resultado && operation.resultado !== "PENDENTE") || operation.status === "LIQUIDADA";
  const entries: BookmakerUsageEntry[] = [];

  if (Array.isArray(operation._sub_entries) && operation._sub_entries.length > 0) {
    entries.push(...operation._sub_entries);
  } else if (Array.isArray(operation.pernas) && operation.pernas.length > 0) {
    operation.pernas.forEach((perna) => {
      if (Array.isArray(perna.entries) && perna.entries.length > 0) {
        entries.push(...perna.entries.map((entry) => ({ ...entry, resultado: entry.resultado ?? perna.resultado })));
      } else {
        entries.push(perna);
      }
    });
  } else {
    entries.push(operation);
  }

  const knownLucro = entries.reduce((acc, entry) => {
    if (typeof entry.lucro_prejuizo !== "number") return acc;
    return acc + convertEntryValue(entry.lucro_prejuizo, entry, moedaFallback, options, entry.lucro_prejuizo_brl_referencia);
  }, 0);
  const missingLucroCount = entries.filter((entry) => typeof entry.lucro_prejuizo !== "number").length;
  const operationLucro = getConsolidatedLucro(operation, options.convertToConsolidation, moedaConsolidacao);
  const fallbackLucro = missingLucroCount > 0 ? (operationLucro - knownLucro) / missingLucroCount : 0;

  return entries.map((entry) => {
    const info = normalizeBookmakerInfo(entry);
    const stakeRaw = typeof entry.stake_total === "number" ? entry.stake_total : (entry.stake ?? 0);
    const stake = entry === operation
      ? getConsolidatedStake(operation, options.convertToConsolidation, moedaConsolidacao)
      : convertEntryValue(stakeRaw, entry, moedaFallback, options, entry.stake_brl_referencia);
    const lucro = typeof entry.lucro_prejuizo === "number"
      ? convertEntryValue(entry.lucro_prejuizo, entry, moedaFallback, options, entry.lucro_prejuizo_brl_referencia)
      : fallbackLucro;

    return {
      bookmaker_id: entry.bookmaker_id,
      bookmaker_nome: info.bookmakerNome,
      parceiro_nome: info.parceiroNome,
      instance_identifier: info.instanceIdentifier,
      logo_url: info.logoUrl,
      stake,
      lucro: resolved ? lucro : 0,
      resolved,
      moeda: moedaConsolidacao,
    };
  });
}

export function aggregateBookmakerUsage(
  operations: BookmakerUsageOperation[],
  options: AggregateOptions = {},
): BookmakerUsageAggregate[] {
  const casaMap = new Map<string, {
    apostas: number;
    volume: number;
    volumeLiquidado: number;
    lucro: number;
    moeda: string;
    logo_url: string | null;
    vinculos: Map<string, { apostas: number; volume: number; volumeLiquidado: number; lucro: number }>;
  }>();

  operations.forEach((operation) => {
    extractBookmakerParticipations(operation, options).forEach((participation) => {
      const { casa, vinculo } = extractCasaVinculo(
        participation.bookmaker_nome,
        participation.parceiro_nome,
        participation.instance_identifier,
      );
      if (!casaMap.has(casa)) {
        casaMap.set(casa, {
          apostas: 0,
          volume: 0,
          volumeLiquidado: 0,
          lucro: 0,
          moeda: participation.moeda,
          logo_url: participation.logo_url,
          vinculos: new Map(),
        });
      }

      const casaData = casaMap.get(casa)!;
      casaData.apostas += 1;
      casaData.volume += participation.stake;
      if (participation.resolved) casaData.volumeLiquidado += participation.stake;
      casaData.lucro += participation.lucro;
      if (!casaData.logo_url && participation.logo_url) casaData.logo_url = participation.logo_url;

      if (!casaData.vinculos.has(vinculo)) {
        casaData.vinculos.set(vinculo, { apostas: 0, volume: 0, volumeLiquidado: 0, lucro: 0 });
      }
      const vinculoData = casaData.vinculos.get(vinculo)!;
      vinculoData.apostas += 1;
      vinculoData.volume += participation.stake;
      if (participation.resolved) vinculoData.volumeLiquidado += participation.stake;
      vinculoData.lucro += participation.lucro;
    });
  });

  return Array.from(casaMap.entries()).map(([casa, data]) => ({
    casa,
    apostas: data.apostas,
    volume: data.volume,
    lucro: data.lucro,
    roi: data.volumeLiquidado > 0 ? (data.lucro / data.volumeLiquidado) * 100 : 0,
    moeda: data.moeda,
    logo_url: data.logo_url || options.resolveLogo?.(casa) || null,
    vinculos: Array.from(data.vinculos.entries()).map(([vinculo, v]) => ({
      vinculo,
      apostas: v.apostas,
      volume: v.volume,
      lucro: v.lucro,
      roi: v.volumeLiquidado > 0 ? (v.lucro / v.volumeLiquidado) * 100 : 0,
    })).sort((a, b) => b.volume - a.volume),
  }));
}