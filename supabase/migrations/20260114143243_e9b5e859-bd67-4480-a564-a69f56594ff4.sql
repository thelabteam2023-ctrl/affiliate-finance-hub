-- Criar bucket para imagens de anotações
INSERT INTO storage.buckets (id, name, public)
VALUES ('anotacoes-images', 'anotacoes-images', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de acesso para o bucket
CREATE POLICY "Users can upload their own annotation images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'anotacoes-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own annotation images"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'anotacoes-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own annotation images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'anotacoes-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Public can view annotation images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'anotacoes-images');