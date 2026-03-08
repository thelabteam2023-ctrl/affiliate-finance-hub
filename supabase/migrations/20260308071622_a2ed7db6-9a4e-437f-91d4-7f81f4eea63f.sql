ALTER TABLE public.projetos DROP CONSTRAINT projetos_tipo_projeto_check;

ALTER TABLE public.projetos ADD CONSTRAINT projetos_tipo_projeto_check CHECK (tipo_projeto IN ('INTERNO', 'BROKER', 'SUREBET', 'DUPLO_GREEN', 'VALUEBET', 'PUNTER', 'BONUS', 'CASHBACK', 'CPA', 'REVENUE_SHARE', 'PROMOCOES', 'OUTROS'));