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
