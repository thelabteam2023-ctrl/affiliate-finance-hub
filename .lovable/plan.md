
# Plano: Revincular Sportmarket ao Projeto Teste Crypto

## Ação Única

Restaurar o vínculo da casa **Sportmarket** (parceiro Luiz Felipe) ao projeto **Teste Crypto**.

## Dados Identificados

| Campo | Valor |
|-------|-------|
| Casa | Sportmarket |
| Parceiro | Luiz Felipe |
| Bookmaker ID | `418afad2-6233-4d34-a08b-1817f9e9902b` |
| Projeto Destino | Teste Crypto |
| Projeto ID | `9b39ca42-bccc-42dd-b78e-7d8fe37161b6` |
| Moeda | MYR (Ringgit Malaio) |
| Saldo Atual | 600.00 MYR |

## Operação

Executar UPDATE na tabela `bookmakers` para definir o `projeto_id` da casa identificada.

```sql
UPDATE bookmakers 
SET projeto_id = '9b39ca42-bccc-42dd-b78e-7d8fe37161b6'
WHERE id = '418afad2-6233-4d34-a08b-1817f9e9902b'
```

## Resultado Esperado

Após a execução, a Sportmarket do Luiz Felipe estará novamente visível na aba **Vínculos** do projeto Teste Crypto, permitindo que você realize o teste de desvinculação com as novas opções implementadas (Liberar mantendo saldo vs Liberar e sacar).
