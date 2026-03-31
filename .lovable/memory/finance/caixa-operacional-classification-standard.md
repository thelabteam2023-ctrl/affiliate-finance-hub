# Memory: finance/caixa-operacional-classification-standard
Updated: 2026-03-31

As classificações financeiras (categorias de despesa) são preservadas integralmente entre o dashboard e a Caixa Operacional. O sistema utiliza uma lógica de mapeamento hierárquico com 4 níveis de resolução:

## Hierarquia de Resolução de Categoria (Prioridade)

1. **`auditoria_metadata.grupo`** — Registros novos armazenam o grupo diretamente no metadata do cash_ledger
2. **Parsing da descrição** — Extrai categoria do formato `"Despesa administrativa - CATEGORIA: detalhe"`
3. **Lookup por descrição** — Busca na tabela `despesas_administrativas` pela descrição do detalhe
4. **Lookup por valor+data** — Chave composta `{valor}_{data_despesa}` como fallback para registros legados sem categoria na descrição

## Causa Raiz Corrigida (2026-03-31)

Registros anteriores à correção salvavam descrições sem a categoria (ex: `"Despesa administrativa - : detalhe"` ou `"Despesa administrativa - "`). A tabela `despesas_administrativas` contém o `grupo` correto mas não havia link (`referencia_transacao_id` é NULL). A solução implementa lookup por valor+data como fallback, e novos registros salvam `grupo` em `auditoria_metadata`.
