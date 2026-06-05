-- 1. Atualizar a constraint de check para permitir AJUSTE_NEGATIVO e AJUSTE_POSITIVO
ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_tipo_transacao_check;
ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_tipo_transacao_check 
CHECK (tipo_transacao = ANY (ARRAY[
  'DEPOSITO', 'SAQUE', 'TRANSFERENCIA', 'AJUSTE_MANUAL', 'AJUSTE_SALDO', 
  'APOSTA_STAKE', 'APOSTA_GREEN', 'APOSTA_RED', 'APOSTA_MEIO_GREEN', 'APOSTA_MEIO_RED', 
  'APOSTA_VOID', 'APOSTA_REEMBOLSO', 'APOSTA_REVERSAO', 'FREEBET_CREDITADA', 
  'FREEBET_CONSUMIDA', 'FREEBET_EXPIRADA', 'FREEBET_ESTORNO', 'FREEBET_CONVERTIDA', 
  'BONUS_CREDITADO', 'BONUS_ESTORNO', 'CASHBACK_CREDITADO', 'CASHBACK_ESTORNO', 
  'CASHBACK_MANUAL', 'GIRO_GRATIS', 'GIRO_GRATIS_ESTORNO', 'COMISSAO', 'DESPESA', 
  'RECEITA', 'INVESTIMENTO', 'RESGATE', 'APORTE_FINANCEIRO', 'RETIRADA_FINANCEIRA', 
  'PERDA_CAMBIAL', 'GANHO_CAMBIAL', 'TAXA_REDE', 'AJUSTE_RECONCILIACAO', 
  'PAGAMENTO_TITULAR', 'ESTORNO_PAGAMENTO_TITULAR', 'SWAP_OUT', 'SWAP_IN', 
  'REVERSAO_AUDITORIA', 'ALOCACAO_FORNECEDOR', 'BONIFICACAO_ESTRATEGICA', 
  'COMISSAO_INDICADOR', 'DEPOSITO_VIRTUAL', 'DESPESA_ADMINISTRATIVA', 'ESTORNO', 
  'PAGTO_FORNECEDOR', 'PAGTO_OPERADOR', 'PAGTO_PARCEIRO', 'PERDA_OPERACIONAL', 
  'PERDA_REVERSAO', 'RENOVACAO_PARCERIA', 'SAQUE_VIRTUAL', 'AJUSTE_NEGATIVO', 'AJUSTE_POSITIVO'
]));

-- 2. Atualizar o trigger para suportar os novos tipos e mapear para eventos financeiros
CREATE OR REPLACE FUNCTION public.fn_cash_ledger_generate_financial_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bookmaker_id UUID;
  v_valor NUMERIC(15,2);
  v_tipo_evento TEXT;
  v_tipo_uso TEXT := 'NORMAL';
  v_descricao TEXT;
  v_idempotency_key TEXT;
  v_allow_negative BOOLEAN := false;
  v_event_scope TEXT := 'REAL';
