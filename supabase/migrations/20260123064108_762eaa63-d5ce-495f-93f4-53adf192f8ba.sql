-- Primeiro remover a constraint existente (se houver)
ALTER TABLE public.projetos DROP CONSTRAINT IF EXISTS projetos_tipo_projeto_check;

-- Atualizar todos os projetos com INTERNO para OUTROS (valor padrão válido)
UPDATE public.projetos SET tipo_projeto = 'OUTROS' WHERE tipo_projeto NOT IN ('SUREBET', 'DUPLO_GREEN', 'VALUEBET', 'PUNTER', 'BONUS', 'CASHBACK', 'OUTROS');

-- Agora sim adicionar a constraint
ALTER TABLE public.projetos ADD CONSTRAINT projetos_tipo_projeto_check 
CHECK (tipo_projeto IN ('SUREBET', 'DUPLO_GREEN', 'VALUEBET', 'PUNTER', 'BONUS', 'CASHBACK', 'OUTROS'));