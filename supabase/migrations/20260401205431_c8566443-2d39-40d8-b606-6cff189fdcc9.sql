-- Fix bad data: remove LTC from ERC20 wallet that shouldn't have it
UPDATE wallets_crypto 
SET moeda = array_remove(moeda, 'LTC')
WHERE id = 'f4aaec95-3a26-45c9-804f-233dde534539'
  AND network = 'Ethereum (ERC20)'
  AND 'LTC' = ANY(moeda);

-- Create validation trigger to prevent incompatible coin+network combinations
CREATE OR REPLACE FUNCTION validate_wallet_coin_network()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  net TEXT;
  coin TEXT;
BEGIN
  net := UPPER(COALESCE(NEW.network, ''));
  
  IF NEW.moeda IS NOT NULL THEN
    FOREACH coin IN ARRAY NEW.moeda
    LOOP
      -- LTC only on Litecoin networks
      IF coin = 'LTC' AND net NOT LIKE '%LTC%' AND net NOT LIKE '%LITECOIN%' THEN
        RAISE EXCEPTION 'Moeda LTC incompatível com rede %', NEW.network;
      END IF;
      -- BTC only on Bitcoin networks
      IF coin = 'BTC' AND net NOT LIKE '%BTC%' AND net NOT LIKE '%BITCOIN%' THEN
        RAISE EXCEPTION 'Moeda BTC incompatível com rede %', NEW.network;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_wallet_coin_network ON wallets_crypto;
CREATE TRIGGER trg_validate_wallet_coin_network
  BEFORE INSERT OR UPDATE ON wallets_crypto
  FOR EACH ROW
  EXECUTE FUNCTION validate_wallet_coin_network();