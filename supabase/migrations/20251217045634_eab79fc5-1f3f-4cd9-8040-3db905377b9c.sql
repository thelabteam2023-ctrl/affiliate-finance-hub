
-- =====================================================
-- RBAC MIGRATION PART 1: ENUM VALUES ONLY
-- Must be committed before use
-- =====================================================

-- Add new values to existing app_role enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'finance' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'finance';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'operator' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'operator';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'viewer' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'viewer';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'owner' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'owner';
  END IF;
END $$;

-- Create other enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bookmaker_visibility') THEN
    CREATE TYPE public.bookmaker_visibility AS ENUM ('GLOBAL_REGULATED', 'GLOBAL_RESTRICTED', 'WORKSPACE_PRIVATE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN
    CREATE TYPE public.audit_action AS ENUM (
      'CREATE', 'UPDATE', 'DELETE', 'ARCHIVE', 'CANCEL',
      'CONFIRM', 'APPROVE', 'REJECT', 'LINK', 'UNLINK',
      'LOGIN', 'LOGOUT', 'PERMISSION_CHANGE', 'ROLE_CHANGE'
    );
  END IF;
END $$;
