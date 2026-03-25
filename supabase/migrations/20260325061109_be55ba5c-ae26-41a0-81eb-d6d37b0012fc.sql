
DO $$
DECLARE
  v_supplier_ws uuid := '479cb912-8583-444f-aed4-5e7a97eb59a1';
  v_fornecedor_id uuid := 'db294002-8fcc-401a-9dae-55dec730f9d1';
  v_titular_id uuid;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT p.id as parceiro_id, p.nome, p.cpf, p.email, p.telefone
    FROM parcerias pa
    JOIN parceiros p ON p.id = pa.parceiro_id
    WHERE pa.fornecedor_id = v_fornecedor_id
  LOOP
    INSERT INTO supplier_titulares (supplier_workspace_id, nome, documento, documento_tipo, email, telefone, status)
    VALUES (v_supplier_ws, rec.nome, rec.cpf, 'CPF', rec.email, rec.telefone, 'ATIVO')
    RETURNING id INTO v_titular_id;

    UPDATE parceiros
    SET fornecedor_origem_id = v_fornecedor_id,
        supplier_titular_id = v_titular_id
    WHERE id = rec.parceiro_id;
  END LOOP;
END;
$$;
