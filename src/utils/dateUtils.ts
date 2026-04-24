/**
 * Utilitários de data para o projeto
 * Centraliza funções de parsing e formatação de datas
 * 
 * REGRA-MÃE: O timezone operacional é America/Sao_Paulo
 * Todo agrupamento diário DEVE ocorrer após conversão para este timezone
 */

import { toZonedTime, format as formatTz } from 'date-fns-tz';

// Timezone operacional do sistema (Brasil)
export const TIMEZONE_OPERACIONAL = 'America/Sao_Paulo';

/**
 * Converte string de data do banco (UTC) para Date no timezone operacional
 * 
 * Use esta função sempre que precisar exibir uma data que veio do banco
 * para o usuário, garantindo que a hora mostrada seja a do timezone operacional.
 * 
 * @param dateString - String de data do banco (ISO 8601 ou similar, geralmente UTC)
 * @returns Date objeto convertido para timezone operacional
 */
export const parseLocalDateTime = (dateString: string | null | undefined): Date => {
  if (!dateString) return new Date();
  
  // Garantir que a string seja parseable como ISO
  // Se termina com +00 (sem :00), normalizar para +00:00
  let normalizedDate = dateString;
  if (/\+00$/.test(normalizedDate)) {
    normalizedDate = normalizedDate.replace(/\+00$/, '+00:00');
  }
  
  // Parse como UTC e converte para timezone operacional
  const utcDate = new Date(normalizedDate);
  if (isNaN(utcDate.getTime())) {
    // Fallback para parsing manual se o formato não for reconhecido
    return parseManualDateTime(dateString);
  }
  
  // Converter para timezone operacional
  return toZonedTime(utcDate, TIMEZONE_OPERACIONAL);
};

/**
 * Fallback para parsing manual quando o formato não é ISO padrão
 */
const parseManualDateTime = (dateString: string): Date => {
  const cleanDate = dateString
    .replace(/\+00:00$/, '')
    .replace(/Z$/, '')
    .replace(/\+\d{2}:\d{2}$/, '')
    .replace(/-\d{2}:\d{2}$/, '')
    .replace(/\+\d{2}$/, '');
  
  const [datePart, timePart] = cleanDate.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds] = (timePart || '00:00:00').split(':').map(n => parseInt(n) || 0);
  
  return new Date(year, month - 1, day, hours, minutes, seconds);
};

/**
 * Verifica se duas datas são do mesmo dia (ignorando hora)
 */
export const isSameDay = (date1: Date, date2: Date): boolean => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

/**
 * Extrai a "data operacional" (YYYY-MM-DD) de uma string de data do banco.
 * 
 * REGRA CRÍTICA: Converte UTC → America/Sao_Paulo ANTES de extrair a data.
 * 
 * Use esta função para agrupar dados por dia civil (calendários, estatísticas, KPIs).
 * Garante que apostas feitas às 23:00 BRT (02:00 UTC do dia seguinte) 
 * sejam agrupadas no dia correto (dia operacional).
 * 
 * @param dateString - String de data do banco (ISO 8601, geralmente UTC)
 * @returns String no formato "YYYY-MM-DD" representando o dia operacional (America/Sao_Paulo)
 */
export const extractLocalDateKey = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  
  // Se é apenas data (sem hora), retornar diretamente
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }
  
  // Normalizar formato: "+00" → "+00:00" para parsing correto
  let normalizedDate = dateString;
  if (/\+00$/.test(normalizedDate)) {
    normalizedDate = normalizedDate.replace(/\+00$/, '+00:00');
  }
  // Também tratar espaço em vez de 'T' (formato Postgres)
  if (normalizedDate.includes(' ') && !normalizedDate.includes('T')) {
    normalizedDate = normalizedDate.replace(' ', 'T');
  }
  
  // Parse como UTC
  const utcDate = new Date(normalizedDate);
  if (isNaN(utcDate.getTime())) {
    // Fallback: extrair data diretamente da string se parsing falhar
    const match = normalizedDate.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }
  
  // Converter para timezone operacional e extrair data
  const zonedDate = toZonedTime(utcDate, TIMEZONE_OPERACIONAL);
  
  // Formatar como YYYY-MM-DD usando date-fns-tz para garantir timezone correto
  return formatTz(zonedDate, 'yyyy-MM-dd', { timeZone: TIMEZONE_OPERACIONAL });
};

