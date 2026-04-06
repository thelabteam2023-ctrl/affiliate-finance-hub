ALTER TYPE solicitacao_tipo ADD VALUE IF NOT EXISTS 'deposito';
ALTER TYPE solicitacao_tipo ADD VALUE IF NOT EXISTS 'saque';
ALTER TYPE solicitacao_tipo ADD VALUE IF NOT EXISTS 'verificacao_conta';
ALTER TYPE solicitacao_tipo ADD VALUE IF NOT EXISTS 'verificacao_celular';
ALTER TYPE solicitacao_tipo ADD VALUE IF NOT EXISTS 'verificacao_facial';
ALTER TYPE solicitacao_tipo ADD VALUE IF NOT EXISTS 'contato_parceria';