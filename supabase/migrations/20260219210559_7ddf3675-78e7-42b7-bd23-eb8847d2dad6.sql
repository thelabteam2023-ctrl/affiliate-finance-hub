
-- Adiciona foreign keys para requerente_id e executor_id em solicitacoes referenciando profiles
ALTER TABLE public.solicitacoes
  ADD CONSTRAINT solicitacoes_requerente_id_fkey
  FOREIGN KEY (requerente_id) REFERENCES public.profiles(id);

ALTER TABLE public.solicitacoes
  ADD CONSTRAINT solicitacoes_executor_id_fkey
  FOREIGN KEY (executor_id) REFERENCES public.profiles(id);