/**
 * Extrai a data civil (YYYY-MM-DD) de uma string de data do banco SEM conversão de timezone.
 * 
 * QUANDO USAR: Para campos que representam "datas civis" (ex: credited_at de bônus,
 * data_transacao de ajustes), onde o valor é armazenado como meia-noite UTC
 * mas o usuário quis dizer "este dia civil" (sem hora real).
 * 
 * QUANDO NÃO USAR: Para data_aposta (timestamps reais com hora).
 * Use extractLocalDateKey para esses casos.
 * 
 * Exemplo: credited_at = "2026-02-23 00:00:00+00" → retorna "2026-02-23"
 * (extractLocalDateKey retornaria "2026-02-22" porque São Paulo é UTC-3)
 * 
 * @param dateString - String de data do banco
 * @returns String no formato "YYYY-MM-DD" representando a data civil
 */
export const extractCivilDateKey = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  
  // Se é apenas data (sem hora), retornar diretamente
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }
  
  // Extrair a parte de data diretamente da string (sem conversão de timezone)
  const match = dateString.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
};

/**
 * Converte um range de datas operacionais (dia civil em São Paulo) para 
 * um range de timestamps UTC para uso em queries de banco.
 * 
 * CRÍTICO: Esta função resolve o problema onde apostas feitas às 23:00 BRT
 * (02:00 UTC do dia seguinte) eram incorretamente filtradas.
 * 
 * Exemplo:
 * - Dia operacional: 05/02/2026 (São Paulo)
 * - Range UTC retornado: 2026-02-05T03:00:00Z até 2026-02-06T02:59:59.999Z
 * 
 * @param startDate - Data de início (considerada como início do dia em São Paulo)
 * @param endDate - Data de fim (considerada como fim do dia em São Paulo)
 * @returns Objeto com startUTC e endUTC em formato ISO para queries
 */
export const getOperationalDateRangeForQuery = (
  startDate: Date,
  endDate: Date
): { startUTC: string; endUTC: string } => {
  // Offset de São Paulo: UTC-3 (simplificado, não considera horário de verão pois foi abolido no Brasil)
  // Para pegar início do dia em São Paulo (00:00), precisamos adicionar 3h ao UTC
  // Ex: 00:00 São Paulo = 03:00 UTC
  
  // Início do dia operacional em São Paulo (00:00 local)
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth();
  const startDay = startDate.getDate();
  
  // Criar data UTC que representa 00:00 em São Paulo
  // 00:00 São Paulo = 03:00 UTC do mesmo dia
  const startUTC = new Date(Date.UTC(startYear, startMonth, startDay, 3, 0, 0, 0));
  
  // Fim do dia operacional em São Paulo (23:59:59.999 local)
  const endYear = endDate.getFullYear();
  const endMonth = endDate.getMonth();
  const endDay = endDate.getDate();
  
  // Criar data UTC que representa 23:59:59.999 em São Paulo
  // 23:59:59.999 São Paulo = 02:59:59.999 UTC do dia SEGUINTE
  const endUTC = new Date(Date.UTC(endYear, endMonth, endDay + 1, 2, 59, 59, 999));
  
  return {
    startUTC: startUTC.toISOString(),
    endUTC: endUTC.toISOString(),
  };
};

/**
 * Versão simplificada que aceita strings YYYY-MM-DD e retorna strings para queries
 */
