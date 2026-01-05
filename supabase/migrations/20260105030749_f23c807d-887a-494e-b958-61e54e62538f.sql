-- Adicionar 'force_logout' aos valores permitidos do session_status
ALTER TABLE public.login_history 
DROP CONSTRAINT login_history_session_status_check;

ALTER TABLE public.login_history 
ADD CONSTRAINT login_history_session_status_check 
CHECK (session_status = ANY (ARRAY['active'::text, 'closed'::text, 'expired'::text, 'force_logout'::text]));