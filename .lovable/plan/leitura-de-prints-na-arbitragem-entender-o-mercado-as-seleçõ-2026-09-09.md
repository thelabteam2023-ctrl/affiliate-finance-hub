# Leitura de prints na arbitragem: entender o mercado, as seleções e os horários

## O que está acontecendo hoje (verificado no código)

1. **O horário do evento nunca chega ao formulário.** O print é lido e a data/hora até é extraída, mas na arbitragem essa informação não é repassada para o campo Data/Hora — nenhum componente da tela de arbitragem lê esse dado. Por isso o formulário fica com o horário atual (01:53 no print) em vez do horário do jogo (07:30).
2. **Existe um único campo de horário.** A leitura devolve apenas "dataHora", sem separar "horário em que a aposta foi feita", "início do evento" e "liquidação". Quando o bilhete traz dois horários, não há critério para escolher.
3. **As pernas complementares saem erradas.** Ao identificar Resultado da Partida, o preenchimento assume que a perna 1 é sempre a casa, a 2 o empate e a 3 o visitante. Se o print foi colado na perna 1 mas a seleção era Empate, o sistema repete "Empate" na perna 2 e deixa a casa de fora — foi o que gerou a perna 3 vazia ("Fora") na sua tela.
4. **Times reconhecidos por comparação de texto crua.** A comparação usa "contém" entre a seleção e o nome do time, sem normalizar acentos, abreviações, "FC/SC/Sub-20/Feminino". Basta o nome vir escrito diferente para nada ser reconhecido.
5. **O mercado é classificado a partir do texto bruto e de um contexto desatualizado.** A classificação recebe o texto original (não o normalizado) e um mercado guardado que ainda não foi atualizado no momento da leitura, o que faz o mesmo print ser interpretado de formas diferentes conforme a ordem em que os prints são colados.

## O que será feito

### 1. Camada de interpretação (nova)
Criar um estágio intermediário entre a leitura da imagem e o preenchimento do formulário, com campos separados para: casa de apostas, esporte, competição, mandante, visitante, mercado bruto, mercado normalizado, seleção bruta, seleção normalizada, horário do evento, horário da aposta, horário de liquidação, odd, stake, confiança e origem de cada campo (extraído / normalizado / inferido / confirmado). Nada é gravado no formulário sem passar por essa camada.

### 2. Normalização de mercados
Tabela única de sinônimos que converte as variações ("Match Result", "Resultado da partida", "Resultado final", "1X2", "FT Result", "Casa/Empate/Fora", "Mandante/Empate/Visitante") para MATCH_RESULT_1X2, mantendo separados DOUBLE_CHANCE, DRAW_NO_BET, CORRECT_SCORE, HALF_TIME_RESULT, SECOND_HALF_RESULT, TO_QUALIFY, WINNER, BTTS, TOTAL_GOALS, HANDICAP e ASIAN_HANDICAP. Regra de prioridade mantida: se houver indicação de período (tempo, quarto, set, entrada), o mercado é do período, nunca do jogo inteiro. A classificação passa a usar o texto já normalizado, não o bruto.

### 3. Preenchimento correto das três pernas
- Descobrir em qual das três posições (casa, empate, visitante) está a seleção do print.
- Distribuir as outras duas posições nas pernas restantes, na ordem em que estiverem livres — nunca repetindo a seleção já lida.
- Só preencher pernas vazias; nada que o usuário digitou é sobrescrito sem confirmação.
- Nunca inventar odd, stake ou casa de apostas para as outras pernas.
- Comparação de nomes de times com normalização (acentos, maiúsculas, sufixos como FC/SC/CF, "Feminino", "Sub-20", apelidos), com limiar mínimo de semelhança; abaixo do limiar, o sistema sugere em vez de preencher.

### 4. Horários com contexto
- A leitura passa a devolver até três horários rotulados, cada um com o texto que o acompanhava no print ("Kickoff", "Starts at", "Início", "Bet placed", "Aposta feita", "Liquidado em").
- Hierarquia de escolha: rótulo explícito de início do evento > horário no cartão do evento > rótulo de aposta feita > comparação temporal > horário solto.
- O horário atual é apenas sinal auxiliar: horário futuro não é automaticamente o jogo, horário passado não é automaticamente a aposta.
- Formatos suportados: 24h, AM/PM, 14h30, 14.30, com e sem data, "hoje/amanhã", data completa e data sem ano (assume o ano corrente).
- Uma data já preenchida no formulário nunca é trocada em silêncio.

### 5. Transparência e confirmação
- Confiança alta: preenche e destaca o que veio do print.
- Confiança média: preenche como sugestão, marcada visualmente, com opção de aceitar ou descartar.
- Confiança baixa ou ambiguidade entre dois horários: não grava; mostra as opções e pede confirmação, com mensagem do tipo "Foram identificados dois horários: 01:57 (registro da aposta) e 07:30 (início do jogo). Usar 07:30?".

### 6. Vários prints do mesmo evento
Ao colar prints em pernas diferentes, o sistema compara evento, mercado e seleções: mantém o que for consistente, e sinaliza divergência (evento diferente, mercado diferente, seleção repetida em duas pernas) em vez de sobrescrever.

## Testes

- Prints de Resultado da Partida com a seleção sendo casa, empate e visitante, colados em cada uma das três pernas.
- Nomenclaturas variadas do mesmo mercado, em português e inglês.
- Distinção entre Resultado da Partida e placar exato, dupla chance, resultado do 1º tempo, handicap, total de gols.
- Bilhete com um, dois e três horários; sem horário; com AM/PM; com data completa; sem ano; com evento no passado.
- Print colado sobre campos já preenchidos manualmente (nada pode ser sobrescrito).
- Prints em 2, 3 e 4+ pernas, verificando que nenhuma seleção se repete e que nenhuma odd/casa é inventada.
- Regressão automatizada dos módulos de normalização de mercado, de nomes de times e de escolha de horário, mais verificação do build.

## Detalhes técnicos

- Frontend: `src/hooks/useSurebetPrintImport.ts` (distribuição por posição, correção do contexto desatualizado, uso dos dados normalizados), `src/lib/marketNormalizer.ts` e `src/lib/ocrNormalization.ts` (tabela de sinônimos e saída estruturada), novo módulo de resolução de horário e novo módulo de normalização de nomes de times.
- Formulário de arbitragem (`SurebetDialog` / `SurebetModalRoot` / `SurebetTableRow`): passa a consumir o horário de evento resolvido e os indicadores de confiança por campo.
- Backend de leitura: `supabase/functions/parse-betting-slip/index.ts` passa a retornar `eventStartsAt`, `betPlacedAt`, `settledAt` (com o rótulo textual de cada um) além do campo atual, mantendo compatibilidade com os fluxos de aposta simples e múltipla.
- Nenhuma regra financeira, de saldo ou de liquidação é alterada.