BEGIN
  -- Ignorar se já processado ou se não confirmado
  IF NEW.financial_events_generated = TRUE OR NEW.status NOT IN ('CONFIRMADO') THEN
    RETURN NEW;
  END IF;

  -- Eventos de Câmbio (FX)
  IF NEW.tipo_transacao IN ('GANHO_CAMBIAL', 'PERDA_CAMBIAL') THEN
    v_bookmaker_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
    IF v_bookmaker_id IS NULL THEN
      NEW.financial_events_generated := TRUE;
      RETURN NEW;
    END IF;

    v_tipo_evento := 'AJUSTE';
    v_allow_negative := true;
    
    IF NEW.tipo_transacao = 'GANHO_CAMBIAL' THEN
      v_valor := ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Ganho cambial #' || NEW.id);
      v_idempotency_key := 'ledger_ganho_cambial_' || NEW.id;
    ELSE
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Perda cambial #' || NEW.id);
      v_idempotency_key := 'ledger_perda_cambial_' || NEW.id;
    END IF;

    INSERT INTO financial_events (
      id, bookmaker_id, workspace_id, created_by,
      tipo_evento, tipo_uso, valor, moeda,
      idempotency_key, descricao, metadata, processed_at,
      allow_negative, event_scope
    ) VALUES (
      gen_random_uuid(), v_bookmaker_id, NEW.workspace_id, NEW.user_id,
      v_tipo_evento, v_tipo_uso, v_valor, NEW.moeda,
      v_idempotency_key, v_descricao,
      jsonb_build_object('ledger_id', NEW.id, 'tipo_fx', NEW.tipo_transacao),
      now(), v_allow_negative, 'REAL'::event_scope
    );

    NEW.financial_events_generated := TRUE;
    RETURN NEW;
  END IF;

  -- Identificar Bookmaker
  v_bookmaker_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
  
  -- Se não houver bookmaker envolvido, não geramos evento financeiro (ex: transação entre bancos)
  IF v_bookmaker_id IS NULL THEN
    NEW.financial_events_generated := TRUE;
    RETURN NEW;
  END IF;

  CASE NEW.tipo_transacao
    WHEN 'DEPOSITO' THEN
      v_tipo_evento := 'DEPOSITO';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Depósito via cash_ledger #' || NEW.id);
      v_idempotency_key := 'ledger_deposit_' || NEW.id;

    WHEN 'SAQUE' THEN
      v_tipo_evento := 'SAQUE';
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Saque via cash_ledger #' || NEW.id);
      v_idempotency_key := 'ledger_saque_' || NEW.id;
      v_allow_negative := true;

    WHEN 'DEPOSITO_VIRTUAL' THEN
      v_tipo_evento := 'DEPOSITO';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Depósito virtual (vínculo) #' || NEW.id);
      v_idempotency_key := 'ledger_dep_virtual_' || NEW.id;
      v_event_scope := 'VIRTUAL';

    WHEN 'SAQUE_VIRTUAL' THEN
      v_tipo_evento := 'SAQUE';
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Saque virtual (desvínculo) #' || NEW.id);
      v_idempotency_key := 'ledger_saque_virtual_' || NEW.id;
      v_event_scope := 'VIRTUAL';
      v_allow_negative := true;

    WHEN 'TRANSFERENCIA' THEN
      -- Transferência já insere diretamente os eventos para origem/destino se forem bookmakers
      IF NEW.origem_bookmaker_id IS NOT NULL THEN
        INSERT INTO financial_events (
          id, bookmaker_id, workspace_id, created_by,
          tipo_evento, tipo_uso, valor, moeda,
          idempotency_key, descricao, metadata, processed_at,
          allow_negative, event_scope
        ) VALUES (
          gen_random_uuid(), NEW.origem_bookmaker_id, NEW.workspace_id, NEW.user_id,
          'TRANSFERENCIA_SAIDA', 'NORMAL', -1 * ABS(NEW.valor), NEW.moeda,
          'ledger_transfer_out_' || NEW.id,
          COALESCE(NEW.descricao, 'Transferência saída #' || NEW.id),
          jsonb_build_object('ledger_id', NEW.id), now(),
          true, 'REAL'::event_scope
        );
      END IF;
      IF NEW.destino_bookmaker_id IS NOT NULL THEN
        INSERT INTO financial_events (
          id, bookmaker_id, workspace_id, created_by,
          tipo_evento, tipo_uso, valor, moeda,
          idempotency_key, descricao, metadata, processed_at,
          allow_negative, event_scope
        ) VALUES (
          gen_random_uuid(), NEW.destino_bookmaker_id, NEW.workspace_id, NEW.user_id,
          'TRANSFERENCIA_ENTRADA', 'NORMAL', ABS(COALESCE(NEW.valor_destino, NEW.valor)),
          COALESCE(NEW.moeda_destino, NEW.moeda),
          'ledger_transfer_in_' || NEW.id,
          COALESCE(NEW.descricao, 'Transferência entrada #' || NEW.id),
          jsonb_build_object('ledger_id', NEW.id), now(),
          false, 'REAL'::event_scope
        );
      END IF;
      NEW.financial_events_generated := TRUE;
      RETURN NEW;

    WHEN 'AJUSTE_SALDO', 'AJUSTE_RECONCILIACAO', 'AJUSTE_MANUAL', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO' THEN
      v_tipo_evento := 'AJUSTE';
      v_valor := CASE 
        WHEN NEW.ajuste_direcao = 'SAIDA' OR NEW.tipo_transacao = 'AJUSTE_NEGATIVO' THEN -1 * ABS(NEW.valor)
        ELSE ABS(NEW.valor)
      END;
      v_descricao := COALESCE(NEW.descricao, 'Ajuste manual #' || NEW.id);
      v_idempotency_key := 'ledger_ajuste_' || NEW.id;
      v_allow_negative := true;

    WHEN 'BONUS_CREDITADO' THEN
      v_tipo_evento := 'BONUS';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Crédito de bônus #' || NEW.id);
      v_idempotency_key := 'ledger_bonus_' || NEW.id;

    WHEN 'BONUS_ESTORNO' THEN
      v_tipo_evento := 'BONUS_ESTORNO';
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Estorno de bônus #' || NEW.id);
      v_idempotency_key := 'ledger_bonus_estorno_' || NEW.id;
      v_allow_negative := true;

    WHEN 'PERDA_OPERACIONAL' THEN
      v_tipo_evento := 'PERDA_OPERACIONAL';
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Perda operacional #' || NEW.id);
      v_idempotency_key := 'ledger_perda_op_' || NEW.id;
      v_allow_negative := true;

    WHEN 'PERDA_REVERSAO' THEN
      v_tipo_evento := 'PERDA_REVERSAO';
      v_valor := ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Reversão de perda #' || NEW.id);
      v_idempotency_key := 'ledger_perda_rev_' || NEW.id;

    WHEN 'GIRO_GRATIS' THEN
      v_tipo_evento := 'GIRO_GRATIS';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Giro grátis #' || NEW.id);
      v_idempotency_key := 'ledger_giro_' || NEW.id;

    WHEN 'GIRO_GRATIS_ESTORNO' THEN
      v_tipo_evento := 'GIRO_GRATIS_ESTORNO';
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Estorno de giro grátis #' || NEW.id);
      v_idempotency_key := 'ledger_giro_estorno_' || NEW.id;
      v_allow_negative := true;

    WHEN 'CASHBACK', 'CASHBACK_MANUAL' THEN
      v_tipo_evento := 'CASHBACK';
      v_valor := NEW.valor;
      v_descricao := COALESCE(NEW.descricao, 'Cashback #' || NEW.id);
      v_idempotency_key := 'ledger_cashback_' || NEW.id;

    WHEN 'CASHBACK_ESTORNO' THEN
      v_tipo_evento := 'CASHBACK_ESTORNO';
      v_valor := -1 * ABS(NEW.valor);
      v_descricao := COALESCE(NEW.descricao, 'Estorno de cashback #' || NEW.id);
      v_idempotency_key := 'ledger_cashback_estorno_' || NEW.id;
      v_allow_negative := true;

    ELSE
      -- Em vez de lançar exceção, apenas marcamos como processado para evitar travar o sistema
      -- Mas logamos o erro se possível (audit_logs seria melhor)
      NEW.financial_events_generated := TRUE;
      RETURN NEW;
  END CASE;

  -- Inserir evento financeiro final
  INSERT INTO financial_events (
    id, bookmaker_id, workspace_id, created_by,
    tipo_evento, tipo_uso, valor, moeda,
    idempotency_key, descricao, metadata, processed_at,
    allow_negative, event_scope
  ) VALUES (
    gen_random_uuid(), v_bookmaker_id, NEW.workspace_id, NEW.user_id,
    v_tipo_evento, v_tipo_uso, v_valor, NEW.moeda,
    v_idempotency_key, v_descricao,
    jsonb_build_object('ledger_id', NEW.id, 'auto_generated', true), 
    now(), v_allow_negative, v_event_scope::event_scope
  );

  NEW.financial_events_generated := TRUE;
  RETURN NEW;
END;
$function$
;