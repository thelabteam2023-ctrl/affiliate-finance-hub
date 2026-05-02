-- Tornar CPF opcional para permitir parceiros do tipo Fornecedor/Empresa
ALTER TABLE public.parceiros ALTER COLUMN cpf DROP NOT NULL;

-- Adicionar coluna de vínculo com Perfil de Fornecedor
ALTER TABLE public.parceiros ADD COLUMN IF NOT EXISTS supplier_profile_id UUID REFERENCES public.supplier_profiles(id);

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_parceiros_supplier_profile ON public.parceiros(supplier_profile_id);

-- View para consolidar o saldo total de cada fornecedor
CREATE OR REPLACE VIEW public.v_supplier_total_balances AS
WITH central_balance AS (
    SELECT 
        supplier_workspace_id,
        SUM(CASE WHEN direcao = 'CREDIT' THEN valor ELSE -valor END) as saldo_central
    FROM public.supplier_ledger
    WHERE bookmaker_account_id IS NULL
      AND (metadata->>'fonte' IS NULL OR metadata->>'fonte' != 'BANCO')
    GROUP BY supplier_workspace_id
),
bank_balances AS (
    SELECT 
        supplier_workspace_id,
        SUM(saldo) as saldo_bancos
    FROM public.supplier_titular_bancos
    GROUP BY supplier_workspace_id
),
account_balances AS (
    SELECT 
        supplier_workspace_id,
        SUM(saldo_atual) as saldo_contas
    FROM public.supplier_bookmaker_accounts
    WHERE status = 'ATIVA'
    GROUP BY supplier_workspace_id
)
SELECT 
    sp.id as supplier_profile_id,
    sp.workspace_id as supplier_workspace_id,
    sp.nome as supplier_nome,
    sp.parent_workspace_id,
    COALESCE(cb.saldo_central, 0) as saldo_central,
    COALESCE(bb.saldo_bancos, 0) as saldo_bancos,
    COALESCE(ab.saldo_contas, 0) as saldo_contas,
    (COALESCE(cb.saldo_central, 0) + COALESCE(bb.saldo_bancos, 0) + COALESCE(ab.saldo_contas, 0)) as saldo_total
FROM public.supplier_profiles sp
LEFT JOIN central_balance cb ON cb.supplier_workspace_id = sp.workspace_id
LEFT JOIN bank_balances bb ON bb.supplier_workspace_id = sp.workspace_id
LEFT JOIN account_balances ab ON ab.supplier_workspace_id = sp.workspace_id;

-- Garantir que cada perfil de fornecedor tenha um parceiro correspondente
INSERT INTO public.parceiros (nome, workspace_id, user_id, status, supplier_profile_id)
SELECT 
    sp.nome || ' (Fornecedor)',
    sp.parent_workspace_id,
    sp.created_by,
    'ativo',
    sp.id
FROM public.supplier_profiles sp
WHERE NOT EXISTS (
    SELECT 1 FROM public.parceiros p WHERE p.supplier_profile_id = sp.id
);
