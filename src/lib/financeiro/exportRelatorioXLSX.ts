import * as XLSX from "xlsx";
import type { MesFinanceiro } from "@/hooks/useFinanceiroMensal";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function exportRelatorioXLSX(meses: MesFinanceiro[], workspaceNome: string) {
  const wb = XLSX.utils.book_new();

  const header = [
    "Mês",
    "Fluxo Líquido (R$)",
    "CAC",
    "Comissões",
    "Bônus",
    "Infraestrutura",
    "Operadores",
    "Custo Total",
    "Resultado Líquido",
    "Margem Operacional (%)",
    "Lucro Operacional (apostas)",
  ];
  const rows = meses.map(m => [
    m.isBaseline ? `${m.mesNomeLongo} (baseline)` : m.mesNomeLongo,
    m.fluxoLiquido,
    m.cac,
    m.comissoes,
    m.bonus,
    m.infra,
    m.operadores,
    m.custoTotal,
    m.resultadoLiquido,
    m.margemOperacional === null ? "—" : Number(m.margemOperacional.toFixed(2)),
    m.lucroOperacional,
  ]);

  // Totais
  const mesesReais = meses.filter(m => !m.isBaseline);
  const sum = (k: keyof MesFinanceiro) =>
    mesesReais.reduce((acc, m) => acc + (Number(m[k]) || 0), 0);
  const avgMargem = (() => {
    const vals = mesesReais.map(m => m.margemOperacional).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  })();
  rows.push([
    "TOTAL / MÉDIA",
    sum("fluxoLiquido"),
    sum("cac"),
    sum("comissoes"),
    sum("bonus"),
    sum("infra"),
    sum("operadores"),
    sum("custoTotal"),
    sum("resultadoLiquido"),
    avgMargem === null ? "—" : Number(avgMargem.toFixed(2)),
    sum("lucroOperacional"),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = [
    { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Resumo Mensal");

  // Aba 2: composição de custos por mês
  const compHeader = ["Mês", "CAC", "Comissões", "Bônus", "Infraestrutura", "RH", "Operadores (pagto)"];
  const compRows = meses.map(m => [
    m.isBaseline ? `${m.mesNomeLongo} (baseline)` : m.mesNomeLongo,
    m.cac, m.comissoes, m.bonus, m.infra, m.rh, m.operadores - m.rh,
  ]);
  const ws2 = XLSX.utils.aoa_to_sheet([compHeader, ...compRows]);
  ws2["!cols"] = new Array(compHeader.length).fill({ wch: 18 });
  XLSX.utils.book_append_sheet(wb, ws2, "Composição Custos");

  const periodo = `${meses[0]?.mesKey || ""}_${meses[meses.length - 1]?.mesKey || ""}`;
  const safe = workspaceNome.replace(/[^a-zA-Z0-9-_]/g, "_");
  XLSX.writeFile(wb, `relatorio-financeiro-${safe}-${periodo}.xlsx`);
}