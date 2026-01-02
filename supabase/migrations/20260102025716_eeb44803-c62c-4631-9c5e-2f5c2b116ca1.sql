
-- Remove a constraint antiga e adiciona uma nova com ARQUIVADO
ALTER TABLE projetos DROP CONSTRAINT projetos_status_check;

ALTER TABLE projetos ADD CONSTRAINT projetos_status_check 
CHECK (status = ANY (ARRAY['PLANEJADO'::text, 'EM_ANDAMENTO'::text, 'PAUSADO'::text, 'FINALIZADO'::text, 'ARQUIVADO'::text]));
