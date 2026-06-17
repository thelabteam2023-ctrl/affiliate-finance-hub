import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toPng } from "html-to-image";
import type { MesFinanceiro } from "@/hooks/useFinanceiroMensal";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function exportRelatorioPDF(
  meses: MesFinanceiro[],
  workspaceNome: string,
  chartEl?: HTMLElement | null,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Capa
  doc.setFontSize(20);
  doc.text("Relatório Financeiro Mensal", 40, 50);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Workspace: ${workspaceNome}`, 40, 72);
  const periodo = `${meses[0]?.mesNomeLongo || "-"} → ${meses[meses.length - 1]?.mesNomeLongo || "-"}`;
  doc.text(`Período: ${periodo}`, 40, 88);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 40, 104);

  // Gráfico (se fornecido)
  let cursorY = 130;
  if (chartEl) {
    try {
      const dataUrl = await toPng(chartEl, { cacheBust: true, pixelRatio: 2, backgroundColor: "#ffffff" });
      const imgW = pageWidth - 80;
      const imgH = imgW * 0.42;
      doc.addImage(dataUrl, "PNG", 40, cursorY, imgW, imgH);
      cursorY += imgH + 20;
    } catch (e) {
      console.warn("[exportRelatorioPDF] chart capture failed", e);
    }
  }

  // Tabela
  const head = [[
    "Mês", "Fluxo Líq.", "CAC", "Comiss.", "Bônus", "Infra", "Operad.", "Custo Total", "Result. Líq.", "Margem"
  ]];
  const body = meses.map(m => [
    m.isBaseline ? `${m.mesLabel} (baseline)` : m.mesLabel,
    fmtBRL(m.fluxoLiquido),
    fmtBRL(m.cac),
    fmtBRL(m.comissoes),
    fmtBRL(m.bonus),
    fmtBRL(m.infra),
    fmtBRL(m.operadores),
    fmtBRL(m.custoTotal),
    fmtBRL(m.resultadoLiquido),
    m.margemOperacional === null ? "—" : `${m.margemOperacional.toFixed(1)}%`,
  ]);

  autoTable(doc, {
    startY: cursorY,
    head,
    body,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 40, right: 40 },
  });

  // Rodapé
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth - 80,
      doc.internal.pageSize.getHeight() - 20,
    );
  }

  const safe = workspaceNome.replace(/[^a-zA-Z0-9-_]/g, "_");
  const periodKey = `${meses[0]?.mesKey || ""}_${meses[meses.length - 1]?.mesKey || ""}`;
  doc.save(`relatorio-financeiro-${safe}-${periodKey}.pdf`);
}