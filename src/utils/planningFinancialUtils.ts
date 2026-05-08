import { getDaysInMonth } from "date-fns";

 export interface PlanningFinancialMetrics {
  totalPlanned: number;
  totalPlannedOriginal: number;
  totalExtras: number;
  completed: number;
  completedOriginal: number;
  completedExtras: number;
  expectedToday: number;
  realPercentage: number;
  expectedPercentage: number;
  gap: number;
  isAtrasado: boolean;
  daysInMonth: number;
  currentDay: number;
}

export function calculatePlanningMetrics(
  campanhas: any[],
  extras: any[],
  year: number,
  month: number,
  convertToConsolidation: (valor: number, moedaOrigem: string) => number
): PlanningFinancialMetrics {
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  // Se o mês já passou, o dia atual é o último dia do mês. Se ainda não chegou, é 0.
  let currentDay = today.getDate();
  if (!isCurrentMonth) {
    const selectedDate = new Date(year, month - 1, 1);
    if (selectedDate < today) {
      currentDay = daysInMonth;
    } else {
      currentDay = 0;
    }
  }

  let totalPlannedOriginal = 0;
  let completedOriginal = 0;
  let totalExtras = 0;
  let completedExtras = 0;
  let expectedTodayFromPlanned = 0;
  let expectedTodayFromExtras = 0;

  const progressTemporal = daysInMonth > 0 ? currentDay / daysInMonth : 0;

  campanhas.forEach((camp) => {
    const valorConvertido = convertToConsolidation(camp.deposit_amount || 0, camp.currency || "BRL");
    totalPlannedOriginal += valorConvertido;
    
    if (camp.is_account_created || camp.status === "done") {
      completedOriginal += valorConvertido;
    }
    
    expectedTodayFromPlanned += valorConvertido * progressTemporal;
  });

  extras.forEach((ext) => {
    const valorConvertido = convertToConsolidation(ext.deposit_amount || 0, ext.currency || "BRL");
    totalExtras += valorConvertido;
    
    if (ext.status === "done") {
      completedExtras += valorConvertido;
    }

    if (ext.scheduled_date) {
      expectedTodayFromExtras += valorConvertido * progressTemporal;
    }
  });

  const totalPlanned = totalPlannedOriginal + totalExtras;
  const completed = completedOriginal + completedExtras;
  const expectedToday = expectedTodayFromPlanned + expectedTodayFromExtras;
  
  const realPercentage = totalPlanned > 0 ? (completed / totalPlanned) * 100 : 0;
  const expectedPercentage = totalPlanned > 0 ? (expectedToday / totalPlanned) * 100 : 0;
  
  const gap = expectedToday - completed;
  const isAtrasado = gap > 0.01;

  return {
    totalPlanned,
    totalPlannedOriginal,
    totalExtras,
    completed,
    completedOriginal,
    completedExtras,
    expectedToday,
    realPercentage,
    expectedPercentage,
    gap,
    isAtrasado,
    daysInMonth,
    currentDay
  };
}

export function getProgressBarColor(real: number, expected: number): string {
  if (real >= expected) {
    return "from-emerald-500 to-green-400";
  }
  
  // Se estiver até 10% abaixo do esperado (em pontos percentuais do total)
  // Ou se preferir 10% do valor esperado: if (real >= expected * 0.9)
  // Vamos usar 10% do valor esperado como margem de "tolerância"
  if (real >= expected * 0.9) {
    return "from-yellow-500 to-amber-400";
  }
  
  return "from-red-500 to-rose-500";
}