-- Add logout_at column to track session end
ALTER TABLE login_history ADD COLUMN IF NOT EXISTS logout_at TIMESTAMP WITH TIME ZONE;

-- Add is_active column to quickly identify the current active session
ALTER TABLE login_history ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;

-- Create index for faster queries on active sessions
CREATE INDEX IF NOT EXISTS idx_login_history_user_active ON login_history(user_id, is_active) WHERE is_active = true;

-- Create function to end previous sessions when a new login occurs
CREATE OR REPLACE FUNCTION end_previous_sessions()
RETURNS TRIGGER AS $$
BEGIN
  -- Mark all previous active sessions for this user as inactive and set logout_at
  UPDATE login_history
  SET 
    is_active = false,
    logout_at = NOW()
  WHERE user_id = NEW.user_id 
    AND id != NEW.id 
    AND is_active = true;
  
  -- Mark the new session as active
  NEW.is_active := true;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically end previous sessions on new login
DROP TRIGGER IF EXISTS tr_end_previous_sessions ON login_history;
CREATE TRIGGER tr_end_previous_sessions
  BEFORE INSERT ON login_history
  FOR EACH ROW
  EXECUTE FUNCTION end_previous_sessions();

-- Create function to end a specific session (for logout)
CREATE OR REPLACE FUNCTION end_user_session(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE login_history
  SET 
    is_active = false,
    logout_at = NOW()
  WHERE user_id = p_user_id 
    AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION end_user_session(UUID) TO authenticated;

-- Initialize: mark only the most recent login per user as active, others as inactive
WITH ranked_logins AS (
  SELECT 
    id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_at DESC) as rn
  FROM login_history
)
UPDATE login_history h
SET is_active = (r.rn = 1)
FROM ranked_logins r
WHERE h.id = r.id;