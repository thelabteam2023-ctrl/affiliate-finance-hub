
-- Add image_urls column to community_topics
ALTER TABLE public.community_topics
ADD COLUMN image_urls text[] DEFAULT '{}';

-- Create storage bucket for community topic images
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-images', 'community-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload images to community-images bucket
CREATE POLICY "Authenticated users can upload community images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'community-images');

-- Allow public read access to community images
CREATE POLICY "Public read access for community images"
ON storage.objects FOR SELECT
USING (bucket_id = 'community-images');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own community images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'community-images' AND auth.uid()::text = (storage.foldername(name))[1]);
