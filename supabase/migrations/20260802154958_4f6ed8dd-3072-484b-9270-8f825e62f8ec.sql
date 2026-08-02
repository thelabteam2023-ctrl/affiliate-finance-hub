UPDATE public.project_bookmaker_link_bonuses
SET currency = 'USD',
    valor_consolidado_snapshot = 200,
    cotacao_credito_snapshot = NULL,
    valor_brl_referencia = NULL,
    updated_at = now()
WHERE id = '1f9f0cd4-bd2d-4a86-b5f0-61cff5e740b7';