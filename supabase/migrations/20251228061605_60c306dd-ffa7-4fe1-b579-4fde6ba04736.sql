
-- FASE 3 (Parte 1): Limpeza de policies duplicadas e problemáticas
-- Remover policies que permitem workspace_id IS NULL

-- 1. APOSTAS_UNIFICADA - remover policies com padrão problemático
DROP POLICY IF EXISTS "Workspace isolation apostas_unificada DELETE" ON apostas_unificada;
DROP POLICY IF EXISTS "Workspace isolation apostas_unificada SELECT" ON apostas_unificada;
DROP POLICY IF EXISTS "Workspace isolation apostas_unificada UPDATE" ON apostas_unificada;

-- 2. BOOKMAKERS - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation bookmakers DELETE" ON bookmakers;
DROP POLICY IF EXISTS "Workspace isolation bookmakers SELECT" ON bookmakers;
DROP POLICY IF EXISTS "Workspace isolation bookmakers UPDATE" ON bookmakers;
DROP POLICY IF EXISTS "bookmakers_delete" ON bookmakers;
DROP POLICY IF EXISTS "bookmakers_insert" ON bookmakers;
DROP POLICY IF EXISTS "bookmakers_select" ON bookmakers;
DROP POLICY IF EXISTS "bookmakers_update" ON bookmakers;

-- 3. CASH_LEDGER - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation cash_ledger DELETE" ON cash_ledger;
DROP POLICY IF EXISTS "Workspace isolation cash_ledger SELECT" ON cash_ledger;
DROP POLICY IF EXISTS "Workspace isolation cash_ledger UPDATE" ON cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_delete" ON cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_insert" ON cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_select" ON cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_update" ON cash_ledger;

-- 4. DESPESAS_ADMINISTRATIVAS - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation despesas_administrativas DELETE" ON despesas_administrativas;
DROP POLICY IF EXISTS "Workspace isolation despesas_administrativas SELECT" ON despesas_administrativas;
DROP POLICY IF EXISTS "Workspace isolation despesas_administrativas UPDATE" ON despesas_administrativas;
DROP POLICY IF EXISTS "despesas_administrativas_delete" ON despesas_administrativas;
DROP POLICY IF EXISTS "despesas_administrativas_insert" ON despesas_administrativas;
DROP POLICY IF EXISTS "despesas_administrativas_select" ON despesas_administrativas;
DROP POLICY IF EXISTS "despesas_administrativas_update" ON despesas_administrativas;

-- 5. ENTREGAS - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation entregas DELETE" ON entregas;
DROP POLICY IF EXISTS "Workspace isolation entregas SELECT" ON entregas;
DROP POLICY IF EXISTS "Workspace isolation entregas UPDATE" ON entregas;
DROP POLICY IF EXISTS "entregas_delete" ON entregas;
DROP POLICY IF EXISTS "entregas_insert" ON entregas;
DROP POLICY IF EXISTS "entregas_select" ON entregas;
DROP POLICY IF EXISTS "entregas_update" ON entregas;

-- 6. FORNECEDORES - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation fornecedores DELETE" ON fornecedores;
DROP POLICY IF EXISTS "Workspace isolation fornecedores SELECT" ON fornecedores;
DROP POLICY IF EXISTS "Workspace isolation fornecedores UPDATE" ON fornecedores;
DROP POLICY IF EXISTS "fornecedores_delete" ON fornecedores;
DROP POLICY IF EXISTS "fornecedores_insert" ON fornecedores;
DROP POLICY IF EXISTS "fornecedores_select" ON fornecedores;
DROP POLICY IF EXISTS "fornecedores_update" ON fornecedores;

-- 7. FREEBETS_RECEBIDAS - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation freebets_recebidas DELETE" ON freebets_recebidas;
DROP POLICY IF EXISTS "Workspace isolation freebets_recebidas SELECT" ON freebets_recebidas;
DROP POLICY IF EXISTS "Workspace isolation freebets_recebidas UPDATE" ON freebets_recebidas;
DROP POLICY IF EXISTS "freebets_recebidas_delete" ON freebets_recebidas;
DROP POLICY IF EXISTS "freebets_recebidas_insert" ON freebets_recebidas;
DROP POLICY IF EXISTS "freebets_recebidas_select" ON freebets_recebidas;
DROP POLICY IF EXISTS "freebets_recebidas_update" ON freebets_recebidas;

