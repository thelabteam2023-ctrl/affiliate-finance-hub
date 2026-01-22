-- Migração para suporte a múltiplas chaves PIX por conta bancária
-- Adiciona coluna JSONB para armazenar array de chaves

-- 1. Adicionar nova coluna JSONB para múltiplas chaves
ALTER TABLE public.contas_bancarias 
ADD COLUMN pix_keys JSONB DEFAULT '[]'::jsonb;

-- 2. Migrar dados existentes da coluna pix_key para o novo formato
UPDATE public.contas_bancarias 
SET pix_keys = CASE 
  WHEN pix_key IS NOT NULL AND pix_key != '' THEN 
    jsonb_build_array(
      jsonb_build_object(
        'tipo', 
        CASE 
          WHEN LENGTH(REGEXP_REPLACE(pix_key, '\D', '', 'g')) = 11 THEN 'cpf'
          WHEN LENGTH(REGEXP_REPLACE(pix_key, '\D', '', 'g')) = 14 THEN 'cnpj'
          WHEN pix_key ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN 'email'
          WHEN pix_key ~ '^\+' THEN 'telefone'
          ELSE 'aleatoria'
        END,
        'chave', pix_key
      )
    )
  ELSE '[]'::jsonb
END
WHERE pix_keys = '[]'::jsonb OR pix_keys IS NULL;

-- 3. Comentário para documentação
COMMENT ON COLUMN public.contas_bancarias.pix_keys IS 'Array de chaves PIX no formato [{tipo: string, chave: string}]';