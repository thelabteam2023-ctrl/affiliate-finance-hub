-- Funções de suporte ao Backup e Restauração (uso exclusivo do servidor / service_role)

-- 1) Lista de tabelas do schema public com PK e ordem de dependência (FK)
CREATE OR REPLACE FUNCTION public.admin_backup_tables()
RETURNS TABLE(table_name text, pk_column text, sort_order int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE tabs AS (
    SELECT c.oid, c.relname::text AS tname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  ),
  deps AS (
    SELECT con.conrelid AS child, con.confrelid AS parent
    FROM pg_constraint con
    JOIN tabs t ON t.oid = con.conrelid
    JOIN tabs p ON p.oid = con.confrelid
    WHERE con.contype = 'f' AND con.conrelid <> con.confrelid
  ),
  lvl AS (
    SELECT t.oid, 0 AS depth FROM tabs t
    UNION ALL
    SELECT d.child, l.depth + 1
    FROM deps d
    JOIN lvl l ON l.oid = d.parent
    WHERE l.depth < 15
  )
  SELECT
    t.tname,
    (
      SELECT a.attname::text
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (i.indkey)
      WHERE i.indrelid = t.oid AND i.indisprimary
      LIMIT 1
    ),
    MAX(l.depth)::int
  FROM tabs t
  JOIN lvl l ON l.oid = t.oid
  GROUP BY t.tname, t.oid
  ORDER BY 3, 1;
END;
$$;

-- 2) Contagem de linhas exata por tabela (para preview da restauração)
CREATE OR REPLACE FUNCTION public.admin_table_row_count(_table text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_reg regclass;
  v_count bigint;
BEGIN
  SELECT c.oid::regclass INTO v_reg
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = _table AND c.relkind = 'r';
  IF v_reg IS NULL THEN
    RAISE EXCEPTION 'Tabela inválida: %', _table;
  END IF;
  EXECUTE format('SELECT count(*) FROM %s', v_reg) INTO v_count;
  RETURN v_count;
END;
$$;

-- 3) Limpeza de uma tabela durante a restauração (espelhamento exato)
CREATE OR REPLACE FUNCTION public.admin_restore_clear(_table text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_reg regclass;
  v_deleted bigint;
BEGIN
  SELECT c.oid::regclass INTO v_reg
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = _table AND c.relkind = 'r';
  IF v_reg IS NULL THEN
    RAISE EXCEPTION 'Tabela inválida: %', _table;
  END IF;

  EXECUTE format('ALTER TABLE %s DISABLE TRIGGER USER', v_reg);
  EXECUTE format('DELETE FROM %s', v_reg);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  EXECUTE format('ALTER TABLE %s ENABLE TRIGGER USER', v_reg);

  RETURN v_deleted;
END;
$$;

-- 4) Carga de linhas durante a restauração (gatilhos de usuário desligados)
CREATE OR REPLACE FUNCTION public.admin_restore_insert(_table text, _rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_reg regclass;
  v_inserted integer;
BEGIN
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0 THEN
    RETURN 0;
  END IF;

  SELECT c.oid::regclass INTO v_reg
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = _table AND c.relkind = 'r';
  IF v_reg IS NULL THEN
    RAISE EXCEPTION 'Tabela inválida: %', _table;
  END IF;

  EXECUTE format('ALTER TABLE %s DISABLE TRIGGER USER', v_reg);
  EXECUTE format(
    'INSERT INTO %s SELECT * FROM jsonb_populate_recordset(NULL::%s, $1)',
    v_reg, v_reg
  ) USING _rows;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  EXECUTE format('ALTER TABLE %s ENABLE TRIGGER USER', v_reg);

  RETURN v_inserted;
END;
$$;

-- 5) DDL consolidado do banco (schema.sql do pacote)
CREATE OR REPLACE FUNCTION public.admin_dump_schema()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_out text := '-- Estrutura do banco (schema public) gerada em ' || now()::text || E'\n\n';
  r record;
  v_cols text;
BEGIN
  -- Tipos ENUM
  v_out := v_out || E'-- ===== TIPOS =====\n';
  FOR r IN
    SELECT t.typname,
           string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname
  LOOP
    v_out := v_out || format('CREATE TYPE public.%I AS ENUM (%s);', r.typname, r.labels) || E'\n';
  END LOOP;

  -- Tabelas
  v_out := v_out || E'\n-- ===== TABELAS =====\n';
  FOR r IN
    SELECT c.oid, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  LOOP
    SELECT string_agg(
      format('  %I %s%s%s',
        a.attname,
        format_type(a.atttypid, a.atttypmod),
        CASE WHEN ad.adbin IS NOT NULL THEN ' DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid) ELSE '' END,
        CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
      ), E',\n' ORDER BY a.attnum)
    INTO v_cols
    FROM pg_attribute a
    LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    WHERE a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped;

    v_out := v_out || format('CREATE TABLE IF NOT EXISTS public.%I (', r.relname) || E'\n' || v_cols || E'\n);\n';
  END LOOP;

  -- Constraints
  v_out := v_out || E'\n-- ===== CONSTRAINTS =====\n';
  FOR r IN
    SELECT c.relname, con.conname, pg_get_constraintdef(con.oid) AS def, con.contype
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    ORDER BY CASE con.contype WHEN 'p' THEN 1 WHEN 'u' THEN 2 WHEN 'c' THEN 3 ELSE 4 END, c.relname, con.conname
  LOOP
    v_out := v_out || format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;', r.relname, r.conname, r.def) || E'\n';
  END LOOP;

  -- Índices (exceto os criados por constraints)
  v_out := v_out || E'\n-- ===== ÍNDICES =====\n';
  FOR r IN
    SELECT i.indexdef
    FROM pg_indexes i
    WHERE i.schemaname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_class ic ON ic.oid = con.conindid
        WHERE ic.relname = i.indexname
      )
    ORDER BY i.tablename, i.indexname
  LOOP
    v_out := v_out || r.indexdef || E';\n';
  END LOOP;

  -- Funções
  v_out := v_out || E'\n-- ===== FUNÇÕES =====\n';
  FOR r IN
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
    ORDER BY p.proname
  LOOP
    v_out := v_out || r.def || E';\n\n';
  END LOOP;

  -- Views
  v_out := v_out || E'\n-- ===== VIEWS =====\n';
  FOR r IN
    SELECT c.relname, pg_get_viewdef(c.oid, true) AS def
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
    ORDER BY c.relname
  LOOP
    v_out := v_out || format('CREATE OR REPLACE VIEW public.%I AS', r.relname) || E'\n' || r.def || E'\n\n';
  END LOOP;

  -- Triggers
  v_out := v_out || E'\n-- ===== TRIGGERS =====\n';
  FOR r IN
    SELECT pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
    ORDER BY c.relname, t.tgname
  LOOP
    v_out := v_out || r.def || E';\n';
  END LOOP;

  RETURN v_out;
END;
$$;

-- Acesso restrito ao servidor (service_role). Nenhum acesso pelo navegador.
REVOKE ALL ON FUNCTION public.admin_backup_tables() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_table_row_count(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_restore_clear(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_restore_insert(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_dump_schema() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_backup_tables() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_table_row_count(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_restore_clear(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_restore_insert(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dump_schema() TO service_role;