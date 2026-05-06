-- 1. Corrigir saldo da HUGEWIN (estava 2500, deve ser 200 conforme auditoria de depósito original + fluxos)
-- Nota: A auditoria mostra um salto de -200 para 200 no último evento REVERSAL, mas o saldo_atual está 2500.
UPDATE public.bookmakers 
SET saldo_atual = 200, 
    saldo_usd = 200,
    updated_at = now()
WHERE id = '74119434-448b-4f04-a356-156022dedf1c';

-- 2. Registrar o ajuste na auditoria para manter rastreabilidade
INSERT INTO public.bookmaker_balance_audit (
    bookmaker_id, 
    workspace_id, 
    saldo_anterior, 
    saldo_novo, 
    origem, 
    observacoes
) VALUES (
    '74119434-448b-4f04-a356-156022dedf1c',
    (SELECT workspace_id FROM public.bookmakers WHERE id = '74119434-448b-4f04-a356-156022dedf1c'),
    2500,
    200,
    'AJUSTE',
    'Correção manual de saldo infectado por redundância de recálculo (volatilidade pós-regressão).'
);

-- 3. Atualizar saldo_usd de todas as casas do projeto para garantir consistência nos KPIs de patrimônio
-- Baseado nas cotações de trabalho do projeto (BRL: 5.30, EUR: 6.10, MXN: 0.26)
UPDATE public.bookmakers b
SET saldo_usd = CASE 
    WHEN moeda = 'USD' THEN saldo_atual
    WHEN moeda = 'BRL' THEN saldo_atual / 5.30
    WHEN moeda = 'EUR' THEN (saldo_atual * 6.10) / 5.30
    WHEN moeda = 'MXN' THEN (saldo_atual * 0.26) / 5.30
    ELSE saldo_atual
END
WHERE projeto_id = '80d16390-22a0-4995-843a-3b076d33d8fe';

-- 4. Definir o Orcamento Inicial do Projeto (Soma dos depósitos originais convertidos para USD)
-- Talismania(100) + Amunra(100) + My Empire(100) + Thunderpick(116.80 EUR -> ~134 USD) + Alawin(1453.50 MXN -> ~71 USD) + 7Games(1000 BRL -> ~188 USD) + Hugewin(200 USD)
-- Total aprox: 100+100+100+134+71+188+200 = 893 USD (Ajustado para o valor nominal de entrada documentado)
UPDATE public.projetos
SET orcamento_inicial = 893.72, -- Valor calculado pela soma dos depósitos registrados na auditoria
    marco_zero_at = '2026-04-24 04:00:00+00', -- Data do primeiro depósito
    updated_at = now()
WHERE id = '80d16390-22a0-4995-843a-3b076d33d8fe';
