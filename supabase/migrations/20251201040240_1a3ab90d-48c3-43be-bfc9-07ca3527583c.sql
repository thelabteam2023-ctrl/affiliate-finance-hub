-- Explicitly set all views to SECURITY INVOKER to fix the security issue
-- This ensures views execute with the permissions of the querying user, not the view creator

ALTER VIEW public.v_roi_investidores SET (security_invoker = on);
ALTER VIEW public.v_saldo_caixa_fiat SET (security_invoker = on);
ALTER VIEW public.v_saldo_caixa_crypto SET (security_invoker = on);
ALTER VIEW public.v_saldo_parceiro_contas SET (security_invoker = on);
ALTER VIEW public.v_saldo_parceiro_wallets SET (security_invoker = on);