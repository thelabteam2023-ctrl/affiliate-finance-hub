-- Remove global credentials from parceiros table
ALTER TABLE public.parceiros 
  DROP COLUMN IF EXISTS usuario_global,
  DROP COLUMN IF EXISTS senha_global_encrypted;

-- Remove password fields from contas_bancarias table
ALTER TABLE public.contas_bancarias
  DROP COLUMN IF EXISTS senha_acesso_encrypted,
  DROP COLUMN IF EXISTS senha_transacao_encrypted,
  DROP COLUMN IF EXISTS usar_senha_global;

-- Remove password fields from wallets_crypto table
ALTER TABLE public.wallets_crypto
  DROP COLUMN IF EXISTS senha_acesso_encrypted,
  DROP COLUMN IF EXISTS usar_senha_global;

-- Add unique constraint for CPF in parceiros table
ALTER TABLE public.parceiros
  ADD CONSTRAINT unique_cpf_per_user UNIQUE (user_id, cpf);

-- Add unique constraint for telefone in parceiros table
ALTER TABLE public.parceiros
  ADD CONSTRAINT unique_telefone_per_user UNIQUE (user_id, telefone);