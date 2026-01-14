-- Adicionar política de INSERT para permitir upload de imagens
CREATE POLICY "Users can upload annotation images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'anotacoes-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);