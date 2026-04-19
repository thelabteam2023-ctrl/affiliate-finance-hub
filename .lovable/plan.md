# Distribuidor de Casas por CPF

Implementado em `/bookmakers` → aba **Distribuição**.

## Modelo
- Grupos de casas continuam neutros (reusa `bookmaker_grupos` + `bookmaker_grupo_membros`)
- Regras vivem por plano: para cada grupo selecionado, escolhe-se (a) regra de distribuição entre CPFs e (b) regra de uso de IP entre casas

## Tabelas
- `distribuicao_planos` — cabeçalho do plano (nome, perfis)
- `distribuicao_plano_grupos` — config por grupo (regra_casa, regra_ip, casas_por_cpf)
- `distribuicao_plano_celulas` — matriz CPF × Casa + slot de IP

## Regras de distribuição (por grupo)
- REPETIR_LIVRE — mesma casa pra todos os CPFs
- NAO_REPETIR_NO_CPF — N casas distintas por CPF; pode repetir entre CPFs
- RODIZIO_ENTRE_CPFS — só repete entre CPFs depois de esgotar o grupo

## Regras de IP (por grupo)
- IP_COMPARTILHADO_GRUPO — mesmo IP do CPF para todas as casas do grupo
- IP_UNICO_POR_CASA — cada casa do grupo no mesmo CPF exige IP diferente

## Próximos passos (não implementados)
- Listagem/edição de planos salvos
- Travar células manualmente + rebalanceamento
- Aplicar plano no calendário (criar campanhas)