-- 8. INDICACOES - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation indicacoes DELETE" ON indicacoes;
DROP POLICY IF EXISTS "Workspace isolation indicacoes SELECT" ON indicacoes;
DROP POLICY IF EXISTS "Workspace isolation indicacoes UPDATE" ON indicacoes;
DROP POLICY IF EXISTS "indicacoes_delete" ON indicacoes;
DROP POLICY IF EXISTS "indicacoes_insert" ON indicacoes;
DROP POLICY IF EXISTS "indicacoes_select" ON indicacoes;
DROP POLICY IF EXISTS "indicacoes_update" ON indicacoes;

-- 9. INDICADOR_ACORDOS - remover policies problemáticas
DROP POLICY IF EXISTS "indicador_acordos_delete" ON indicador_acordos;
DROP POLICY IF EXISTS "indicador_acordos_insert" ON indicador_acordos;
DROP POLICY IF EXISTS "indicador_acordos_select" ON indicador_acordos;
DROP POLICY IF EXISTS "indicador_acordos_update" ON indicador_acordos;

-- 10. INDICADORES_REFERRAL - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation indicadores_referral DELETE" ON indicadores_referral;
DROP POLICY IF EXISTS "Workspace isolation indicadores_referral SELECT" ON indicadores_referral;
DROP POLICY IF EXISTS "Workspace isolation indicadores_referral UPDATE" ON indicadores_referral;
DROP POLICY IF EXISTS "indicadores_referral_delete" ON indicadores_referral;
DROP POLICY IF EXISTS "indicadores_referral_insert" ON indicadores_referral;
DROP POLICY IF EXISTS "indicadores_referral_select" ON indicadores_referral;
DROP POLICY IF EXISTS "indicadores_referral_update" ON indicadores_referral;

-- 11. INVESTIDORES e INVESTIDOR_DEALS - remover policies problemáticas
DROP POLICY IF EXISTS "investidores_delete" ON investidores;
DROP POLICY IF EXISTS "investidores_insert" ON investidores;
DROP POLICY IF EXISTS "investidores_select" ON investidores;
DROP POLICY IF EXISTS "investidores_update" ON investidores;
DROP POLICY IF EXISTS "investidor_deals_delete" ON investidor_deals;
DROP POLICY IF EXISTS "investidor_deals_insert" ON investidor_deals;
DROP POLICY IF EXISTS "investidor_deals_select" ON investidor_deals;
DROP POLICY IF EXISTS "investidor_deals_update" ON investidor_deals;

-- 12. MOVIMENTACOES_INDICACAO - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation movimentacoes_indicacao DELETE" ON movimentacoes_indicacao;
DROP POLICY IF EXISTS "Workspace isolation movimentacoes_indicacao SELECT" ON movimentacoes_indicacao;
DROP POLICY IF EXISTS "Workspace isolation movimentacoes_indicacao UPDATE" ON movimentacoes_indicacao;
DROP POLICY IF EXISTS "movimentacoes_indicacao_delete" ON movimentacoes_indicacao;
DROP POLICY IF EXISTS "movimentacoes_indicacao_insert" ON movimentacoes_indicacao;
DROP POLICY IF EXISTS "movimentacoes_indicacao_select" ON movimentacoes_indicacao;
DROP POLICY IF EXISTS "movimentacoes_indicacao_update" ON movimentacoes_indicacao;

-- 13. OPERADORES - remover policies problemáticas
DROP POLICY IF EXISTS "operadores_delete" ON operadores;
DROP POLICY IF EXISTS "operadores_insert" ON operadores;
DROP POLICY IF EXISTS "operadores_select" ON operadores;
DROP POLICY IF EXISTS "operadores_update" ON operadores;

-- 14. OPERADOR_PROJETOS - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation operador_projetos DELETE" ON operador_projetos;
DROP POLICY IF EXISTS "Workspace isolation operador_projetos SELECT" ON operador_projetos;
DROP POLICY IF EXISTS "Workspace isolation operador_projetos UPDATE" ON operador_projetos;
DROP POLICY IF EXISTS "operador_projetos_delete" ON operador_projetos;
DROP POLICY IF EXISTS "operador_projetos_insert" ON operador_projetos;
DROP POLICY IF EXISTS "operador_projetos_select" ON operador_projetos;
DROP POLICY IF EXISTS "operador_projetos_update" ON operador_projetos;

