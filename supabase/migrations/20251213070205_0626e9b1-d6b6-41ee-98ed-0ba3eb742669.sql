-- Adicionar constraint única para nome de projeto por usuário
CREATE UNIQUE INDEX idx_projetos_nome_user_unique ON public.projetos (user_id, nome);