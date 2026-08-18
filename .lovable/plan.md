# Plano de Melhoria Visual: Instrumentos Financeiros no Histórico do Caixa

Este plano detalha a implementação da exibição visual de instrumentos financeiros (Wallets Cripto e Contas Bancárias) no histórico de movimentações do Caixa Operacional, permitindo uma rastreabilidade imediata sem a necessidade de abrir detalhes da transação.

## Objetivo
Transformar a visualização simples "Quem → Quem" em uma visualização enriquecida "Quem (Instrumento A) → Quem (Instrumento B)", com suporte a cópia rápida de endereços cripto e identificação clara de redes e bancos.

## Alterações Propostas

### 1. Frontend: Componentes de UI
- **Refatoração do `getOrigemInfo` e `getDestinoInfo` em `Caixa.tsx`**:
  - Expandir o objeto de retorno para incluir `instrumento` (tipo, endereço/conta, rede/banco, pix).
  - Integrar metadados de wallets e contas bancárias já disponíveis no estado.
- **Criação de Sub-componente `InstrumentoDisplay` em `HistoricoMovimentacoes.tsx`**:
  - Exibir o ícone do instrumento (Wallet, Banco, Pix).
  - Exibir o endereço cripto abreviado com botão de cópia (usando `copy-to-clipboard`).
  - Exibir detalhes bancários (Banco, Agência/Conta mascarados).
  - Garantir hierarquia visual (texto menor, cor suave) abaixo do nome principal.

### 2. Lógica de Identificação
- **Detecção Automática**:
  - Se `origem_wallet_id` ou `destino_wallet_id` estiver presente: buscar em `walletsDetalhes` para obter `endereco`, `network` e `exchange`.
  - Se `origem_conta_bancaria_id` ou `destino_conta_bancaria_id` estiver presente: buscar em `contasBancarias` para obter `banco`, `agencia`, `conta` e `pix`.
- **Formatação**:
  - Usar `truncateAddress` para cripto.
  - Usar `formatNetworkName` para redes.

## Regras de Comportamento
- **Hierarquia Visual**: O nome da pessoa/entidade permanece em destaque. O instrumento aparece abaixo em cinza/faint.
- **Segurança**: Contas bancárias exibem apenas os últimos 4 dígitos. Chaves Pix serão parcialmente mascaradas.
- **Fallback**: Se nenhum instrumento for identificado em uma transferência, manter a visualização atual (sem criar ruído visual desnecessário).

## Detalhes Técnicos
- **Arquivos afetados**:
  - `src/pages/Caixa.tsx`: Atualização da lógica de extração de metadados das transações.
  - `src/components/caixa/HistoricoMovimentacoes.tsx`: Implementação da renderização visual no loop do histórico.
- **Nenhuma alteração de Banco de Dados ou RLS é necessária**, pois os campos já existem na tabela `cash_ledger` e os dados relacionados já são carregados no componente pai.
