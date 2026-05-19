ALTER TABLE public.workspaces 
ADD COLUMN chat_notification_sound TEXT DEFAULT 'https://cdn.pixabay.com/audio/2022/03/15/audio_c8c8a73a5a.mp3';

COMMENT ON COLUMN public.workspaces.chat_notification_sound IS 'URL do som de notificação do chat escolhido para o workspace.';