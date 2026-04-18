-- Permitir projeto_id NULL em freebets_recebidas
-- Justificativa: Quando uma bookmaker é desvinculada de um projeto, suas freebets ativas
-- precisam ficar "órfãs" (sem projeto) até serem reatribuídas em uma nova vinculação.
-- O saldo físico permanece na bookmaker (saldo_freebet inalterado).

ALTER TABLE public.freebets_recebidas
  ALTER COLUMN projeto_id DROP NOT NULL;

-- Index parcial para acelerar query de freebets órfãs (sem projeto) por bookmaker
CREATE INDEX IF NOT EXISTS idx_freebets_recebidas_bookmaker_orfas
  ON public.freebets_recebidas (bookmaker_id)
  WHERE projeto_id IS NULL AND COALESCE(utilizada, false) = false;