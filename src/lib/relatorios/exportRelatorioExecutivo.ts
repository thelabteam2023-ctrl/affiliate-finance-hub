import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ProjetoResultado } from "@/hooks/useProjetoResultado";
import type { ProjetoKpiBreakdowns } from "@/types/moduleBreakdown";
import logoAsset from "@/assets/HORIZONTAL_OFICIAL_2-2.png.asset.json";
import { classifyFinancialValue, checkReconciliation, getSemanticColor } from "./dataUtils";

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

export async function exportRelatorioExecutivo(props: ExportRelatorioExecutivoProps) {
  const {
    projeto,
    periodo,
    resultado,
    breakdowns,
    historicoContas,
    formatCurrency,
  } = props;

  // 1. Camada de regras de dados (Preparo)
  const lucroData = classifyFinancialValue(resultado.netProfit, breakdowns?.apostas?.total || 0, "Lucro Realizado");
  const volumeData = classifyFinancialValue(resultado.totalStaked, breakdowns?.apostas?.total || 0, "Volume Total");
  
  const reconciliacao = checkReconciliation(
    [resultado.lucroCashback, resultado.lucroGirosGratis, (breakdowns?.bonusPerformance?.extracaoLiquida || 0)],
    resultado.netProfit
  );

  const dataEmissao = format(new Date(), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: ptBR });
  const periodoTxt = periodo.de && periodo.ate 
    ? `${format(periodo.de, "dd/MM/yy")} a ${format(periodo.ate, "dd/MM/yy")}`
    : "Todo o período";

  // 2. Template HTML/CSS (Design Tokens SaaS Dark)
  const html = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=JetBrains+Mono:wght@400;700&display=swap');
      
      :root {
        --bg: #0A0B0F;
        --surface: #12141A;
        --surface-2: #171A22;
        --border: #1F222C;
        --border-strong: #23262F;
        --text-primary: #F2F3F6;
        --text-secondary: #8990A3;
        --text-tertiary: #6C7280;
        --accent-brand: #3C63FF;
        --accent-positive: #34D399;
        --accent-negative: #F87171;
        --accent-warning: #FBBF24;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0; padding: 0;
        background-color: var(--bg);
        color: var(--text-primary);
        font-family: 'Inter', sans-serif;
        font-size: 12px;
        line-height: 1.5;
        width: 794px; /* A4 width in px at 96dpi approx */
      }

      .page {
        padding: 48px 52px 40px 52px;
        min-height: 1123px; /* A4 height */
        display: flex;
        flex-direction: column;
      }

      .header {
        display: flex;
        flex-direction: column;
        gap: 12px;
        border-bottom: 1px solid var(--border-strong);
        padding-bottom: 20px;
        margin-bottom: 28px;
      }

      .header-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .logo-box {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .logo-wordmark {
        font-weight: 700;
        letter-spacing: 1px;
        font-size: 14px;
        text-transform: uppercase;
      }

      .meta-emissao {
        font-size: 10px;
        color: var(--text-tertiary);
        text-align: right;
      }

      .title-block h1 {
        margin: 0;
        font-size: 26px;
        font-weight: 700;
        letter-spacing: -0.3px;
      }

      .subtitle {
        font-size: 11px;
        color: var(--text-secondary);
        margin-top: 4px;
      }

      .meta-bar {
        display: flex;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 10px;
        margin-bottom: 28px;
      }

      .meta-cell {
        flex: 1;
        padding: 16px;
        border-right: 1px solid var(--border);
      }

      .meta-cell:last-child { border-right: none; }

      .meta-label {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: var(--text-tertiary);
        margin-bottom: 4px;
      }

      .meta-value {
        font-size: 13px;
        font-weight: 700;
      }

      .section-title {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--text-tertiary);
        margin: 28px 0 12px 0;
      }

      .kpi-row {
        display: flex;
        gap: 12px;
        margin-bottom: 12px;
      }

      .kpi-card {
        flex: 1;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 16px 18px;
        border-left: 3px solid var(--accent-brand);
      }

      .kpi-card.pos { border-left-color: var(--accent-positive); }
      .kpi-card.neg { border-left-color: var(--accent-negative); }

      .kpi-label {
        font-size: 9.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: var(--text-tertiary);
        margin-bottom: 8px;
      }

      .kpi-value {
        font-family: 'JetBrains Mono', monospace;
        font-size: 20px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      .kpi-sublabel {
        font-size: 10px;
        color: var(--text-secondary);
        margin-top: 4px;
      }

      .data-table {
        width: 100%;
        border-collapse: collapse;
        background: var(--surface);
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid var(--border);
      }

      .data-table th {
        background: var(--surface-2);
        color: var(--text-tertiary);
        font-size: 9.5px;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        text-align: left;
        padding: 11px 16px;
        border-bottom: 1px solid var(--border);
      }

      .data-table td {
        padding: 11px 16px;
        border-bottom: 1px solid #1B1E27;
        font-size: 12px;
      }

      .data-table tr:last-child td { border-bottom: none; }

      .num {
        font-family: 'JetBrains Mono', monospace;
        font-variant-numeric: tabular-nums;
        text-align: right;
        font-weight: 700;
      }

      .badge {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 20px;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.3px;
      }

      .badge-pos { background: rgba(52, 211, 153, 0.14); color: var(--accent-positive); }
      .badge-neg { background: rgba(248, 113, 113, 0.14); color: var(--accent-negative); }
      .badge-warn { background: rgba(251, 191, 36, 0.14); color: var(--accent-warning); }

      .module-block {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 18px;
      }

      .module-item { margin-bottom: 14px; }
      .module-item:last-child { margin-bottom: 0; }

      .module-info {
        display: flex;
        justify-content: space-between;
        margin-bottom: 6px;
      }

      .bar-track {
        height: 6px;
        background: var(--surface-2);
        border-radius: 4px;
        width: 100%;
        overflow: hidden;
      }

      .bar-fill {
        height: 100%;
        border-radius: 4px;
      }

      .recon-note {
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid var(--border);
        font-size: 9.5px;
        color: var(--text-tertiary);
      }

      .footer {
        margin-top: auto;
        padding-top: 20px;
        display: flex;
        justify-content: space-between;
        font-size: 9px;
        color: var(--text-quaternary);
      }

      .flag {
        color: var(--accent-warning);
        font-size: 9px;
        margin-left: 4px;
      }
    </style>

    <div class="page">
      <div class="header">
        <div class="header-top">
          <div class="logo-box">
            <img src="${logoAsset.url}" height="22" />
            <span class="logo-wordmark">LABBET</span>
          </div>
          <div class="meta-emissao">
            ${dataEmissao}<br/>
            DOC-ID: ${projeto.id.slice(0, 8).toUpperCase()}
          </div>
        </div>
        <div class="title-block">
          <h1>Relatório de Performance</h1>
          <div class="subtitle">Análise executiva de resultados operacionais e eficiência financeira</div>
        </div>
      </div>

      <div class="meta-bar">
        <div class="meta-cell">
          <div class="meta-label">Projeto</div>
          <div class="meta-value">${projeto.nome}</div>
        </div>
        <div class="meta-cell">
          <div class="meta-label">Período</div>
          <div class="meta-value">${periodoTxt}</div>
        </div>
        <div class="meta-cell">
          <div class="meta-label">Status</div>
          <div class="meta-value">
            <span class="badge badge-pos">${projeto.status}</span>
          </div>
        </div>
      </div>

      <div class="section-title">Resumo Financeiro</div>
      <div class="kpi-row">
        <div class="kpi-card ${lucroData.semantic}">
          <div class="kpi-label">Lucro Realizado</div>
          <div class="kpi-value" style="color: ${getSemanticColor(lucroData.semantic)}">
            ${lucroData.display}
          </div>
          <div class="kpi-sublabel">Resultado líquido do período</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">ROI Operacional</div>
          <div class="kpi-value">
            ${resultado.roi !== null ? resultado.roi.toFixed(2) + '%' : '—'}
          </div>
          <div class="kpi-sublabel">Eficiência sobre capital</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Depositado</div>
          <div class="kpi-value">${formatCurrency(resultado.totalDepositos)}</div>
          <div class="kpi-sublabel">Aporte bruto de capital</div>
        </div>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>Indicador Secundário</th>
            <th style="text-align: right">Valor</th>
            <th style="text-align: right">Impacto</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Total Sacado (Realização)</td>
            <td class="num">${formatCurrency(resultado.totalSaques)}</td>
            <td style="text-align: right"><span class="badge">NORMAL</span></td>
          </tr>
          <tr>
            <td>Capital em Giro (Bookmakers)</td>
            <td class="num">${formatCurrency(resultado.saldoBookmakers)}</td>
            <td style="text-align: right"><span class="badge">ATUAL</span></td>
          </tr>
          <tr>
            <td>Saldo Irrecuperável</td>
            <td class="num">${formatCurrency(resultado.saldoIrrecuperavel)}</td>
            <td style="text-align: right"><span class="badge badge-neg">RISCO</span></td>
          </tr>
        </tbody>
      </table>

      <div class="section-title">Indicadores Operacionais</div>
      <table class="data-table">
        <tbody>
          <tr>
            <td>Volume Total Transacionado</td>
            <td class="num">
              ${volumeData.display}
              ${volumeData.flag ? `<span class="flag">⚠</span>` : ''}
            </td>
          </tr>
          <tr>
            <td>Quantidade de Apostas</td>
            <td class="num">${breakdowns?.apostas?.total || 0}</td>
          </tr>
          <tr>
            <td>Ticket Médio</td>
            <td class="num">
              ${(breakdowns?.apostas?.total || 0) > 0 ? formatCurrency(resultado.totalStaked / (breakdowns?.apostas?.total || 1)) : '—'}
            </td>
          </tr>
        </tbody>
      </table>

      <div class="section-title">Performance por Módulo</div>
      <div class="module-block">
        ${(breakdowns?.lucro?.contributions || []).map(c => {
          const maxValue = Math.max(...(breakdowns?.lucro?.contributions || []).map(m => Math.abs(m.value)), 1);
          const percent = (Math.abs(c.value) / maxValue) * 100;
          const color = c.value >= 0 ? 'var(--accent-positive)' : 'var(--accent-negative)';
          return `
            <div class="module-item">
              <div class="module-info">
                <span>${c.moduleName}</span>
                <span class="num" style="color: ${color}">${c.value >= 0 ? '+' : ''}${formatCurrency(c.value)}</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill" style="width: ${percent}%; background: ${color}"></div>
              </div>
            </div>
          `;
        }).join('')}

        ${reconciliacao.show ? `
          <div class="recon-note">
            <strong>Checagem de consistência:</strong> 
            ${reconciliacao.formula} = ${formatCurrency(reconciliacao.calculated)}, 
            dif. de ${formatCurrency(reconciliacao.diff)} em relação ao Lucro Realizado.
          </div>
        ` : ''}
      </div>

      <div class="footer">
        <div>Labbet · Relatório gerado automaticamente</div>
        <div>Página 1 de 1</div>
      </div>
    </div>
  `;

  // 3. Renderização Final
  const doc = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });
  
  // Usamos a função html do jsPDF que processa o DOM via html2canvas internamente
  // Precisamos de um container temporário
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    await doc.html(container, {
      callback: function (doc) {
        const safeName = projeto.nome.replace(/[^a-zA-Z0-9]/g, "_");
        doc.save(`Relatorio_${safeName}_${format(new Date(), "yyyyMMdd")}.pdf`);
      },
      x: 0,
      y: 0,
      width: 794, // Largura alvo do PDF em px
      windowWidth: 794,
      autoPaging: 'text',
    });
  } finally {
    document.body.removeChild(container);
  }
}