export const getOperationalDateRangeFromStrings = (
  startDateStr: string,
  endDateStr: string
): { startUTC: string; endUTC: string } => {
  const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
  
  // 00:00 São Paulo = 03:00 UTC
  const startUTC = new Date(Date.UTC(startYear, startMonth - 1, startDay, 3, 0, 0, 0));
  
  // 23:59:59.999 São Paulo = 02:59:59.999 UTC do dia seguinte
  const endUTC = new Date(Date.UTC(endYear, endMonth - 1, endDay + 1, 2, 59, 59, 999));
  
  return {
    startUTC: startUTC.toISOString(),
    endUTC: endUTC.toISOString(),
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// FILTRO DE DATA CIVIL — Para campos armazenados como meia-noite UTC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gera range de filtragem para campos de "Data Civil" — campos que armazenam
 * datas como meia-noite UTC (ex: data_transacao no cash_ledger, credited_at em bônus).
 * 
 * DIFERENÇA CRÍTICA vs getOperationalDateRangeForQuery:
 * - getOperationalDateRangeForQuery: Para timestamps reais (data_aposta) que possuem
 *   horário significativo. Usa offset São Paulo (03:00Z → 02:59Z).
 * - getCivilDateRangeForQuery: Para datas civis salvas como YYYY-MM-DD 00:00:00 UTC.
 *   Usa meia-noite UTC pura (00:00Z → 23:59Z) para não excluir registros.
 * 
 * Exemplo:
 * - data_transacao = 2026-03-10 00:00:00+00 (data civil)
 * - getCivilDateRangeForQuery("2026-03-10", "2026-05-05")
 *   → { startUTC: "2026-03-10T00:00:00.000Z", endUTC: "2026-05-05T23:59:59.999Z" }
 * 
 * QUANDO USAR:
 * - cash_ledger.data_transacao (depósitos, saques, ajustes)
 * - project_bookmaker_link_bonuses.credited_at
 * - Qualquer campo que use toLocalTimestamp com meia-noite
 * 
 * QUANDO NÃO USAR:
 * - apostas_unificada.data_aposta (timestamp real → usar getOperationalDateRangeForQuery)
 * - created_at, updated_at (timestamps reais)
 */
export const getCivilDateRangeForQuery = (
  startDateStr: string,
  endDateStr: string
): { startUTC: string; endUTC: string } => {
  return {
    startUTC: `${startDateStr}T00:00:00.000Z`,
    endUTC: `${endDateStr}T23:59:59.999Z`,
  };
};

// Ano mínimo permitido para apostas (proteção contra datas inválidas)
const ANO_MINIMO_APOSTAS = 2025;

/**
 * Valida se uma data de aposta está dentro do intervalo aceitável
 * Protege contra erros de digitação (ex: 2024 em vez de 2026)
 * 
 * @param dateString - String de data a validar
 * @returns Objeto com { valid: boolean, error?: string }
 */
export const validarDataAposta = (dateString: string): { valid: boolean; error?: string } => {
  if (!dateString) {
    return { valid: false, error: "Data não informada" };
  }
  
  // Extrair ano da string
  const match = dateString.match(/^(\d{4})/);
  if (!match) {
    return { valid: false, error: "Formato de data inválido" };
  }
  
  const ano = parseInt(match[1]);
  
  if (ano < ANO_MINIMO_APOSTAS) {
    return { 
      valid: false, 
      error: `Ano ${ano} inválido. Datas anteriores a ${ANO_MINIMO_APOSTAS} não são permitidas.` 
    };
  }
  
  // Verificar se não é muito no futuro (mais de 1 ano)
  const anoAtual = new Date().getFullYear();
  if (ano > anoAtual + 1) {
    return { 
      valid: false, 
      error: `Ano ${ano} parece incorreto. Verifique a data.` 
    };
  }
  
  return { valid: true };
};

/**
 * Converte uma string de data/hora local (São Paulo) para timestamp com offset.
 * 
 * REGRA CRÍTICA: O usuário digita a hora em São Paulo (UTC-3).
 * Esta função adiciona o offset -03:00 para que o Postgres interprete corretamente.
 * 
 * Exemplo:
 * - Usuário digita: 07/03 00:34 (São Paulo)
 * - Esta função retorna: 2026-03-07T00:34:00-03:00
 * - Postgres interpreta como: 2026-03-07 03:34:00 UTC
 * - Na exibição com parseLocalDateTime: converte UTC → São Paulo = 07/03 00:34 ✓
 * 
 * IMPORTANTE: Esta função NÃO valida o ano. Use validarDataAposta() antes de salvar.
 * 
 * @param dateTimeString - String no formato "YYYY-MM-DDTHH:mm" (datetime-local)
 * @returns String no formato ISO com offset de São Paulo (-03:00)
 */
export const toLocalTimestamp = (dateTimeString: string): string => {
  // Offset de São Paulo: UTC-3 (horário de verão foi abolido no Brasil em 2019)
  const SAO_PAULO_OFFSET = '-03:00';
  
  if (!dateTimeString) {
    // Se vazio, retornar timestamp atual no formato com offset
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${SAO_PAULO_OFFSET}`;
  }
  
  // Remover qualquer timezone info existente para normalizar
  const cleanDate = dateTimeString
    .replace(/\+00:00$/, '')
    .replace(/Z$/, '')
    .replace(/[+-]\d{2}:\d{2}$/, '')
    .replace(/[+-]\d{2}$/, '');
  
  // Garantir formato completo com segundos e adicionar offset de São Paulo
  if (cleanDate.length === 16) {
    // Formato: YYYY-MM-DDTHH:mm
    return `${cleanDate}:00${SAO_PAULO_OFFSET}`;
  }
  
  // Se já tem segundos, apenas adicionar offset
  if (cleanDate.length === 19) {
    return `${cleanDate}${SAO_PAULO_OFFSET}`;
  }
  
  // Fallback: adicionar offset ao que temos
  return `${cleanDate}${SAO_PAULO_OFFSET}`;
};

/**
 * Converte um timestamp do banco (UTC) para o formato datetime-local (YYYY-MM-DDTHH:mm)
 * no timezone operacional (São Paulo).
 * 
 * QUANDO USAR: Para preencher inputs datetime-local com dados vindos do banco.
 * 
 * BUG CORRIGIDO: Antes, usávamos aposta.data_aposta.slice(0, 16) que pegava
 * o valor UTC bruto. Ex: DB tem "2026-03-07T03:34:00+00" (UTC), slice dava
 * "2026-03-07T03:34" (errado!), deveria ser "2026-03-07T00:34" (São Paulo).
 * 
 * @param dbTimestamp - String de timestamp do banco (geralmente UTC)
 * @returns String no formato "YYYY-MM-DDTHH:mm" em horário de São Paulo
 */
export const dbTimestampToDatetimeLocal = (dbTimestamp: string | null | undefined): string => {
  if (!dbTimestamp) return getLocalDateTimeString();
  
  const localDate = parseLocalDateTime(dbTimestamp);
  
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  const hours = String(localDate.getHours()).padStart(2, '0');
  const minutes = String(localDate.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

/**
 * Retorna a data/hora atual no formato datetime-local (YYYY-MM-DDTHH:mm)
 * para uso como valor padrão em inputs.
 */
export const getLocalDateTimeString = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

/**
 * Retorna a data civil de HOJE no timezone operacional (São Paulo) como "YYYY-MM-DD".
 * 
 * BUG CORRIGIDO: `new Date().toISOString().split('T')[0]` retorna a data UTC.
 * Após 21:00 BRT (00:00 UTC), isso retorna o dia SEGUINTE.
 * Ex: 09/03 às 22:00 BRT → toISOString() = "2026-03-10T01:00:00Z" → split = "2026-03-10" (ERRADO!)
 * 
 * Esta função garante que retorna "2026-03-09" independente do horário UTC.
 * 
 * QUANDO USAR: Sempre que precisar da data de "hoje" para campos de data civil
 * (data_transacao, data_credito, data_entrada, etc.)
 * 
 * QUANDO NÃO USAR: Para timestamps reais com hora (use toLocalTimestamp).
 */
export const getTodayCivilDate = (): string => {
  const now = new Date();
  // Usar toZonedTime para obter a data no timezone operacional
  const zonedNow = toZonedTime(now, TIMEZONE_OPERACIONAL);
  const year = zonedNow.getFullYear();
  const month = String(zonedNow.getMonth() + 1).padStart(2, '0');
  const day = String(zonedNow.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Converte um Date object para string "YYYY-MM-DD" no timezone operacional (São Paulo).
 * 
 * Mesma lógica do getTodayCivilDate mas para qualquer Date, não apenas "agora".
 * 
 * QUANDO USAR: Para converter Date objects (ex: de addMonths, subDays) para
 * strings de data civil sem o bug do toISOString().
 */
export const dateToCivilDateString = (date: Date): string => {
  const zonedDate = toZonedTime(date, TIMEZONE_OPERACIONAL);
  const year = zonedDate.getFullYear();
  const month = String(zonedDate.getMonth() + 1).padStart(2, '0');
  const day = String(zonedDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Detecta se uma string de timestamp representa "meia-noite UTC pura"
 * (i.e., uma DATA CIVIL armazenada como timestamp, sem hora real).
 *
 * Ex: "2026-04-23 00:00:00+00" → true (data civil)
 * Ex: "2026-04-23 20:51:37+00" → false (timestamp real)
 *
 * Usado para decidir se devemos preferir `created_at` (timestamp real) na exibição,
 * em vez de `data_transacao` (data civil que renderizaria como 21:00 do dia anterior em SP).
 */
export const isCivilDateOnlyTimestamp = (
  dateString: string | null | undefined
): boolean => {
  if (!dateString) return false;
  // Aceita "YYYY-MM-DD" puro ou "YYYY-MM-DD[T ]00:00:00(.000)?(+00(:00)?|Z)"
  return /^\d{4}-\d{2}-\d{2}([T ]00:00:00(\.0+)?(\+00(:00)?|Z)?)?$/.test(
    dateString.trim()
  );
};

/**
 * Retorna o timestamp REAL de uma transação para fins de exibição.
 *
 * REGRA: Se `data_transacao` é uma "data civil pura" (00:00:00 UTC), o horário não é
 * significativo e foi atribuído por convenção — devemos usar `created_at` (ou
 * `data_confirmacao`) como source of truth do horário real.
 *
 * Caso contrário, `data_transacao` já contém o horário real escolhido pelo usuário
 * e deve ser preservado.
 *
 * Isso elimina o "21:00 fixo" exibido no histórico de movimentações.
 */
export const getTransactionDisplayTimestamp = (tx: {
  data_transacao?: string | null;
  created_at?: string | null;
  data_confirmacao?: string | null;
}): string => {
  const data = tx.data_transacao;
  if (data && !isCivilDateOnlyTimestamp(data)) return data;
  return tx.data_confirmacao || tx.created_at || data || '';
};
