ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_transit_status_check;
ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_transit_status_check
  CHECK (
    transit_status IS NULL OR transit_status = ANY (ARRAY[
      'PENDING'::text,
      'CONFIRMED'::text,
      'FAILED'::text,
      'STUCK'::text,
      'WRONG_ADDRESS'::text,
      'EXPIRED'::text,
      'MANUAL_REVIEW'::text,
      'CANCELLED'::text,
      'LOST'::text
    ])
  );