Proponho transformar os planos salvos de distribuição em uma navegação direta dentro do Planejamento de Campanhas, reduzindo o fluxo atual de abrir o select e escolher “Bônus Maio” toda vez.

## Modelo sugerido

Criar uma faixa de acesso rápido acima/ao lado do calendário com os planos salvos como subabas/chips clicáveis:

```text
Calendário Real | Calendário Simulado

[Sem plano] [Bônus Maio] [Bônus Junho] [VIP Maio] [+ Gerenciar]
```

Ao clicar em uma subaba de plano:
- O calendário continua no mesmo mês/ano atual.
- A lateral passa automaticamente para o modo daquele plano.
- Os filtros de CPF e grupo continuam disponíveis, mas como filtros secundários.
- O plano ativo fica visualmente destacado.
- O usuário não precisa abrir o select para acessar o plano salvo.

## Comportamento de UX

1. **Subabas de planos salvos**
   - Mostrar os planos retornados por `useDistribuicaoPlanos()` como botões horizontais.
   - Incluir sempre uma opção “Sem plano” para casas livres.
   - Se houver muitos planos, a lista será rolável horizontalmente para não quebrar o layout.

2. **Persistência da última visualização**
   - Salvar localmente o último plano aberto pelo usuário.
   - Quando ele voltar ao Planejamento de Campanhas, abrir direto no último plano selecionado, se ainda existir.
   - Se o plano tiver sido excluído, voltar para “Sem plano”.

3. **Menos peso na lateral**
   - O select atual de plano dentro da sidebar deixa de ser o caminho principal.
   - Podemos remover esse select ou mantê-lo como fallback compacto, mas a recomendação é remover para evitar duplicidade.
   - A sidebar fica focada em: progresso do plano, filtros por grupo/CPF, busca e lista de casas/células.

4. **Acesso ao Gerenciador de Recursos**
   - Manter o botão “Gerenciar recursos”.
   - Adicionar também um botão pequeno “Gerenciar” ao fim das subabas para o usuário chegar rapidamente onde cria/exclui planos.

## O que muda na prática

Hoje:
```text
Entrar no planejamento → abrir select → escolher Bônus Maio → visualizar células
```

Depois:
```text
Entrar no planejamento → clicar direto em Bônus Maio
```

Ou, se foi o último usado:
```text
Entrar no planejamento → Bônus Maio já abre automaticamente
```

## Ajustes técnicos previstos

Arquivos principais:
- `src/components/planejamento/PlanejamentoCalendario.tsx`
- Possivelmente criação de um componente pequeno, por exemplo `PlanejamentoPlanoTabs.tsx`, para manter o calendário mais organizado.

Implementação:
- Trocar a seleção principal baseada apenas no `<Select>` por uma navegação de botões/chips usando o mesmo estado `planoFiltroId`.
- Inicializar `planoFiltroId` a partir de `localStorage`, com validação contra a lista real de planos carregados.
- Persistir mudanças em uma chave local, por exemplo `planejamento:planoFiltroId`.
- Resetar `grupoFiltroId` e `cpfFiltroIdx` quando o usuário trocar de plano, mantendo o comportamento atual.
- Manter isolamento por workspace e sem alterar dados financeiros, apostas, registros ou estrutura de banco.

## Segurança e dados

Não é necessário alterar banco de dados para esse modelo.
A mudança é apenas de navegação/visualização no frontend.
Os dados continuam sendo carregados pelas queries existentes e filtrados pelo workspace atual.

## Resultado esperado

A tela passa a funcionar como uma central de planos salvos: o usuário visualiza rapidamente “Bônus Maio”, “Bônus Junho” ou qualquer distribuição criada, sem depender do select escondido na lateral e com menos cliques para chegar à operação desejada.