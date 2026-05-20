-- Corrigir cotações de trabalho inválidas (1.0) para moedas estrangeiras na tabela projetos
UPDATE public.projetos
SET 
  cotacao_trabalho = CASE WHEN ABS(cotacao_trabalho - 1.0) < 0.0001 THEN NULL ELSE cotacao_trabalho END,
  cotacao_trabalho_eur = CASE WHEN ABS(cotacao_trabalho_eur - 1.0) < 0.0001 THEN NULL ELSE cotacao_trabalho_eur END,
  cotacao_trabalho_gbp = CASE WHEN ABS(cotacao_trabalho_gbp - 1.0) < 0.0001 THEN NULL ELSE cotacao_trabalho_gbp END,
  cotacao_trabalho_myr = CASE WHEN ABS(cotacao_trabalho_myr - 1.0) < 0.0001 THEN NULL ELSE cotacao_trabalho_myr END,
  cotacao_trabalho_mxn = CASE WHEN ABS(cotacao_trabalho_mxn - 1.0) < 0.0001 THEN NULL ELSE cotacao_trabalho_mxn END,
  cotacao_trabalho_ars = CASE WHEN ABS(cotacao_trabalho_ars - 1.0) < 0.0001 THEN NULL ELSE cotacao_trabalho_ars END,
  cotacao_trabalho_cop = CASE WHEN ABS(cotacao_trabalho_cop - 1.0) < 0.0001 THEN NULL ELSE cotacao_trabalho_cop END
WHERE 
  ABS(cotacao_trabalho - 1.0) < 0.0001 OR
  ABS(cotacao_trabalho_eur - 1.0) < 0.0001 OR
  ABS(cotacao_trabalho_gbp - 1.0) < 0.0001 OR
  ABS(cotacao_trabalho_myr - 1.0) < 0.0001 OR
  ABS(cotacao_trabalho_mxn - 1.0) < 0.0001 OR
  ABS(cotacao_trabalho_ars - 1.0) < 0.0001 OR
  ABS(cotacao_trabalho_cop - 1.0) < 0.0001;
