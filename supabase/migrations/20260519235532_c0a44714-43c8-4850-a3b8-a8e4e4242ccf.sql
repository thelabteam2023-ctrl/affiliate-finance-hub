-- Atualizar o valor padrão para o novo caminho local
ALTER TABLE public.workspaces 
ALTER COLUMN chat_notification_sound SET DEFAULT '/sounds/pop.mp3';

-- Corrigir linhas existentes que podem estar com a URL antiga ou quebrada
UPDATE public.workspaces
SET chat_notification_sound = '/sounds/pop.mp3'
WHERE chat_notification_sound LIKE 'https://cdn.pixabay.com%';

-- Também podemos tentar mapear se o usuário já escolheu algo específico
UPDATE public.workspaces
SET chat_notification_sound = '/sounds/ding.mp3'
WHERE chat_notification_sound = 'https://cdn.pixabay.com/audio/2021/08/04/audio_0625c1539c.mp3';

UPDATE public.workspaces
SET chat_notification_sound = '/sounds/chime.mp3'
WHERE chat_notification_sound = 'https://cdn.pixabay.com/audio/2022/03/10/audio_c3508a2890.mp3';