-- 15. PAGAMENTOS_OPERADOR - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation pagamentos_operador DELETE" ON pagamentos_operador;
DROP POLICY IF EXISTS "Workspace isolation pagamentos_operador SELECT" ON pagamentos_operador;
DROP POLICY IF EXISTS "Workspace isolation pagamentos_operador UPDATE" ON pagamentos_operador;
DROP POLICY IF EXISTS "pagamentos_operador_delete" ON pagamentos_operador;
DROP POLICY IF EXISTS "pagamentos_operador_insert" ON pagamentos_operador;
DROP POLICY IF EXISTS "pagamentos_operador_select" ON pagamentos_operador;
DROP POLICY IF EXISTS "pagamentos_operador_update" ON pagamentos_operador;

-- 16. PAGAMENTOS_PROPOSTOS - remover policies problemáticas
DROP POLICY IF EXISTS "pagamentos_propostos_delete" ON pagamentos_propostos;
DROP POLICY IF EXISTS "pagamentos_propostos_insert" ON pagamentos_propostos;
DROP POLICY IF EXISTS "pagamentos_propostos_select" ON pagamentos_propostos;
DROP POLICY IF EXISTS "pagamentos_propostos_update" ON pagamentos_propostos;

-- 17. PARCEIROS - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation parceiros DELETE" ON parceiros;
DROP POLICY IF EXISTS "Workspace isolation parceiros SELECT" ON parceiros;
DROP POLICY IF EXISTS "Workspace isolation parceiros UPDATE" ON parceiros;
DROP POLICY IF EXISTS "parceiros_delete" ON parceiros;
DROP POLICY IF EXISTS "parceiros_insert" ON parceiros;
DROP POLICY IF EXISTS "parceiros_select" ON parceiros;
DROP POLICY IF EXISTS "parceiros_update" ON parceiros;

-- 18. PARCEIRO_LUCRO_ALERTAS - remover policies problemáticas
DROP POLICY IF EXISTS "parceiro_lucro_alertas_delete" ON parceiro_lucro_alertas;
DROP POLICY IF EXISTS "parceiro_lucro_alertas_insert" ON parceiro_lucro_alertas;
DROP POLICY IF EXISTS "parceiro_lucro_alertas_select" ON parceiro_lucro_alertas;
DROP POLICY IF EXISTS "parceiro_lucro_alertas_update" ON parceiro_lucro_alertas;

-- 19. PARCERIAS - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation parcerias DELETE" ON parcerias;
DROP POLICY IF EXISTS "Workspace isolation parcerias SELECT" ON parcerias;
DROP POLICY IF EXISTS "Workspace isolation parcerias UPDATE" ON parcerias;
DROP POLICY IF EXISTS "parcerias_delete" ON parcerias;
DROP POLICY IF EXISTS "parcerias_insert" ON parcerias;
DROP POLICY IF EXISTS "parcerias_select" ON parcerias;
DROP POLICY IF EXISTS "parcerias_update" ON parcerias;

-- 20. PARTICIPACAO_CICLOS - remover policies problemáticas
DROP POLICY IF EXISTS "participacao_ciclos_delete" ON participacao_ciclos;
DROP POLICY IF EXISTS "participacao_ciclos_insert" ON participacao_ciclos;
DROP POLICY IF EXISTS "participacao_ciclos_select" ON participacao_ciclos;
DROP POLICY IF EXISTS "participacao_ciclos_update" ON participacao_ciclos;

-- 21. PROJECT_BOOKMAKER_LINK_BONUSES - remover policies problemáticas
DROP POLICY IF EXISTS "project_bookmaker_link_bonuses_delete" ON project_bookmaker_link_bonuses;
DROP POLICY IF EXISTS "project_bookmaker_link_bonuses_insert" ON project_bookmaker_link_bonuses;
DROP POLICY IF EXISTS "project_bookmaker_link_bonuses_select" ON project_bookmaker_link_bonuses;
DROP POLICY IF EXISTS "project_bookmaker_link_bonuses_update" ON project_bookmaker_link_bonuses;

-- 22. PROJETO_BOOKMAKER_HISTORICO - remover policies problemáticas
DROP POLICY IF EXISTS "projeto_bookmaker_historico_delete" ON projeto_bookmaker_historico;
DROP POLICY IF EXISTS "projeto_bookmaker_historico_insert" ON projeto_bookmaker_historico;
DROP POLICY IF EXISTS "projeto_bookmaker_historico_select" ON projeto_bookmaker_historico;
DROP POLICY IF EXISTS "projeto_bookmaker_historico_update" ON projeto_bookmaker_historico;

