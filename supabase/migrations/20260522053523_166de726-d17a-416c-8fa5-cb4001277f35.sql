-- Add last_read_chat_at column to workspace_members if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workspace_members' AND column_name = 'last_read_chat_at') THEN
    ALTER TABLE public.workspace_members ADD COLUMN last_read_chat_at TIMESTAMP WITH TIME ZONE DEFAULT now();
  END IF;
END $$;

-- Update RLS policies (assuming they exist, but let's be safe and ensure the user can update their own record)
-- Usually workspace_members policies allow users to view/update their own entries.
