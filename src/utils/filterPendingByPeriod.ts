import { startOfDay } from "date-fns";

/**
 * Filtra apostas para KPIs, removendo pendentes que NÃO pertencem ao período selecionado.
 * 
 * Pendentes são injetadas na lista de apostas sem filtro de data para visibilidade operacional,
 * mas NÃO devem inflar métricas (Volume, Lucro, ROI, contagem) de períodos onde não ocorreram.
 * 
 * @param items Array de apostas/surebets (inclui pendentes de fora do período)
 * @param periodStart Início do período selecionado (ou undefined se sem filtro)
 * @param periodEnd Fim do período selecionado (ou undefined se sem filtro)
 * @param getDate Função para extrair a data da aposta (default: item.data_aposta)
 * @param isPending Função para verificar se o item é pendente (default: !resultado || resultado === 'PENDENTE')
 */
export function filterForKpis<T extends Record<string, any>>(
  items: T[],
  periodStart: Date | undefined,
  periodEnd: Date | undefined,
  options?: {
    getDate?: (item: T) => string;
    isPending?: (item: T) => boolean;
  }
): T[] {
  // Sem filtro de período = tudo incluso
  if (!periodStart || !periodEnd) return items;

  const getDate = options?.getDate ?? ((item: T) => item.data_aposta as string);
  const isPending = options?.isPending ?? ((item: T) => !item.resultado || item.resultado === "PENDENTE");

  const pStart = startOfDay(periodStart);

  return items.filter((item) => {
    // Itens liquidados já foram filtrados pelo período na query original
    if (!isPending(item)) return true;

    // Pendentes: verificar se data_aposta está dentro do período
    const dateStr = getDate(item);
    if (!dateStr) return false;
    const cleanDate = dateStr.includes('T') ? dateStr.substring(0, 10) : dateStr;
    const itemDate = new Date(cleanDate + 'T12:00:00');
    return itemDate >= pStart && itemDate <= periodEnd;
  });
}
