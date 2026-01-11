-- 1. Adicionar campo para identificar ciclos criados automaticamente
ALTER TABLE projeto_ciclos 
ADD COLUMN IF NOT EXISTS auto_criado BOOLEAN DEFAULT false;

-- 2. Comentário para documentação
COMMENT ON COLUMN projeto_ciclos.gatilho_fechamento IS 'Motivo do encerramento: META (meta atingida) ou PRAZO (data limite expirou)';
COMMENT ON COLUMN projeto_ciclos.data_fechamento IS 'Timestamp real do momento do encerramento';
COMMENT ON COLUMN projeto_ciclos.auto_criado IS 'Indica se o ciclo foi criado automaticamente ao encerrar o anterior';

-- 3. Criar função para encerrar ciclo e criar próximo automaticamente
CREATE OR REPLACE FUNCTION public.encerrar_ciclo_e_criar_proximo(
  p_ciclo_id UUID,
  p_gatilho TEXT,
  p_excedente NUMERIC DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ciclo RECORD;
  v_novo_ciclo_id UUID;
  v_nova_data_inicio DATE;
  v_nova_data_fim DATE;
BEGIN
  -- Buscar dados do ciclo atual
  SELECT * INTO v_ciclo FROM projeto_ciclos WHERE id = p_ciclo_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ciclo não encontrado';
  END IF;
  
  IF v_ciclo.status = 'FECHADO' THEN
    RAISE EXCEPTION 'Ciclo já está fechado';
  END IF;
  
  -- Encerrar ciclo atual
  UPDATE projeto_ciclos
  SET 
    status = 'FECHADO',
    gatilho_fechamento = p_gatilho,
    data_fechamento = NOW(),
    data_fim_real = CURRENT_DATE,
    excedente_proximo = COALESCE(p_excedente, 0),
    updated_at = NOW()
  WHERE id = p_ciclo_id;
  
  -- Calcular datas do próximo ciclo
  v_nova_data_inicio := CURRENT_DATE + INTERVAL '1 day';
  
  -- Se tinha data limite, manter mesmo período
  IF v_ciclo.data_fim_prevista IS NOT NULL THEN
    v_nova_data_fim := v_nova_data_inicio + (v_ciclo.data_fim_prevista - v_ciclo.data_inicio);
  ELSE
    v_nova_data_fim := v_nova_data_inicio + INTERVAL '30 days';
  END IF;
  
  -- Criar próximo ciclo automaticamente
  INSERT INTO projeto_ciclos (
    user_id,
    workspace_id,
    projeto_id,
    operador_projeto_id,
    numero_ciclo,
    data_inicio,
    data_fim_prevista,
    tipo_gatilho,
    meta_volume,
    metrica_acumuladora,
    status,
    valor_acumulado,
    excedente_anterior,
    auto_criado
  ) VALUES (
    v_ciclo.user_id,
    v_ciclo.workspace_id,
    v_ciclo.projeto_id,
    v_ciclo.operador_projeto_id,
    v_ciclo.numero_ciclo + 1,
    v_nova_data_inicio,
    v_nova_data_fim,
    v_ciclo.tipo_gatilho,
    v_ciclo.meta_volume,
    v_ciclo.metrica_acumuladora,
    'EM_ANDAMENTO',
    COALESCE(p_excedente, 0), -- Excedente entra como valor inicial
    COALESCE(p_excedente, 0),
    true -- Marcado como auto-criado
  )
  RETURNING id INTO v_novo_ciclo_id;
  
  RETURN v_novo_ciclo_id;
END;
$$;

-- 4. Criar função para verificar e encerrar ciclos por prazo (para job diário)
CREATE OR REPLACE FUNCTION public.verificar_ciclos_vencidos()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ciclo RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Buscar ciclos TEMPO que venceram
  FOR v_ciclo IN 
    SELECT id 
    FROM projeto_ciclos 
    WHERE status = 'EM_ANDAMENTO'
      AND tipo_gatilho = 'TEMPO'
      AND data_fim_prevista < CURRENT_DATE
  LOOP
    PERFORM encerrar_ciclo_e_criar_proximo(v_ciclo.id, 'PRAZO', 0);
    v_count := v_count + 1;
  END LOOP;
  
  -- Buscar ciclos META com prazo que também venceram
  FOR v_ciclo IN 
    SELECT id 
    FROM projeto_ciclos 
    WHERE status = 'EM_ANDAMENTO'
      AND tipo_gatilho = 'META'
      AND data_fim_prevista IS NOT NULL
      AND data_fim_prevista < CURRENT_DATE
  LOOP
    PERFORM encerrar_ciclo_e_criar_proximo(v_ciclo.id, 'PRAZO', 0);
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$;