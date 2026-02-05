/**
 * Utilitários de data para o projeto
 * Centraliza funções de parsing e formatação de datas
 */

/**
 * Converte string de data do banco para Date local sem conversão de timezone
 * Resolve o problema de datas sendo exibidas com offset incorreto
 * 
 * Use esta função sempre que precisar exibir uma data que veio do banco
 * para o usuário, garantindo que a hora mostrada seja a mesma que foi salva.
 * 
 * @param dateString - String de data do banco (ISO 8601 ou similar)
 * @returns Date objeto interpretado como hora local
 */
export const parseLocalDateTime = (dateString: string | null | undefined): Date => {
  if (!dateString) return new Date();
  
  // Remove timezone info para interpretar como hora local
  const cleanDate = dateString
    .replace(/\+00:00$/, '')
    .replace(/Z$/, '')
    .replace(/\+\d{2}:\d{2}$/, '')
    .replace(/-\d{2}:\d{2}$/, '');
  
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
 * Extrai a "data civil" (YYYY-MM-DD) de uma string de data do banco
 * SEM conversão de timezone - usa a data exatamente como foi registrada.
 * 
 * Use esta função para agrupar dados por dia civil (calendários, estatísticas).
 * Evita o problema de apostas registradas às 23:00 BRT aparecerem no dia seguinte
 * quando o banco armazena em UTC (02:00 UTC do dia seguinte).
 * 
 * @param dateString - String de data do banco (ISO 8601 ou similar)
 * @returns String no formato "YYYY-MM-DD" representando o dia civil local
 */
export const extractLocalDateKey = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  
  // Remove timezone info para interpretar como hora local
  const cleanDate = dateString
    .replace(/\+00:00$/, '')
    .replace(/Z$/, '')
    .replace(/\+\d{2}:\d{2}$/, '')
    .replace(/-\d{2}:\d{2}$/, '');
  
  const [datePart, timePart] = cleanDate.split('T');
  
  // Se só tem a parte da data, retorna diretamente
  if (!timePart) return datePart;
  
  // Converte para Date local e extrai a data formatada
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds] = timePart.split(':').map(n => parseInt(n) || 0);
  const localDate = new Date(year, month - 1, day, hours, minutes, seconds);
  
  // Formata como YYYY-MM-DD
  const y = localDate.getFullYear();
  const m = String(localDate.getMonth() + 1).padStart(2, '0');
  const d = String(localDate.getDate()).padStart(2, '0');
  
  return `${y}-${m}-${d}`;
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
 * Converte uma string de data/hora para timestamp local literal
 * SEM conversão de timezone - preserva exatamente o que o usuário escolheu.
 * 
 * Esta função garante que não haja shift de dia causado por conversão UTC.
 * Se o usuário escolhe "25/01/2026 23:59", o banco deve salvar "2026-01-25 23:59:00".
 * 
 * IMPORTANTE: Esta função NÃO valida o ano. Use validarDataAposta() antes de salvar.
 * 
 * @param dateTimeString - String no formato "YYYY-MM-DDTHH:mm" (datetime-local)
 * @returns String no formato "YYYY-MM-DDTHH:mm:ss" (sem Z, sem offset)
 */
export const toLocalTimestamp = (dateTimeString: string): string => {
  if (!dateTimeString) {
    // Se vazio, retornar timestamp atual no formato local
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }
  
  // Se já tem timezone info, remover
  const cleanDate = dateTimeString
    .replace(/\+00:00$/, '')
    .replace(/Z$/, '')
    .replace(/\+\d{2}:\d{2}$/, '')
    .replace(/-\d{2}:\d{2}$/, '');
  
  // Garantir formato completo com segundos
  if (cleanDate.length === 16) {
    // Formato: YYYY-MM-DDTHH:mm
    return `${cleanDate}:00`;
  }
  
  return cleanDate;
};
