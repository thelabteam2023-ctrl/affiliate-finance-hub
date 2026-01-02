
-- Ensure users always have a default workspace when they are members of at least one workspace
-- Fix existing users with null default_workspace_id

-- Create a function to set default workspace if null
CREATE OR REPLACE FUNCTION public.ensure_default_workspace()
RETURNS TRIGGER AS $$
BEGIN
  -- When a user becomes a member of a workspace and has no default, set this one
  IF (SELECT default_workspace_id FROM profiles WHERE id = NEW.user_id) IS NULL THEN
    UPDATE profiles SET default_workspace_id = NEW.workspace_id WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-set default workspace on new membership
DROP TRIGGER IF EXISTS trg_ensure_default_workspace ON workspace_members;
CREATE TRIGGER trg_ensure_default_workspace
  AFTER INSERT ON workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION ensure_default_workspace();

-- Fix all existing users who have no default workspace but are members
UPDATE profiles p
SET default_workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm 
  WHERE wm.user_id = p.id 
    AND wm.is_active = true 
  ORDER BY wm.role = 'owner' DESC, wm.joined_at ASC 
  LIMIT 1
)
WHERE p.default_workspace_id IS NULL
AND EXISTS (
  SELECT 1 FROM workspace_members wm 
  WHERE wm.user_id = p.id AND wm.is_active = true
);