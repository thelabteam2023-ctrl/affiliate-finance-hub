Plano para melhorar a visualização mobile da aba Vínculos

Objetivo
- Manter a linha da bookmaker enxuta no mobile, mas permitir acesso completo às informações e botões através de um modal de detalhes.
- Preservar a visualização atual em telas maiores, onde já há espaço para exibir tudo na própria linha.

Mudanças propostas

1. Criar ação “Detalhes” na linha mobile
- Na lista de vínculos, em telas pequenas, a linha ficará mais limpa.
- Adicionar um botão/área de toque “Ver detalhes” ou ícone de expansão na linha da bookmaker.
- Ao tocar, abrir um modal com todas as informações daquela bookmaker.

2. Modal completo da bookmaker
O modal exibirá, de forma organizada:
- Logo, nome da casa, login/usuário e parceiro/investidor.
- Status da conta: Ativo, Limitada ou outro status existente.
- Moeda da conta e informação de cotação quando for moeda estrangeira.
- Total de apostas.
- Saldos completos:
  - Saldo Operável
  - Em Aposta
  - Disponível
  - Saldo Real
  - Freebet
  - Bônus
  - Em Saque, quando existir
  - Conversão aproximada para a moeda de consolidação do projeto, quando aplicável.
- Credenciais de acesso, mantendo o comportamento atual de revelar/copiar senha somente pelo fluxo já existente.
- Alerta de conciliação pendente, quando existir.

3. Botões dentro do modal
Adicionar no modal os mesmos botões importantes que hoje ficam comprimidos na linha:
- Bônus
- Depósito
- Saque
- Alterar status
- Ajustar saldo
- Liberar/conciliar vínculo

As mesmas regras atuais serão mantidas:
- Depósito/Saque não aparecem quando o vínculo é de investidor, como já ocorre hoje.
- Alterar status continuará usando o mesmo fluxo atual.
- Ajuste, bônus e conciliação continuarão abrindo os diálogos existentes.

4. Ajustar responsividade da lista
- Em mobile, ocultar ou reduzir colunas que hoje causam perda de informação visual.
- Mostrar apenas o resumo essencial na linha: logo, nome, parceiro/login, status/moeda e talvez saldo principal compacto.
- O modal passa a ser a “ficha completa” da conta.
- Em desktop/tablet maior, preservar a experiência atual com a linha completa.

5. Fechamento e integração com os diálogos existentes
- Ao clicar em uma ação dentro do modal que abre outro diálogo, fechar ou manter o modal de forma controlada para evitar sobreposição confusa.
- Reutilizar os estados e handlers existentes em `ProjetoVinculosTab.tsx`, sem alterar regras financeiras nem consultas.

Detalhes técnicos
- Arquivo principal: `src/components/projeto-detalhe/ProjetoVinculosTab.tsx`.
- Reutilizar o componente `Dialog` já existente do projeto.
- Reutilizar `SaldoOperavelDisplay`, `LazyPasswordField`, `getStatusBadge`, `handleOpenBonusDrawer`, `handleChangeStatus`, `setTransacaoContext`, `setAjusteSaldoDialogOpen` e `setConciliacaoDialogOpen`.
- Não haverá mudança de banco de dados, RPCs, saldos ou fórmulas financeiras.
- A alteração será apenas de interface/responsividade.

Resultado esperado
- No mobile, a aba Vínculos ficará mais limpa e fácil de navegar.
- O usuário conseguirá acessar todas as informações e ações da bookmaker sem depender de uma linha horizontal apertada.
- Em telas grandes, a experiência atual permanece estável.