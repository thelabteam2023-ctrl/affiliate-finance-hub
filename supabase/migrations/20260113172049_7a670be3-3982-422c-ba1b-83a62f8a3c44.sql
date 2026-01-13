-- ============================================================
-- TAXONOMIA DE GRUPOS PARA DESPESAS ADMINISTRATIVAS
-- ============================================================

-- 1. Adicionar coluna grupo (preserva categoria original para auditoria)
ALTER TABLE public.despesas_administrativas
ADD COLUMN IF NOT EXISTS grupo TEXT;

-- 2. Criar índice para performance em relatórios
CREATE INDEX IF NOT EXISTS idx_despesas_admin_grupo ON public.despesas_administrativas(grupo);

-- 3. Migração de categorias existentes para grupos
-- Mapeamento baseado na semântica das categorias

UPDATE public.despesas_administrativas
SET grupo = CASE
  -- UTILIDADES_E_SERVICOS_BASICOS: energia, água, gás
  WHEN categoria IN ('ENERGIA', 'AGUA', 'GAS', 'LUZ') THEN 'UTILIDADES_E_SERVICOS_BASICOS'
  
  -- INTERNET_E_COMUNICACAO: internet, telefonia, comunicação
  WHEN categoria IN ('INTERNET', 'INTERNET_MOVEL', 'INTERNET FIXA', 'TELEFONIA', 'COMUNICACAO', 'CELULAR') THEN 'INTERNET_E_COMUNICACAO'
  
  -- TRIBUTOS_E_OBRIGACOES_LEGAIS: impostos, taxas, darf
  WHEN categoria IN ('DARF', 'IMPOSTOS', 'TAXAS', 'TRIBUTOS', 'INSS', 'IRPF', 'ISS') THEN 'TRIBUTOS_E_OBRIGACOES_LEGAIS'
  
  -- CONTABIL_E_ADMINISTRATIVO: contabilidade, jurídico, administrativo
  WHEN categoria IN ('CONTABILIDADE', 'CONTADOR', 'JURIDICO', 'ADVOCACIA', 'CARTORIO', 'ADMINISTRATIVO') THEN 'CONTABIL_E_ADMINISTRATIVO'
  
  -- INFRAESTRUTURA_E_OCUPACAO: aluguel, condomínio, manutenção predial
  WHEN categoria IN ('ALUGUEL', 'CONDOMINIO', 'MANUTENCAO', 'IPTU', 'SEGURO_PREDIAL') THEN 'INFRAESTRUTURA_E_OCUPACAO'
  
  -- TECNOLOGIA_E_SOFTWARES: software, licenças, proxy, VPN, servidores
  WHEN categoria IN ('SOFTWARE', 'LICENCA', 'PROXY', 'VPN', 'SERVIDOR', 'HOSTING', 'CLOUD', 'SAAS') THEN 'TECNOLOGIA_E_SOFTWARES'
  
  -- ATIVOS: equipamentos, móveis, hardware
  WHEN categoria IN ('EQUIPAMENTO', 'HARDWARE', 'MOVEIS', 'COMPUTADOR', 'MONITOR') THEN 'ATIVOS'
  
  -- OUTROS: fallback para categorias não mapeadas
  ELSE 'OUTROS'
END
WHERE grupo IS NULL;

-- 4. Garantir que novos registros tenham grupo padrão
ALTER TABLE public.despesas_administrativas
ALTER COLUMN grupo SET DEFAULT 'OUTROS';

-- 5. Comentário para documentação
COMMENT ON COLUMN public.despesas_administrativas.grupo IS 'Grupo semântico da despesa (taxonomia simplificada). Categoria original preservada para auditoria.';