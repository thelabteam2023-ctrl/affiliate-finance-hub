-- Reset completo para testes (mantendo bookmakers_catalogo, bancos, redes_crypto)

-- 1. Transações e movimentações financeiras
DELETE FROM public.transacoes_bookmakers;
DELETE FROM public.cash_ledger;

-- 2. Matched Betting
DELETE FROM public.matched_betting_pernas;
DELETE FROM public.matched_betting_rounds;
DELETE FROM public.matched_betting_promocoes;

-- 3. Apostas
DELETE FROM public.apostas;

-- 4. Bookmakers (vínculos, não o catálogo)
DELETE FROM public.bookmakers;

-- 5. Contas bancárias e wallets
DELETE FROM public.contas_bancarias;
DELETE FROM public.wallets_crypto;

-- 6. Operadores
DELETE FROM public.pagamentos_operador;
DELETE FROM public.operador_projetos;
DELETE FROM public.operadores;

-- 7. Programa de Indicação
DELETE FROM public.movimentacoes_indicacao;
DELETE FROM public.promocao_participantes;
DELETE FROM public.parcerias;
DELETE FROM public.indicacoes;
DELETE FROM public.indicador_acordos;
DELETE FROM public.promocoes_indicacao;
DELETE FROM public.indicadores_referral;
DELETE FROM public.fornecedores;

-- 8. Investidores
DELETE FROM public.investidor_deals;
DELETE FROM public.investidores;

-- 9. Despesas
DELETE FROM public.despesas_administrativas;

-- 10. Projetos
DELETE FROM public.projetos;

-- 11. Parceiros (por último)
DELETE FROM public.parceiros;