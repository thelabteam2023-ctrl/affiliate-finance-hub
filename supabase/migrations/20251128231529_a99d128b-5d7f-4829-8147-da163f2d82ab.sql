-- Fase 1.1: Adicionar colunas na tabela parceiros
ALTER TABLE parceiros 
ADD COLUMN endereco text,
ADD COLUMN cidade text,
ADD COLUMN cep text,
ADD COLUMN usuario_global text,
ADD COLUMN senha_global_encrypted text;

-- Fase 1.2: Criar tabela bancos para CRUD de bancos
CREATE TABLE bancos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  nome text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  is_system boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS na tabela bancos
ALTER TABLE bancos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para bancos
CREATE POLICY "Users can view system banks and own banks" 
ON bancos 
FOR SELECT 
USING (is_system = true OR auth.uid() = user_id);

CREATE POLICY "Users can insert own banks" 
ON bancos 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND is_system = false);

CREATE POLICY "Users can update own banks" 
ON bancos 
FOR UPDATE 
USING (auth.uid() = user_id AND is_system = false);

CREATE POLICY "Users can delete own banks" 
ON bancos 
FOR DELETE 
USING (auth.uid() = user_id AND is_system = false);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_bancos_updated_at
BEFORE UPDATE ON bancos
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Fase 1.3: Criar tabela redes_crypto
CREATE TABLE redes_crypto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  nome text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  is_system boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS na tabela redes_crypto
ALTER TABLE redes_crypto ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para redes_crypto
CREATE POLICY "Users can view system networks and own networks" 
ON redes_crypto 
FOR SELECT 
USING (is_system = true OR auth.uid() = user_id);

CREATE POLICY "Users can insert own networks" 
ON redes_crypto 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND is_system = false);

CREATE POLICY "Users can update own networks" 
ON redes_crypto 
FOR UPDATE 
USING (auth.uid() = user_id AND is_system = false);

CREATE POLICY "Users can delete own networks" 
ON redes_crypto 
FOR DELETE 
USING (auth.uid() = user_id AND is_system = false);

-- Fase 1.4: Adicionar colunas na tabela contas_bancarias
ALTER TABLE contas_bancarias 
ADD COLUMN banco_id uuid REFERENCES bancos(id),
ADD COLUMN senha_acesso_encrypted text,
ADD COLUMN senha_transacao_encrypted text,
ADD COLUMN usar_senha_global boolean DEFAULT false;

-- Fase 1.5: Adicionar colunas na tabela wallets_crypto
ALTER TABLE wallets_crypto 
ADD COLUMN rede_id uuid REFERENCES redes_crypto(id),
ADD COLUMN senha_acesso_encrypted text,
ADD COLUMN usar_senha_global boolean DEFAULT false;

-- Fase 3.1: Inserir bancos pré-definidos do sistema
INSERT INTO bancos (codigo, nome, is_system, user_id) VALUES
('001', 'Banco do Brasil S.A.', true, NULL),
('003', 'Banco da Amazônia S.A.', true, NULL),
('004', 'Banco do Nordeste do Brasil S.A.', true, NULL),
('010', 'Credicoamo Crédito Rural Cooperativa', true, NULL),
('011', 'Credit Suisse (Brasil) S.A.', true, NULL),
('025', 'Banco Alfa S.A.', true, NULL),
('033', 'Banco Santander (Brasil) S.A.', true, NULL),
('036', 'Banco Bradesco BBI S.A.', true, NULL),
('037', 'Banco do Estado do Pará S.A.', true, NULL),
('041', 'Banco do Estado do Rio Grande do Sul S.A. (Banrisul)', true, NULL),
('047', 'Banco do Estado de Sergipe S.A. (Banese)', true, NULL),
('070', 'Banco de Brasília S.A. (BRB)', true, NULL),
('077', 'Banco Inter S.A.', true, NULL),
('102', 'XP Investimentos S.A.', true, NULL),
('104', 'Caixa Econômica Federal', true, NULL),
('184', 'Banco Itaú BBA S.A.', true, NULL),
('212', 'Banco Original S.A.', true, NULL),
('237', 'Banco Bradesco S.A.', true, NULL),
('260', 'Nu Pagamentos S.A. (Nubank)', true, NULL),
('290', 'Pagseguro Internet S.A.', true, NULL),
('323', 'Mercado Pago – Conta do Mercado Livre', true, NULL),
('336', 'Banco C6 S.A. (C6 Bank)', true, NULL),
('341', 'Itaú Unibanco S.A.', true, NULL),
('389', 'Banco Mercantil do Brasil S.A.', true, NULL),
('422', 'Banco Safra S.A.', true, NULL),
('453', 'Banco Rural S.A.', true, NULL),
('633', 'Banco Rendimento S.A.', true, NULL),
('652', 'Itaú Unibanco Holding S.A.', true, NULL),
('735', 'Neon Pagamentos S.A.', true, NULL),
('739', 'Banco Cetelem S.A.', true, NULL),
('756', 'Banco Cooperativo do Brasil S.A. (Bancoob/Sicoob)', true, NULL),
('380', 'PicPay Serviços S.A. (PicPay)', true, NULL),
('301', 'Dock IP S.A.', true, NULL),
('738', 'Swap Finance', true, NULL);

-- Fase 3.2: Inserir redes DeFi pré-definidas do sistema
INSERT INTO redes_crypto (codigo, nome, is_system, user_id) VALUES
('ERC20', 'Ethereum (ERC20)', true, NULL),
('BEP20', 'BNB Smart Chain (BEP20)', true, NULL),
('MATIC', 'Polygon (MATIC)', true, NULL),
('TRC20', 'Tron (TRC20)', true, NULL),
('SOL', 'Solana (SOL)', true, NULL),
('ARB', 'Arbitrum One', true, NULL),
('ADA', 'Cardano (ADA)', true, NULL),
('LTC', 'Litecoin (LTC)', true, NULL),
('DOGE', 'Dogecoin (DOGE)', true, NULL),
('BTC', 'Bitcoin', true, NULL);