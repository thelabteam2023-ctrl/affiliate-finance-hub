UPDATE public.projeto_bookmaker_historico
   SET data_desvinculacao = now(),
       status_final = 'ativo'
 WHERE projeto_id = '80d16390-22a0-4995-843a-3b076d33d8fe'
   AND data_desvinculacao IS NULL;