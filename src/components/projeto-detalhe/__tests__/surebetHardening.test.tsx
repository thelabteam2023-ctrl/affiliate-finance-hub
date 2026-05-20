import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SurebetCard } from "@/components/projeto-detalhe/SurebetCard";
import React from 'react';

// Mock simple currency formatter
const mockFormat = (v: number) => `R$ ${v.toFixed(2)}`;

describe("Surebet Hardening - DOM & Observability", () => {
  const mockSurebet = {
    id: "test-123",
    data_operacao: new Date().toISOString(),
    evento: "TEST MATCH",
    esporte: "Futebol",
    modelo: "1-2",
    stake_total: 100,
    status: "PENDENTE",
    resultado: null,
    observacoes: "",
    pernas: [
      {
        id: "p1",
        bookmaker_nome: "CASA 1",
        bookmaker_id: "bk1",
        moeda: "USD",
        odd: 2.0,
        stake: 10,
        selecao: "1",
        entries: [
            { bookmaker_nome: "SUB 1", moeda: "USD", stake: 5, odd: 2.0 },
            { bookmaker_nome: "SUB 2", moeda: "BRL", stake: 25, odd: 2.0 }
        ]
      },
      {
        id: "p2",
        bookmaker_nome: "CASA 2",
        bookmaker_id: "bk2",
        moeda: "BRL",
        odd: 2.0,
        stake: 50,
        selecao: "2"
      }
    ]
  };

  it("deve conter atributos de data-* para automação de testes", () => {
    const { container } = render(
      <SurebetCard 
        surebet={mockSurebet as any} 
        formatCurrency={mockFormat}
        moedaConsolidacao="BRL"
      />
    );

    const card = container.querySelector('[data-testid="surebet-card"]');
    expect(card).toBeDefined();
    expect(card?.getAttribute('data-is-multicurrency')).toBe('true');
    expect(card?.getAttribute('data-base-currency')).toBe('BRL');

    const legs = container.querySelectorAll('[data-testid="surebet-leg-wrapper"]');
    expect(legs.length).toBe(2);
    expect(legs[0].getAttribute('data-sub-entries-count')).toBe('2');
    
    // Verifica sub-entradas
    const subEntries = container.querySelectorAll('[data-testid="surebet-sub-entry"]');
    expect(subEntries.length).toBe(2);
    expect(subEntries[0].getAttribute('data-moeda')).toBe('USD');
  });

  it("não deve exibir botão de debug em cards simples BRL sem anomalias", () => {
    const simpleSurebet = {
        ...mockSurebet,
        pernas: [
            { ...mockSurebet.pernas[1], id: 's1' },
            { ...mockSurebet.pernas[1], id: 's2' }
        ]
    };
    
    render(
      <SurebetCard 
        surebet={simpleSurebet as any} 
        formatCurrency={mockFormat}
        moedaConsolidacao="BRL"
      />
    );

    const debugBtn = screen.queryByTitle("Abrir Auditoria Matemática");
    expect(debugBtn).toBeNull();
  });
});
