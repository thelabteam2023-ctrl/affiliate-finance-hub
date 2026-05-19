-- Add image_url to community_chat_messages
ALTER TABLE public.community_chat_messages ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Create storage bucket for chat images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for chat-images
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'chat-images');

CREATE POLICY "Authenticated users can upload chat images" 
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'chat-images' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Users can delete their own chat images" 
ON storage.objects FOR DELETE 
USING (
  bucket_id = 'chat-images' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);