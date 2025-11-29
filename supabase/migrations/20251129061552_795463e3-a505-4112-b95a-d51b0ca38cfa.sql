-- Adicionar campo observacoes_encrypted na tabela wallets_crypto
ALTER TABLE public.wallets_crypto 
ADD COLUMN IF NOT EXISTS observacoes_encrypted TEXT;

-- Remover campo label se existir
ALTER TABLE public.wallets_crypto 
DROP COLUMN IF EXISTS label;

-- Criar função de validação de unicidade de endereço por tenant
CREATE OR REPLACE FUNCTION public.validate_wallet_endereco_unique()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_exists BOOLEAN;
BEGIN
  -- Obter user_id do parceiro
  SELECT user_id INTO v_user_id
  FROM public.parceiros
  WHERE id = NEW.parceiro_id;

  -- Verificar se já existe outro endereço igual para o mesmo tenant
  -- Excluir o próprio registro em caso de UPDATE
  SELECT EXISTS(
    SELECT 1
    FROM public.wallets_crypto w
    INNER JOIN public.parceiros p ON w.parceiro_id = p.id
    WHERE w.endereco = NEW.endereco
    AND p.user_id = v_user_id
    AND w.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
  ) INTO v_exists;

  -- Se já existe, lançar erro
  IF v_exists THEN
    RAISE EXCEPTION 'Este endereço de wallet já está cadastrado para outro parceiro'
      USING ERRCODE = '23505'; -- unique_violation
  END IF;

  RETURN NEW;
END;
$$;

-- Criar trigger para validar antes de INSERT ou UPDATE
DROP TRIGGER IF EXISTS validate_wallet_endereco_unique_trigger ON public.wallets_crypto;
CREATE TRIGGER validate_wallet_endereco_unique_trigger
  BEFORE INSERT OR UPDATE OF endereco, parceiro_id
  ON public.wallets_crypto
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_wallet_endereco_unique();

-- Adicionar comentário explicativo
COMMENT ON FUNCTION public.validate_wallet_endereco_unique() 
IS 'Garante que o mesmo endereço de wallet não pode ser cadastrado duas vezes pelo mesmo usuário (tenant), similar à regra de CPF único';