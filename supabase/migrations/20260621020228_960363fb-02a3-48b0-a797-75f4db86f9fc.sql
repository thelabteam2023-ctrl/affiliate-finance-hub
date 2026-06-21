
-- Snapshot de Lucro Realizado: congelar o lucro/ROI no momento da liquidação
-- Reaproveita pl_consolidado (fonte canônica, definida pela RPC de liquidação) e
-- materializa em colunas dedicadas para leitura imutável no card de histórico.

ALTER TABLE public.apostas_unificada
  ADD COLUMN IF NOT EXISTS lucro_realizado numeric,
  ADD COLUMN IF NOT EXISTS roi_realizado numeric,
  ADD COLUMN IF NOT EXISTS lucro_realizado_at timestamptz;

COMMENT ON COLUMN public.apostas_unificada.lucro_realizado IS
  'Snapshot imutável do lucro consolidado no momento da transição para LIQUIDADA. Copiado de pl_consolidado pelo trigger trg_snapshot_lucro_realizado.';
COMMENT ON COLUMN public.apostas_unificada.roi_realizado IS
  'Snapshot imutável do ROI realizado (lucro_realizado / stake_consolidado * 100). Congelado junto com lucro_realizado.';
COMMENT ON COLUMN public.apostas_unificada.lucro_realizado_at IS
  'Timestamp do congelamento do snapshot.';

CREATE OR REPLACE FUNCTION public.fn_snapshot_lucro_realizado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stake numeric;
BEGIN
  -- Só age na transição PARA LIQUIDADA (ou quando pl_consolidado muda em aposta já liquidada
  -- via reliquidação) — mantém o snapshot sincronizado com o motor canônico.
  IF NEW.status = 'LIQUIDADA'
     AND NEW.pl_consolidado IS NOT NULL
     AND (
        OLD.status IS DISTINCT FROM NEW.status
        OR OLD.pl_consolidado IS DISTINCT FROM NEW.pl_consolidado
        OR NEW.lucro_realizado IS NULL
     )
  THEN
    v_stake := COALESCE(NULLIF(NEW.stake_consolidado, 0), NULLIF(NEW.stake_total, 0));
    NEW.lucro_realizado := NEW.pl_consolidado;
    NEW.roi_realizado   := CASE WHEN v_stake IS NOT NULL AND v_stake > 0
                                THEN (NEW.pl_consolidado / v_stake) * 100
                                ELSE NULL END;
    NEW.lucro_realizado_at := COALESCE(NEW.lucro_realizado_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_lucro_realizado ON public.apostas_unificada;
CREATE TRIGGER trg_snapshot_lucro_realizado
  BEFORE UPDATE ON public.apostas_unificada
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_snapshot_lucro_realizado();

-- Backfill: para apostas já liquidadas, materializar o snapshot a partir de pl_consolidado.
UPDATE public.apostas_unificada
SET    lucro_realizado    = pl_consolidado,
       roi_realizado      = CASE WHEN COALESCE(NULLIF(stake_consolidado,0), NULLIF(stake_total,0)) > 0
                                 THEN (pl_consolidado / COALESCE(NULLIF(stake_consolidado,0), NULLIF(stake_total,0))) * 100
                                 ELSE NULL END,
       lucro_realizado_at = COALESCE(lucro_realizado_at, updated_at, now())
WHERE  status = 'LIQUIDADA'
  AND  pl_consolidado IS NOT NULL
  AND  lucro_realizado IS NULL;
