UPDATE public.projeto_bookmaker_historico
SET data_desvinculacao = '2026-06-23 12:00:00+00'::timestamptz
WHERE projeto_id = 'a55c6329-d75e-400d-a549-7abea71f68e1'
  AND bookmaker_id IN (
    'db0f3229-bd41-4cb7-ae8c-9cd5b86e1d3a',
    '072ddbd3-fd0c-476e-a37c-d892714a6bd8',
    '2c3cb3cf-f747-4011-8006-7a0201179839',
    '3ee6c43f-14f7-431d-b4c1-bc08f043927b',
    'd5c62d03-59fc-4130-8c87-051501abb705'
  );