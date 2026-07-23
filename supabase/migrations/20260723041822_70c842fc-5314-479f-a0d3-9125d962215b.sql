
-- Enums
CREATE TYPE public.announcement_priority AS ENUM ('baixa', 'normal', 'alta', 'critica');
CREATE TYPE public.announcement_category AS ENUM ('operacao', 'regras', 'produto', 'manutencao', 'programacao', 'orientacao', 'geral');
CREATE TYPE public.announcement_status AS ENUM ('rascunho', 'agendado', 'publicado', 'expirado', 'arquivado');

-- Main table
CREATE TABLE public.workspace_announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  category public.announcement_category NOT NULL DEFAULT 'geral',
  priority public.announcement_priority NOT NULL DEFAULT 'normal',
  status public.announcement_status NOT NULL DEFAULT 'publicado',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  publish_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  allow_reactions BOOLEAN NOT NULL DEFAULT true,
  allow_comments BOOLEAN NOT NULL DEFAULT false,
  require_read_receipt BOOLEAN NOT NULL DEFAULT false,
  audience_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_workspace_status ON public.workspace_announcements(workspace_id, status, is_pinned DESC, publish_at DESC);

-- Reads
CREATE TABLE public.workspace_announcement_reads (
  announcement_id UUID NOT NULL REFERENCES public.workspace_announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

-- Reactions
CREATE TABLE public.workspace_announcement_reactions (
  announcement_id UUID NOT NULL REFERENCES public.workspace_announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id, emoji)
);

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_announcements TO authenticated;
GRANT ALL ON public.workspace_announcements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_announcement_reads TO authenticated;
GRANT ALL ON public.workspace_announcement_reads TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_announcement_reactions TO authenticated;
GRANT ALL ON public.workspace_announcement_reactions TO service_role;

-- RLS
ALTER TABLE public.workspace_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_announcement_reactions ENABLE ROW LEVEL SECURITY;

-- Helper: is user active member of workspace
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = _user_id
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_announcements(_workspace_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = _user_id
      AND is_active = true
      AND role IN ('owner', 'admin')
  );
$$;

-- Announcements policies
CREATE POLICY "wa_select_members" ON public.workspace_announcements
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "wa_insert_owners_admins" ON public.workspace_announcements
FOR INSERT TO authenticated
WITH CHECK (
  public.can_manage_announcements(workspace_id, auth.uid())
  AND author_id = auth.uid()
);

CREATE POLICY "wa_update_owners_admins" ON public.workspace_announcements
FOR UPDATE TO authenticated
USING (public.can_manage_announcements(workspace_id, auth.uid()))
WITH CHECK (public.can_manage_announcements(workspace_id, auth.uid()));

CREATE POLICY "wa_delete_owners_admins" ON public.workspace_announcements
FOR DELETE TO authenticated
USING (public.can_manage_announcements(workspace_id, auth.uid()));

-- Reads policies (each user manages their own; readable by workspace members)
CREATE POLICY "war_select_members" ON public.workspace_announcement_reads
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_announcements a
    WHERE a.id = announcement_id
      AND public.is_workspace_member(a.workspace_id, auth.uid())
  )
);

CREATE POLICY "war_insert_self" ON public.workspace_announcement_reads
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.workspace_announcements a
    WHERE a.id = announcement_id
      AND public.is_workspace_member(a.workspace_id, auth.uid())
  )
);

CREATE POLICY "war_delete_self" ON public.workspace_announcement_reads
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Reactions policies
CREATE POLICY "wareact_select_members" ON public.workspace_announcement_reactions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_announcements a
    WHERE a.id = announcement_id
      AND public.is_workspace_member(a.workspace_id, auth.uid())
  )
);

CREATE POLICY "wareact_insert_self" ON public.workspace_announcement_reactions
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.workspace_announcements a
    WHERE a.id = announcement_id
      AND a.allow_reactions = true
      AND public.is_workspace_member(a.workspace_id, auth.uid())
  )
);

CREATE POLICY "wareact_delete_self" ON public.workspace_announcement_reactions
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_wa_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_wa_touch
BEFORE UPDATE ON public.workspace_announcements
FOR EACH ROW EXECUTE FUNCTION public.tg_wa_touch();
