UPDATE public.solicitacoes SET tipo = 'verificacao_kyc' WHERE tipo IN ('verificacao_conta', 'verificacao_facial');
UPDATE public.solicitacoes SET tipo = 'verificacao_sms_email' WHERE tipo = 'verificacao_celular';
UPDATE public.solicitacoes SET tipo = 'outros' WHERE tipo = 'transferencia';