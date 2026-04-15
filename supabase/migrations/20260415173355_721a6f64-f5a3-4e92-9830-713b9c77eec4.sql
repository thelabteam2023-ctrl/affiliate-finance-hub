UPDATE exchange_rate_cache 
SET rate = 1.262, 
    source = 'MANUAL_UPDATE', 
    fetched_at = NOW(), 
    updated_at = NOW(), 
    expires_at = NOW() + INTERVAL '24 hours'
WHERE currency_pair = 'MYRBRL';