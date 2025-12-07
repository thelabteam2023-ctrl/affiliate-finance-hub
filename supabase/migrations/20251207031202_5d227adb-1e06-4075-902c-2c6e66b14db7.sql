-- Add saldo_freebet column to bookmakers table for freebet tracking
ALTER TABLE public.bookmakers 
ADD COLUMN saldo_freebet numeric NOT NULL DEFAULT 0;