-- 23. PROJETO_CICLOS - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation projeto_ciclos DELETE" ON projeto_ciclos;
DROP POLICY IF EXISTS "Workspace isolation projeto_ciclos SELECT" ON projeto_ciclos;
DROP POLICY IF EXISTS "Workspace isolation projeto_ciclos UPDATE" ON projeto_ciclos;
DROP POLICY IF EXISTS "projeto_ciclos_delete" ON projeto_ciclos;
DROP POLICY IF EXISTS "projeto_ciclos_insert" ON projeto_ciclos;
DROP POLICY IF EXISTS "projeto_ciclos_select" ON projeto_ciclos;
DROP POLICY IF EXISTS "projeto_ciclos_update" ON projeto_ciclos;

-- 24. PROJETO_CONCILIACOES - remover policies problemáticas
DROP POLICY IF EXISTS "projeto_conciliacoes_delete" ON projeto_conciliacoes;
DROP POLICY IF EXISTS "projeto_conciliacoes_insert" ON projeto_conciliacoes;
DROP POLICY IF EXISTS "projeto_conciliacoes_select" ON projeto_conciliacoes;
DROP POLICY IF EXISTS "projeto_conciliacoes_update" ON projeto_conciliacoes;

-- 25. PROJETO_PERDAS - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation projeto_perdas DELETE" ON projeto_perdas;
DROP POLICY IF EXISTS "Workspace isolation projeto_perdas SELECT" ON projeto_perdas;
DROP POLICY IF EXISTS "Workspace isolation projeto_perdas UPDATE" ON projeto_perdas;
DROP POLICY IF EXISTS "projeto_perdas_delete" ON projeto_perdas;
DROP POLICY IF EXISTS "projeto_perdas_insert" ON projeto_perdas;
DROP POLICY IF EXISTS "projeto_perdas_select" ON projeto_perdas;
DROP POLICY IF EXISTS "projeto_perdas_update" ON projeto_perdas;

-- 26. PROJETOS - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation projetos DELETE" ON projetos;
DROP POLICY IF EXISTS "Workspace isolation projetos SELECT" ON projetos;
DROP POLICY IF EXISTS "Workspace isolation projetos UPDATE" ON projetos;
DROP POLICY IF EXISTS "projetos_delete" ON projetos;
DROP POLICY IF EXISTS "projetos_insert" ON projetos;
DROP POLICY IF EXISTS "projetos_select" ON projetos;
DROP POLICY IF EXISTS "projetos_update" ON projetos;

-- 27. PROMOCAO_PARTICIPANTES - remover policies problemáticas
DROP POLICY IF EXISTS "promocao_participantes_delete" ON promocao_participantes;
DROP POLICY IF EXISTS "promocao_participantes_insert" ON promocao_participantes;
DROP POLICY IF EXISTS "promocao_participantes_select" ON promocao_participantes;
DROP POLICY IF EXISTS "promocao_participantes_update" ON promocao_participantes;

-- 28. PROMOCOES_INDICACAO - remover policies duplicadas e problemáticas
DROP POLICY IF EXISTS "Workspace isolation promocoes_indicacao DELETE" ON promocoes_indicacao;
DROP POLICY IF EXISTS "Workspace isolation promocoes_indicacao SELECT" ON promocoes_indicacao;
DROP POLICY IF EXISTS "Workspace isolation promocoes_indicacao UPDATE" ON promocoes_indicacao;
DROP POLICY IF EXISTS "promocoes_indicacao_delete" ON promocoes_indicacao;
DROP POLICY IF EXISTS "promocoes_indicacao_insert" ON promocoes_indicacao;
DROP POLICY IF EXISTS "promocoes_indicacao_select" ON promocoes_indicacao;
DROP POLICY IF EXISTS "promocoes_indicacao_update" ON promocoes_indicacao;

-- 29. TRANSACOES_BOOKMAKERS - remover policies problemáticas
DROP POLICY IF EXISTS "transacoes_bookmakers_delete" ON transacoes_bookmakers;
DROP POLICY IF EXISTS "transacoes_bookmakers_insert" ON transacoes_bookmakers;
DROP POLICY IF EXISTS "transacoes_bookmakers_select" ON transacoes_bookmakers;
DROP POLICY IF EXISTS "transacoes_bookmakers_update" ON transacoes_bookmakers;

-- 30. USER_FAVORITES - remover policies problemáticas
DROP POLICY IF EXISTS "user_favorites_delete" ON user_favorites;
DROP POLICY IF EXISTS "user_favorites_insert" ON user_favorites;
