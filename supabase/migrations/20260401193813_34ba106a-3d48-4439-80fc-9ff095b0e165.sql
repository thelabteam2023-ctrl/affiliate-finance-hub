
-- 1. Atualizar constraint com TODOS os tipos existentes + novo
ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_tipo_transacao_check;

ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_tipo_transacao_check CHECK (
  tipo_transacao = ANY (ARRAY[
    'DEPOSITO', 'SAQUE', 'TRANSFERENCIA', 'AJUSTE_MANUAL', 'AJUSTE_SALDO',
    'APOSTA_STAKE', 'APOSTA_GREEN', 'APOSTA_RED', 'APOSTA_MEIO_GREEN', 'APOSTA_MEIO_RED',
    'APOSTA_VOID', 'APOSTA_REEMBOLSO', 'APOSTA_REVERSAO',
    'FREEBET_CREDITADA', 'FREEBET_CONSUMIDA', 'FREEBET_EXPIRADA', 'FREEBET_ESTORNO', 'FREEBET_CONVERTIDA',
    'BONUS_CREDITADO', 'BONUS_ESTORNO',
    'CASHBACK_CREDITADO', 'CASHBACK_ESTORNO', 'CASHBACK_MANUAL', 'GIRO_GRATIS',
    'COMISSAO', 'DESPESA', 'RECEITA', 'INVESTIMENTO', 'RESGATE',
    'APORTE_FINANCEIRO', 'RETIRADA_FINANCEIRA',
    'PERDA_CAMBIAL', 'GANHO_CAMBIAL', 'TAXA_REDE',
    'AJUSTE_RECONCILIACAO',
    'PAGAMENTO_TITULAR', 'ESTORNO_PAGAMENTO_TITULAR',
    'SWAP_OUT', 'SWAP_IN',
    'REVERSAO_AUDITORIA',
    'ALOCACAO_FORNECEDOR', 'BONIFICACAO_ESTRATEGICA', 'COMISSAO_INDICADOR',
    'DEPOSITO_VIRTUAL', 'DESPESA_ADMINISTRATIVA', 'ESTORNO',
    'PAGTO_FORNECEDOR', 'PAGTO_OPERADOR', 'PAGTO_PARCEIRO',
    'PERDA_OPERACIONAL', 'PERDA_REVERSAO', 'RENOVACAO_PARCERIA', 'SAQUE_VIRTUAL'
  ])
);

-- 2. Marcar transação original como revertida
UPDATE public.cash_ledger
SET auditoria_metadata = jsonb_build_object(
  'revertido', true,
  'revertido_em', now(),
  'motivo', 'Transferência de wallet sem saldo - rede incorreta',
  'tipo_reversao', 'REVERSAO_AUDITORIA'
)
WHERE id = 'a701f555-a0ef-4837-b386-5adbefd3ef74';

-- 3. Inserir lançamento de reversão
INSERT INTO public.cash_ledger (
  tipo_transacao, tipo_moeda, coin, qtd_coin, valor, moeda, status, transit_status,
  destino_wallet_id, origem_wallet_id,
  valor_origem, valor_destino,
  moeda_origem, moeda_destino,
  descricao, workspace_id, user_id, data_transacao,
  auditoria_metadata
)
SELECT
  'REVERSAO_AUDITORIA',
  cl.tipo_moeda,
  cl.coin,
  cl.qtd_coin,
  cl.valor,
  cl.moeda,
  'CONFIRMADO',
  'CONFIRMED',
  cl.origem_wallet_id,
  cl.destino_wallet_id,
  cl.valor_destino,
  cl.valor_origem,
  cl.moeda_destino,
  cl.moeda_origem,
  'REVERSAO_AUDITORIA: Desfazendo transferência de wallet sem saldo (rede incorreta)',
  cl.workspace_id,
  cl.user_id,
  now()::date,
  jsonb_build_object(
    'transacao_original_id', cl.id,
    'motivo', 'Wallet de origem não possuía saldo - operação em rede incorreta',
    'tipo', 'REVERSAO_AUDITORIA'
  )
FROM public.cash_ledger cl
WHERE cl.id = 'a701f555-a0ef-4837-b386-5adbefd3ef74';

-- 4. GUARD TRIGGER
CREATE OR REPLACE FUNCTION public.guard_wallet_debit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_saldo_coin numeric;
  v_wallet_network text;
  v_dest_wallet_network text;
BEGIN
  IF NEW.origem_wallet_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status != 'CONFIRMADO' THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo_transacao IN ('REVERSAO_AUDITORIA', 'AJUSTE_RECONCILIACAO', 'AJUSTE_MANUAL', 'AJUSTE_SALDO') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN cl.destino_wallet_id = NEW.origem_wallet_id AND cl.status = 'CONFIRMADO' AND cl.transit_status = 'CONFIRMED'
        THEN cl.qtd_coin
      WHEN cl.origem_wallet_id = NEW.origem_wallet_id AND cl.status = 'CONFIRMADO' AND cl.transit_status = 'CONFIRMED'
        THEN -cl.qtd_coin
      ELSE 0
    END
  ), 0) INTO v_saldo_coin
  FROM public.cash_ledger cl
  WHERE (cl.destino_wallet_id = NEW.origem_wallet_id OR cl.origem_wallet_id = NEW.origem_wallet_id)
    AND cl.coin = NEW.coin;

  IF v_saldo_coin < COALESCE(NEW.qtd_coin, 0) THEN
    RAISE EXCEPTION 'Saldo insuficiente na wallet. Disponível: % %, Solicitado: % %',
      v_saldo_coin, NEW.coin, NEW.qtd_coin, NEW.coin;
  END IF;

  IF NEW.destino_wallet_id IS NOT NULL AND NEW.tipo_transacao = 'TRANSFERENCIA' THEN
    SELECT wc.network INTO v_wallet_network
    FROM public.wallets_crypto wc WHERE wc.id = NEW.origem_wallet_id;

    SELECT wc.network INTO v_dest_wallet_network
    FROM public.wallets_crypto wc WHERE wc.id = NEW.destino_wallet_id;

    IF v_wallet_network IS NOT NULL AND v_dest_wallet_network IS NOT NULL
       AND v_wallet_network != v_dest_wallet_network THEN
      RAISE EXCEPTION 'Rede incompatível entre origem (%) e destino (%). Transferências devem usar a mesma rede.',
        v_wallet_network, v_dest_wallet_network;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_wallet_debit ON public.cash_ledger;
CREATE TRIGGER trg_guard_wallet_debit
  BEFORE INSERT ON public.cash_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_wallet_debit();
