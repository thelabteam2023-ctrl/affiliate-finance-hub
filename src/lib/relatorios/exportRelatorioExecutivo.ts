import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ProjetoResultado } from "@/hooks/useProjetoResultado";
import type { ProjetoKpiBreakdowns } from "@/types/moduleBreakdown";
import logoAsset from "@/assets/HORIZONTAL_OFICIAL_2-2.png.asset.json";

interface ExportRelatorioExecutivoProps {
  projeto: {
    id: string;
    nome: string;
    tipo_projeto?: string;
    status: string;
    moeda_consolidacao?: string;
  };
  workspace: {
    nome: string;
  };
  periodo: {
    de: Date | null;
    ate: Date | null;
  };
  resultado: ProjetoResultado;
  breakdowns: ProjetoKpiBreakdowns | null;
  historicoContas: {
    historicoParceirosLista: any[];
    contasComBonusLista: any[];
  } | null;
  formatCurrency: (value: number) => string;
  config?: {
    secoes: Record<string, boolean>;
  };
}

export async function exportRelatorioExecutivo({
  projeto,
  workspace,
  periodo,
  resultado,
  breakdowns,
  historicoContas,
  formatCurrency,
  config,
}: ExportRelatorioExecutivoProps) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const configSecoes = config?.secoes || {
    resumo: true,
    operacional: true,
    modulos: true,
    insights: true
  };
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - (margin * 2);
  const lucroReal = resultado.netProfit;

  // Helper colors
  const colors = {
    primary: [37, 99, 235] as [number, number, number],
    secondary: [100, 116, 139] as [number, number, number],
    success: [5, 150, 105] as [number, number, number],
    danger: [220, 38, 38] as [number, number, number],
    bg: [248, 250, 252] as [number, number, number],
  };

  const drawHeader = () => {
    // Logo
    const logoWidth = 140;
    const logoHeight = 40; 
    doc.addImage(logoAsset.url, 'PNG', margin, 35, logoWidth, logoHeight);

    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.setFont("helvetica", "bold");
    
    // Título ao lado da logo (reposicionado para estética executiva)
    const titleX = margin + logoWidth + 20;
    doc.text("Relatório de Performance", titleX, 65);

    doc.setFontSize(9);
    doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
    const dataEmissao = format(new Date(), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: ptBR });
    doc.text(`Emitido em: ${dataEmissao}`, pageWidth - margin, 85, { align: "right" });



    // Divider
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(1);
    doc.line(margin, 105, pageWidth - margin, 105);
  };

  const drawFooter = () => {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(
        `StakeSync ERP - Inteligência Operacional | Página ${i} de ${pageCount}`,
        pageWidth / 2,
        pageHeight - 20,
        { align: "center" }
      );
    }
  };

  // --- CAPA / IDENTIFICAÇÃO ---
  drawHeader();
  
  doc.setFillColor(colors.bg[0], colors.bg[1], colors.bg[2]);
  doc.rect(margin, 115, contentWidth, 55, "F");

  
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.setFont("helvetica", "bold");
  doc.text("Identificação do Projeto", margin + 15, 138);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Projeto:`, margin + 15, 153);
  doc.setFont("helvetica", "bold");
  doc.text(projeto.nome, margin + 70, 153);
  
  doc.setFont("helvetica", "normal");
  doc.text(`Período:`, margin + 180, 153);
  const periodoTxt = periodo.de && periodo.ate 
    ? `${format(periodo.de, "dd/MM/yy")} a ${format(periodo.ate, "dd/MM/yy")}`
    : "Todo o período";
  doc.setFont("helvetica", "bold");
  doc.text(periodoTxt, margin + 235, 153);




  // --- RESUMO EXECUTIVO (KPIs Financeiros) ---
  if (configSecoes.resumo) {
    let yResumo = 220;
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo Financeiro", margin, yResumo);
    
    const isPositivo = lucroReal >= 0;

    autoTable(doc, {
      startY: yResumo + 10,
      margin: { left: margin, right: margin },
      head: [["Indicador", "Valor Atual", "Impacto"]],
      body: [
        ["Lucro Realizado (Net Profit)", formatCurrency(lucroReal), isPositivo ? "POSITIVO" : "ATENÇÃO"],
        ["ROI Operacional", resultado.roi !== null ? `${resultado.roi.toFixed(2)}%` : "N/A", "-"],
        ["Total Depositado", formatCurrency(resultado.totalDepositos), "Entrada"],
        ["Total Sacado", formatCurrency(resultado.totalSaques), "Realização"],
        ["Capital Operável (Casas)", formatCurrency(resultado.saldoBookmakers), "Em Giro"],
        ["Saldo Irrecuperável", formatCurrency(resultado.saldoIrrecuperavel), "Risco"],
      ],
      theme: "striped",
      headStyles: { fillColor: colors.primary, textColor: 255 },
      styles: { fontSize: 9 },
      columnStyles: {
        1: { fontStyle: "bold", halign: "right" },
        2: { halign: "center" }
      }
    });
  }

  let currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 40 : 220;

  // --- OPERAÇÃO ---
  if (configSecoes.operacional) {
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text("Indicadores Operacionais", margin, currentY);

    const volumeTotal = resultado.totalStaked;
    const totalApostas = breakdowns?.apostas?.total || 0;
    
    autoTable(doc, {
      startY: currentY + 10,
      margin: { left: margin, right: margin },
      head: [["Métrica Operacional", "Valor"]],
      body: [
        ["Volume Total Transacionado", formatCurrency(volumeTotal)],
        ["Quantidade de Apostas", totalApostas.toString()],
        ["Ticket Médio", totalApostas > 0 ? formatCurrency(volumeTotal / totalApostas) : "N/A"],
        ["Lucro Bruto (Apostas)", formatCurrency(resultado.grossProfitFromBets)],
        ["Créditos Promocionais/Giros", formatCurrency(resultado.lucroGirosGratis + resultado.lucroCashback)],
      ],
      theme: "grid",
      headStyles: { fillColor: [71, 85, 105] as [number, number, number], textColor: 255 },
      styles: { fontSize: 9 },
      columnStyles: {
        1: { fontStyle: "bold", halign: "right" }
      }
    });
    currentY = (doc as any).lastAutoTable.finalY + 40;
  }

  // --- BREAKDOWN POR MÓDULO (LUCRO) ---
  if (configSecoes.modulos && breakdowns?.lucro?.contributions) {
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text("Performance por Módulo", margin, currentY);

    const contribBody = breakdowns.lucro.contributions.map(c => [
      c.moduleName,
      c.details || "-",
      formatCurrency(c.value)
    ]);

    autoTable(doc, {
      startY: currentY + 10,
      margin: { left: margin, right: margin },
      head: [["Módulo", "Detalhes", "Resultado"]],
      body: contribBody,
      theme: "striped",
      headStyles: { fillColor: [148, 163, 184] as [number, number, number], textColor: 30 },
      styles: { fontSize: 9 },
      columnStyles: {
        2: { fontStyle: "bold", halign: "right" }
      }
    });
    
    currentY = (doc as any).lastAutoTable.finalY + 40;
  }

  // --- PERFORMANCE DE BÔNUS ---
  if (configSecoes.bonusPerformance && breakdowns?.bonusPerformance) {
    if (currentY > pageHeight - 150) {
      doc.addPage();
      drawHeader();
      currentY = 130;
    }

    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text("Performance de Bônus", margin, currentY);

    const bp = breakdowns.bonusPerformance;

    autoTable(doc, {
      startY: currentY + 10,
      margin: { left: margin, right: margin },
      head: [["Indicador de Bônus", "Valor"]],
      body: [
        ["Total de Bônus Creditados", formatCurrency(bp.bonusCreditado)],
        ["Total de Juice (Perdas Operacionais)", formatCurrency(bp.juice)],
        ["Total Líquido Extraído", formatCurrency(bp.extracaoLiquida)],
        ["Taxa de Extração (%)", `${bp.taxaExtracao.toFixed(1)}%`],
        ["Quantidade de Operações de Bônus", bp.quantidadeOperacoes.toString()],
      ],
      theme: "grid",
      headStyles: { fillColor: [5, 150, 105] as [number, number, number], textColor: 255 },
      styles: { fontSize: 9 },
      columnStyles: {
        1: { fontStyle: "bold", halign: "right" }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 40;
  }

  // --- CONTRIBUIÇÃO POR VÍNCULO (PARCEIROS) ---
  if (configSecoes.vinculos && historicoContas) {

    if (currentY > pageHeight - 150) {
      doc.addPage();
      drawHeader();
      currentY = 130;
    }

    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text("Contribuição por Vínculo", margin, currentY);

    const partnersData = historicoContas.historicoParceirosLista || [];
    const partners = [...partnersData].sort((a: any, b: any) => (b.totalBonus || 0) - (a.totalBonus || 0));
    const totalBonusProjeto = partners.reduce((acc: number, p: any) => acc + (p.totalBonus || 0), 0);


    const partnerBody = partners.map(p => {
      const bonusGerados = p.totalBonus || 0;
      const participation = totalBonusProjeto > 0 ? (bonusGerados / totalBonusProjeto) * 100 : 0;

      return [
        p.nome,
        p.totalContas.toString(),
        formatCurrency(bonusGerados),
        `${participation.toFixed(1)}%`
      ];
    });


    autoTable(doc, {
      startY: currentY + 10,
      margin: { left: margin, right: margin },
      head: [["Vínculo (Pessoa)", "Casas Utilizadas", "Bônus Gerados", "Participação (%)"]],
      body: partnerBody.length > 0 ? partnerBody : [["Nenhum vínculo identificado", "-", "-", "-"]],
      theme: "striped",
      headStyles: { fillColor: colors.primary, textColor: 255 },
      styles: { fontSize: 9 },
      columnStyles: {
        1: { halign: "center" },
        2: { fontStyle: "bold", halign: "right" },
        3: { halign: "center" }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 40;
  }

  // --- INSIGHTS AUTOMÁTICOS ---

  if (configSecoes.insights) {
    if (currentY > pageHeight - 150) {
      doc.addPage();
      drawHeader();
      currentY = 100;
    }

    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text("Destaques e Observações", margin, currentY);

  const insights = [];
  if (lucroReal > 0) insights.push("- O projeto apresenta lucratividade real positiva no período analisado.");
  if (resultado.roi && resultado.roi > 15) insights.push("- Desempenho acima da média com ROI superior a 15%.");
  if (resultado.saldoIrrecuperavel > (resultado.saldoBookmakers * 0.1)) insights.push("- Alerta: Saldo irrecuperável representa mais de 10% do capital operável.");
  if (resultado.totalSaques > resultado.totalDepositos) insights.push("- Projeto já atingiu o ponto de equilíbrio (Break-even).");
  
  if (insights.length === 0) insights.push("- Nenhuma anomalia ou destaque significativo identificado nos dados presentes.");

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
    insights.forEach((insight, i) => {
      doc.text(insight, margin, currentY + 25 + (i * 15));
    });
    
    currentY += (insights.length * 15) + 40;
  }

  // --- VISÃO TEMPORAL (GRÁFICO DE LINHAS MANUAL) ---
  if (configSecoes.evolucao && breakdowns?.volumeTemporal?.dailyHistory) {
    if (currentY > pageHeight - 200) {
      doc.addPage();
      drawHeader();
      currentY = 130;
    }

    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text("Evolução do Período", margin, currentY);

    const history = breakdowns.volumeTemporal.dailyHistory;
    const chartHeight = 120;
    const chartWidth = pageWidth - (margin * 2);
    const chartX = margin;
    const chartY = currentY + 20;

    // Eixos
    doc.setDrawColor(203, 213, 225);
    doc.line(chartX, chartY + chartHeight, chartX + chartWidth, chartY + chartHeight); // X
    doc.line(chartX, chartY, chartX, chartY + chartHeight); // Y

    if (history.length > 1) {
      const maxProfit = Math.max(...history.map(h => h.cumulativeProfit), 0.01);
      const minProfit = Math.min(...history.map(h => h.cumulativeProfit), 0);
      const range = maxProfit - minProfit;

      doc.setDrawColor(5, 150, 105);
      doc.setLineWidth(1.5);
      
      history.forEach((point, i) => {
        if (i === 0) return;
        const prev = history[i - 1];
        
        const x1 = chartX + ((i - 1) / (history.length - 1)) * chartWidth;
        const y1 = chartY + chartHeight - ((prev.cumulativeProfit - minProfit) / range) * chartHeight;
        const x2 = chartX + (i / (history.length - 1)) * chartWidth;
        const y2 = chartY + chartHeight - ((point.cumulativeProfit - minProfit) / range) * chartHeight;
        
        doc.line(x1, y1, x2, y2);
      });

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(formatCurrency(maxProfit), chartX + 5, chartY + 10);
      doc.text(formatCurrency(minProfit), chartX + 5, chartY + chartHeight - 5);
      doc.text("Evolução do Lucro Acumulado (Consolidado)", chartX + chartWidth/2, chartY + chartHeight + 15, { align: "center" });
    }

    currentY = chartY + chartHeight + 40;
  }

  drawFooter();


  const safeName = projeto.nome.replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Relatorio_${safeName}_${format(new Date(), "yyyyMMdd")}.pdf`);
}
